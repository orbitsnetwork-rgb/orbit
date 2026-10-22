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

import { canUseRoom, dmRoom, normRoom, roomsFor } from "./live-rules.ts";
const mk = (status: string, id = "c-1") => ({
  accounts: ["a", "b", "c", "z"].map((x) => ({ id: x })),
  creations: [{ id, userId: "a", status, confirms: [{ witnessId: "b", at: 1 }] }],
}) as never;
test("rooms: world chat is off; DM only for its two existing people", () => {
  const w = { accounts: ["u-a", "u-b", "u-c"].map((id) => ({ id })), creations: [] } as never;
  assert.equal(canUseRoom(w, "u-a", "d:u-a~u-b"), true);
  assert.equal(canUseRoom(w, "u-b", "d:u-a~u-b"), true);
  assert.equal(canUseRoom(w, "u-c", "d:u-a~u-b"), false);
  assert.equal(canUseRoom(w, "u-a", "d:u-a~u-x"), false);
  assert.equal(canUseRoom(w, "u-a", "d:u-b~u-a"), false);
  assert.equal(canUseRoom(mk("collecting"), "z", "world"), false);
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
  assert.equal(normRoom("world"), null);
  assert.equal(dmRoom("u-b", "u-a"), "d:u-a~u-b");
  assert.equal(dmRoom("u-a", "u-a"), null);
  assert.equal(normRoom("d:u-a~u-b' or 1"), null);
  assert.equal(normRoom("l:c-1"), "l:c-1");
  assert.equal(normRoom("l:c-1' or 1=1"), null);
  assert.equal(normRoom("crew:1"), null);
  assert.equal(normRoom(undefined), null);
});
test("rooms: list shows only my launches (no world), crew title after success", () => {
  assert.deepEqual(roomsFor(mk("collecting"), "c").map((r) => r.id), []);
  const done = roomsFor(mk("done"), "b");
  assert.equal(done[0].id, "l:c-1");
  assert.equal(done[0].title, "Екіпаж №1");
  assert.equal(done[0].members, 2);
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

import { keepDays, maskWords, muteFor, reactNoteText, roomNoteText } from "./live-rules.ts";
test("moderation: soft mask, no false positives", () => {
  assert.equal(maskWords("ти сука така").text, "ти с••• така");
  assert.equal(maskWords("What the FUCK man").masked, 1);
  assert.equal(maskWords("Нахуй це").masked, 1);
  for (const ok of ["потребами", "Dickens", "психологія", "skyscraper", "Hello world", "Підтримую"]) {
    assert.equal(maskWords(ok).masked, 0, ok);
  }
  assert.equal(maskWords("скорочення").masked, 0);
});
test("moderation: mute ladder 1h then 24h", () => {
  assert.equal(muteFor(0), 0);
  assert.equal(muteFor(1), 0);
  assert.equal(muteFor(2), 3_600_000);
  assert.equal(muteFor(5), 86_400_000);
});
test("retention disabled by default", () => {
  assert.equal(keepDays(undefined), 0);
  assert.equal(keepDays("abc"), 0);
  assert.equal(keepDays("3"), 0);
  assert.equal(keepDays("30"), 30);
});
test("chat notes are grouped text", () => {
  assert.equal(reactNoteText(["Оля К."], 1, "Привіт"), "Нова реакція на твоє повідомлення «Привіт» — Оля К.");
  assert.equal(reactNoteText(["Оля К.", "Іван П."], 5, "x"), "Реакцій: 5 на твоє повідомлення «x» — Оля К., Іван П. і ще 3");
  assert.equal(roomNoteText("Екіпаж №2", 1), "«Екіпаж №2»: 1 нове повідомлення");
  assert.equal(roomNoteText("Екіпаж №2", 3), "«Екіпаж №2»: 3 нові повідомлення");
  assert.equal(roomNoteText("Екіпаж №2", 12), "«Екіпаж №2»: 12 нових повідомлень");
});
