import { createServerFn } from "@tanstack/react-start";
import { CHAT_MAX, CHAT_READ, HIDE_AFTER_REPORTS, MUTE_WINDOW_MS, REACT_PER_MIN, WHY_MAX, WHY_MIN, canUseRoom, cleanText, dmPair, dmRoom, keepDays, maskWords, muteFor, muteText, normReaction, normRoom, overChatCap, reactNoteText, roomMembers, roomNoteText, roomsFor, shortName, type ChatNote, type RoomInfo } from "@/lib/orbit/live-rules";
import type { World } from "@/lib/orbit/engine";

/**
 * Живий шар: кімнати запусків і особисті розмови, заявки на роль, сигнали «схоже на бота».
 * Окремі таблиці (міграція 0038), не документ світу. Нічого тут не змінює ✦, орбіти чи формули (engine.ts не чіпається).
 * Хто пише — визначає сервер за ключем сесії (як orbitAct), а не за id з клієнта.
 */
export type ChatReply = { id: number; name: string; text: string; gone: boolean };
export type ChatLine = {
  id: number; name: string; text: string; at: number; mine: boolean;
  /** Стабільний ідентифікатор автора — лише для аватарки й групування (ім'я може повторюватись). */
  uid: string;
  replyTo?: ChatReply | null; edited?: boolean; deleted?: boolean;
};
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
    const e = (await import("../../../migrations/0046_chat_v2.sql?raw")).default;
    const f = (await import("../../../migrations/0047_dm_seek.sql?raw")).default;
    for (const stmt of `${a};\n${b};\n${c};\n${d};\n${e};\n${f}`.replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean)) await sql.query(stmt, []);
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
type Row = { id: string | number; user_id: string; name: string; text: string; at: string | number; reply_to: string | number | null; edited_at: string | number | null; deleted_at: string | number | null };
const COLS = "id, user_id, name, text, at, reply_to, edited_at, deleted_at";
const toLine = (meId: string, replies: Map<number, ChatReply>) => (r: Row): ChatLine => ({
  id: Number(r.id), name: r.name, text: r.deleted_at ? "" : r.text, at: Number(r.at), mine: r.user_id === meId, uid: r.user_id,
  replyTo: r.reply_to ? (replies.get(Number(r.reply_to)) ?? { id: Number(r.reply_to), name: "", text: "", gone: true }) : null,
  edited: Boolean(r.edited_at), deleted: Boolean(r.deleted_at),
});
const TYPING_MS = 6000;

/** Короткі цитати для відповідей: ім'я й перші 80 знаків (видалене/сховане — «gone»). */
async function repliesFor(sql: Sql, room: string, rows: Row[]): Promise<Map<number, ChatReply>> {
  const ids = [...new Set(rows.map((r) => Number(r.reply_to)).filter((n) => n > 0))];
  if (!ids.length) return new Map();
  const got = await sql.query<{ id: string; name: string; text: string; hidden: boolean; deleted_at: string | null }>(
    `select id, name, text, hidden, deleted_at from orbit_chat where room = $1 and id = any($2::bigint[])`, [room, ids]);
  return new Map(got.map((r) => [Number(r.id), { id: Number(r.id), name: r.name, text: r.hidden || r.deleted_at ? "" : r.text.slice(0, 80), gone: Boolean(r.hidden || r.deleted_at) }]));
}

/** Хто зараз друкує в кімнаті (крім мене), до 3 імен. */
async function typingIn(sql: Sql, room: string, meId: string, now: number): Promise<string[]> {
  const rows = await sql.query<{ user_id: string }>(`select user_id from orbit_chat_typing where room = $1 and user_id <> $2 and at > $3 order by at desc limit 3`, [room, meId, now - TYPING_MS]);
  return rows.map((r) => r.user_id);
}

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
  /** v2: змінені (редаговані/видалені) вже надіслані повідомлення + курсор змін. */
  changed: ChatLine[]; ev: number;
  /** v2: найбільший id, який прочитав хтось інший у кімнаті («прочитано» для моїх). */
  peer: number;
  /** v2: імена тих, хто друкує. */
  typing: string[];
  /** v2: чи я модератор (інструменти видалення й паузи). */
  mod: boolean;
};
const EMPTY = { lines: [], hidden: [], online: 0, reacts: {}, rx: 0, unread: {}, mutedUntil: 0, changed: [], ev: 0, peer: 0, typing: [], mod: false };

