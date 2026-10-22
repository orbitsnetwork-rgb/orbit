import { createServerFn } from "@tanstack/react-start";

/**
 * Сторінка власника (/owner): перевірка схованих скаргами повідомлень, заявок на роль, позначок «схоже на бота», пауз у чаті.
 * Доступ — лише з ORBIT_ADMIN_TOKEN, який перевіряє СЕРВЕР (у клієнтському коді токена немає; людина вводить його сама).
 * Якщо змінна не задана або коротша за 24 символи — сторінка вимкнена.
 * Жодна дія тут не змінює ✦, орбіти чи формули: лише видимість повідомлень і позначки «переглянуто».
 */
type Sql = import("@/lib/db").Sql;
const FAILS = new Map<string, number[]>();

async function gate(token: unknown): Promise<{ ok: true; sql: Sql } | { ok: false; error: string }> {
  const server = await import("@tanstack/react-start/server");
  const ip = (server.getRequestHeader("x-nf-client-connection-ip") ?? server.getRequestIP({ xForwardedFor: true }) ?? "unknown").split(",")[0].trim();
  const now = Date.now();
  const fails = (FAILS.get(ip) ?? []).filter((t) => t > now - 10 * 60_000);
  if (fails.length >= 8) return { ok: false, error: "Забагато спроб. Зачекай 10 хвилин." };
  const want = process.env.ORBIT_ADMIN_TOKEN?.trim() ?? "";
  const got = typeof token === "string" ? token.trim().slice(0, 256) : "";
  const { timingSafeEqual, createHash } = await import("node:crypto");
  // Порівнюємо хеші однакової довжини — без витоку довжини токена.
  const same = want.length >= 24 && timingSafeEqual(createHash("sha256").update(got).digest(), createHash("sha256").update(want).digest());
  if (!same) {
    if (FAILS.size > 2000) FAILS.clear();
    FAILS.set(ip, [...fails, now]);
    return { ok: false, error: "Невірний токен або сторінку вимкнено." };
  }
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const live = await import("@/lib/orbit/live");
  await live.ensureLive(sql);
  return { ok: true, sql };
}

async function names(sql: Sql): Promise<Map<string, string>> {
  const { unpackDoc } = await import("@/lib/orbit/access");
  const rows = await sql.query<{ doc: unknown }>(`select doc from orbit_world where id = 'world'`, []);
  const world = rows[0] ? unpackDoc(rows[0].doc).world : null;
  return new Map((world?.accounts ?? []).map((a) => [a.id, a.name]));
}

export type OwnerView = {
  ok: boolean; error?: string;
  hidden: { id: number; room: string; name: string; userId: string; text: string; at: number; reports: number }[];
  roles: { userId: string; name: string; role: string; why: string; at: number }[];
  bots: { userId: string; name: string; reason: string; hits: number; lastAt: number }[];
  mutes: { userId: string; name: string; until: number; hiddenN: number }[];
  keepDays: number;
};
const NONE = { hidden: [], roles: [], bots: [], mutes: [], keepDays: 0 };

