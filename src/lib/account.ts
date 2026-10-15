import {
  CONFIRM_PERSON_SQL,
  CONFIRM_RECOVERY_SQL,
  LIMITS,
  acceptsWithVersion,
  confirmAllowed,
  digest,
  makeCredentialV2,
  makeRecoveryV2,
  pendingJson,
  readPending,
  sealSecret,
  secretMatches,
  type PendingMigration,
} from "@/lib/credential";
import { createServerFn } from "@tanstack/react-start";
import { credentialAccepted, credentialShape } from "@/lib/model";

const RECOVERY_V1 = /^R-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const RECOVERY_V2 = /^R(?:-[A-HJ-NP-Z2-9]{4}){6}-[A-HJ-NP-Z2-9]{2}$/;

function recoveryShape(code: string) {
  return RECOVERY_V1.test(code) || RECOVERY_V2.test(code);
}

async function sqlClient() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function allow(bucket: string, limit: number) {
  const sql = await sqlClient();
  const rows = await sql<{ n: number; at: string }>`select n, at from gate where bucket = ${bucket} limit 1`;
  const fresh = !rows[0] || Date.now() - new Date(rows[0].at).getTime() > 15 * 60 * 1000;
  if (fresh) {
    await sql`
      insert into gate (bucket, n, at) values (${bucket}, 1, now())
      on conflict (bucket) do update set n = 1, at = now()
    `;
    return true;
  }
  if (Number(rows[0]?.n ?? 0) >= limit) return false;
  await sql`update gate set n = n + 1 where bucket = ${bucket}`;
  return true;
}

async function locked(bucket: string, limit: number) {
  const sql = await sqlClient();
  const rows = await sql<{ n: number; at: string }>`select n, at from gate where bucket = ${bucket} limit 1`;
  if (!rows[0]) return false;
  if (Date.now() - new Date(rows[0].at).getTime() > 15 * 60 * 1000) return false;
  return Number(rows[0].n) >= limit;
}

async function gate(kind: "keys" | "recovery", material: string, device: string) {
  const { entryMarks } = await import("@/lib/entry-guard.server");
  const ip = (await entryMarks()).ip;
  const dev = /^[a-z0-9]{16,32}$/.test(device) ? device : "";
  if (await locked(`fail-ip:${ip}`, LIMITS.failure)) return false;
  if (dev && (await locked(`fail-dev:${dev}`, LIMITS.failure))) return false;
  if (!(await allow(kind, LIMITS.global))) return false;
  if (!(await allow(`${kind === "keys" ? "k" : "r"}:${material}`, LIMITS.credential))) return false;
  if (!(await allow(`ip:${kind}:${ip}`, LIMITS.ip))) return false;
  if (dev && !(await allow(`dev:${kind}:${dev}`, LIMITS.device))) return false;
  return true;
}

async function noteFailure(device: string) {
  const { entryMarks } = await import("@/lib/entry-guard.server");
  const ip = (await entryMarks()).ip;
  await allow(`fail-ip:${ip}`, LIMITS.failure);
  if (/^[a-z0-9]{16,32}$/.test(device)) await allow(`fail-dev:${device}`, LIMITS.failure);
}

const BUSY = "Забагато спроб. Зачекай 15 хвилин.";
const REJECTED = "Такого ключа немає.";

export async function resolveKey(plain: string) {
  const key = plain.trim().toUpperCase();
  if (!credentialAccepted(key)) return "";
  const sql = await sqlClient();
  const locator = digest(key);
  const rows = await sql<{ key: string; credential_version: number | null; credential_hash: string | null }>`
    select key, credential_version, credential_hash from people
    where credential_lookup = ${locator}
       or (credential_hash = ${locator} and coalesce(credential_version, 1) = 1)
    limit 1
  `;
  const row = rows[0];
  if (row?.credential_hash) {
    const version = row.credential_version ?? 1;
    const shaMatch = version === 1 && row.credential_hash === locator;
    const argonMatch = version === 2 ? await secretMatches(key, row.credential_hash) : false;
    if (!acceptsWithVersion(version, shaMatch, argonMatch)) return "";
    return row.key;
  }
  const legacyHash = await sql<{ key: string }>`select key from people where key = ${locator} and credential_hash is null limit 1`;
  if (legacyHash[0]) {
    await sql`update people set credential_hash = ${locator}, credential_version = 1 where key = ${locator} and credential_hash is null`;
    return locator;
  }
  const legacy = await sql<{ name: string; city: string }>`select name, city from people where key = ${key} limit 1`;
  if (!legacy[0]) return "";
  await sql`
    insert into people (key, name, city, updated_at, credential_hash, credential_version)
    values (${locator}, ${legacy[0].name}, ${legacy[0].city}, now(), ${locator}, 1)
    on conflict (key) do nothing
  `;
  await sql`update recovery set person_key = ${locator} where person_key = ${key}`;
  await sql`update eights set owner_key = ${locator} where owner_key = ${key}`;
  await sql`update eights set confirmer_key = ${locator} where confirmer_key = ${key}`;
  await sql`delete from people where key = ${key}`;
  return locator;
}

