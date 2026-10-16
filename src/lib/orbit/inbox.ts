/** Центр сповіщень: події журналу світу, позначки «прочитано» — лише на цьому телефоні. */
import { useEffect, useState } from "react";
import { sparkText } from "@/lib/orbit/copy";
import type { Account, World } from "@/lib/orbit/engine";

export type Topic = "me" | "market" | "charge" | "fund" | "system";
export type Note = { key: string; at: number; text: string; topic: Topic; mine: boolean; orbitId?: number };

const EVENT = "orbit-inbox";
const readKey = (userId: string) => `orbits-read-${userId}`;
const TOAST = "orbits-toast";

type ReadState = { upTo: number; keys: string[] };

function load(userId: string): ReadState {
  if (typeof window === "undefined") return { upTo: 0, keys: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(readKey(userId)) || "{}") as Partial<ReadState>;
    return { upTo: typeof raw.upTo === "number" ? raw.upTo : 0, keys: Array.isArray(raw.keys) ? raw.keys.filter((key) => typeof key === "string").slice(-120) : [] };
  } catch {
    return { upTo: 0, keys: [] };
  }
}

function save(userId: string, state: ReadState) {
  try {
    localStorage.setItem(readKey(userId), JSON.stringify({ upTo: state.upTo, keys: state.keys.slice(-120) }));
  } catch {
    /* приватний режим */
  }
  window.dispatchEvent(new Event(EVENT));
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function topicOf(text: string): Topic {
  if (/Фонд поділено/.test(text)) return "fund";
  if (/купив #|поставив #|зняв #|Ціна на добу/.test(text)) return "market";
  if (/Заряд|заявку|підтвердив|вісімку|випустив код/.test(text)) return "charge";
  return "system";
}

export function notesOf(world: World, user: Account): Note[] {
  const name = new RegExp(`(^|[\\s«(])${escape(user.name)}(?=$|[\\s.,!?»)])`);
  return world.log.map((row) => {
    // Лише вигляд: номери орбіт як у біржі (#0000019) і одиниця ✦ біля часток продажу.
    const text = sparkText(row.text)
      .replace(/(Продавцю|У фонд) (\d+)\./g, "$1 $2 ✦.")
      .replace(/#(\d+)/g, (_m, n: string) => `#${n.padStart(7, "0")}`);
    const orbit = /#(\d+)/.exec(row.text);
    return {
      key: `${row.at}-${row.text.length}-${row.text.slice(0, 16)}`,
      at: row.at,
      text,
      topic: topicOf(row.text),
      mine: name.test(row.text),
      orbitId: orbit ? Number(orbit[1]) : undefined,
    };
  });
}

export function useInbox(world: World, user: Account | null) {
  const [state, setState] = useState<ReadState>({ upTo: 0, keys: [] });
  const id = user?.id ?? "";
  useEffect(() => {
    if (!id) return;
    const read = () => setState(load(id));
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, [id]);
  const notes = user ? notesOf(world, user) : [];
  // Нового користувача не засипаємо старою історією світу: усе до реєстрації вважається прочитаним.
  const floor = Math.max(state.upTo, user?.createdAt ?? 0);
  const unreadOf = (note: Note) => note.at > floor && !state.keys.includes(note.key);
  return {
    notes,
    unread: notes.filter(unreadOf).length,
    isUnread: unreadOf,
    markAll: () => id && save(id, { upTo: Math.max(world.now, ...notes.map((note) => note.at)), keys: [] }),
    mark: (note: Note) => id && !state.keys.includes(note.key) && save(id, { ...state, keys: [...state.keys, note.key] }),
  };
}

/** Спливаючі сповіщення про події світу: увімк / вимк. */
export function toastsOn() {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(TOAST) !== "0";
  } catch {
    return true;
  }
}

export function setToasts(on: boolean) {
  try {
    localStorage.setItem(TOAST, on ? "1" : "0");
  } catch {
    /* приватний режим */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function ago(ms: number, now: number) {
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв тому`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} год тому`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} д тому`;
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", timeZone: "UTC" }).format(ms);
}
