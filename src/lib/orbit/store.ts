import { create } from "zustand";
import type { Identity } from "@/lib/orbit/access";
import { emptyWorld, type World } from "@/lib/orbit/engine";
import { orbitAct, type OrbitAction, type OrbitReply } from "@/lib/orbit/remote";

const WHO = "orbits-who";
const KEYS = "orbits-keys";
const DEVICE = "orbits-device";

function device(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const have = localStorage.getItem(DEVICE);
    if (have && /^d-[A-Z2-9]{8}$/.test(have)) return have;
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let body = "";
    for (const byte of bytes) body += alphabet[byte % alphabet.length];
    const id = `d-${body}`;
    localStorage.setItem(DEVICE, id);
    return id;
  } catch {
    return null;
  }
}

type OrbitState = {
  world: World;
  self: Identity | null;
  flash: string;
  bad: boolean;
  ready: boolean;
  refresh: () => Promise<void>;
  probe: (email: string) => Promise<boolean>;
  registerPerson: (input: { name: string; family: string; birth: string; email: string; phone: string }) => Promise<void>;
  enterMail: (email: string, key: string) => Promise<void>;
  enterId: (id: string, key: string) => Promise<void>;
  confirmMail: (code: string) => Promise<void>;
  leave: () => void;
  start: () => Promise<void>;
  issue: () => Promise<void>;
  accept: (code: string) => Promise<void>;
  list: (orbitId: number) => Promise<void>;
  cancel: (orbitId: number) => Promise<void>;
  buy: () => Promise<void>;
  topup: (amount: number) => Promise<void>;
  confirmTopup: (sessionId: string) => Promise<void>;
};

function who(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = localStorage.getItem(WHO);
    return id && id.startsWith("u-") ? id : null;
  } catch {
    return null;
  }
}

function keep(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(WHO, id);
    else localStorage.removeItem(WHO);
  } catch {
    /* приватний режим */
  }
}

export function deviceKeys(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEYS) || "{}") as Record<string, unknown>;
    const keys: Record<string, string> = {};
    for (const [id, key] of Object.entries(raw)) {
      if (id.startsWith("u-") && typeof key === "string") keys[id] = key;
    }
    return keys;
  } catch {
    return {};
  }
}

function remember(id: string, key: string) {
  if (typeof window === "undefined") return;
  try {
    const keys = deviceKeys();
    keys[id] = key;
    localStorage.setItem(KEYS, JSON.stringify(keys));
  } catch {
    /* приватний режим */
  }
}

function blip() {
  if (typeof window === "undefined" || localStorage.getItem("orbits-sound") !== "1") return;
  const Ctx = window.AudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 523;
  gain.gain.value = 0.03;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.04);
  osc.onended = () => void ctx.close();
}

let tail: Promise<unknown> = Promise.resolve();

function send(action: OrbitAction, quiet = false, keyOverride?: string): Promise<OrbitReply | null> {
  const job = tail.then(async () => {
    const sessionId = who();
    const held = deviceKeys();
    const key = keyOverride ?? null;
    try {
      const step = await orbitAct({
        data: {
          sessionId,
          sessionKey: sessionId ? (held[sessionId] ?? null) : null,
          key: key ?? (sessionId ? (held[sessionId] ?? null) : null),
          device: device(),
          action,
        },
      });
      const prior = useOrbits.getState();
      if (step.key && step.world.sessionId) remember(step.world.sessionId, step.key);
      else if (action.type === "enter" && !step.error && key) remember(action.id, key);
      else if (action.type === "enterMail" && !step.error && key && step.world.sessionId) remember(step.world.sessionId, key);
      keep(step.world.sessionId);
      const text = step.error ?? step.notice ?? "";
      const shown = !step.error && step.key ? `${text} Ключ: ${step.key}. Запиши його.` : text;
      if (!quiet && !step.error) blip();
      if (step.url && !step.error && typeof window !== "undefined") window.location.href = step.url;
      useOrbits.setState({
        world: step.world,
        self: step.self === undefined ? prior.self : step.self,
        flash: quiet ? (prior.bad ? prior.flash : "") : shown,
        bad: quiet ? prior.bad : Boolean(step.error),
        ready: true,
      });
      return step;
    } catch {
      useOrbits.setState({ ready: true, flash: "Спільний світ не відповідає.", bad: true });
      return null;
    }
  });
  tail = job.catch(() => undefined);
  return job;
}

export const useOrbits = create<OrbitState>()(() => ({
  world: emptyWorld(),
  self: null,
  flash: "",
  bad: false,
  ready: false,
  refresh: () => send({ type: "pull" }, true).then(() => undefined),
  probe: (email) => send({ type: "probe", email }, true).then((step) => Boolean(step?.taken)),
  registerPerson: (input) => send({ type: "register", ...input }).then(() => undefined),
  enterMail: (email, key) => send({ type: "enterMail", email }, false, key).then(() => undefined),
  enterId: (id, key) => send({ type: "enter", id }, false, key).then(() => undefined),
  confirmMail: (code) => send({ type: "confirmMail", code }).then(() => undefined),
  leave: () => {
    keep(null);
    const world = useOrbits.getState().world;
    useOrbits.setState({ world: { ...world, sessionId: null }, self: null, flash: "", bad: false });
  },
  start: () => send({ type: "start" }).then(() => undefined),
  issue: () => send({ type: "issue" }).then(() => undefined),
  accept: (code) => send({ type: "accept", code }).then(() => undefined),
  list: (orbitId) => send({ type: "list", orbitId }).then(() => undefined),
  cancel: (orbitId) => send({ type: "cancel", orbitId }).then(() => undefined),
  buy: () => send({ type: "buy" }).then(() => undefined),
  topup: (amount) => send({ type: "topup", amount }).then(() => undefined),
  confirmTopup: (sessionId) => send({ type: "confirmTopup", sessionId }).then(() => undefined),
}));

export function bootOrbits() {
  void useOrbits.getState().refresh();
}
