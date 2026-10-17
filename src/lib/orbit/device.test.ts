import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DEVICE_SECRET = "unit-test-device-secret-not-real";
const D = await import("./device.ts");

test("QR token: valid for its launch for 60–90 s, then rejected", () => {
  const now = 1_800_000_000_000;
  const { t, exp } = D.qrToken("c-abc-1", now);
  assert.ok(exp - now >= 60_000 && exp - now <= 90_000, String(exp - now));
  assert.ok(D.checkQr(t, "c-abc-1", now));
  assert.ok(D.checkQr(t, "c-abc-1", exp));
  assert.ok(!D.checkQr(t, "c-abc-1", exp + 1), "expired");
  assert.ok(!D.checkQr(t, "c-other-2", now), "bound to the launch");
});

test("QR token: forged or far-future tokens are rejected", () => {
  const now = 1_800_000_000_000;
  const { t } = D.qrToken("c-abc-1", now);
  const [head, sig] = t.split(".");
  assert.ok(!D.checkQr(`${head}.${"A".repeat(sig.length)}`, "c-abc-1", now));
  const far = (now + 3_600_000).toString(36);
  assert.ok(!D.checkQr(`${far}.${sig}`, "c-abc-1", now), "exp too far ahead");
  for (const bad of [null, undefined, "", "x", "a.b.c", "zz".repeat(40)]) assert.ok(!D.checkQr(bad as never, "c-abc-1", now));
});