/** Модератор — лише той, кого затвердив власник (orbit_mods). */
export async function isMod(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql.query<{ n: number }>(`select 1 as n from orbit_mods where user_id = $1`, [userId]);
  return Boolean(rows[0]);
}

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
    const body = (raw ?? {}) as { after?: unknown; from?: unknown; rx?: unknown; ev?: unknown; room?: unknown; wait?: unknown; tp?: unknown };
    const int = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
    return { ...creds(raw), room: normRoom(body.room), after: int(body.after), from: int(body.from), rx: int(body.rx), ev: int(body.ev), tp: int(body.tp), wait: body.wait === true };
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
        const fresh = await sql.query<{ m: boolean; r: boolean; h: number; e: boolean; t: number }>(
          `select exists(select 1 from orbit_chat where room = $1 and id > $2) as m,
                  exists(select 1 from orbit_chat_reacts where room = $1 and seq > $3) as r,
                  (select count(*)::int from orbit_chat where room = $1 and hidden and id >= $4) as h,
                  exists(select 1 from orbit_chat where room = $1 and rev > $5) as e,
                  (select count(*)::int from orbit_chat_typing where room = $1 and user_id <> $6 and at > $7) as t`,
          [room, data.after, data.rx, from, data.ev, me.id, Date.now() - TYPING_MS],
        );
        if (gone()) break;
        if (fresh[0] && (fresh[0].m || fresh[0].r || fresh[0].e || fresh[0].t !== data.tp || fresh[0].h !== (hiddenNow[0]?.n ?? 0))) break;
        await new Promise((r) => setTimeout(r, TICK_MS));
      }
    }
    const rows = data.after > 0
      ? await sql.query<Row>(`select ${COLS} from orbit_chat where room = $1 and id > $2 and not hidden order by id asc limit ${CHAT_READ}`, [room, data.after])
      : (await sql.query<Row>(`select ${COLS} from orbit_chat where room = $1 and not hidden order by id desc limit ${CHAT_READ}`, [room])).reverse();
    const changedRows = data.after > 0 && data.ev >= 0
      ? await sql.query<Row>(`select ${COLS} from orbit_chat where room = $1 and rev > $2 and id >= $3 and id <= $4 and not hidden order by id asc limit 100`, [room, data.ev, from, data.after])
      : [];
    const evTop = await sql.query<{ e: string | null }>(`select max(rev)::text as e from orbit_chat where room = $1`, [room]);
    const replies = await repliesFor(sql, room, [...rows, ...changedRows]);
    const lowest = data.after > 0 ? from : Number(rows[0]?.id ?? 0);
    const hid = await sql.query<{ id: string }>(`select id from orbit_chat where room = $1 and hidden and id >= $2 order by id desc limit 100`, [room, lowest]);
    // Клієнт пішов (перезавантаження, закрита вкладка) — не позначаємо прочитаним те, що він не отримав.
    const now = gone() ? Date.now() : await mark(Math.max(data.after, ...rows.map((r) => Number(r.id))));
    const { reacts, rx } = await reactsFor(sql, me.id, room, lowest);
    const others = (await myRooms(sql, me)).map((r) => r.id).filter((id) => id !== room);
    const peer = await sql.query<{ p: string | null }>(`select max(last_id)::text as p from orbit_chat_seen where room = $1 and user_id <> $2`, [room, me.id]);
    const names = new Map(me.world.accounts.map((a) => [a.id, shortName(a.name)]));
    const typing = (await typingIn(sql, room, me.id, Date.now())).map((id) => names.get(id) ?? "Учасник");
    return {
      signedIn: true, allowed: true, lines: rows.map(toLine(me.id, replies)), hidden: hid.map((r) => Number(r.id)),
      online: await onlineIn(sql, room, now), reacts, rx, unread: await unreadFor(sql, me.id, others), mutedUntil: await mutedUntil(sql, me.id, now),
      changed: changedRows.map(toLine(me.id, replies)), ev: Number(evTop[0]?.e ?? 0), peer: Number(peer[0]?.p ?? 0), typing, mod: await isMod(sql, me.id),
    };
  });

