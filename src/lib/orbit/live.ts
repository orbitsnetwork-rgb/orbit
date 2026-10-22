import { createServerFn } from "@tanstack/react-start";
import { CHAT_MAX, CHAT_READ, HIDE_AFTER_REPORTS, MUTE_WINDOW_MS, REACT_PER_MIN, WHY_MAX, WHY_MIN, canUseRoom, cleanText, keepDays, maskWords, muteFor, muteText, normReaction, normRoom, overChatCap, reactNoteText, roomNoteText, roomsFor, shortName, type ChatNote, type RoomInfo } from "@/lib/orbit/live-rules";
import type { World } from "@/lib/orbit/engine";

/**
 * Живий шар: чат світу, заявки на роль, сигнали «схоже на бота».
 * Окремі таблиці (міграція 0038), не документ світу. Нічого тут не змінює ✦, орбіти чи формули (engine.ts не чіпається).
 * Хто пише — визначає сервер за ключем сесії (як orbitAct), а не за id з клієнта.
 */
export type ChatLine = { id: number; name: string; text: string; at: number; mine: boolean };
/** Реакції на повідомлення: kind → [скільки, чи є серед них моя]. Лише прикраса, без ✦. */
export type ChatReacts = Record<number, Record<string, [number, boolean]>>;
type Creds = { sessionId: string | null; sessionKey: string | null };
type Sql = import("@/lib/db").Sql;

const g = globalThis as { __orbitLiveReady__?: Promise<void>; __orbitWorldCache__?: ReturnType<typeof import("@/lib/orbit/world-cache").makeWorldCache<import("@/lib/orbit/access").Bag>> };
async function ready(sql: Sql) {
  g.__orbitLiveReady__ ??= (async () => {
    const a = (await import("../../../migrations/0038_orbit_live.sql?raw")).default;
    const b = (await import("../../../migrations/0039_chat_rooms.sql?raw")).default;
    const c = (await import("../../../migrations/0040_chat_reactions.sql?raw")).default;
    const d = (await import("../../../migrations/0041_chat_moderation.sql?raw")).default;
    for (const stmt of `${a};\n${b};\n${c};\n${d}`.replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean)) await sql.query(stmt, []);
  })().catch((error) => {
    g.__orbitLiveReady__ = undefined;
    throw error;
  });
  return g.__orbitLiveReady__;
}

function creds(raw: unknown): Creds {
  const body = (raw ?? {}) as { sessionId?: unknown; sessionKey?: unknown };
  const id = typeof body.sessionId === "string" && body.sessionId.startsWith("u-") ? body.sessionId.slice(0, 64) : null;
  const key = typeof body.sessionKey === "string" ? body.sessionKey.slice(0, 200) : null;
  return { sessionId: id, sessionKey: key };
}

/**
 * Перевірка ключа тим самим шляхом, що й orbitAct (лише читання світу, без блокування).
 * Світ береться з легкого кешу (world-cache): щоразу читаємо лише updated_at, а doc — тільки після зміни світу.
 */
async function whoIs(sql: Sql, c: Creds): Promise<{ id: string; name: string; world: World } | null> {
  if (!c.sessionId || !c.sessionKey) return null;
  const server = await import("@tanstack/react-start/server");
  const dev = await import("@/lib/orbit/device");
  const { unpackDoc } = await import("@/lib/orbit/access");
  const { makeWorldCache } = await import("@/lib/orbit/world-cache");
  const K = await import("@/lib/orbit/key-hash");
  const rawIp = server.getRequestHeader("x-nf-client-connection-ip") ?? server.getRequestIP({ xForwardedFor: true }) ?? "unknown";
  g.__orbitWorldCache__ ??= makeWorldCache(unpackDoc);
  const bag = await g.__orbitWorldCache__.get((text, params) => sql.query(text, params));
  if (!bag) return null;
  if (!K.verifyKey(bag.keys, c.sessionId, c.sessionKey, `v:${dev.ipTag(rawIp.split(",")[0].trim())}`)) return null;
  const account = bag.world.accounts.find((item) => item.id === c.sessionId);
  return account ? { id: account.id, name: shortName(account.name), world: bag.world } : null;
}

