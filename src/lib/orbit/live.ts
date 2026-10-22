import { createServerFn } from "@tanstack/react-start";
import { CHAT_MAX, CHAT_PER_MIN, CHAT_READ, HIDE_AFTER_REPORTS, WHY_MAX, WHY_MIN, canUseRoom, cleanText, normRoom, roomsFor, shortName, type RoomInfo } from "@/lib/orbit/live-rules";
import type { World } from "@/lib/orbit/engine";

/**
 * Живий шар: чат світу, заявки на роль, сигнали «схоже на бота».
 * Окремі таблиці (міграція 0038), не документ світу. Нічого тут не змінює ✦, орбіти чи формули (engine.ts не чіпається).
 * Хто пише — визначає сервер за ключем сесії (як orbitAct), а не за id з клієнта.
 */
export type ChatLine = { id: number; name: string; text: string; at: number; mine: boolean };
type Creds = { sessionId: string | null; sessionKey: string | null };
type Sql = import("@/lib/db").Sql;

const g = globalThis as { __orbitLiveReady__?: Promise<void> };
async function ready(sql: Sql) {
  g.__orbitLiveReady__ ??= (async () => {
    const a = (await import("../../../migrations/0038_orbit_live.sql?raw")).default;
    const b = (await import("../../../migrations/0039_chat_rooms.sql?raw")).default;
    for (const stmt of `${a};\n${b}`.replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean)) await sql.query(stmt, []);
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

/** Перевірка ключа тим самим шляхом, що й orbitAct (лише читання світу, без блокування). */
async function whoIs(sql: Sql, c: Creds): Promise<{ id: string; name: string; world: World } | null> {
  if (!c.sessionId || !c.sessionKey) return null;
  const server = await import("@tanstack/react-start/server");
  const dev = await import("@/lib/orbit/device");
  const { unpackDoc } = await import("@/lib/orbit/access");
  const K = await import("@/lib/orbit/key-hash");
  const rawIp = server.getRequestHeader("x-nf-client-connection-ip") ?? server.getRequestIP({ xForwardedFor: true }) ?? "unknown";
  const rows = await sql.query<{ doc: unknown }>(`select doc from orbit_world where id = 'world'`, []);
  if (!rows[0]) return null;
  const bag = unpackDoc(rows[0].doc);
  if (!K.verifyKey(bag.keys, c.sessionId, c.sessionKey, `v:${dev.ipTag(rawIp.split(",")[0].trim())}`)) return null;
  const account = bag.world.accounts.find((item) => item.id === c.sessionId);
  return account ? { id: account.id, name: shortName(account.name), world: bag.world } : null;
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

/**
 * Читання кімнати. after = останній id, який уже є в клієнта; wait = довге опитування:
 * сервер до 8 с раз на секунду дешево перевіряє, чи з'явилося нове (лише індекс room,id), і відповідає одразу, як з'явилося.
 * Доступ до кімнати перевіряється на кожен запит за даними світу (автор + підтверджувачі запуску).
 */
export const chatRead = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const body = (raw ?? {}) as { after?: unknown; room?: unknown; wait?: unknown };
    return { ...creds(raw), room: normRoom(body.room), after: Math.max(0, Math.floor(Number(body.after) || 0)), wait: body.wait === true };
  })
  .handler(async ({ data }): Promise<{ lines: ChatLine[]; hidden: number[]; online: number; signedIn: boolean; allowed: boolean }> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { lines: [], hidden: [], online: 0, signedIn: false, allowed: false };
    if (!data.room || !canUseRoom(me.world, me.id, data.room)) return { lines: [], hidden: [], online: 0, signedIn: true, allowed: false };
    const room = data.room;
    const mark = async () => {
      const now = Date.now();
      await sql.query(
        `insert into orbit_chat_seen (user_id, room, last_id, seen_at) values ($1, $2, coalesce((select max(id) from orbit_chat where room = $2), 0), $3)
         on conflict (user_id, room) do update set last_id = excluded.last_id, seen_at = excluded.seen_at`,
        [me.id, room, now],
      );
      return now;
    };
    if (data.after > 0 && data.wait) {
      await mark();
      const until = Date.now() + WAIT_MS;
      while (Date.now() < until) {
        const fresh = await sql.query<{ id: string }>(`select id from orbit_chat where room = $1 and id > $2 limit 1`, [room, data.after]);
        if (fresh.length) break;
        await new Promise((r) => setTimeout(r, TICK_MS));
      }
    }
    const rows = data.after > 0
      ? await sql.query<Row>(`select id, user_id, name, text, at from orbit_chat where room = $1 and id > $2 and not hidden order by id asc limit ${CHAT_READ}`, [room, data.after])
      : (await sql.query<Row>(`select id, user_id, name, text, at from orbit_chat where room = $1 and not hidden order by id desc limit ${CHAT_READ}`, [room])).reverse();
    const hid = await sql.query<{ id: string }>(`select id from orbit_chat where room = $1 and hidden and id > $2 order by id desc limit 50`, [room, Math.max(0, data.after - 500)]);
    const now = await mark();
    return { signedIn: true, allowed: true, lines: rows.map(toLine(me.id)), hidden: hid.map((r) => Number(r.id)), online: await onlineIn(sql, room, now) };
  });

/** Мої кімнати з кількістю непрочитаного (чужі повідомлення після останнього перегляду, до 99). */
export const chatRooms = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => creds(raw))
  .handler(async ({ data }): Promise<{ rooms: (RoomInfo & { unread: number })[]; online: number; signedIn: boolean }> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { rooms: [], online: 0, signedIn: false };
    const list = roomsFor(me.world, me.id);
    const rooms = [];
    for (const room of list) {
      const n = await sql.query<{ n: number }>(
        `select count(*)::int as n from (select 1 from orbit_chat c where c.room = $1 and not c.hidden and c.user_id <> $2
           and c.id > coalesce((select last_id from orbit_chat_seen s where s.user_id = $2 and s.room = $1), 0) limit 99) t`,
        [room.id, me.id],
      );
      rooms.push({ ...room, unread: n[0]?.n ?? 0 });
    }
    return { rooms, online: await onlineIn(sql, "world", Date.now()), signedIn: true };
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
    // Ліміт рахується в кожній кімнаті окремо; спільний запобіжник — удвічі більший на всі кімнати разом.
    const recent = await sql.query<{ n: number; all: number }>(
      `select count(*) filter (where room = $3)::int as n, count(*)::int as all from orbit_chat where user_id = $1 and at > $2`, [me.id, now - 60_000, data.room]);
    if ((recent[0]?.n ?? 0) >= CHAT_PER_MIN || (recent[0]?.all ?? 0) >= CHAT_PER_MIN * 2) return { ok: false, error: "Забагато повідомлень. Зачекай хвилину." };
    const same = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_chat where user_id = $1 and room = $2 and text = $3 and at > $4`, [me.id, data.room, data.text, now - 10 * 60_000]);
    if ((same[0]?.n ?? 0) > 0) return { ok: false, error: "Це вже було щойно." };
    await sql.query(`insert into orbit_chat (room, user_id, name, text, at) values ($1, $2, $3, $4, $5)`, [data.room, me.id, me.name, data.text, now]);
    return { ok: true };
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
    if ((n[0]?.n ?? 0) >= HIDE_AFTER_REPORTS) await sql.query(`update orbit_chat set hidden = true where id = $1`, [data.id]);
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
