import { createServerFn } from "@tanstack/react-start";

/**
 * Сторінка власника (/owner): перевірка схованих скаргами повідомлень, заявок на роль, позначок «схоже на бота», пауз у чаті.
 * Доступ — лише з ORBIT_ADMIN_TOKEN, який перевіряє СЕРВЕР (у клієнтському коді токена немає; людина вводить його сама).
 * Якщо змінна не задана або коротша за 24 символи — сторінка вимкнена.
 * Жодна дія тут не змінює ✦, орбіти чи формули: лише видимість повідомлень і позначки «переглянуто».
 */
type Sql = import("@/lib/db").Sql;
const FAILS = new Map<string, number[]>();

/**
 * Власник за акаунтом: ORBIT_OWNER_IDS (id акаунтів через кому) або ORBIT_OWNER_EMAILS (пошта, підтверджена при реєстрації).
 * Обидві змінні — лише в налаштуваннях воркера, не в git. Перевірка ключа сесії — та сама, що в чаті.
 */
export function ownerListed(id: string, email: string | null, env = process.env): boolean {
  const list = (v?: string) => (v ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (list(env.ORBIT_OWNER_IDS).includes(id.toLowerCase())) return true;
  return Boolean(email) && list(env.ORBIT_OWNER_EMAILS).includes(String(email).trim().toLowerCase());
}
async function ownerBySession(session: unknown): Promise<{ ok: true; sql: Sql } | null> {
  if (!session || typeof session !== "object") return null;
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const { sessionUser } = await import("@/lib/orbit/session-user");
  const me = await sessionUser(sql, session).catch(() => null);
  if (!me) return null;
  let email: string | null = null;
  if (process.env.ORBIT_OWNER_EMAILS) {
    const rows = await sql.query<{ doc: unknown }>(`select doc from orbit_world where id = 'world'`, []);
    const { unpackDoc } = await import("@/lib/orbit/access");
    const people = (rows[0] ? unpackDoc(rows[0].doc).people : []) as unknown as { userId?: string; email?: string }[];
    const p = people.find((x) => x?.userId === me.id);
    email = p?.email ?? null;
  }
  if (!ownerListed(me.id, email)) return null;
  await (await import("@/lib/orbit/live")).ensureLive(sql);
  return { ok: true, sql };
}

/** Чи бачить цей акаунт «Адмін-панель» (лише так/ні; нічого не розкриває). */
export const ownerCheck = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ session: (raw as { session?: unknown })?.session }))
  .handler(async ({ data }): Promise<{ owner: boolean }> => ({ owner: Boolean(await ownerBySession(data.session).catch(() => null)) }));

