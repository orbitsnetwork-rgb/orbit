import { test } from "node:test";
import assert from "node:assert/strict";
import * as K from "./key-hash.ts";

test("hashSome hashes at most `max` plaintext keys and keeps hashed ones", () => {
  const keys = { a: "key-a-123456", b: K.hashKey("key-b-123456"), c: "key-c-123456", d: "key-d-123456" };
  const out = K.hashSome(keys, 2);
  assert.equal(Object.values(out).filter((v) => !K.isHashed(v)).length, 1);
  assert.equal(out.b, keys.b);
  for (const id of ["a", "b", "c", "d"]) assert.ok(K.verifyKey(out, id, `key-${id}-123456`), id);
  const done = K.hashAll(keys).keys;
  assert.equal(K.hashSome(done), done, "nothing to hash → same object, no write");
});

test("findByKey finds hashed keys and rejects wrong ones", () => {
  const keys = K.hashAll({ a: "alpha-key-1", b: "beta-key-22" }).keys;
  assert.equal(K.findByKey(keys, "beta-key-22"), "b");
  assert.equal(K.findByKey(keys, "nope"), null);
  assert.equal(K.findByKey(keys, null), null);
  assert.ok(!K.verifyKey(keys, "a", "beta-key-22"));
});

test("findByKey also matches lookups made with the dev pepper (DEVICE_SECRET set later)", () => {
  const prev = process.env.DEVICE_SECRET;
  delete process.env.DEVICE_SECRET;
  const keys = K.hashAll({ a: "alpha-key-1" }).keys;
  process.env.DEVICE_SECRET = "a-real-secret-for-the-unit-test-only";
  try { assert.equal(K.findByKey(keys, "alpha-key-1"), "a"); }
  finally { if (prev === undefined) delete process.env.DEVICE_SECRET; else process.env.DEVICE_SECRET = prev; }
});
