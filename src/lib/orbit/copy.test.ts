import { test } from "node:test";
import assert from "node:assert/strict";
import { sparkText } from "./copy.ts";

test("legacy «ОД» in stored log lines renders as ✦", () => {
  assert.equal(sparkText("Поповнення 100 ОД."), "Поповнення 100 ✦.");
  assert.equal(sparkText("Ціна на добу 2026-10-17: 100 ОД."), "Ціна на добу 2026-10-17: 100 ✦.");
  assert.equal(sparkText("Зараховано 1 000 ОД."), "Зараховано 1 000 ✦.");
  assert.doesNotMatch(sparkText("Стартові 200 ОД — після першого внеску."), /ОД/);
  assert.equal(sparkText("Поповнення 100 ✦."), "Поповнення 100 ✦.");
  assert.equal(sparkText("ОДЕСА"), "ОДЕСА");
});