/** Для сторінки власника: таблиці живого шару (міграції 0038–0041) мають існувати. */
export async function ensureLive(sql: Sql) {
  await ready(sql);
}

async function db() {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await ready(sql);
  return sql;
}

/** Скільки сервер тримає довге опитування (Netlify: синхронна функція живе ≤10 с). */
const WAIT_MS = 8000;
const TICK_MS = 1000;
const ONLINE_MS = 45_000;
type Row = { id: string | number; user_id: string; name: string; text: string; at: string | number };
const toLine = (meId: string) => (r: Row): ChatLine => ({ id: Number(r.id), name: r.name, text: r.text, at: Number(r.at), mine: r.user_id === meId });

async function onlineIn(sql: Sql, room: string, now: number) {
  const rows = room === "world"
    ? await sql.query<{ n: number }>(`select count(distinct user_id)::int as n from orbit_chat_seen where seen_at > $1`, [now - ONLINE_MS])
    : await sql.query<{ n: number }>(`select count(distinct user_id)::int as n from orbit_chat_seen where room = $1 and seen_at > $2`, [room, now - ONLINE_MS]);
  return rows[0]?.n ?? 0;
}

/** Непрочитане по кімнатах одним запитом (чужі, не сховані, після мого last_id), до 99 на кімнату. */
async function unreadFor(sql: Sql, meId: string, rooms: string[]): Promise<Record<string, number>> {
  if (!rooms.length) return {};
  const rows = await sql.query<{ room: string; n: number }>(
    `select c.room, least(count(*), 99)::int as n from orbit_chat c
       left join orbit_chat_seen s on s.user_id = $1 and s.room = c.room
     where c.room = any($2::text[]) and not c.hidden and c.user_id <> $1 and c.id > coalesce(s.last_id, 0)
     group by c.room`,
    [meId, rooms],
  );
  return Object.fromEntries(rows.map((r) => [r.room, r.n]));
}

/** Реакції для повідомлень з id ≥ from у кімнаті + курсор змін (seq). */
async function reactsFor(sql: Sql, meId: string, room: string, from: number): Promise<{ reacts: ChatReacts; rx: number }> {
  const rows = await sql.query<{ msg_id: string; kind: string; n: number; mine: boolean }>(
    `select msg_id, kind, count(*)::int as n, bool_or(user_id = $3) as mine from orbit_chat_reacts
     where room = $1 and msg_id >= $2 and is_on group by msg_id, kind`,
    [room, from, meId],
  );
  const top = await sql.query<{ s: string | null }>(`select max(seq)::text as s from orbit_chat_reacts where room = $1`, [room]);
  const reacts: ChatReacts = {};
  for (const r of rows) (reacts[Number(r.msg_id)] ??= {})[r.kind] = [r.n, r.mine];
  return { reacts, rx: Number(top[0]?.s ?? 0) };
}

export type ChatReadOut = {
  lines: ChatLine[]; hidden: number[]; online: number; signedIn: boolean; allowed: boolean;
  reacts: ChatReacts; rx: number; unread: Record<string, number>; mutedUntil: number;
};
const EMPTY = { lines: [], hidden: [], online: 0, reacts: {}, rx: 0, unread: {}, mutedUntil: 0 };

/** Активна пауза в чаті (0 — немає). */
async function mutedUntil(sql: Sql, userId: string, now = Date.now()): Promise<number> {
  const rows = await sql.query<{ u: string }>(`select until_at::text as u from orbit_chat_mutes where user_id = $1`, [userId]);
  const until = Number(rows[0]?.u ?? 0);
  return until > now ? until : 0;
}

