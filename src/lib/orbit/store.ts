import { create } from "zustand";
import type { Identity } from "@/lib/orbit/access";
import { emptyWorld, type World } from "@/lib/orbit/engine";
import { orbitAct, type OrbitAction, type OrbitReply, type PublicStats } from "@/lib/orbit/remote";
import type { Mine } from "@/lib/orbit/social";

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
  /** Загальні цифри світу для гостя (до входу). */
  pub: PublicStats | null;
  /** Мої особисті події, подяки й дні (лише свої; приходять із кожною відповіддю). */
  mine: Mine | null;
  /** Номер орбіти → заявка-джерело (для «Екіпажу»). */
  origins: Record<string, string>;
  self: Identity | null;
  flash: string;
  bad: boolean;
  ready: boolean;
  /** Щойно створений ключ: показуємо окремим екраном, а не в тості. */
  fresh: { id: string; key: string } | null;
  dismissKey: () => void;
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
  /** expected — ціна, яку людина бачила у вікні підтвердження. */
  buy: (expected: number) => Promise<void>;
  topup: (amount: number) => Promise<void>;
  confirmTopup: (sessionId: string) => Promise<void>;
  /** «Дякую» підтверджувачу успішного запуску. */
  thank: (cr: string, to: string) => Promise<void>;
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

const KEY_SCREEN = "orbits-keyscreen";
const WELCOME = "Вітаємо в Орбітах. На рахунку 200 стартових іскор ✦.";

/** Екран ключа переживає перезавантаження вкладки, поки людина не підтвердить збереження. */
function holdKeyScreen(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) sessionStorage.setItem(KEY_SCREEN, id);
    else sessionStorage.removeItem(KEY_SCREEN);
  } catch {
    /* приватний режим */
  }
}

/** Після перезавантаження: чи треба знову показати екран ключа цьому акаунту. */
export function pendingKeyScreen(id: string): { id: string; key: string } | null {
  if (typeof window === "undefined") return null;
  try {
    if (sessionStorage.getItem(KEY_SCREEN) !== id) return null;
    if (localStorage.getItem(`orbits-keysaved-${id}`) === "1") return null;
  } catch {
    return null;
  }
  const key = deviceKeys()[id];
  return key ? { id, key } : null;
}

export const OFFLINE = "Спільний світ не відповідає.";

let tail: Promise<unknown> = Promise.resolve();

/** Коли людина востаннє щось зробила сама: одразу після дії опитуємо частіше. */
let lastOwnAction = 0;
let replan: (() => void) | null = null;
export function sinceOwnAction() {
  return Date.now() - lastOwnAction;
}

function send(action: OrbitAction, quiet = false, keyOverride?: string): Promise<OrbitReply | null> {
  if (action.type !== "pull" && action.type !== "probe") {
    lastOwnAction = Date.now();
    // Відповідь на дію вже несе свіжий світ; далі — швидший ритм, щоб побачити реакцію інших.
    queueMicrotask(() => replan?.());
  }
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
      // Новий ключ іде на екран «Твій ключ входу». Тост з ключем зникав за 2,6 с — так ключі губились.
      const fresh = !step.error && step.key && step.world.sessionId ? { id: step.world.sessionId, key: step.key } : null;
      if (fresh) holdKeyScreen(fresh.id);
      // Рушій повертає сам код як повідомлення; тост не дублює код, що вже великий на екрані.
      const shown = fresh ? "" : action.type === "issue" && !step.error ? "Код готовий. Діє 10 хвилин." : text;
      if (!quiet && !step.error) blip();
      if (step.url && !step.error && typeof window !== "undefined") window.location.href = step.url;
      useOrbits.setState({
        world: step.world,
        pub: step.pub ?? null,
        mine: step.world.sessionId ? (step.mine ?? prior.mine) : null,
        origins: step.origins ?? prior.origins,
        self: step.self === undefined ? prior.self : step.self,
        // Тиха відповідь означає, що зв’язок повернувся: прибираємо лише помилку зв’язку.
        flash: quiet ? (prior.bad && prior.flash !== OFFLINE ? prior.flash : "") : shown,
        bad: quiet ? prior.bad && prior.flash !== OFFLINE : Boolean(step.error),
        ready: true,
        ...(fresh ? { fresh } : {}),
      });
      return step;
    } catch {
      useOrbits.setState({ ready: true, flash: OFFLINE, bad: true });
      return null;
    }
  });
  tail = job.catch(() => undefined);
  return job;
}

export const useOrbits = create<OrbitState>()(() => ({
  world: emptyWorld(),
  pub: null,
  mine: null,
  origins: {},
  self: null,
  flash: "",
  bad: false,
  ready: false,
  fresh: null,
  dismissKey: () => {
    holdKeyScreen(null);
    useOrbits.setState({ fresh: null, flash: WELCOME, bad: false });
  },
  refresh: () => send({ type: "pull" }, true).then(() => undefined),
  probe: (email) => send({ type: "probe", email }, true).then((step) => Boolean(step?.taken)),
  registerPerson: (input) => send({ type: "register", ...input }).then(() => undefined),
  enterMail: (email, key) => send({ type: "enterMail", email }, false, key).then(() => undefined),
  enterId: (id, key) => send({ type: "enter", id }, false, key).then(() => undefined),
  confirmMail: (code) => send({ type: "confirmMail", code }).then(() => undefined),
  leave: () => {
    keep(null);
    const world = useOrbits.getState().world;
    holdKeyScreen(null);
    useOrbits.setState({ world: { ...world, sessionId: null }, mine: null, self: null, flash: "", bad: false, fresh: null });
  },
  start: () => send({ type: "start" }).then(() => undefined),
  issue: () => send({ type: "issue" }).then(() => undefined),
  accept: (code) => send({ type: "accept", code }).then(() => undefined),
  list: (orbitId) => send({ type: "list", orbitId }).then(() => undefined),
  cancel: (orbitId) => send({ type: "cancel", orbitId }).then(() => undefined),
  buy: (expected) => send({ type: "buy", price: expected }).then(() => undefined),
  topup: (amount) => send({ type: "topup", amount }).then(() => undefined),
  confirmTopup: (sessionId) => send({ type: "confirmTopup", sessionId }).then(() => undefined),
  thank: (cr, to) => send({ type: "thank", cr, to }).then(() => undefined),
}));

export function bootOrbits() {
  void useOrbits.getState().refresh();
}

/** Звичайний ритм опитування і швидший — перші 30 с після власної дії (чекаємо відповіді інших). */
export const POLL_MS = 10_000;
export const POLL_FAST_MS = 3_000;
const FAST_WINDOW_MS = 30_000;

/**
 * Опитування світу: раз на ~10 с, частіше одразу після власної дії, пауза, поки вкладка прихована.
 * Повернення на вкладку — миттєве оновлення. Повертає функцію зупинки.
 */
export function startPolling(): () => void {
  if (typeof window === "undefined") return () => undefined;
  let timer = 0;
  let stopped = false;
  const plan = () => {
    window.clearTimeout(timer);
    if (stopped || document.hidden) return;
    const wait = sinceOwnAction() < FAST_WINDOW_MS ? POLL_FAST_MS : POLL_MS;
    timer = window.setTimeout(() => {
      void useOrbits.getState().refresh().finally(plan);
    }, wait);
  };
  const onVisible = () => {
    if (document.hidden) {
      window.clearTimeout(timer);
      return;
    }
    void useOrbits.getState().refresh().finally(plan);
  };
  document.addEventListener("visibilitychange", onVisible);
  replan = plan;
  plan();
  return () => {
    stopped = true;
    if (replan === plan) replan = null;
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
