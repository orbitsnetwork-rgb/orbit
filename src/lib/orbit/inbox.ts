import { orbitNo } from "@/lib/orbit/traits";
/** Центр сповіщень: події журналу світу, позначки «прочитано» — лише на цьому телефоні. */
import { useEffect, useState } from "react";
import { sparkText } from "@/lib/orbit/copy";
import { STARTER_OD, type Account, type World } from "@/lib/orbit/engine";
import type { Ev } from "@/lib/orbit/social";
import { useOrbits } from "@/lib/orbit/store";

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

const no7 = (n?: number) => (n === undefined ? "" : orbitNo(n));

/** Текст особистої події. Інших людей називаємо за id — так, як їх показує сервер («Ім’я П.»). */
export function eventText(ev: Ev, world: World): { text: string; topic: Topic } {
  const who = (id?: string) => world.accounts.find((account) => account.id === id)?.name ?? "учасник";
  const sp = (n?: number) => `${Math.abs(n ?? 0)} ✦`;
  switch (ev.t) {
    case "join": return { text: ev.amt ? `Ти в Орбітах. Стартові ${sp(ev.amt)} на рахунку.` : `Ти в Орбітах. Стартові ${STARTER_OD} ✦ — після першого внеску.`, topic: "me" };
    case "starter": return { text: `Стартові ${sp(ev.amt)} зараховано — перший заряд пройшов.`, topic: "me" };
    case "launch": return { text: "Ти відкрив заявку на орбіту.", topic: "charge" };
    case "confirmGiven": return { text: `Ти підтвердив запуск ${who(ev.other)} · ${ev.n} з 8.`, topic: "charge" };
    case "confirmed": return { text: `${who(ev.other)} підтвердив твій запуск · ${ev.n} з 8.`, topic: "charge" };
    case "charging": return { text: "Вісімка зібрана. Заряд на 24 години.", topic: "charge" };
    case "chargeOk": return { text: `Заряд пройшов. Орбіта ${no7(ev.orbit)} твоя.`, topic: "charge" };
    case "chargeFail": return { text: "Заряд зірвався. Підтвердження згоріли.", topic: "charge" };
    case "witnessOk": return { text: `Запуск ${who(ev.other)}, який ти підтвердив, пройшов. +${sp(ev.amt)}.`, topic: "charge" };
    case "witnessFail": return { text: `Запуск ${who(ev.other)}, який ти підтвердив, зірвався.`, topic: "charge" };
    case "buy": return { text: `Ти купив ${no7(ev.orbit)} за ${sp(ev.amt)}.`, topic: "market" };
    case "sold": return { text: `Твою ${no7(ev.orbit)} купили. Тобі ${sp(ev.amt)}.`, topic: "market" };
    case "list": return { text: `Ти виставив ${no7(ev.orbit)} у чергу.`, topic: "market" };
    case "cancel": return { text: `Ти зняв ${no7(ev.orbit)} з черги.`, topic: "market" };
    case "fund": return { text: `Частка фонду: +${sp(ev.amt)}.`, topic: "fund" };
    case "topup": return { text: `Тестове поповнення: +${sp(ev.amt)}.`, topic: "me" };
    case "thanksGot": return { text: `${who(ev.other)} дякує тобі за підтвердження ✦`, topic: "me" };
    case "thanksSent": return { text: `Ти подякував ${who(ev.other)}.`, topic: "me" };
    case "nudge": return { text: `${who(ev.other)} нагадує про свій запуск · ${ev.n ?? 0} з 8. Попроси свіжий код і підтверди.`, topic: "charge" };
    case "nudgeSent": return { text: `Ти нагадав ${ev.n ?? 0} ${(ev.n ?? 0) === 1 ? "людині" : "людям"} про свій запуск.`, topic: "charge" };
    default: return { text: "Подія", topic: "system" };
  }
}

/**
 * Сповіщення: мої події — з особистого списку (за id), решта — зі спільного журналу.
 * Пошук свого імені в тексті журналу лишився лише для записів до першої особистої події.
 */
export function notesOf(world: World, user: Account, events: Ev[] = [], publicOnly = false): Note[] {
  const name = new RegExp(`(^|[\\s«(])${escape(user.name)}(?=$|[\\s.,!?»)])`);
  const since = events.length ? Math.min(...events.map((ev) => ev.at)) : Number.POSITIVE_INFINITY;
  const taken = new Set(events.map((ev) => ev.at));
  const personal: Note[] = publicOnly ? [] : events.map((ev, index) => {
    const { text, topic } = eventText(ev, world);
    return { key: `e-${ev.at}-${ev.t}-${index}`, at: ev.at, text, topic, mine: true, orbitId: ev.orbit };
  });
  const shared = world.log
    .filter((row) => publicOnly || !taken.has(row.at))
    .map((row) => {
      // Лише вигляд: номери орбіт як у біржі (#0000019) і одиниця ✦ біля часток продажу.
      const text = sparkText(row.text)
        .replace(/(Продавцю|У фонд) (\d+)\./g, "$1 $2 ✦.")
        .replace(/#(\d+)/g, (_m, n: string) => orbitNo(Number(n)));
      const orbit = /#(\d+)/.exec(row.text);
      return {
        key: `${row.at}-${row.text.length}-${row.text.slice(0, 16)}`,
        at: row.at,
        text,
        topic: topicOf(row.text),
        mine: (publicOnly && taken.has(row.at)) || (row.at < since && name.test(row.text)),
        orbitId: orbit ? Number(orbit[1]) : undefined,
      };
    });
  return [...personal, ...shared].sort((a, b) => b.at - a.at);
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
  const events = useOrbits((st) => st.mine?.events);
  const notes = user ? notesOf(world, user, events ?? []) : [];
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
