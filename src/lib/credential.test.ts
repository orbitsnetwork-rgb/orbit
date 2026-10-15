import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIRM_PERSON_SQL,
  CONFIRM_RECOVERY_SQL,
  LIMITS,
  acceptsWithVersion,
  attemptAllowed,
  confirmAllowed,
  digest,
  encode128,
  makeCredentialV2,
  pendingJson,
  resolveClientIp,
  sealSecret,
  secretMatches,
} from "./credential.ts";
import { credentialAccepted, credentialShape } from "./model.ts";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const eight = { id: "100184", owner: "identity-a", timeline: ["created", "placed"] };

test("v1 and v2 shapes are only input checks", () => {
  assert.equal(credentialShape("8-ABCD-2345"), 1);
  assert.equal(credentialAccepted("8-ABCD-2345"), true);
  assert.equal(credentialShape("8-abc"), 0);
  const next = makeCredentialV2();
  assert.equal(credentialShape(next), 2);
  assert.equal(acceptsWithVersion(1, true, false), true);
  assert.equal(acceptsWithVersion(1, false, true), false);
  assert.equal(acceptsWithVersion(2, true, false), false);
  assert.equal(acceptsWithVersion(2, false, true), true);
});

test("v2 credential is 128 bits and not the short key", () => {
  const body = encode128(randomBytes(16));
  assert.equal(body.length, 26);
  assert.equal(makeCredentialV2().split("-").slice(1).join("").length, 26);
});

test("pending has no plaintext and confirmation is one-shot", async () => {
  const plain = makeCredentialV2();
  const sealed = await sealSecret(plain);
  assert.equal(await secretMatches(plain, sealed.hash), true);
  const pending = pendingJson({
    lookup: "lookup-hash",
    hash: sealed.hash,
    salt: sealed.salt,
    exp: Date.now() + 1000,
    kind: "login",
  });
  assert.equal(pending.includes(plain), false);
  const row = { id: eight.owner, version: 1 as number | null, pending, owner: eight.owner, eightId: eight.id, timeline: eight.timeline };
  assert.equal(confirmAllowed(row, pending, Date.now()), true);
  const activated = { ...row, version: 2, pending: null };
  assert.equal(activated.id, row.id);
  assert.equal(activated.owner, eight.owner);
  assert.equal(activated.eightId, "100184");
  assert.deepEqual(activated.timeline, eight.timeline);
  assert.equal(confirmAllowed(activated, pending, Date.now()), false);
  assert.equal(confirmAllowed({ ...row, pending, version: 1 }, pending, Date.now() + 20 * 60 * 1000), false);
});

test("confirmation sql does not touch 8, owner or timeline", () => {
  const sql = `${CONFIRM_PERSON_SQL}\n${CONFIRM_RECOVERY_SQL}`;
  assert.equal(/eight_events|insert into eights|owner_key/i.test(sql), false);
  assert.equal(sql.includes("people.key"), false);
  assert.equal(CONFIRM_RECOVERY_SQL.includes("person_key = excluded"), false);
});

test("forwarded header is ignored unless the peer is trusted", () => {
  assert.equal(resolveClientIp({ forwarded: "1.2.3.4", peer: "10.0.0.8", trusted: [] }), "10.0.0.8");
  assert.equal(resolveClientIp({ forwarded: "1.2.3.4", peer: "10.0.0.8", trusted: ["10.0.0.9"] }), "10.0.0.8");
  assert.equal(resolveClientIp({ forwarded: "1.2.3.4", peer: "10.0.0.8", trusted: ["10.0.0.8"] }), "1.2.3.4");
});

test("database confirmation keeps the same 8 and identity", async () => {
  const db = new PGlite();
  await db.exec(`
    create table people (
      key text primary key,
      credential_version smallint,
      credential_salt text,
      credential_hash text,
      credential_lookup text,
      credential_pending text,
      updated_at timestamptz default now()
    );
    create table eights (id text primary key, owner_key text);
    create table eight_events (id text primary key, eight_id text, kind text);
    create table recovery (person_key text primary key, code text, version smallint, salt text, verifier text);
  `);
  const identity = "identity-a";
  const oldSecret = "8-ABCD-2345";
  await db.query(
    "insert into people (key, credential_version, credential_hash) values ($1, 1, $2)",
    [identity, digest(oldSecret)],
  );
  await db.query("insert into eights (id, owner_key) values ('100184', $1)", [identity]);
  await db.query("insert into eight_events (id, eight_id, kind) values ('e1', '100184', 'placed')");
  await db.query("insert into recovery (person_key, code, version) values ($1, 'old-recovery', 1)", [identity]);
  const next = makeCredentialV2();
  const sealed = await sealSecret(next);
  const pending = pendingJson({
    lookup: digest(next),
    hash: sealed.hash,
    salt: sealed.salt,
    exp: Date.now() + 60_000,
    kind: "login",
  });
  await db.query("update people set credential_pending = $1 where key = $2", [pending, identity]);
  const before = await db.query<{ owner_key: string }>("select owner_key from eights where id = '100184'");
  const first = await db.query<{ key: string }>(CONFIRM_PERSON_SQL, [sealed.salt, sealed.hash, digest(next), identity, pending]);
  const second = await db.query<{ key: string }>(CONFIRM_PERSON_SQL, [sealed.salt, sealed.hash, digest(next), identity, pending]);
  const person = await db.query<{ key: string; credential_version: number; credential_hash: string }>(
    "select key, credential_version, credential_hash from people where key = $1",
    [identity],
  );
  const events = await db.query("select id from eight_events");
  const owner = await db.query<{ owner_key: string }>("select owner_key from eights where id = '100184'");
  assert.equal(first.rows.length, 1);
  assert.equal(second.rows.length, 0);
  assert.equal(person.rows[0].key, identity);
  assert.equal(person.rows[0].credential_version, 2);
  assert.equal(person.rows[0].credential_hash.includes(next), false);
  assert.equal(owner.rows[0].owner_key, before.rows[0].owner_key);
  assert.equal(events.rows.length, 1);
  await db.close();
});

test("rate limit window matches the credential policy", () => {
  assert.equal(LIMITS.credential, 5);
  assert.equal(LIMITS.ip, 40);
  assert.equal(LIMITS.device, 20);
  assert.equal(LIMITS.global, 200);
  assert.equal(attemptAllowed(4, LIMITS.credential, 1000), true);
  assert.equal(attemptAllowed(5, LIMITS.credential, 1000), false);
  assert.equal(attemptAllowed(5, LIMITS.credential, LIMITS.windowMs + 1), true);
});