/** Після того як повідомлення сховали скаргами: рахуємо сховані за 30 днів і, якщо треба, ставимо паузу (лише подовжуємо). */
export async function applyMute(sql: Sql, userId: string, now = Date.now()) {
  const n = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_chat where user_id = $1 and hidden and at > $2`, [userId, now - MUTE_WINDOW_MS]);
  const hiddenN = n[0]?.n ?? 0;
  const span = muteFor(hiddenN);
  if (!span) return 0;
  await sql.query(
    `insert into orbit_chat_mutes (user_id, until_at, hidden_n, at) values ($1, $2, $3, $4)
     on conflict (user_id) do update set until_at = greatest(orbit_chat_mutes.until_at, excluded.until_at), hidden_n = excluded.hidden_n, at = excluded.at`,
    [userId, now + span, hiddenN, now],
  );
  return now + span;
}

let lastPrune = 0;
/** Автовидалення повідомлень старших за ORBIT_CHAT_KEEP_DAYS. Вимкнено за замовчуванням (рішення власника). Не частіше разу на годину. */
async function pruneOld(sql: Sql, now: number) {
  const days = keepDays(process.env.ORBIT_CHAT_KEEP_DAYS);
  if (!days || now - lastPrune < 60 * 60 * 1000) return;
  lastPrune = now;
  const edge = now - days * 24 * 60 * 60 * 1000;
  await sql.query(`delete from orbit_chat_reacts where msg_id in (select id from orbit_chat where at < $1)`, [edge]);
  await sql.query(`delete from orbit_chat_reports where msg_id in (select id from orbit_chat where at < $1)`, [edge]);
  await sql.query(`delete from orbit_chat where at < $1`, [edge]);
}

/**
 * Читання кімнати. after = останній id, який уже є в клієнта; from = найстаріший id у клієнта (для схованих і реакцій);
 * rx = курсор реакцій. wait = довге опитування: сервер до 8 с раз на секунду дешево перевіряє (лише індекси),
 * чи з'явилося нове повідомлення, реакція або сховане скаргою, і відповідає одразу.
 * Доступ до кімнати перевіряється на кожен запит за даними світу (автор + підтверджувачі запуску).
 * Разом з відповіддю йде непрочитане в інших моїх кімнатах — окреме опитування списку кімнат не потрібне.
 */
export const chatRead = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const body = (raw ?? {}) as { after?: unknown; from?: unknown; rx?: unknown; room?: unknown; wait?: unknown };
    const int = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
    return { ...creds(raw), room: normRoom(body.room), after: int(body.after), from: int(body.from), rx: int(body.rx), wait: body.wait === true };
  })
  .handler(async ({ data }): Promise<ChatReadOut> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { ...EMPTY, signedIn: false, allowed: false };
    if (!data.room || !canUseRoom(me.world, me.id, data.room)) return { ...EMPTY, signedIn: true, allowed: false };
    const room = data.room;
    const from = data.from > 0 ? data.from : Math.max(0, data.after - 500);
    // «Прочитано» рухається лише до повідомлень, які справді віддано клієнту в цій відповіді
    // (обірване довге опитування не позначає прочитаним те, чого людина не бачила).
    const mark = async (upTo: number) => {
      const now = Date.now();
      await sql.query(
        `insert into orbit_chat_seen (user_id, room, last_id, seen_at) values ($1, $2, $3, $4)
         on conflict (user_id, room) do update set last_id = greatest(orbit_chat_seen.last_id, excluded.last_id), seen_at = excluded.seen_at`,
        [me.id, room, upTo, now],
      );
      return now;
    };
    const server = await import("@tanstack/react-start/server");
    const gone = () => { try { return server.getRequest().signal.aborted; } catch { return false; } };
    if (data.after > 0 && data.wait) {
      await mark(data.after);
      const hiddenNow = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_chat where room = $1 and hidden and id >= $2`, [room, from]);
      const until = Date.now() + WAIT_MS;
      while (Date.now() < until) {
        const fresh = await sql.query<{ m: boolean; r: boolean; h: number }>(
          `select exists(select 1 from orbit_chat where room = $1 and id > $2) as m,
                  exists(select 1 from orbit_chat_reacts where room = $1 and seq > $3) as r,
                  (select count(*)::int from orbit_chat where room = $1 and hidden and id >= $4) as h`,
          [room, data.after, data.rx, from],
        );
        if (gone()) break;
        if (fresh[0] && (fresh[0].m || fresh[0].r || fresh[0].h !== (hiddenNow[0]?.n ?? 0))) break;
        await new Promise((r) => setTimeout(r, TICK_MS));
      }
    }
    const rows = data.after > 0
      ? await sql.query<Row>(`select id, user_id, name, text, at from orbit_chat where room = $1 and id > $2 and not hidden order by id asc limit ${CHAT_READ}`, [room, data.after])
      : (await sql.query<Row>(`select id, user_id, name, text, at from orbit_chat where room = $1 and not hidden order by id desc limit ${CHAT_READ}`, [room])).reverse();
    const lowest = data.after > 0 ? from : Number(rows[0]?.id ?? 0);
    const hid = await sql.query<{ id: string }>(`select id from orbit_chat where room = $1 and hidden and id >= $2 order by id desc limit 100`, [room, lowest]);
    // Клієнт пішов (перезавантаження, закрита вкладка) — не позначаємо прочитаним те, що він не отримав.
    const now = gone() ? Date.now() : await mark(Math.max(data.after, ...rows.map((r) => Number(r.id))));
    const { reacts, rx } = await reactsFor(sql, me.id, room, lowest);
    const others = roomsFor(me.world, me.id).map((r) => r.id).filter((id) => id !== room);
    return {
      signedIn: true, allowed: true, lines: rows.map(toLine(me.id)), hidden: hid.map((r) => Number(r.id)),
      online: await onlineIn(sql, room, now), reacts, rx, unread: await unreadFor(sql, me.id, others), mutedUntil: await mutedUntil(sql, me.id, now),
    };
  });