async function gate(token: unknown, session?: unknown): Promise<{ ok: true; sql: Sql } | { ok: false; error: string }> {
  const viaSession = await ownerBySession(session).catch(() => null);
  if (viaSession) return viaSession;
  if (!token) return { ok: false, error: session ? "Цей акаунт не має доступу до адмін-панелі." : "Увійди акаунтом власника." };
  const ip = await (await import("@/lib/orbit/client-ip")).requestIp();
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

type OwnWorld = import("@/lib/orbit/engine").World;
async function loadWorld(sql: Sql): Promise<OwnWorld | null> {
  const { unpackDoc } = await import("@/lib/orbit/access");
  const rows = await sql.query<{ doc: unknown }>(`select doc from orbit_world where id = 'world'`, []);
  return rows[0] ? unpackDoc(rows[0].doc).world : null;
}

/**
 * «Кільце ботів»: лише читання з дзеркальних таблиць (orbit_device_seen, orbit_vouches, orbit_bot_flags) і світу.
 * Ідентифікатори пристроїв лишаються на сервері — назовні тільки кількості. Помилка тут не ламає решту сторінки.
 */
async function rings(sql: Sql, world: OwnWorld | null): Promise<{ list: import("@/lib/orbit/bot-ring").Ring[]; regCapDevices: number; error?: boolean }> {
  try {
    const { findRings } = await import("@/lib/orbit/bot-ring");
    const { NAMES_PER_DEVICE } = await import("@/lib/orbit/access");
    const seenRows = await sql.query<{ device: string; ids: unknown }>(`select device, ids from orbit_device_seen where jsonb_typeof(ids) = 'array' and jsonb_array_length(ids) > 1`, []);
    const vouchRows = await sql.query<{ witness_id: string; author_id: string; at: string }>(`select witness_id, author_id, at from orbit_vouches`, []);
    const flagRows = await sql.query<{ user_id: string }>(`select user_id from orbit_bot_flags where state = 'review'`, []);
    const today = new Date().toISOString().slice(0, 10);
    const cap = await sql.query<{ n: number }>(`select count(*)::int as n from orbit_device_day where day = $1 and count >= $2`, [today, NAMES_PER_DEVICE]);
    const seen: Record<string, string[]> = {};
    for (const r of seenRows) if (Array.isArray(r.ids)) seen[r.device] = r.ids.filter((x): x is string => typeof x === "string");
    const confirms = vouchRows.map((r) => ({ witness: r.witness_id, author: r.author_id, at: Number(r.at) }));
    for (const c of world?.creations ?? []) for (const k of c.confirms) confirms.push({ witness: k.witnessId, author: c.userId, at: k.at });
    const list = findRings({ accounts: (world?.accounts ?? []).map((a) => ({ id: a.id, name: a.name, createdAt: a.createdAt })), confirms, seen, flagged: flagRows.map((r) => r.user_id) });
    return { list, regCapDevices: cap[0]?.n ?? 0 };
  } catch (e) {
    console.error("owner rings failed", e instanceof Error ? e.message : e);
    return { list: [], regCapDevices: 0, error: true };
  }
}

export type OwnerView = {
  ok: boolean; error?: string;
  hidden: { id: number; room: string; name: string; userId: string; text: string; at: number; reports: number }[];
  roles: { userId: string; name: string; role: string; why: string; at: number }[];
  bots: { userId: string; name: string; reason: string; hits: number; lastAt: number }[];
  mutes: { userId: string; name: string; until: number; hiddenN: number }[];
  keepDays: number;
  modApps: { userId: string; name: string; why: string; exp: string; at: number; state: string }[];
  mods: { userId: string; name: string; at: number }[];
  modLog: { id: number; mod: string; action: string; target: string; msgId: number | null; note: string; at: number }[];
  /** «Кільце ботів» — лише сигнал, без ідентифікаторів пристроїв. */
  rings: import("@/lib/orbit/bot-ring").Ring[];
  ringsError?: boolean;
  /** Скільки пристроїв сьогодні вичерпали ліміт реєстрацій (без самих пристроїв). */
  regCapDevices: number;
};
const NONE = { hidden: [], roles: [], bots: [], mutes: [], keepDays: 0, modApps: [], mods: [], modLog: [], rings: [], regCapDevices: 0 };

export const ownerView = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ token: (raw as { token?: unknown })?.token, session: (raw as { session?: unknown })?.session }))
  .handler(async ({ data }): Promise<OwnerView> => {
    const g = await gate(data.token, data.session);
    if (!g.ok) return { ok: false, error: g.error, ...NONE };
    const { sql } = g;
    const world = await loadWorld(sql);
    const who = new Map((world?.accounts ?? []).map((a) => [a.id, a.name]));
    const ring = await rings(sql, world);
    const nm = (id: string, fallback = "—") => who.get(id) ?? fallback;
    const hidden = await sql.query<{ id: string; room: string; name: string; user_id: string; text: string; at: string; n: number }>(
      `select c.id, c.room, c.name, c.user_id, c.text, c.at, (select count(*)::int from orbit_chat_reports r where r.msg_id = c.id) as n
         from orbit_chat c where c.hidden and not c.removed and c.reviewed_at is null order by c.id desc limit 100`, []);
    const roles = await sql.query<{ user_id: string; role: string; why: string; at: string }>(`select user_id, role, why, at from orbit_role_asks where state = 'wait' order by at desc limit 100`, []);
    const bots = await sql.query<{ user_id: string; reason: string; hits: number; last_at: string }>(`select user_id, reason, hits, last_at from orbit_bot_flags where state = 'review' order by last_at desc limit 100`, []);
    const mutes = await sql.query<{ user_id: string; until_at: string; hidden_n: number }>(`select user_id, until_at, hidden_n from orbit_chat_mutes where until_at > $1 order by until_at desc limit 100`, [Date.now()]);
    const { keepDays } = await import("@/lib/orbit/live-rules");
    const apps = await sql.query<{ user_id: string; why: string; experience: string; at: string; state: string }>(`select user_id, why, experience, at, state from orbit_mod_apps where state = 'pending' order by at asc limit 100`, []);
    const mods = await sql.query<{ user_id: string; at: string }>(`select user_id, at from orbit_mods order by at desc limit 200`, []);
    const log = await sql.query<{ id: string; mod_id: string; action: string; target_user: string | null; msg_id: string | null; note: string; at: string }>(`select id, mod_id, action, target_user, msg_id, note, at from orbit_mod_log order by id desc limit 100`, []);
    return {
      ok: true,
      modApps: apps.map((r) => ({ userId: r.user_id, name: nm(r.user_id), why: r.why, exp: r.experience, at: Number(r.at), state: r.state })),
      mods: mods.map((r) => ({ userId: r.user_id, name: nm(r.user_id), at: Number(r.at) })),
      modLog: log.map((r) => ({ id: Number(r.id), mod: nm(r.mod_id), action: r.action, target: r.target_user ? nm(r.target_user) : "—", msgId: r.msg_id ? Number(r.msg_id) : null, note: r.note, at: Number(r.at) })),
      hidden: hidden.map((r) => ({ id: Number(r.id), room: r.room, name: r.name, userId: r.user_id, text: r.text, at: Number(r.at), reports: r.n })),
      roles: roles.map((r) => ({ userId: r.user_id, name: nm(r.user_id), role: r.role, why: r.why, at: Number(r.at) })),
      bots: bots.map((r) => ({ userId: r.user_id, name: nm(r.user_id), reason: r.reason, hits: r.hits, lastAt: Number(r.last_at) })),
      mutes: mutes.map((r) => ({ userId: r.user_id, name: nm(r.user_id), until: Number(r.until_at), hiddenN: r.hidden_n })),
      keepDays: keepDays(process.env.ORBIT_CHAT_KEEP_DAYS),
      rings: ring.list,
      ...(ring.error ? { ringsError: true } : {}),
      regCapDevices: ring.regCapDevices,
    };
  });