/** Мої кімнати з кількістю непрочитаного (чужі повідомлення після останнього перегляду, до 99). */
export const chatRooms = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => creds(raw))
  .handler(async ({ data }): Promise<{ rooms: (RoomInfo & { unread: number; last: { name: string; text: string; at: number } | null })[]; online: number; signedIn: boolean }> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { rooms: [], online: 0, signedIn: false };
    const list = await myRooms(sql, me);
    const unread = await unreadFor(sql, me.id, list.map((r) => r.id));
    const lastRows = list.length
      ? await sql.query<{ room: string; name: string; text: string; at: string; user_id: string; deleted_at: string | null }>(
        `select distinct on (room) room, name, text, at, user_id, deleted_at from orbit_chat where room = any($1::text[]) and not hidden order by room, id desc`, [list.map((r) => r.id)])
      : [];
    const last = new Map(lastRows.map((r) => [r.room, { name: r.user_id === me.id ? "Я" : r.name, text: r.deleted_at ? "Повідомлення видалено" : r.text.slice(0, 80), at: Number(r.at) }]));
    return { rooms: list.map((room) => ({ ...room, unread: unread[room.id] ?? 0, last: last.get(room.id) ?? null })), online: await onlineIn(sql, "world", Date.now()), signedIn: true };
  });