async function issuePending(personId: string, kind: PendingMigration["kind"]) {
  const plain = makeCredentialV2();
  const sealed = await sealSecret(plain);
  const pending: PendingMigration = {
    lookup: digest(plain),
    hash: sealed.hash,
    salt: sealed.salt,
    exp: Date.now() + 15 * 60 * 1000,
    kind,
  };
  let recovery = "";
  if (kind === "recovery") {
    recovery = makeRecoveryV2();
    const sealedRecovery = await sealSecret(recovery);
    pending.recoveryLookup = digest(recovery);
    pending.recoveryHash = sealedRecovery.hash;
    pending.recoverySalt = sealedRecovery.salt;
  }
  const packed = pendingJson(pending);
  if (packed.includes(plain) || (recovery && packed.includes(recovery))) return { plain: "", recovery: "" };
  const sql = await sqlClient();
  const saved = await sql<{ key: string }>`
    update people set credential_pending = ${packed}
    where key = ${personId}
      and (
        (${kind} = 'login' and coalesce(credential_version, 1) = 1)
        or ${kind} = 'recovery'
      )
    returning key
  `;
  if (!saved[0]) return { plain: "", recovery: "" };
  return { plain, recovery };
}

export const keepPerson = createServerFn({ method: "POST" })
  .inputValidator((input: { key?: string; name: string; city: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; key: string; recovery: string } | { ok: false; error: string }> => {
    const name = data.name.trim().slice(0, 40);
    const city = data.city.trim().slice(0, 40);
    if (name.length < 2) return { ok: false, error: "Спочатку вкажи ім'я." };
    const sql = await sqlClient();
    let plain = (data.key ?? "").trim().toUpperCase();
    const supplied = credentialAccepted(plain);
    if (!supplied) {
      const { entryMarks } = await import("@/lib/entry-guard.server");
      const ip = (await entryMarks()).ip;
      if (!(await allow(`reg:${ip}`, 5))) return { ok: false, error: BUSY };
      plain = makeCredentialV2();
      const sealed = await sealSecret(plain);
      const id = digest(plain);
      const recovery = makeRecoveryV2();
      const sealedRecovery = await sealSecret(recovery);
      await sql`
        insert into people (key, name, city, updated_at, credential_hash, credential_version, credential_salt, credential_lookup)
        values (${id}, ${name}, ${city}, now(), ${sealed.hash}, 2, ${sealed.salt}, ${id})
      `;
      await sql`
        insert into recovery (person_key, code, version, salt, verifier)
        values (${id}, ${digest(recovery)}, 2, ${sealedRecovery.salt}, ${sealedRecovery.hash})
      `;
      return { ok: true, key: plain, recovery };
    }
    const moved = await resolveKey(plain);
    if (!moved) return { ok: false, error: REJECTED };
    await sql`
      update people set name = ${name}, city = ${city}, updated_at = now()
      where key = ${moved}
    `;
    return { ok: true, key: "", recovery: "" };
  });

export const openPerson = createServerFn({ method: "POST" })
  .inputValidator((input: string | { key: string; device?: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; name: string; city: string; next?: string } | { ok: false; error: string }> => {
    const key = (typeof data === "string" ? data : data.key).trim().toUpperCase().replace(/\s+/g, "");
    const device = typeof data === "string" ? "" : (data.device ?? "");
    if (!credentialShape(key)) return { ok: false, error: REJECTED };
    if (!(await gate("keys", digest(key), device))) return { ok: false, error: BUSY };
    const id = await resolveKey(key);
    if (!id) {
      await noteFailure(device);
      return { ok: false, error: REJECTED };
    }
    const sql = await sqlClient();
    const rows = await sql<{ name: string; city: string; credential_version: number | null }>`
      select name, city, credential_version from people where key = ${id} limit 1
    `;
    const row = rows[0];
    if (!row) {
      await noteFailure(device);
      return { ok: false, error: REJECTED };
    }
    if ((row.credential_version ?? 1) !== 1) return { ok: true, name: row.name, city: row.city };
    const issued = await issuePending(id, "login");
    return issued.plain
      ? { ok: true, name: row.name, city: row.city, next: issued.plain }
      : { ok: true, name: row.name, city: row.city };
  });

export const confirmCredential = createServerFn({ method: "POST" })
  .inputValidator((input: { key: string; device?: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const key = data.key.trim().toUpperCase().replace(/\s+/g, "");
    const device = data.device ?? "";
    if (credentialShape(key) !== 2) return { ok: false, error: REJECTED };
    if (!(await gate("keys", digest(key), device))) return { ok: false, error: BUSY };
    const sql = await sqlClient();
    const rows = await sql<{ key: string; credential_version: number | null; credential_pending: string | null }>`
      select key, credential_version, credential_pending from people
      where credential_pending::jsonb->>'lookup' = ${digest(key)}
      limit 1
    `;
    const row = rows[0];
    const now = Date.now();
    if (!row?.credential_pending || !confirmAllowed({ version: row.credential_version, pending: row.credential_pending }, row.credential_pending, now)) {
      await noteFailure(device);
      return { ok: false, error: "Підтвердження вже не діє. Старий ключ і далі працює." };
    }
    const pending = readPending(row.credential_pending);
    if (!pending || !(await secretMatches(key, pending.hash))) {
      await noteFailure(device);
      return { ok: false, error: "Підтвердження вже не діє. Старий ключ і далі працює." };
    }
    const { withTransaction } = await import("@/lib/db");
    const activated = await withTransaction(async (tx) => {
      const updated = await tx.query<{ key: string }>(CONFIRM_PERSON_SQL, [
        pending.salt,
        pending.hash,
        pending.lookup,
        row.key,
        row.credential_pending,
      ]);
      if (!updated[0]) return false;
      if (pending.kind === "recovery" && pending.recoveryLookup && pending.recoveryHash && pending.recoverySalt) {
        await tx.query(CONFIRM_RECOVERY_SQL, [row.key, pending.recoveryLookup, pending.recoverySalt, pending.recoveryHash]);
      }
      return true;
    });
    if (!activated) return { ok: false, error: "Підтвердження вже не діє. Старий ключ і далі працює." };
    return { ok: true };
  });

export const openRecovery = createServerFn({ method: "POST" })
  .inputValidator((input: string | { code: string; device?: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; key: string; name: string; city: string; recovery: string } | { ok: false; error: string }> => {
    const code = (typeof data === "string" ? data : data.code).trim().toUpperCase().replace(/\s+/g, "");
    const device = typeof data === "string" ? "" : (data.device ?? "");
    if (!recoveryShape(code)) return { ok: false, error: "Код не підійшов." };
    if (!(await gate("recovery", digest(code), device))) return { ok: false, error: BUSY };
    const sql = await sqlClient();
    const locator = digest(code);
    const found = await sql<{ person_key: string; version: number | null; verifier: string | null; code: string }>`
      select person_key, version, verifier, code from recovery where code = ${locator} limit 1
    `;
    let personId = "";
    if (found[0]) {
      const version = found[0].version ?? 1;
      const shaMatch = version === 1 && found[0].code === locator;
      const argonMatch = version === 2 && found[0].verifier ? await secretMatches(code, found[0].verifier) : false;
      if (acceptsWithVersion(version, shaMatch, argonMatch)) personId = found[0].person_key;
    }
    if (!personId) {
      const legacy = await sql<{ person_key: string }>`select person_key from recovery where code = ${code} limit 1`;
      personId = legacy[0]?.person_key ?? "";
    }
    if (!personId) {
      await noteFailure(device);
      return { ok: false, error: "Код не підійшов." };
    }
    if (credentialAccepted(personId)) personId = (await resolveKey(personId)) || personId;
    const rows = await sql<{ name: string; city: string }>`select name, city from people where key = ${personId} limit 1`;
    const row = rows[0];
    if (!row) return { ok: false, error: "Код не підійшов." };
    const issued = await issuePending(personId, "recovery");
    if (!issued.plain || !issued.recovery) return { ok: false, error: "Код не підійшов." };
    return { ok: true, key: issued.plain, name: row.name, city: row.city, recovery: issued.recovery };
  });
