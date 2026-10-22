/**
 * Вхід і відновлення акаунта на новому пристрої: Google, телефон (SMS через Firebase) або код з пошти.
 * Успіх = новий ключ входу для акаунта (старий ключ і сесії на інших пристроях перестають діяти).
 * Кожен спосіб доступний лише коли налаштовано його змінні середовища (див. authConfig).
 */
import { createServerFn } from "@tanstack/react-start";
import { firebaseConfig, googleClientId, phoneDigits, verifyProof, type Proof } from "@/lib/orbit/identity";
import { codeMail, mailReady, sendMail } from "@/lib/orbit/mail";
import { clipTurnstile, turnstileSecret, verifyTurnstile } from "@/lib/orbit/turnstile";

export type RecoverReply =
  | { ok: true; id: string; key: string }
  | { ok: false; error: string; notFound?: { email?: string; phone?: string } }
  | { ok: true; sent: true };

const SLOW = "Забагато спроб. Спробуй за 10 хвилин.";
const CODE_TTL = 15 * 60_000;

export const authConfig = createServerFn({ method: "GET" }).handler(async () => ({
  google: googleClientId(),
  firebase: firebaseConfig(),
  mail: mailReady(),
}));

type Input = { kind: "google" | "phone" | "mail"; token?: string; email?: string; code?: string; ts?: string | null };

function clean(raw: unknown): Input {
  const v = (raw ?? {}) as Record<string, unknown>;
  const kind = v.kind === "google" || v.kind === "phone" || v.kind === "mail" ? v.kind : "mail";
  return {
    kind,
    token: typeof v.token === "string" ? v.token.slice(0, 4096) : undefined,
    email: typeof v.email === "string" ? v.email.trim().toLowerCase().slice(0, 80) : undefined,
    code: typeof v.code === "string" ? v.code.replace(/\D/g, "").slice(0, 6) : undefined,
    ts: clipTurnstile(v.ts),
  };
}

async function sha(text: string) {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", process.env.DEVICE_SECRET?.trim() || "orbit-dev-only-lookup").update(`login:${text}`).digest("hex");
}

