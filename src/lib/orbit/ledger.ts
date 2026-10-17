import { orbitNo } from "@/lib/orbit/traits";
/**
 * Історія операцій людини. Лише читання: збираємо з того, що вже є у світі
 * (угоди, виплати, заявки, черга, журнал) і з поповнень, записаних на цьому телефоні.
 * Рушій і формули не змінюються.
 */
import { CHARGE_MS, CONFIRM_NEED, STARTER_OD, WITNESS_OD, type Account, type World } from "@/lib/orbit/engine";
import type { Ev } from "@/lib/orbit/social";

export type Kind = "topup" | "buy" | "sell" | "charge" | "fund" | "bonus";
export type Entry = {
  id: string;
  kind: Kind;
  at: number;
  /** Зі знаком: + прийшло, − пішло, 0 — без руху іскор. */
  amount: number;
  title: string;
  status?: string;
  pending?: boolean;
  /** Підпис замість суми, коли іскри не рухались (наприклад «+1 орбіта»). */
  badge?: string;
  orbitId?: number;
  source: "world" | "log" | "phone";
  lines: [string, string][];
};

export type LocalTopup = { at: number; amount: number };

const TOPUP_KEY = (userId: string) => `orbits-topups-${userId}`;

export function readTopups(userId: string): LocalTopup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(TOPUP_KEY(userId)) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((row): row is LocalTopup => typeof row?.at === "number" && typeof row?.amount === "number" && row.amount > 0).slice(0, 200);
  } catch {
    return [];
  }
}

