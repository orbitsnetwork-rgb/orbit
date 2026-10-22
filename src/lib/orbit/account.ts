/**
 * Дії з власним акаунтом: змінити пошту/телефон, вийти всюди (новий ключ), м’яко видалити акаунт.
 * Кожна дія — лише з чинним ключем сесії, під блокуванням рядка світу (без гонок і подвійних записів).
 */
import { createServerFn } from "@tanstack/react-start";
import type { Proof } from "@/lib/orbit/identity";
import { samePhone, clipEmail, clipPhone, mintKey, unpackDoc, mailCode, type Identity } from "@/lib/orbit/access";
import { codeMail, mailReady, sendMail } from "@/lib/orbit/mail";

export type AccountOp =
  | { op: "email"; email: string }
  | { op: "phone"; phone: string }
  | { op: "logoutAll" }
  | { op: "delete"; confirm: string }
  /** Аудит #3: довести поточну пошту (Google) чи телефон (SMS) — тоді за ними можна відновлювати доступ. */
  | { op: "verify"; kind: "google" | "phone"; token: string };
export type AccountReply = { ok: true; notice: string; key?: string; self?: Identity | null; deleted?: boolean } | { ok: false; error: string };

export const DELETE_WORD = "ВИДАЛИТИ";

function clean(raw: unknown): { sessionId: string | null; sessionKey: string | null; action: AccountOp | null; ts: string | null } {
  const v = (raw ?? {}) as Record<string, unknown>;
  const a = (v.action ?? {}) as Record<string, unknown>;
  const sessionId = typeof v.sessionId === "string" && /^u-[a-z0-9-]{1,40}$/i.test(v.sessionId) ? v.sessionId : null;
  const sessionKey = typeof v.sessionKey === "string" && v.sessionKey.length <= 64 ? v.sessionKey.trim() : null;
  let action: AccountOp | null = null;
  if (a.op === "email" && typeof a.email === "string") action = { op: "email", email: a.email.slice(0, 80) };
  else if (a.op === "phone" && typeof a.phone === "string") action = { op: "phone", phone: a.phone.slice(0, 24) };
  else if (a.op === "logoutAll") action = { op: "logoutAll" };
  else if (a.op === "delete" && typeof a.confirm === "string") action = { op: "delete", confirm: a.confirm.slice(0, 20) };
  else if (a.op === "verify" && (a.kind === "google" || a.kind === "phone") && typeof a.token === "string" && a.token.length <= 4096) action = { op: "verify", kind: a.kind, token: a.token };
  return { sessionId, sessionKey, action, ts: typeof v.ts === "string" ? v.ts.slice(0, 4096) : null };
}

/** Чиста логіка (тестується без бази): нові люди/ключі або помилка. */
export function applyAccountOp(
  people: Identity[],
  keys: Record<string, string>,
  self: string,
  action: AccountOp,
  mail: boolean,
  hash: (k: string) => string,
  proof: Proof | null = null,
): { error: string } | { people: Identity[]; keys: Record<string, string>; notice: string; key?: string; removed?: Identity; sendCode?: boolean } {
  const me = people.find((row) => row.userId === self);
  if (!me) return { error: "Акаунт не знайдено." };
  if (action.op === "email") {
    const email = clipEmail(action.email);
    if (!email) return { error: "Пошта виглядає неправильно." };
    if (email === me.email) return { error: "Це вже твоя пошта." };
    if (people.some((row) => row.userId !== self && row.email === email)) return { error: "Ця пошта вже в іншому акаунті." };
    // Аудит #3: нова пошта без доказу — прапор false: за нею не відновлюють доступ, поки її не доведуть (код з листа / Google).
    const next = { ...me, email, confirmed: !mail, mailCode: mail ? mailCode() : null, mailTries: 0, emailVerified: false };
    return { people: people.map((row) => (row.userId === self ? next : row)), keys, notice: mail ? `Пошту змінено. Код підтвердження — у листі на ${email}.` : "Пошту змінено.", sendCode: mail };
  }
  if (action.op === "phone") {
    const phone = clipPhone(action.phone);
    if (!phone) return { error: "Телефон — від 10 до 15 цифр." };
    if (phone === me.phone) return { error: "Це вже твій телефон." };
    if (people.some((row) => row.userId !== self && samePhone(row.phone, phone))) return { error: "Цей телефон уже в іншому акаунті." };
    return { people: people.map((row) => (row.userId === self ? { ...row, phone, phoneVerified: false } : row)), keys, notice: "Телефон змінено. Підтверди його через SMS, щоб за ним можна було відновити вхід." };
  }
  if (action.op === "verify") {
    if (!proof || proof.kind !== action.kind) return { error: "Не вдалося підтвердити. Спробуй ще раз." };
    if (proof.kind === "google") {
      if (proof.email !== me.email.trim().toLowerCase()) return { error: "Це інша пошта Google. Спершу зміни пошту в акаунті на цю." };
      return { people: people.map((row) => (row.userId === self ? { ...row, emailVerified: true, confirmed: true, mailCode: null, mailTries: 0 } : row)), keys, notice: "Пошту підтверджено ✦" };
    }
    if (!samePhone(me.phone, proof.phone)) return { error: "Це інший номер. Спершу зміни телефон в акаунті на цей." };
    return { people: people.map((row) => (row.userId === self ? { ...row, phoneVerified: true } : row)), keys, notice: "Телефон підтверджено ✦" };
  }
  if (action.op === "logoutAll") {
    const key = mintKey();
    return { people, keys: { ...keys, [self]: hash(key) }, key, notice: "Готово: усі інші пристрої вийшли. Ось новий ключ — збережи його." };
  }
  if (action.confirm.trim().toUpperCase() !== DELETE_WORD) return { error: `Щоб видалити, напиши слово ${DELETE_WORD}.` };
  const rest = { ...keys };
  delete rest[self];
  return { people: people.filter((row) => row.userId !== self), keys: rest, removed: me, notice: "Акаунт видалено. Протягом 30 днів його ще можна відновити через підтримку." };
}

