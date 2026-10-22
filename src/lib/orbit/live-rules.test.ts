import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanText, looksScripted, shortName } from "./live-rules.ts";

test("live: cleans control chars and caps length", () => {
  assert.equal(cleanText("  hi\u202Ethere \n\n x "), "hithere x");
  assert.equal(cleanText("a".repeat(500)).length, 240);
});
test("live: short names", () => {
  assert.equal(shortName("Іван Петренко"), "Іван П.");
  assert.equal(shortName("❄ Оля"), "Оля");
  assert.equal(shortName("  "), "Учасник");
});
test("live: bot signal only on long, even, fast series", () => {
  const even = Array.from({ length: 20 }, (_, i) => i * 100);
  assert.equal(looksScripted(even), true);
  assert.equal(looksScripted(even.slice(0, 12)), false);
  assert.equal(looksScripted(even.map((t, i) => t + (i % 3) * 40)), false);
});