/** Записати поповнення на цьому телефоні (сервер не повертає список поповнень клієнту). */
export function rememberTopup(userId: string, amount: number, at = Date.now()) {
  if (typeof window === "undefined" || !(amount > 0)) return;
  try {
    const rows = readTopups(userId);
    if (rows.some((row) => Math.abs(row.at - at) < 5000 && row.amount === amount)) return;
    localStorage.setItem(TOPUP_KEY(userId), JSON.stringify([{ at, amount }, ...rows].slice(0, 200)));
  } catch {
    /* приватний режим */
  }
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Час з id заявки: `c-<час у base36>-<n>`. */
function creationTime(id: string) {
  const part = id.split("-")[1] ?? "";
  const value = parseInt(part, 36);
  return Number.isFinite(value) ? value : 0;
}

/**
 * events — особисті події з сервера (за id, не за іменем). Старий розбір тексту журналу за іменем
 * лишається тільки для записів, старіших за першу особисту подію (акаунти до появи подій).
 */
export function buildLedger(world: World, user: Account, topups: LocalTopup[], events: Ev[] = [], payouts?: { at: number; userId: string; amount: number }[]): Entry[] {
  const rows: Entry[] = [];
  const name = escape(user.name);
  const seen = new Set<string>();
  const since = events.length ? Math.min(...events.map((ev) => ev.at)) : Number.POSITIVE_INFINITY;
  const legacy = (at: number) => at < since;

  // Б5: нові акаунти отримують стартові ✦ після першого внеску (подія starter); старі — одразу.
  const starter = events.find((ev) => ev.t === "starter");
  if (!user.starterPending) rows.push({
    id: `start-${user.id}`,
    kind: "bonus",
    at: starter?.at ?? user.createdAt,
    amount: starter?.amt ?? STARTER_OD,
    title: "Стартові іскри",
    source: "world",
    lines: [["Звідки", starter ? "За перший внесок, один раз" : "Подарунок на старті, один раз"]],
  });

  for (const ev of events) {
    if (ev.t !== "topup" || !ev.amt) continue;
    rows.push({ id: `topup-${ev.at}`, kind: "topup", at: ev.at, amount: ev.amt, title: "Тестове поповнення", source: "world", lines: [["Режим", "Тест · справжні гроші не списано"]] });
  }
  for (const [index, row] of topups.entries()) {
    if (!legacy(row.at)) continue;
    rows.push({
      id: `topup-${row.at}-${index}`,
      kind: "topup",
      at: row.at,
      amount: row.amount,
      title: "Тестове поповнення",
      source: "phone",
      lines: [
        ["Режим", "Тест · справжні гроші не списано"],
        ["Де видно", "Лише на цьому телефоні"],
      ],
    });
  }

  for (const [index, row] of (payouts ?? world.payouts).entries()) {
    if (row.userId !== user.id) continue;
    rows.push({
      id: `fund-${row.at}-${index}`,
      kind: "fund",
      at: row.at,
      amount: row.amount,
      title: "Частка фонду",
      source: "world",
      lines: [["Звідки", "Поділ фонду між активними"]],
    });
  }

  // Заявки і заряди (свої).
  for (const item of world.creations) {
    if (item.userId !== user.id) continue;
    const opened = creationTime(item.id);
    if (item.status === "collecting") {
      rows.push({
        id: item.id,
        kind: "charge",
        at: item.confirms.at(-1)?.at ?? opened,
        amount: 0,
        title: "Заявка на орбіту",
        status: `${item.confirms.length} з ${CONFIRM_NEED}`,
        pending: true,
        source: "world",
        lines: [["Підтверджень", `${item.confirms.length} з ${CONFIRM_NEED}`]],
      });
      continue;
    }
    const startedAt = item.chargeStartedAt ?? opened;
    const readyAt = startedAt + CHARGE_MS;
    if (item.status === "charging") {
      rows.push({ id: item.id, kind: "charge", at: startedAt, amount: 0, title: "Заряд іде", status: "чекаємо результат", pending: true, source: "world", lines: [["Результат", "через 24 години після старту"]] });
      continue;
    }
    const passed = item.status === "done";
    let orbitId: number | undefined;
    if (passed) orbitId = events.find((ev) => ev.t === "chargeOk" && ev.cr === item.id)?.orbit;
    if (passed && orbitId === undefined && legacy(readyAt)) {
      const pattern = new RegExp(`^Заряд пройшов\\. Орбіта #(\\d+) у ${name}\\.`);
      const hit = world.log.find((row) => row.at >= readyAt - 1000 && pattern.test(row.text));
      orbitId = hit ? Number(pattern.exec(hit.text)?.[1]) : undefined;
    }
    rows.push({
      id: item.id,
      kind: "charge",
      at: readyAt,
      amount: 0,
      title: passed ? "Заряд пройшов" : "Заряд зірвався",
      badge: passed ? "+1 орбіта" : "без орбіти",
      status: passed ? (orbitId ? `орбіта ${orbitNo(orbitId)}` : "нова орбіта") : "підтвердження згоріли",
      orbitId,
      source: "world",
      lines: [
        ["Підтверджень", `${item.confirms.length} з ${CONFIRM_NEED}`],
        ["Результат", passed ? "Орбіта твоя" : "Без орбіти"],
      ],
    });
  }

  // Ти — свідок у чужій заявці.
  for (const item of world.creations) {
    if (item.userId === user.id || (item.status !== "done" && item.status !== "failed")) continue;
    if (!item.confirms.some((row) => row.witnessId === user.id)) continue;
    const passed = item.status === "done";
    // Скільки реально нараховано (40 ✦ до 16.10.2026, 20 ✦ після) — з особистої події, якщо вона є.
    const reward = events.find((ev) => ev.t === "witnessOk" && ev.cr === item.id)?.amt ?? WITNESS_OD;
    const owner = world.accounts.find((account) => account.id === item.userId)?.name ?? "хтось";
    rows.push({
      id: `w-${item.id}`,
      kind: "charge",
      at: (item.chargeStartedAt ?? creationTime(item.id)) + CHARGE_MS,
      amount: passed ? reward : 0,
      title: passed ? "Свідок · заряд пройшов" : "Свідок · заряд зірвався",
      status: owner,
      source: "world",
      lines: [
        ["Чия заявка", owner],
        ["Тобі", passed ? `+${reward} ✦` : "0 ✦"],
      ],
    });
  }

  // Купівлі: з журналу і з орбіт, які зараз у тебе (час купівлі = час власності).
  // До v16 рушій писав «ОД», з v16 — «✦»: приймаємо обидва.
  const buyText = new RegExp(`^${name} купив #(\\d+) за (\\d+) (?:ОД|✦)`);
  for (const ev of events) {
    if (ev.t !== "buy" || ev.orbit === undefined) continue;
    seen.add(`${ev.orbit}-${ev.at}`);
    rows.push(buyEntry(ev.orbit, ev.at, Math.abs(ev.amt ?? 0), "world"));
  }
  for (const row of world.log) {
    if (!legacy(row.at)) continue;
    const match = buyText.exec(row.text);
    if (!match) continue;
    const orbitId = Number(match[1]);
    const key = `${orbitId}-${row.at}`;
    seen.add(key);
    rows.push(buyEntry(orbitId, row.at, Number(match[2]), "log"));
  }
  for (const orbit of world.orbits) {
    if (orbit.ownerId !== user.id) continue;
    const trade = world.trades.find((row) => row.orbitId === orbit.id && row.at === orbit.createdAt);
    if (!trade) continue;
    const key = `${orbit.id}-${trade.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(buyEntry(orbit.id, trade.at, trade.amount, "world"));
  }

  // Продажі: виставлено → продано / знято. Журнал тримає останні події.
  const listText = new RegExp(`^${name} поставив #(\\d+) у чергу\\.`);
  const cancelText = new RegExp(`^${name} зняв #(\\d+) з черги\\.`);
  const sold = /^.+ купив #(\d+) за (\d+) (?:ОД|✦)\. Продавцю (\d+)\./;
  const open = new Map<number, number>();
  for (const ev of [...events].reverse()) {
    if (ev.orbit === undefined) continue;
    if (ev.t === "list") open.set(ev.orbit, ev.at);
    if (ev.t === "cancel") {
      const listedAt = open.get(ev.orbit);
      open.delete(ev.orbit);
      rows.push({ id: `cancel-${ev.orbit}-${ev.at}`, kind: "sell", at: ev.at, amount: 0, title: "Знято з черги", badge: "знято", status: no(ev.orbit), orbitId: ev.orbit, source: "world", lines: [["Виставлено", listedAt ? clock(listedAt) : "—"]] });
    }
    if (ev.t === "sold") {
      const listedAt = open.get(ev.orbit) ?? 0;
      open.delete(ev.orbit);
      const price = ev.n ?? 0;
      const got = ev.amt ?? 0;
      rows.push({
        id: `sold-${ev.orbit}-${ev.at}`, kind: "sell", at: ev.at, amount: got, title: "Продаж", status: no(ev.orbit), orbitId: ev.orbit, source: "world",
        lines: [["Ціна дня", `${fmt.format(price)} ✦`], ["Тобі", `${fmt.format(got)} ✦`], ["Фонд і резерв", `${fmt.format(price - got)} ✦`], ["Чекала в черзі", listedAt ? wait(ev.at - listedAt) : "—"]],
      });
    }
  }
  const chrono = [...world.log].reverse().filter((row) => legacy(row.at));
  for (const row of chrono) {
    const listed = listText.exec(row.text);
    if (listed) {
      open.set(Number(listed[1]), row.at);
      continue;
    }
    const cancelled = cancelText.exec(row.text);
    if (cancelled) {
      const orbitId = Number(cancelled[1]);
      const since = open.get(orbitId);
      open.delete(orbitId);
      rows.push({
        id: `cancel-${orbitId}-${row.at}`,
        kind: "sell",
        at: row.at,
        amount: 0,
        title: `Знято з черги`,
        badge: "знято",
        status: no(orbitId),
        orbitId,
        source: "log",
        lines: [["Виставлено", since ? clock(since) : "—"]],
      });
      continue;
    }
    const hit = sold.exec(row.text);
    if (hit && open.has(Number(hit[1])) && !buyText.test(row.text)) {
      const orbitId = Number(hit[1]);
      const since = open.get(orbitId) ?? 0;
      open.delete(orbitId);
      const price = Number(hit[2]);
      const got = Number(hit[3]);
      rows.push({
        id: `sold-${orbitId}-${row.at}`,
        kind: "sell",
        at: row.at,
        amount: got,
        title: "Продаж",
        status: no(orbitId),
        orbitId,
        source: "log",
        lines: [
          ["Ціна дня", `${fmt.format(price)} ✦`],
          ["Тобі", `${fmt.format(got)} ✦`],
          ["Фонд і резерв", `${fmt.format(price - got)} ✦`],
          ["Чекала в черзі", since ? wait(row.at - since) : "—"],
        ],
      });
    }
  }
  // Зараз у черзі.
  world.queue.forEach((row, index) => {
    if (row.userId !== user.id) return;
    rows.push({
      id: `queue-${row.id}`,
      kind: "sell",
      at: row.createdAt,
      amount: 0,
      title: "У черзі продажу",
      status: `${no(row.orbitId)} · місце ${index + 1}`,
      pending: true,
      orbitId: row.orbitId,
      source: "world",
      lines: [
        ["Місце", `${index + 1} з ${world.queue.length}`],
        ["Іскри прийдуть", "коли орбіту куплять"],
      ],
    });
  });

  return rows.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
}

const fmt = new Intl.NumberFormat("uk-UA");

export function no(id: number) {
  return orbitNo(id);
}

export function clock(ms: number) {
  return `${new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZone: "UTC" }).format(ms)} UTC`;
}

function wait(ms: number) {
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return `${Math.floor(hours / 24)} д`;
  if (hours >= 1) return `${hours} год`;
  return `${Math.max(1, Math.round(ms / 60_000))} хв`;
}

function buyEntry(orbitId: number, at: number, price: number, source: "log" | "world"): Entry {
  return {
    id: `buy-${orbitId}-${at}`,
    kind: "buy",
    at,
    amount: -price,
    title: "Купівля",
    status: no(orbitId),
    orbitId,
    source,
    lines: [
      ["Ціна дня", `${fmt.format(price)} ✦`],
      ["Комісія", "0 ✦"],
      ["Стабільність", "+1"],
    ],
  };
}