type Op = "restore" | "delete" | "roleSeen" | "botSeen" | "unmute" | "modApprove" | "modReject" | "modRevoke";
const OPS: Op[] = ["restore", "delete", "roleSeen", "botSeen", "unmute", "modApprove", "modReject", "modRevoke"];

export const ownerAct = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const b = (raw ?? {}) as { token?: unknown; session?: unknown; op?: unknown; id?: unknown; userId?: unknown; role?: unknown };
    return {
      token: b.token,
      session: b.session,
      op: OPS.includes(b.op as Op) ? (b.op as Op) : null,
      id: Math.max(0, Math.floor(Number(b.id) || 0)),
      userId: typeof b.userId === "string" ? b.userId.slice(0, 64) : "",
      role: b.role === "admin" ? "admin" : "confirmer",
    };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const g = await gate(data.token, data.session);
    if (!g.ok) return { ok: false, error: g.error };
    if (!data.op) return { ok: false, error: "Невідома дія." };
    const { sql } = g;
    const now = Date.now();
    switch (data.op) {
      case "restore": {
        // Повертаємо повідомлення; скарги на нього знімаються, повторно сховати його скаргами вже не можна (позначка «переглянуто»).
        const out = await sql.query<{ user_id: string }>(`update orbit_chat set hidden = false, reviewed_at = $2, rev = nextval('orbit_chat_rev_seq') where id = $1 and not removed returning user_id`, [data.id, now]);
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
      case "modApprove": {
        const out = await sql.query<{ user_id: string }>(`update orbit_mod_apps set state = 'approved', decided_at = $2 where user_id = $1 and state = 'pending' returning user_id`, [data.userId, now]);
        if (!out[0]) return { ok: false, error: "Заявку не знайдено." };
        await sql.query(`insert into orbit_mods (user_id, at) values ($1, $2) on conflict do nothing`, [data.userId, now]);
        await sql.query(`insert into orbit_mod_log (mod_id, action, target_user, at) values ('owner', 'approve', $1, $2)`, [data.userId, now]);
        return { ok: true };
      }
      case "modReject": {
        const out = await sql.query<{ user_id: string }>(`update orbit_mod_apps set state = 'rejected', decided_at = $2 where user_id = $1 and state = 'pending' returning user_id`, [data.userId, now]);
        if (!out[0]) return { ok: false, error: "Заявку не знайдено." };
        await sql.query(`insert into orbit_mod_log (mod_id, action, target_user, at) values ('owner', 'reject', $1, $2)`, [data.userId, now]);
        return { ok: true };
      }
      case "modRevoke":
        await sql.query(`delete from orbit_mods where user_id = $1`, [data.userId]);
        await sql.query(`update orbit_mod_apps set state = 'rejected', decided_at = $2, note = 'Роль знято власником' where user_id = $1`, [data.userId, now]);
        await sql.query(`insert into orbit_mod_log (mod_id, action, target_user, at) values ('owner', 'revoke', $1, $2)`, [data.userId, now]);
        return { ok: true };
    }
  });
