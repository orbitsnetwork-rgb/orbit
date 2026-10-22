import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyTurnstile, clipTurnstile, TURNSTILE_ACTIONS } from "./turnstile";

const fake = (ok: boolean, success: boolean) => (async () => ({ ok, json: async () => ({ success }) })) as unknown as typeof fetch;

test("turnstile: no token → refused without network", async () => {
  let called = false;
  const f = (async () => { called = true; return { ok: true, json: async () => ({ success: true }) }; }) as unknown as typeof fetch;
  assert.equal(await verifyTurnstile(null, "1.2.3.4", "s", f), false);
  assert.equal(called, false);
});
test("turnstile: success / failure / http error / throw", async () => {
  assert.equal(await verifyTurnstile("t", null, "s", fake(true, true)), true);
  assert.equal(await verifyTurnstile("t", null, "s", fake(true, false)), false);
  assert.equal(await verifyTurnstile("t", null, "s", fake(false, true)), false);
  assert.equal(await verifyTurnstile("t", null, "s", (async () => { throw new Error("x"); }) as unknown as typeof fetch), false);
});
test("turnstile: clip + guarded actions", () => {
  assert.equal(clipTurnstile(""), null);
  assert.equal(clipTurnstile("x".repeat(3000)), null);
  assert.equal(clipTurnstile("abc"), "abc");
  assert.ok(TURNSTILE_ACTIONS.has("register") && TURNSTILE_ACTIONS.has("enter") && TURNSTILE_ACTIONS.has("enterMail"));
  assert.ok(!TURNSTILE_ACTIONS.has("pull"));
});
