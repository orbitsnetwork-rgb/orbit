import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("stripe.ts has no legacy «ОД» unit (Checkout item, log, notices)", () => {
  const src = readFileSync(new URL("./stripe.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /(?<!\p{L})ОД(?!\p{L})/u);
  assert.match(src, /іскор ✦ · Орбіти/);
});
