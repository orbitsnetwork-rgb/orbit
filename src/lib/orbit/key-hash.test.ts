import { test } from "node:test";
import assert from "node:assert/strict";
import * as K from "./key-hash.ts";
import { mintKey } from "./access.ts";

const KA = "ABCD-EFGH-JKLM", KB = "NPQR-STUV-WXYZ", KC = "2345-6789-ABCD", KD = "WXYZ-2345-HJKN";

test("mintKey output always passes the pre-scrypt format check", () => {
  for (let i = 0; i < 500; i++) assert.ok(K.plausibleKey(mintKey()));
  for (const bad of ["", "abcd-efgh-jklm", "ABCD-EFGH-JKL", "ABCD-EFGH-JKLMN", "ABCD-EFGH-JKL1", "ABCDEFGHJKLM", "ABCD EFGH JKLM", "OLD0-KEYS-AA00"]) assert.ok(!K.plausibleKey(bad), bad);
});

test("hashSome hashes at most `max` plaintext keys and keeps hashed ones", () => {
  const keys = { a: KA, b: K.hashKey(KB), c: KC, d: KD };
  const out = K.hashSome(keys, 2);
  assert.equal(Object.values(out).filter((v) => !K.isHashed(v)).length, 1);
  assert.equal(out.b, keys.b);
  const plain = { a: KA, b: KB, c: KC, d: KD } as Record<string, string>;
  for (const id of ["a", "b", "c", "d"]) assert.ok(K.verifyKey(out, id, plain[id]), id);
  const done = K.hashAll(keys).keys;
  assert.equal(K.hashSome(done), done, "nothing to hash → same object, no write");
});

test("findByKey finds hashed keys and rejects wrong ones", () => {
  const keys = K.hashAll({ a: KA, b: KB }).keys;
  assert.equal(K.findByKey(keys, KB), "b");
  assert.equal(K.findByKey(keys, KC), null);
  assert.equal(K.findByKey(keys, null), null);
  assert.ok(!K.verifyKey(keys, "a", KB));
});

test("findByKey also matches lookups made with the dev pepper (DEVICE_SECRET set later)", () => {
  const prev = process.env.DEVICE_SECRET;
  delete process.env.DEVICE_SECRET;
  const keys = K.hashAll({ a: KA }).keys;
  process.env.DEVICE_SECRET = "a-real-secret-for-the-unit-test-only";
  try { assert.equal(K.findByKey(keys, KA), "a"); }
  finally { if (prev === undefined) delete process.env.DEVICE_SECRET; else process.env.DEVICE_SECRET = prev; }
});

test("R7: malformed keys never reach scrypt; failed scrypt checks are budgeted per network", () => {
  K.resetFails();
  const keys = K.hashAll({ a: KA }).keys;
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) assert.ok(!K.verifyKey(keys, "a", `bogus-${i}-xxxxxxxx`, "v:net1"));
  assert.ok(performance.now() - t0 < 200, "format check is cheap (no scrypt)");
  assert.ok(K.verifyKey(keys, "a", KA, "v:net1"), "right key works and is cached");
  for (let i = 0; i < K.FAIL_MAX; i++) K.verifyKey(keys, "a", KB, "v:net2");
  const t1 = performance.now();
  for (let i = 0; i < 50; i++) assert.ok(!K.verifyKey(keys, "a", KC, "v:net2"));
  assert.ok(performance.now() - t1 < 200, "over budget → no more scrypt from that network");
  assert.ok(K.verifyKey(keys, "a", KA, "v:net2"), "an already verified key still passes (cache) from a throttled network");
  assert.ok(!K.verifyKey(keys, "a", KD, "v:net2"));
  assert.ok(K.verifyKey(K.hashAll({ a: KD }).keys, "a", KD, "v:net3"), "other networks unaffected");
  K.resetFails();
});

test("v2: new keys use fast HMAC; old scrypt hashes verify once and upgrade transparently", () => {
  const fresh = K.hashKey(KA);
  assert.ok(fresh.startsWith("h1$") && K.isHashed(fresh));
  const old = { a: K.hashKeySlow(KA) };
  assert.ok(K.verifyKey(old, "a", KA));
  const up = K.upgradeKey(old, "a", KA);
  assert.ok(up.a.startsWith("h1$"), "upgraded to HMAC");
  assert.ok(K.verifyKey(up, "a", KA) && !K.verifyKey(up, "a", KB));
  assert.equal(K.upgradeKey(up, "a", KA), up, "already fast → no write");
  assert.equal(K.upgradeKey(old, "a", KB), old, "wrong key never upgrades");
  assert.equal(K.findByKey(up, KA), "a");
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) K.verifyKey({ a: fresh }, "a", KA);
  const per = (performance.now() - t0) / 1000;
  assert.ok(per < 0.5, `fast verify per call ${per.toFixed(3)} ms`);
});