/** Мої кімнати з кількістю непрочитаного (чужі повідомлення після останнього перегляду, до 99). */
export const chatRooms = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => creds(raw))
  .handler(async ({ data }): Promise<{ rooms: (RoomInfo & { unread: number })[]; online: number; signedIn: boolean }> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { rooms: [], online: 0, signedIn: false };
    const list = roomsFor(me.world, me.id);
    const unread = await unreadFor(sql, me.id, list.map((r) => r.id));
    return { rooms: list.map((room) => ({ ...room, unread: unread[room.id] ?? 0 })), online: await onlineIn(sql, "world", Date.now()), signedIn: true };
  });

export const chatSend = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), room: normRoom((raw as { room?: unknown })?.room), text: cleanText((raw as { text?: unknown })?.text, CHAT_MAX) }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    if (!data.text) return { ok: false, error: "Порожнє повідомлення." };
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { ok: false, error: "Увійди, щоб писати." };
    if (!data.room || !canUseRoom(me.world, me.id, data.room)) return { ok: false, error: "Ця кімната лише для учасників запуску." };
    const now = Date.now();
    const muted = await mutedUntil(sql, me.id, now);
    if (muted) return { ok: false, error: muteText(muted) };
    // Ліміт рахується в кожній кімнаті окремо (8/хв); спільний запобіжник — 16/хв на всі кімнати разом.
    const recent = await sql.query<{ n: number; all: number }>(
      `select count(*) filter (where room = $3)::int as n, count(*)::int as all from orbit_chat where user_id = $1 and at > $2`, [me.id, now - 60_000, data.room]);
    if (overChatCap(recent[0]?.n ?? 0, recent[0]?.all ?? 0)) return { ok: false, error: "Забагато повідомлень. Зачекай хвилину." };
    const same = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_chat where user_id = $1 and room = $2 and text = $3 and at > $4`, [me.id, data.room, data.text, now - 10 * 60_000]);
    if ((same[0]?.n ?? 0) > 0) return { ok: false, error: "Це вже було щойно." };
    // М'який фільтр: грубі слова маскуються, повідомлення не блокується.
    const { text, masked } = maskWords(data.text);
    await sql.query(`insert into orbit_chat (room, user_id, name, text, at) values ($1, $2, $3, $4, $5)`, [data.room, me.id, me.name, text, now]);
    await pruneOld(sql, now).catch(() => null);
    return masked ? { ok: true, error: "Кілька слів приховано зірочками — так чат лишається приємним для всіх." } : { ok: true };
  });

/**
 * Реакція: вмикає/вимикає одну реакцію даного виду від мене на повідомлення (по одній кожного виду).
 * Лише прикраса: жодних ✦, жодного впливу на орбіти чи економіку. Доступ — як до кімнати повідомлення.
 */
export const chatReact = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), id: Math.floor(Number((raw as { id?: unknown })?.id) || 0), kind: normReaction((raw as { kind?: unknown })?.kind) }))
  .handler(async ({ data }): Promise<{ ok: boolean; on?: boolean; error?: string }> => {
    if (data.id <= 0 || !data.kind) return { ok: false, error: "Невідома реакція." };
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { ok: false, error: "Увійди, щоб реагувати." };
    const msg = await sql.query<{ room: string }>(`select room from orbit_chat where id = $1 and not hidden`, [data.id]);
    if (!msg[0] || !canUseRoom(me.world, me.id, msg[0].room)) return { ok: false, error: "Немає доступу до цього повідомлення." };
    const now = Date.now();
    // Два запобіжники: у пам'яті процесу (рахує й перемикання того самого рядка) і в базі (між процесами).
    const taps = (TAPS.get(me.id) ?? []).filter((t) => t > now - 60_000);
    if (taps.length >= REACT_PER_MIN) return { ok: false, error: "Забагато реакцій. Зачекай хвилину." };
    if (TAPS.size > 5000) TAPS.clear();
    TAPS.set(me.id, [...taps, now]);
    const recent = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_chat_reacts where user_id = $1 and at > $2`, [me.id, now - 60_000]);
    if ((recent[0]?.n ?? 0) >= REACT_PER_MIN) return { ok: false, error: "Забагато реакцій. Зачекай хвилину." };
    const out = await sql.query<{ is_on: boolean }>(
      `insert into orbit_chat_reacts (msg_id, user_id, kind, room, is_on, at) values ($1, $2, $3, $4, true, $5)
       on conflict (msg_id, user_id, kind) do update set is_on = not orbit_chat_reacts.is_on, at = excluded.at, seq = nextval('orbit_chat_react_seq')
       returning is_on`,
      [data.id, me.id, data.kind, msg[0].room, now],
    );
    return { ok: true, on: out[0]?.is_on ?? true };
  });