export const ownerView = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ token: (raw as { token?: unknown })?.token }))
  .handler(async ({ data }): Promise<OwnerView> => {
    const g = await gate(data.token);
    if (!g.ok) return { ok: false, error: g.error, ...NONE };
    const { sql } = g;
    const who = await names(sql);
    const nm = (id: string, fallback = "—") => who.get(id) ?? fallback;
    const hidden = await sql.query<{ id: string; room: string; name: string; user_id: string; text: string; at: string; n: number }>(
      `select c.id, c.room, c.name, c.user_id, c.text, c.at, (select count(*)::int from orbit_chat_reports r where r.msg_id = c.id) as n
         from orbit_chat c where c.hidden and not c.removed and c.reviewed_at is null order by c.id desc limit 100`, []);
    const roles = await sql.query<{ user_id: string; role: string; why: string; at: string }>(`select user_id, role, why, at from orbit_role_asks where state = 'wait' order by at desc limit 100`, []);
    const bots = await sql.query<{ user_id: string; reason: string; hits: number; last_at: string }>(`select user_id, reason, hits, last_at from orbit_bot_flags where state = 'review' order by last_at desc limit 100`, []);
    const mutes = await sql.query<{ user_id: string; until_at: string; hidden_n: number }>(`select user_id, until_at, hidden_n from orbit_chat_mutes where until_at > $1 order by until_at desc limit 100`, [Date.now()]);
    const { keepDays } = await import("@/lib/orbit/live-rules");
    return {
      ok: true,
      hidden: hidden.map((r) => ({ id: Number(r.id), room: r.room, name: r.name, userId: r.user_id, text: r.text, at: Number(r.at), reports: r.n })),
      roles: roles.map((r) => ({ userId: r.user_id, name: nm(r.user_id), role: r.role, why: r.why, at: Number(r.at) })),
      bots: bots.map((r) => ({ userId: r.user_id, name: nm(r.user_id), reason: r.reason, hits: r.hits, lastAt: Number(r.last_at) })),
      mutes: mutes.map((r) => ({ userId: r.user_id, name: nm(r.user_id), until: Number(r.until_at), hiddenN: r.hidden_n })),
      keepDays: keepDays(process.env.ORBIT_CHAT_KEEP_DAYS),
    };
  });

type Op = "restore" | "delete" | "roleSeen" | "botSeen" | "unmute";
const OPS: Op[] = ["restore", "delete", "roleSeen", "botSeen", "unmute"];

export const ownerAct = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const b = (raw ?? {}) as { token?: unknown; op?: unknown; id?: unknown; userId?: unknown; role?: unknown };
    return {
      token: b.token,
      op: OPS.includes(b.op as Op) ? (b.op as Op) : null,
      id: Math.max(0, Math.floor(Number(b.id) || 0)),
      userId: typeof b.userId === "string" ? b.userId.slice(0, 64) : "",
      role: b.role === "admin" ? "admin" : "confirmer",
    };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const g = await gate(data.token);
    if (!g.ok) return { ok: false, error: g.error };
    if (!data.op) return { ok: false, error: "Невідома дія." };
    const { sql } = g;
    const now = Date.now();
    switch (data.op) {
      case "restore": {
        // Повертаємо повідомлення; скарги на нього знімаються, повторно сховати його скаргами вже не можна (позначка «переглянуто»).
        const out = await sql.query<{ user_id: string }>(`update orbit_chat set hidden = false, reviewed_at = $2 where id = $1 and not removed returning user_id`, [data.id, now]);
        if (!out[0]) return { ok: false, error: "Повідомлення не знайдено." };
        await sql.query(`delete from orbit_chat_reports where msg_id = $1`, [data.id]);
        // Пауза автора перераховується без цього повідомлення: якщо підстав більше немає — знімається.
        const left = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_chat where user_id = $1 and hidden and at > $2`, [out[0].user_id, now - 30 * 24 * 60 * 60 * 1000]);
        if ((left[0]?.n ?? 0) < 2) await sql.query(`update orbit_chat_mutes set until_at = 0 where user_id = $1`, [out[0].user_id]);
        return { ok: true };
      }
      case "delete": {
        const out = await sql.query<{ id: string }>(`update orbit_chat set hidden = true, removed = true, text = '', reviewed_at = $2 where id = $1 returning id`, [data.id, now]);
        if (!out[0]) return { ok: false, error: "Повідомлення не знайдено." };
        await sql.query(`delete from orbit_chat_reacts where msg_id = $1`, [data.id]);
        return { ok: true };
      }
      case "roleSeen":
        await sql.query(`update orbit_role_asks set state = 'seen' where user_id = $1 and role = $2 and state = 'wait'`, [data.userId, data.role]);
        return { ok: true };
      case "botSeen":
        await sql.query(`update orbit_bot_flags set state = 'ok' where user_id = $1`, [data.userId]);
        return { ok: true };
      case "unmute":
        await sql.query(`update orbit_chat_mutes set until_at = 0 where user_id = $1`, [data.userId]);
        return { ok: true };
    }
  });
