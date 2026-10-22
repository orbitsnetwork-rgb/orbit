import { test } from "node:test";
import assert from "node:assert/strict";
import { canVouch, prepWord, WORD_MAX } from "./vouch-word";

const world = { creations: [{ userId: "a", confirms: [{ witnessId: "w", at: 1 }] }] } as never;
test("vouch word: only a real witness of the author", () => {
  assert.equal(canVouch(world, "w", "a"), true);
  assert.equal(canVouch(world, "a", "w"), false);
  assert.equal(canVouch(world, "x", "a"), false);
  assert.equal(canVouch(world, "a", "a"), false);
});
test("vouch word: length, links, clipping", () => {
  assert.ok("error" in prepWord("ok"));
  assert.ok("error" in prepWord("пиши мені https://x.y"));
  assert.ok("error" in prepWord("мій канал t.me/spam"));
  const long = prepWord("я".repeat(500));
  assert.ok("text" in long && Array.from(long.text).length <= WORD_MAX);
  assert.deepEqual(prepWord("  Надійна   людина, знаю 10 років "), { text: "Надійна людина, знаю 10 років" });
});