const TAPS = new Map<string, number[]>();

/** Хто відреагував: «Ім'я П.» за видами (до 30 на вид). Той самий доступ, що й до кімнати. */
export const chatWho = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), id: Math.floor(Number((raw as { id?: unknown })?.id) || 0) }))
  .handler(async ({ data }): Promise<{ ok: boolean; who: Record<string, string[]> }> => {
    if (data.id <= 0) return { ok: false, who: {} };
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { ok: false, who: {} };
    const msg = await sql.query<{ room: string }>(`select room from orbit_chat where id = $1 and not hidden`, [data.id]);
    if (!msg[0] || !canUseRoom(me.world, me.id, msg[0].room)) return { ok: false, who: {} };
    const rows = await sql.query<{ user_id: string; kind: string }>(`select user_id, kind from orbit_chat_reacts where msg_id = $1 and is_on order by at asc limit 300`, [data.id]);
    const names = new Map(me.world.accounts.map((a) => [a.id, shortName(a.name)]));
    const who: Record<string, string[]> = {};
    for (const r of rows) {
      const list = (who[r.kind] ??= []);
      if (list.length < 30) list.push(r.user_id === me.id ? "Я" : (names.get(r.user_id) ?? "Учасник"));
    }
    return { ok: true, who };
  });

