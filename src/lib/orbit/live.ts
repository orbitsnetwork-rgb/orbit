import { createServerFn } from "@tanstack/react-start";
import { CHAT_MAX, CHAT_PER_MIN, CHAT_READ, HIDE_AFTER_REPORTS, WHY_MAX, WHY_MIN, cleanText, shortName } from "@/lib/orbit/live-rules";

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
    const schema = (await import("../../../migrations/0038_orbit_live.sql?raw")).default;
    for (const stmt of String(schema).replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean)) await sql.query(stmt, []);
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
async function whoIs(sql: Sql, c: Creds): Promise<{ id: string; name: string } | null> {
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
  return account ? { id: account.id, name: shortName(account.name) } : null;
}

async function db() {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await ready(sql);
  return sql;
}

export const chatRead = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), after: Math.max(0, Number((raw as { after?: unknown })?.after) || 0) }))
  .handler(async ({ data }): Promise<{ lines: ChatLine[]; signedIn: boolean }> => {
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { lines: [], signedIn: false };
    const rows = await sql.query<{ id: string | number; user_id: string; name: string; text: string; at: string | number }>(
      `select id, user_id, name, text, at from orbit_chat where room = 'world' and not hidden order by id desc limit ${CHAT_READ}`,
      [],
    );
    return { signedIn: true, lines: rows.reverse().map((r) => ({ id: Number(r.id), name: r.name, text: r.text, at: Number(r.at), mine: r.user_id === me.id })) };
  });

export const chatSend = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...creds(raw), text: cleanText((raw as { text?: unknown })?.text, CHAT_MAX) }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    if (!data.text) return { ok: false, error: "Порожнє повідомлення." };
    const sql = await db();
    const me = await whoIs(sql, data);
    if (!me) return { ok: false, error: "Увійди, щоб писати." };
    const now = Date.now();
    const recent = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_chat where user_id = $1 and at > $2`, [me.id, now - 60_000]);
    if ((recent[0]?.n ?? 0) >= CHAT_PER_MIN) return { ok: false, error: "Забагато повідомлень. Зачекай хвилину." };
    const same = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_chat where user_id = $1 and text = $2 and at > $3`, [me.id, data.text, now - 10 * 60_000]);
    if ((same[0]?.n ?? 0) > 0) return { ok: false, error: "Це вже було щойно." };
    await sql.query(`insert into orbit_chat (room, user_id, name, text, at) values ('world', $1, $2, $3, $4)`, [me.id, me.name, data.text, now]);
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
    const own = await sql.query<{ user_id: string }>(`select user_id from orbit_chat where id = $1`, [data.id]);
    if (!own[0] || own[0].user_id === me.id) return { ok: false };
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