export const authRecover = createServerFn({ method: "POST" })
  .inputValidator(clean)
  .handler(async ({ data }): Promise<RecoverReply> => {
    try {
      const server = await import("@tanstack/react-start/server");
      const ip = (server.getRequestHeader("cf-connecting-ip") ?? server.getRequestHeader("x-nf-client-connection-ip") ?? server.getRequestIP({ xForwardedFor: true }) ?? "unknown").split(",")[0].trim();
      const secret = turnstileSecret();
      // Turnstile — на кроки, що щось надсилають або видають ключ (не на введення коду, щоб не просити двічі).
      if (secret && !(data.kind === "mail" && data.code) && !(await verifyTurnstile(data.ts ?? null, ip, secret))) {
        return { ok: false, error: "Перевірка браузера не пройшла. Онови сторінку й спробуй ще раз." };
      }
      const { getSql, withTransaction } = await import("@/lib/db");
      const sql = await getSql();
      const { ipTag } = await import("@/lib/orbit/device");
      if (await overLimit(sql, `ip:${ipTag(ip)}`, 20)) return { ok: false, error: SLOW };

      let proof: Proof | { kind: "mail"; email: string } | null = null;
      if (data.kind === "google" || data.kind === "phone") {
        proof = await verifyProof(data.kind, data.token);
        if (!proof) return { ok: false, error: "Не вдалося підтвердити вхід. Спробуй ще раз." };
      } else {
        if (!mailReady()) return { ok: false, error: "Вхід поштою ще не відкрито." };
        const email = data.email ?? "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Пошта виглядає неправильно." };
        if (!data.code) {
          if (await overLimit(sql, `mail:${email}`, 3)) return { ok: false, error: SLOW };
          // Не розкриваємо, чи є така пошта: відповідь однакова, лист іде лише існуючим.
          const known = await findUser(sql, { kind: "mail", email });
          if (known) {
            const { randomInt } = await import("node:crypto");
            const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
            const now = Date.now();
            await sql.query(
              `insert into orbit_login_codes (email, code_hash, expires_at, tries, sent_at) values ($1, $2, $3, 0, $4)
               on conflict (email) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0, sent_at = excluded.sent_at`,
              [email, await sha(`${email}:${code}`), now + CODE_TTL, now],
            );
            const letter = codeMail(code, "login");
            if (!(await sendMail(email, letter.subject, letter.text))) return { ok: false, error: "Лист поки не відправився. Спробуй за хвилину." };
          }
          return { ok: true, sent: true };
        }
        const rows = await sql.query<{ code_hash: string; expires_at: number; tries: number }>(`select code_hash, expires_at::bigint as expires_at, tries from orbit_login_codes where email = $1`, [email]);
        const row = rows[0];
        if (!row || Number(row.expires_at) < Date.now() || row.tries >= 5) return { ok: false, error: "Код недійсний або згас. Попроси новий." };
        if (row.code_hash !== (await sha(`${email}:${data.code}`))) {
          await sql.query(`update orbit_login_codes set tries = tries + 1 where email = $1`, [email]);
          return { ok: false, error: "Код не той." };
        }
        await sql.query(`delete from orbit_login_codes where email = $1`, [email]);
        proof = { kind: "mail", email };
      }

      const p = proof;
      return await withTransaction(async (tx) => {
        const { unpackDoc, mintKey } = await import("@/lib/orbit/access");
        const K = await import("@/lib/orbit/key-hash");
        const rows = await tx.query<{ doc: unknown }>(`select doc from orbit_world where id = 'world' for update`, []);
        if (!rows[0]) return { ok: false as const, error: "Акаунт не знайдено." };
        const bag = unpackDoc(rows[0].doc);
        const person = matchPerson(bag.people, p);
        if (!person || !bag.world.accounts.some((a) => a.id === person.userId)) {
          return { ok: false as const, error: "Акаунт не знайдено. Створи новий.", notFound: p.kind === "phone" ? { phone: p.phone } : { email: p.email } };
        }
        const key = mintKey();
        await tx.query(`update orbit_world set doc = jsonb_set(doc, array['keys', $1::text], to_jsonb($2::text)), updated_at = now() where id = 'world'`, [person.userId, K.hashKey(key)]);
        // Вхід поштою/Google доводить володіння поштою — позначаємо підтвердженою.
        if (p.kind !== "phone" && !person.confirmed) {
          const people = bag.people.map((row) => (row.userId === person.userId ? { ...row, confirmed: true, mailCode: null } : row));
          await tx.query(`update orbit_world set doc = jsonb_set(doc, '{people}', $1::jsonb) where id = 'world'`, [JSON.stringify(people)]);
        }
        return { ok: true as const, id: person.userId, key };
      });
    } catch (error) {
      console.error("authRecover failed", error instanceof Error ? error.message : "unknown");
      return { ok: false, error: "Сервер тимчасово недоступний. Спробуй ще раз." };
    }
  });

type Person = { userId: string; email: string; phone: string; confirmed: boolean };
export function matchPerson<T extends Person>(people: T[], proof: Proof | { kind: "mail"; email: string }): T | null {
  if (proof.kind === "phone") {
    const want = phoneDigits(proof.phone);
    const tail = (v: string) => (v.length >= 9 ? v.slice(-9) : null);
    return people.find((row) => { const d = phoneDigits(row.phone ?? ""); return d === want || (tail(d) !== null && tail(d) === tail(want)); }) ?? null;
  }
  return people.find((row) => row.email.trim().toLowerCase() === proof.email) ?? null;
}

async function findUser(sql: { query: <T>(t: string, p: unknown[]) => Promise<T[]> }, proof: { kind: "mail"; email: string }) {
  const rows = await sql.query<{ doc: unknown }>(`select doc from orbit_world where id = 'world'`, []);
  if (!rows[0]) return null;
  const { unpackDoc } = await import("@/lib/orbit/access");
  return matchPerson(unpackDoc(rows[0].doc).people, proof);
}

async function overLimit(sql: { query: <T>(t: string, p: unknown[]) => Promise<T[]> }, tag: string, max: number) {
  const now = Date.now();
  const rows = await sql.query<{ n: number }>(
    `insert into orbit_auth_hits (tag, n, window_start) values ($1, 1, $2)
     on conflict (tag) do update set
       n = case when orbit_auth_hits.window_start < $2 - 600000 then 1 else orbit_auth_hits.n + 1 end,
       window_start = case when orbit_auth_hits.window_start < $2 - 600000 then $2 else orbit_auth_hits.window_start end
     returning n`,
    [tag, now],
  );
  return Number(rows[0]?.n ?? 0) > max;
}
