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

import { canUseRoom, normRoom, roomsFor } from "./live-rules.ts";
const mk = (status: string, id = "c-1") => ({
  accounts: ["a", "b", "c", "z"].map((x) => ({ id: x })),
  creations: [{ id, userId: "a", status, confirms: [{ witnessId: "b", at: 1 }] }],
}) as never;
test("rooms: world for any signed-in account, not for strangers", () => {
  assert.equal(canUseRoom(mk("collecting"), "z", "world"), true);
  assert.equal(canUseRoom(mk("collecting"), "ghost", "world"), false);
});
test("rooms: launch room only for author + confirmers", () => {
  const w = mk("collecting");
  assert.equal(canUseRoom(w, "a", "l:c-1"), true);
  assert.equal(canUseRoom(w, "b", "l:c-1"), true);
  assert.equal(canUseRoom(w, "c", "l:c-1"), false);
  assert.equal(canUseRoom(w, "a", "l:c-404"), false);
  assert.equal(canUseRoom(mk("failed"), "a", "l:c-1"), false);
});
test("rooms: ids are validated (no injection, no unknown kinds)", () => {
  assert.equal(normRoom("world"), "world");
  assert.equal(normRoom("l:c-1"), "l:c-1");
  assert.equal(normRoom("l:c-1' or 1=1"), null);
  assert.equal(normRoom("crew:1"), null);
  assert.equal(normRoom(undefined), "world");
});
test("rooms: list shows world + only my launches, crew title after success", () => {
  assert.deepEqual(roomsFor(mk("collecting"), "c").map((r) => r.id), ["world"]);
  const done = roomsFor(mk("done"), "b");
  assert.equal(done[1].id, "l:c-1");
  assert.equal(done[1].title, "Екіпаж №1");
  assert.equal(done[1].members, 2);
});

import { CHAT_PER_MIN, CHAT_PER_MIN_ALL, REACTIONS, normReaction, overChatCap } from "./live-rules.ts";
test("caps: per-room 8/min", () => {
  assert.equal(CHAT_PER_MIN, 8);
  assert.equal(overChatCap(7, 7), false);
  assert.equal(overChatCap(8, 8), true);
});
test("caps: global 16/min across rooms even if each room is under 8", () => {
  assert.equal(CHAT_PER_MIN_ALL, 16);
  assert.equal(overChatCap(3, 15), false);
  assert.equal(overChatCap(3, 16), true);
});
test("reactions: fixed set, unique ids and names, unknown refused", () => {
  assert.ok(REACTIONS.length >= 8 && REACTIONS.length <= 12);
  assert.equal(new Set(REACTIONS.map((r) => r.id)).size, REACTIONS.length);
  assert.equal(new Set(REACTIONS.map((r) => r.name)).size, REACTIONS.length);
  assert.equal(normReaction("spark"), "spark");
  assert.equal(normReaction("<b>"), null);
  assert.equal(normReaction(undefined), null);
});
