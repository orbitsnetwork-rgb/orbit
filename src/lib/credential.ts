const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(n: number, x: number) {
  return (x >>> n) | (x << (32 - n));
}

function sha256Hex(data: Uint8Array) {
  const bitLen = data.length * 8;
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen >>> 0, false);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, w[t - 15]!) ^ rotr(18, w[t - 15]!) ^ (w[t - 15]! >>> 3);
      const s1 = rotr(17, w[t - 2]!) ^ rotr(19, w[t - 2]!) ^ (w[t - 2]! >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const s1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + SHA_K[t]! + w[t]!) >>> 0;
      const s0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((n) => n.toString(16).padStart(8, "0")).join("");
}

function randomBytes(size: number) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export type PendingKind = "login" | "recovery";

export type PendingMigration = {
  lookup: string;
  hash: string;
  salt: string;
  exp: number;
  kind: PendingKind;
  recoveryLookup?: string;
  recoveryHash?: string;
  recoverySalt?: string;
};

export const CONFIRM_PERSON_SQL = `
update people
set credential_version = 2,
    credential_salt = $1,
    credential_hash = $2,
    credential_lookup = $3,
    credential_pending = null,
    updated_at = now()
where key = $4
  and credential_pending = $5
  and (
    (credential_pending::jsonb->>'kind' = 'login' and coalesce(credential_version, 1) = 1)
    or credential_pending::jsonb->>'kind' = 'recovery'
  )
  and (credential_pending::jsonb->>'exp')::bigint > (extract(epoch from now()) * 1000)::bigint
returning key
`;

export const CONFIRM_RECOVERY_SQL = `
insert into recovery (person_key, code, version, salt, verifier)
values ($1, $2, 2, $3, $4)
on conflict (person_key) do update
set code = excluded.code,
    version = excluded.version,
    salt = excluded.salt,
    verifier = excluded.verifier
`;

export function digest(plain: string) {
  return sha256Hex(new TextEncoder().encode(plain));
}

export function encode128(bytes: Uint8Array) {
  let value = 0;
  let bits = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >> bits) & 31];
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out.slice(0, 26);
}

export function groupSecret(prefix: "8" | "R", body: string) {
  const parts = body.match(/.{1,4}/g) ?? [];
  return `${prefix}-${parts.join("-")}`;
}

export function makeCredentialV2() {
  return groupSecret("8", encode128(randomBytes(16)));
}

export function makeRecoveryV2() {
  return groupSecret("R", encode128(randomBytes(16)));
}

export async function sealSecret(plain: string) {
  const { argon2id } = await import("hash-wasm");
  const salt = randomBytes(16);
  const hash = await argon2id({
    password: plain,
    salt,
    parallelism: 1,
    iterations: 2,
    memorySize: 19_456,
    hashLength: 32,
    outputType: "encoded",
  });
  return { salt: bytesToBase64(salt), hash };
}

export async function secretMatches(plain: string, encoded: string) {
  const { argon2Verify } = await import("hash-wasm");
  return argon2Verify({ password: plain, hash: encoded });
}

export function acceptsWithVersion(version: number | null, shaMatch: boolean, argonMatch: boolean) {
  const current = version ?? 1;
  if (current === 1) return shaMatch;
  if (current === 2) return argonMatch;
  return false;
}

export function pendingJson(pending: PendingMigration) {
  return JSON.stringify(pending);
}

export function readPending(raw: string | null): PendingMigration | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingMigration;
    if (!parsed.lookup || !parsed.hash || !parsed.salt || !parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function confirmAllowed(row: { version: number | null; pending: string | null }, expectedPending: string, now: number) {
  if (!row.pending || row.pending !== expectedPending) return false;
  const pending = readPending(row.pending);
  if (!pending || pending.exp <= now) return false;
  const version = row.version ?? 1;
  if (pending.kind === "login") return version === 1;
  return version === 1 || version === 2;
}

export const LIMITS = { credential: 5, ip: 40, device: 20, global: 200, failure: 8, windowMs: 15 * 60 * 1000 };

export function attemptAllowed(count: number, limit: number, ageMs: number) {
  if (ageMs > LIMITS.windowMs) return true;
  return count < limit;
}

export function resolveClientIp(input: { forwarded: string | null; peer: string; trusted: string[] }) {
  const peer = input.peer.trim() || "local";
  if (!input.trusted.includes(peer)) return peer;
  const first = (input.forwarded ?? "").split(",")[0]?.trim() ?? "";
  return first || peer;
}