export const accountAct = createServerFn({ method: "POST" })
  .inputValidator(clean)
  .handler(async ({ data }): Promise<AccountReply> => {
    if (!data.action || !data.sessionId || !data.sessionKey) return { ok: false, error: "Спершу увійди." };
    try {
      const K = await import("@/lib/orbit/key-hash");
      const { withTransaction, getSql } = await import("@/lib/db");
      const action = data.action;
      // Аудит M3: Turnstile (якщо ввімкнено) і лічильник невдалих ключів з мережі — у базі, спільний для всіх ізолятів.
      const ip = await (await import("@/lib/orbit/client-ip")).requestIp();
      const { ipTag } = await import("@/lib/orbit/device");
      const T = await import("@/lib/orbit/turnstile");
      const secret = T.turnstileSecret();
      if (secret && !(await T.verifyTurnstile(data.ts, ip, secret))) return { ok: false, error: T.TURNSTILE_FAIL };
      const tag = `acct-bad:${ipTag(ip)}`;
      const sql0 = await getSql();
      if (await badKeys(sql0, tag, false)) return { ok: false, error: "Забагато невдалих спроб. Спробуй за 10 хвилин." };
      let proof: Proof | null = null;
      if (action.op === "verify") {
        const { verifyProof } = await import("@/lib/orbit/identity");
        proof = await verifyProof(action.kind, action.token);
        if (!proof) return { ok: false, error: "Не вдалося підтвердити. Спробуй ще раз." };
      }
      const out = await withTransaction(async (tx) => {
        const rows = await tx.query<{ doc: unknown }>(`select doc from orbit_world where id = 'world' for update`, []);
        if (!rows[0]) return { error: "Акаунт не знайдено." } as const;
        const bag = unpackDoc(rows[0].doc);
        if (!K.verifyKey(bag.keys, data.sessionId, data.sessionKey)) {
          await badKeys(tx, tag, true);
          return { error: "Сесія застаріла. Увійди ще раз." } as const;
        }
        const res = applyAccountOp(bag.people, bag.keys, data.sessionId!, action, mailReady(), K.hashKey, proof);
        if ("error" in res) return res;
        await tx.query(
          `update orbit_world set doc = jsonb_set(jsonb_set(doc, '{people}', $1::jsonb), '{keys}', $2::jsonb), updated_at = now() where id = 'world'`,
          [JSON.stringify(res.people), JSON.stringify(res.keys)],
        );
        if (res.removed) {
          await tx.query(
            `insert into orbit_deleted (user_id, person, deleted_at, reason) values ($1, $2::jsonb, $3, 'self') on conflict (user_id) do update set person = excluded.person, deleted_at = excluded.deleted_at`,
            [data.sessionId, JSON.stringify(res.removed), Date.now()],
          );
        }
        return res;
      });
      if ("error" in out) return { ok: false, error: out.error };
      const self = out.people.find((row) => row.userId === data.sessionId) ?? null;
      let notice = out.notice;
      if (out.sendCode && self?.mailCode) {
        const letter = codeMail(self.mailCode, "confirm");
        if (!(await sendMail(self.email, letter.subject, letter.text))) notice = "Пошту змінено, але лист поки не відправився. Натисни «Надіслати код ще раз».";
      }
      return { ok: true, notice, key: out.key, self: self ? { ...self, mailCode: null } : null, deleted: Boolean(out.removed) };
    } catch (error) {
      console.error("accountAct failed", error instanceof Error ? error.message : "unknown");
      return { ok: false, error: "Сервер тимчасово недоступний. Спробуй ще раз." };
    }
  });

/** Невдалі ключі з однієї мережі: понад ACCOUNT_BAD_MAX за 10 хв — блок. count=false лише читає. */
export const ACCOUNT_BAD_MAX = 10;
async function badKeys(sql: { query: <T>(t: string, p: unknown[]) => Promise<T[]> }, tag: string, count: boolean): Promise<boolean> {
  const now = Date.now();
  if (!count) {
    const rows = await sql.query<{ n: number; window_start: string | number }>(`select n, window_start from orbit_auth_hits where tag = $1`, [tag]);
    const row = rows[0];
    return Boolean(row && Number(row.window_start) >= now - 600_000 && Number(row.n) >= ACCOUNT_BAD_MAX);
  }
  await sql.query(
    `insert into orbit_auth_hits (tag, n, window_start) values ($1, 1, $2)
     on conflict (tag) do update set
       n = case when orbit_auth_hits.window_start < $2 - 600000 then 1 else orbit_auth_hits.n + 1 end,
       window_start = case when orbit_auth_hits.window_start < $2 - 600000 then $2 else orbit_auth_hits.window_start end`,
    [tag, now],
  );
  return false;
}