export const chatSend = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({
    ...creds(raw), room: normRoom((raw as { room?: unknown })?.room), text: cleanText((raw as { text?: unknown })?.text, CHAT_MAX),
    replyTo: Math.max(0, Math.floor(Number((raw as { replyTo?: unknown })?.replyTo) || 0)),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; id?: number }> => {
    if (!data.text) return { ok: false, error: "Порожнє повідомлення." };
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { ok: false, error: "Увійди, щоб писати." };
    if (!data.room || !canUseRoom(me.world, me.id, data.room)) return { ok: false, error: "Ця кімната лише для учасників запуску." };
    const now = Date.now();
    const muted = await mutedUntil(sql, me.id, now);
    if (muted) return { ok: false, error: muteText(muted) };
    const pair = dmPair(data.room);
    if (pair) {
      if (await blockedEither(sql, pair[0], pair[1])) return { ok: false, error: "Ця розмова недоступна." };
      await sql.query(`insert into orbit_dm (room, a, b, at, last_at) values ($1, $2, $3, $4, $4) on conflict (room) do update set last_at = excluded.last_at`, [data.room, pair[0], pair[1], now]);
    }
    // Ліміт рахується в кожній кімнаті окремо (8/хв); спільний запобіжник — 16/хв на всі кімнати разом.
    const recent = await sql.query<{ n: number; all: number }>(
      `select count(*) filter (where room = $3)::int as n, count(*)::int as all from orbit_chat where user_id = $1 and at > $2`, [me.id, now - 60_000, data.room]);
    if (overChatCap(recent[0]?.n ?? 0, recent[0]?.all ?? 0)) return { ok: false, error: "Забагато повідомлень. Зачекай хвилину." };
    const same = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_chat where user_id = $1 and room = $2 and text = $3 and at > $4`, [me.id, data.room, data.text, now - 10 * 60_000]);
    if ((same[0]?.n ?? 0) > 0) return { ok: false, error: "Це вже було щойно." };
    // М'який фільтр: грубі слова маскуються, повідомлення не блокується.
    const { text, masked } = maskWords(data.text);
    // Відповідь — лише на повідомлення з тієї самої кімнати (інакше цитата могла б винести текст з приватної кімнати).
    let replyTo: number | null = null;
    if (data.replyTo) {
      const ok = await sql.query<{ id: string }>(`select id from orbit_chat where id = $1 and room = $2`, [data.replyTo, data.room]);
      replyTo = ok[0] ? data.replyTo : null;
    }
    const ins = await sql.query<{ id: string }>(`insert into orbit_chat (room, user_id, name, text, at, reply_to) values ($1, $2, $3, $4, $5, $6) returning id`, [data.room, me.id, me.name, text, now, replyTo]);
    await sql.query(`delete from orbit_chat_typing where user_id = $1 and room = $2`, [me.id, data.room]).catch(() => null);
    await pruneOld(sql, now).catch(() => null);
    const id = Number(ins[0]?.id ?? 0);
    return masked ? { ok: true, id, error: "Кілька слів приховано зірочками — так чат лишається приємним для всіх." } : { ok: true, id };
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
    const msg = await sql.query<{ room: string }>(`select room from orbit_chat where id = $1 and not hidden and deleted_at is null`, [data.id]);
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
    // У кімнаті на двох (особиста, запуск з одним підтвердженням) скаржитись може лише один — тоді досить однієї скарги; власник переглядає все сховане.
    const others = Math.max(1, (roomMembers(me.world, own[0].room)?.length ?? 2) - 1);
    if ((n[0]?.n ?? 0) >= Math.min(HIDE_AFTER_REPORTS, others)) {
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
    // Згадки @Ім'я П. за 7 днів у кімнатах, де я є і яких ще не прочитав (до 5).
    const mine = (await myRooms(sql, me)).map((r) => r.id);
    const tag = `@${me.name}`;
    const men = await sql.query<{ id: string; room: string; name: string; text: string; at: string }>(
      `select c.id, c.room, c.name, c.text, c.at from orbit_chat c left join orbit_chat_seen s on s.user_id = $1 and s.room = c.room
        where c.room = any($2::text[]) and c.user_id <> $1 and not c.hidden and c.deleted_at is null and c.at > $3
          and position(lower($4) in lower(c.text)) > 0 and c.id > coalesce(s.last_id, 0)
        order by c.id desc limit 5`,
      [me.id, mine, now - 7 * 24 * 60 * 60 * 1000, tag],
    );
    for (const m of men) notes.push({ key: `men-${m.id}`, at: Number(m.at), room: m.room, text: `${m.name} згадав тебе: «${m.text.slice(0, 60)}»` });
    const rooms = await myRooms(sql, me);
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


const EDIT_MS = 48 * 60 * 60 * 1000;

/** Редагування свого повідомлення (до 48 год). Грубі слова маскуються так само, як при надсиланні. */
export const chatEdit = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), id: Math.floor(Number((raw as { id?: unknown })?.id) || 0), text: cleanText((raw as { text?: unknown })?.text, CHAT_MAX) }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    if (data.id <= 0 || !data.text) return { ok: false, error: "Порожнє повідомлення." };
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { ok: false, error: "Увійди, щоб редагувати." };
    const now = Date.now();
    if (await mutedUntil(sql, me.id, now)) return { ok: false, error: "Під час паузи редагувати не можна." };
    const { text } = maskWords(data.text);
    const out = await sql.query<{ id: string }>(
      `update orbit_chat set text = $3, edited_at = $4, rev = nextval('orbit_chat_rev_seq')
        where id = $1 and user_id = $2 and deleted_at is null and not hidden and at > $5 returning id`,
      [data.id, me.id, text, now, now - EDIT_MS],
    );
    return out[0] ? { ok: true } : { ok: false, error: "Це повідомлення вже не можна змінити." };
  });

/** Видалення: своє — будь-коли; модератор — будь-яке в кімнаті, до якої має доступ (із записом у журнал). */
export const chatDelete = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), id: Math.floor(Number((raw as { id?: unknown })?.id) || 0) }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    if (data.id <= 0) return { ok: false, error: "Невідоме повідомлення." };
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { ok: false, error: "Увійди." };
    const msg = await sql.query<{ user_id: string; room: string }>(`select user_id, room from orbit_chat where id = $1 and deleted_at is null`, [data.id]);
    if (!msg[0] || !canUseRoom(me.world, me.id, msg[0].room)) return { ok: false, error: "Повідомлення не знайдено." };
    const own = msg[0].user_id === me.id;
    if (!own && !(await isMod(sql, me.id))) return { ok: false, error: "Видаляти чужі повідомлення може лише модератор." };
    const now = Date.now();
    await sql.query(`update orbit_chat set deleted_at = $2, rev = nextval('orbit_chat_rev_seq') where id = $1`, [data.id, now]);
    await sql.query(`delete from orbit_chat_reacts where msg_id = $1`, [data.id]);
    if (!own) {
      await sql.query(`insert into orbit_mod_log (mod_id, action, target_user, msg_id, room, at) values ($1, 'delete', $2, $3, $4, $5)`, [me.id, msg[0].user_id, data.id, msg[0].room, now]);
    }
    return { ok: true };
  });

/** «Друкує…»: дешева позначка на 6 с. Не частіше разу на 3 с від людини (у пам'яті процесу). */
const TYPED = new Map<string, number>();
export const chatTyping = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), room: normRoom((raw as { room?: unknown })?.room) }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    if (!data.room) return { ok: false };
    const now = Date.now();
    const key = `${data.sessionId}:${data.room}`;
    if ((TYPED.get(key) ?? 0) > now - 3000) return { ok: true };
    if (TYPED.size > 5000) TYPED.clear();
    TYPED.set(key, now);
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me || !canUseRoom(me.world, me.id, data.room)) return { ok: false };
    await sql.query(
      `insert into orbit_chat_typing (user_id, room, at) values ($1, $2, $3) on conflict (user_id, room) do update set at = excluded.at`,
      [me.id, data.room, now],
    );
    return { ok: true };
  });

/** Пауза в чаті від модератора (1–24 год), із записом у журнал. ✦ і орбіти не зачіпає. */
export const modMute = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), id: Math.floor(Number((raw as { id?: unknown })?.id) || 0), hours: Math.min(24, Math.max(1, Math.floor(Number((raw as { hours?: unknown })?.hours) || 1))) }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me || !(await isMod(sql, me.id))) return { ok: false, error: "Лише для модераторів." };
    const msg = await sql.query<{ user_id: string; room: string }>(`select user_id, room from orbit_chat where id = $1`, [data.id]);
    if (!msg[0] || !canUseRoom(me.world, me.id, msg[0].room)) return { ok: false, error: "Повідомлення не знайдено." };
    if (msg[0].user_id === me.id) return { ok: false, error: "Себе на паузу не ставлять." };
    if (await isMod(sql, msg[0].user_id)) return { ok: false, error: "Паузу модератору ставить лише власник." };
    const now = Date.now();
    const until = now + data.hours * 60 * 60 * 1000;
    await sql.query(
      `insert into orbit_chat_mutes (user_id, until_at, hidden_n, at) values ($1, $2, 0, $3)
       on conflict (user_id) do update set until_at = greatest(orbit_chat_mutes.until_at, excluded.until_at), at = excluded.at`,
      [msg[0].user_id, until, now],
    );
    await sql.query(`insert into orbit_mod_log (mod_id, action, target_user, msg_id, room, note, at) values ($1, 'mute', $2, $3, $4, $5, $6)`, [me.id, msg[0].user_id, data.id, msg[0].room, `${data.hours} год`, now]);
    return { ok: true };
  });

export type ModState = { signedIn: boolean; state: "none" | "pending" | "approved" | "rejected"; isMod: boolean; at: number; note: string };

/** Мій статус модератора: заявка й чи вже затверджено. */
export const modStatus = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => creds(raw))
  .handler(async ({ data }): Promise<ModState> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { signedIn: false, state: "none", isMod: false, at: 0, note: "" };
    const app = await sql.query<{ state: string; at: string; note: string }>(`select state, at, note from orbit_mod_apps where user_id = $1`, [me.id]);
    const st = app[0]?.state;
    return { signedIn: true, state: st === "pending" || st === "approved" || st === "rejected" ? st : "none", isMod: await isMod(sql, me.id), at: Number(app[0]?.at ?? 0), note: app[0]?.note ?? "" };
  });

export const MOD_WHY_MIN = 30;
export const MOD_EXP_MAX = 400;
export const MOD_MIN_AGE_MS = 3 * 24 * 60 * 60 * 1000;
/** Сервер може скоротити поріг (ORBIT_MOD_MIN_AGE_H, години) — напр. для локальних перевірок. Типово 72 год. */
function modMinAge() {
  const h = Number(process.env.ORBIT_MOD_MIN_AGE_H);
  return Number.isFinite(h) && h >= 0 && process.env.ORBIT_MOD_MIN_AGE_H?.trim() ? h * 3_600_000 : MOD_MIN_AGE_MS;
}

/** Заявка «Стати модератором». Нічого не вмикає сама: рішення ухвалює власник на /owner. */
export const modApply = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const b = (raw ?? {}) as { why?: unknown; exp?: unknown; agree?: unknown };
    return { ...creds(raw), why: cleanText(b.why, WHY_MAX), exp: cleanText(b.exp, MOD_EXP_MAX), agree: b.agree === true };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    if (data.why.length < MOD_WHY_MIN) return { ok: false, error: `Розкажи трохи більше — хоча б ${MOD_WHY_MIN} знаків.` };
    if (!data.agree) return { ok: false, error: "Потрібна згода з правилами модератора." };
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { ok: false, error: "Увійди, щоб подати заявку." };
    const acc = me.world.accounts.find((a) => a.id === me.id);
    if (acc && Date.now() - acc.createdAt < modMinAge()) return { ok: false, error: "Заявку можна подати через 3 дні після реєстрації." };
    const now = Date.now();
    const out = await sql.query<{ user_id: string }>(
      `insert into orbit_mod_apps (user_id, why, experience, agreed, state, at) values ($1, $2, $3, true, 'pending', $4)
       on conflict (user_id) do update set why = excluded.why, experience = excluded.experience, agreed = true, state = 'pending', at = excluded.at, decided_at = null, note = ''
       where orbit_mod_apps.state <> 'approved' and (orbit_mod_apps.state = 'pending' or orbit_mod_apps.decided_at < $5)
       returning user_id`,
      [me.id, data.why, data.exp, now, now - 7 * 24 * 60 * 60 * 1000],
    );
    return out[0] ? { ok: true } : { ok: false, error: "Повторну заявку можна подати через 7 днів після рішення." };
  });

/** Щоденний «Заряд» на сервері: прочитати серію або торкнутися (раз на добу UTC). Лише вигляд, ✦ не змінює. */
export const ritualSync = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), tap: Boolean((raw as { tap?: unknown } | null)?.tap) }))
  .handler(async ({ data }): Promise<{ ok: boolean; last: string; streak: number; best: number }> => {
    const { nextRitual } = await import("@/lib/orbit/ritual");
    const { utcDay } = await import("@/lib/orbit/engine");
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { ok: false, last: "", streak: 0, best: 0 };
    const rows = await sql.query<{ last_day: string; streak: number; best: number }>(`select last_day, streak, best from orbit_ritual where user_id = $1`, [me.id]);
    const prev = rows[0] ? { last: rows[0].last_day, streak: Number(rows[0].streak), best: Number(rows[0].best) } : { last: "", streak: 0, best: 0 };
    if (!data.tap) return { ok: true, ...prev };
    const now = Date.now();
    const next = nextRitual(prev, utcDay(now), utcDay(now - 86_400_000));
    if (next !== prev) {
      await sql.query(
        `insert into orbit_ritual (user_id, last_day, streak, best, updated_at) values ($1, $2, $3, $4, $5)
         on conflict (user_id) do update set last_day = excluded.last_day, streak = excluded.streak, best = excluded.best, updated_at = excluded.updated_at`,
        [me.id, next.last, next.streak, next.best, now],
      );
    }
    return { ok: true, ...next };
  });

/* ---------- Особисті розмови й «Шукаю орбіту» ---------- */

type Me = { id: string; name: string; world: World };

async function blockedEither(sql: Sql, a: string, b: string): Promise<boolean> {
  const r = await sql.query<{ n: number }>(`select 1 as n from orbit_blocks where (user_id = $1 and blocked = $2) or (user_id = $2 and blocked = $1) limit 1`, [a, b]);
  return Boolean(r[0]);
}

/** Мої кімнати: запуски/екіпажі (зі світу) + особисті розмови (з бази), найсвіжіші розмови першими. */
async function myRooms(sql: Sql, me: Me): Promise<RoomInfo[]> {
  const launches = roomsFor(me.world, me.id);
  const rows = await sql.query<{ room: string; a: string; b: string }>(
    `select room, a, b from orbit_dm where a = $1 or b = $1 order by last_at desc limit 40`, [me.id]);
  const names = new Map(me.world.accounts.map((x) => [x.id, x.name]));
  const dms: RoomInfo[] = [];
  for (const r of rows) {
    const peer = r.a === me.id ? r.b : r.a;
    const name = names.get(peer);
    if (!name || !canUseRoom(me.world, me.id, r.room)) continue;
    dms.push({ id: r.room, kind: "dm", title: shortName(name), members: 2, peer });
  }
  return [...dms, ...launches];
}

/** Відкрити (або створити) особисту розмову з людиною. Повідомлення не надсилає. */
export const dmOpen = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), peer: String((raw as { peer?: unknown })?.peer ?? "").slice(0, 44) }))
  .handler(async ({ data }): Promise<{ ok: boolean; room?: string; title?: string; error?: string }> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { ok: false, error: "Увійди, щоб писати." };
    const room = dmRoom(me.id, data.peer);
    const peer = me.world.accounts.find((a) => a.id === data.peer);
    if (!room || !peer || !canUseRoom(me.world, me.id, room)) return { ok: false, error: "Цієї людини не знайдено." };
    if (await blockedEither(sql, me.id, peer.id)) return { ok: false, error: "Ця розмова недоступна." };
    const pair = dmPair(room)!;
    const now = Date.now();
    await sql.query(`insert into orbit_dm (room, a, b, at, last_at) values ($1, $2, $3, $4, $4) on conflict (room) do nothing`, [room, pair[0], pair[1], now]);
    return { ok: true, room, title: shortName(peer.name) };
  });

/** Заблокувати / розблокувати людину: вона не зможе писати мені в особисті. */
export const dmBlock = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), peer: String((raw as { peer?: unknown })?.peer ?? "").slice(0, 44), on: (raw as { on?: unknown })?.on !== false }))
  .handler(async ({ data }): Promise<{ ok: boolean; blocked?: boolean }> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me || data.peer === me.id || !me.world.accounts.some((a) => a.id === data.peer)) return { ok: false };
    if (data.on) await sql.query(`insert into orbit_blocks (user_id, blocked, at) values ($1, $2, $3) on conflict do nothing`, [me.id, data.peer, Date.now()]);
    else await sql.query(`delete from orbit_blocks where user_id = $1 and blocked = $2`, [me.id, data.peer]);
    return { ok: true, blocked: data.on };
  });

/** Чи я заблокував цю людину (для меню розмови). */
export const dmState = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), peer: String((raw as { peer?: unknown })?.peer ?? "").slice(0, 44) }))
  .handler(async ({ data }): Promise<{ blocked: boolean; blockedMe: boolean }> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { blocked: false, blockedMe: false };
    const r = await sql.query<{ user_id: string }>(`select user_id from orbit_blocks where (user_id = $1 and blocked = $2) or (user_id = $2 and blocked = $1)`, [me.id, data.peer]);
    return { blocked: r.some((x) => x.user_id === me.id), blockedMe: r.some((x) => x.user_id === data.peer) };
  });

export const SEEK_MAX = 140;
export const SEEK_DAYS = 7;
const SEEK_MS = SEEK_DAYS * 24 * 60 * 60 * 1000;
const SEEK_EDIT_GAP_MS = 60_000;
const SEEK_HIDE_AFTER = 3;
export type SeekCard = { uid: string; name: string; text: string; at: number; expires: number; mine: boolean; orbits: number; stability: number; since: number; reported: boolean };

/** Моя картка «Шукаю орбіту»: увімкнути/оновити (≤140 знаків, живе 7 днів) або зняти. Не частіше разу на хвилину. */
export const seekSet = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), text: cleanText((raw as { text?: unknown })?.text, SEEK_MAX), on: (raw as { on?: unknown })?.on !== false }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; expires?: number }> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { ok: false, error: "Увійди спочатку." };
    const now = Date.now();
    const cur = await sql.query<{ at: string; hidden: boolean; hidden_at: string | null }>(`select at, hidden, hidden_at from orbit_seek where user_id = $1`, [me.id]);
    if (!data.on) { await sql.query(`update orbit_seek set expires_at = $2 where user_id = $1 and not hidden`, [me.id, now]); return { ok: true, expires: 0 }; }
    if (data.text.length < 3) return { ok: false, error: "Напиши кілька слів про себе." };
    if (cur[0]?.hidden && Number(cur[0].hidden_at ?? 0) > now - SEEK_MS) return { ok: false, error: "Картку приховав модератор. Спробуй пізніше." };
    if (cur[0] && Number(cur[0].at) > now - SEEK_EDIT_GAP_MS) return { ok: false, error: "Зачекай хвилину перед наступною зміною." };
    if ((await mutedUntil(sql, me.id, now))) return { ok: false, error: "Під час паузи картку не публікують." };
    const { text } = maskWords(data.text);
    await sql.query(
      `insert into orbit_seek (user_id, text, at, expires_at, hidden, hidden_at, hidden_by) values ($1, $2, $3, $4, false, null, null)
       on conflict (user_id) do update set text = excluded.text, at = excluded.at, expires_at = excluded.expires_at, hidden = false, hidden_at = null, hidden_by = null`,
      [me.id, text, now, now + SEEK_MS]);
    await sql.query(`delete from orbit_seek_reports where card_user = $1`, [me.id]);
    return { ok: true, expires: now + SEEK_MS };
  });

/** Живі картки «Шукаю орбіту» (не сховані, не прострочені, без заблокованих), найновіші першими. */
export const seekList = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => creds(raw))
  .handler(async ({ data }): Promise<{ signedIn: boolean; cards: SeekCard[]; mine: SeekCard | null; mod: boolean }> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { signedIn: false, cards: [], mine: null, mod: false };
    const now = Date.now();
    const rows = await sql.query<{ user_id: string; text: string; at: string; expires_at: string; rep: boolean }>(
      `select s.user_id, s.text, s.at, s.expires_at, exists(select 1 from orbit_seek_reports r where r.card_user = s.user_id and r.reporter = $1) as rep
         from orbit_seek s
        where not s.hidden and s.expires_at > $2
          and not exists(select 1 from orbit_blocks b where (b.user_id = $1 and b.blocked = s.user_id) or (b.user_id = s.user_id and b.blocked = $1))
        order by s.at desc limit 60`, [me.id, now]);
    const cards: SeekCard[] = [];
    for (const r of rows) {
      const acc = me.world.accounts.find((a) => a.id === r.user_id);
      if (!acc) continue;
      cards.push({ uid: acc.id, name: shortName(acc.name), text: r.text, at: Number(r.at), expires: Number(r.expires_at), mine: acc.id === me.id,
        orbits: me.world.orbits.filter((o) => o.ownerId === acc.id).length, stability: acc.stability, since: acc.createdAt, reported: r.rep });
    }
    return { signedIn: true, cards: cards.filter((c) => !c.mine), mine: cards.find((c) => c.mine) ?? null, mod: await isMod(sql, me.id) };
  });

/** Скарга на картку: одна від людини; після 3 скарг картка ховається сама. */
export const seekReport = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), uid: String((raw as { uid?: unknown })?.uid ?? "").slice(0, 44) }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me || data.uid === me.id) return { ok: false };
    const now = Date.now();
    await sql.query(`insert into orbit_seek_reports (card_user, reporter, at) values ($1, $2, $3) on conflict do nothing`, [data.uid, me.id, now]);
    const n = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_seek_reports where card_user = $1`, [data.uid]);
    if ((n[0]?.n ?? 0) >= SEEK_HIDE_AFTER) await sql.query(`update orbit_seek set hidden = true, hidden_at = $2, hidden_by = 'reports' where user_id = $1`, [data.uid, now]);
    return { ok: true };
  });

/** Модератор ховає картку (із записом у журнал). */
export const seekHide = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), uid: String((raw as { uid?: unknown })?.uid ?? "").slice(0, 44) }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me || !(await isMod(sql, me.id))) return { ok: false, error: "Лише для модераторів." };
    const now = Date.now();
    await sql.query(`update orbit_seek set hidden = true, hidden_at = $2, hidden_by = $3 where user_id = $1`, [data.uid, now, me.id]);
    await sql.query(`insert into orbit_mod_log (mod_id, action, target_user, msg_id, room, note, at) values ($1, 'seek-hide', $2, null, null, '', $3)`, [me.id, data.uid, now]);
    return { ok: true };
  });