/** Скарга: одна від людини на повідомлення; після 3 різних скарг повідомлення ховається до перевірки. */
export const chatReport = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), id: Math.floor(Number((raw as { id?: unknown })?.id) || 0) }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    if (data.id <= 0) return { ok: false };
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { ok: false };
    const own = await sql.query<{ user_id: string; room: string }>(`select user_id, room from orbit_chat where id = $1`, [data.id]);
    if (!own[0] || own[0].user_id === me.id || !canUseRoom(me.world, me.id, own[0].room)) return { ok: false };
    await sql.query(`insert into orbit_chat_reports (msg_id, reporter_id, at) values ($1, $2, $3) on conflict do nothing`, [data.id, me.id, Date.now()]);
    const n = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_chat_reports where msg_id = $1`, [data.id]);
    if ((n[0]?.n ?? 0) >= HIDE_AFTER_REPORTS) {
      const hid = await sql.query<{ id: string }>(`update orbit_chat set hidden = true where id = $1 and not hidden and reviewed_at is null returning id`, [data.id]);
      if (hid.length) await applyMute(sql, own[0].user_id);
    }
    return { ok: true };
  });

/** Заявка на роль. Нічого не видає: лише запис для власника. Адмін видається тільки вручну. */
export const roleAsk = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const body = (raw ?? {}) as { role?: unknown; why?: unknown };
    return { ...creds(raw), role: body.role === "admin" ? "admin" : "confirmer", why: cleanText(body.why, WHY_MAX) };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    if (data.why.length < WHY_MIN) return { ok: false, error: "Напиши хоча б кілька слів." };
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { ok: false, error: "Увійди, щоб подати заявку." };
    await sql.query(
      `insert into orbit_role_asks (user_id, role, why, at, state) values ($1, $2, $3, $4, 'wait')
       on conflict (user_id, role) do update set why = excluded.why, at = excluded.at
       where orbit_role_asks.state = 'wait'`,
      [me.id, data.role, data.why, Date.now()],
    );
    return { ok: true };
  });

/** Сигнал «схоже на автоклікер». Лише позначка для перевірки людиною: ✦, орбіти й доступ не змінюються. */
export const botSignal = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => creds(raw))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { ok: false };
    const now = Date.now();
    await sql.query(
      `insert into orbit_bot_flags (user_id, reason, hits, first_at, last_at) values ($1, 'even-fast-clicks', 1, $2, $2)
       on conflict (user_id) do update set hits = orbit_bot_flags.hits + 1, last_at = excluded.last_at
       where orbit_bot_flags.last_at < $2 - 600000`,
      [me.id, now],
    );
    return { ok: true };
  });

/**
 * Сповіщення з чату для дзвіночка — згруповано, без спаму:
 * одне на кожне моє повідомлення з чужими реакціями (за 7 днів, до 10) і одне на кожну кімнату запуску/екіпажу з непрочитаним.
 * Світовий чат у дзвіночок не потрапляє (там і так людно).
 */
export const chatNotes = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => creds(raw))
  .handler(async ({ data }): Promise<{ notes: ChatNote[] }> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { notes: [] };
    const now = Date.now();
    const names = new Map(me.world.accounts.map((a) => [a.id, shortName(a.name)]));
    const rx = await sql.query<{ msg_id: string; room: string; text: string; n: number; last: string; who: string[] }>(
      `select r.msg_id, c.room, c.text, count(distinct r.user_id)::int as n, max(r.at)::text as last,
              (array_agg(r.user_id order by r.at desc))[1:3] as who
         from orbit_chat_reacts r join orbit_chat c on c.id = r.msg_id
        where c.user_id = $1 and r.user_id <> $1 and r.is_on and not c.hidden and r.at > $2
        group by r.msg_id, c.room, c.text order by max(r.at) desc limit 10`,
      [me.id, now - 7 * 24 * 60 * 60 * 1000],
    );
    const notes: ChatNote[] = [];
    for (const r of rx) {
      if (!canUseRoom(me.world, me.id, r.room)) continue;
      const who = [...new Set(r.who ?? [])].map((id) => names.get(id) ?? "Учасник");
      notes.push({ key: `rx-${r.msg_id}-${r.last}`, at: Number(r.last), room: r.room, text: reactNoteText(who, r.n, r.text) });
    }
    const rooms = roomsFor(me.world, me.id).filter((r) => r.id !== "world");
    if (rooms.length) {
      const rows = await sql.query<{ room: string; n: number; last: string; top: string }>(
        `select c.room, least(count(*), 99)::int as n, max(c.at)::text as last, max(c.id)::text as top from orbit_chat c
           left join orbit_chat_seen s on s.user_id = $1 and s.room = c.room
         where c.room = any($2::text[]) and not c.hidden and c.user_id <> $1 and c.id > coalesce(s.last_id, 0)
         group by c.room`,
        [me.id, rooms.map((r) => r.id)],
      );
      for (const r of rows) {
        const info = rooms.find((x) => x.id === r.room);
        if (info) notes.push({ key: `room-${r.room}-${r.top}`, at: Number(r.last), room: r.room, text: roomNoteText(info.title, r.n) });
      }
    }
    return { notes };
  });
