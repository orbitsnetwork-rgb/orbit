import { test } from "node:test";
import assert from "node:assert/strict";
import { chatTokens, dayLabel, hm } from "./chat-text.ts";

test("chat: only http(s) becomes a link, trailing punctuation stays outside", () => {
  const t = chatTokens("дивись https://orbit.example/a?b=1. і javascript:alert(1)", "");
  assert.deepEqual(t[1], { kind: "link", text: "https://orbit.example/a?b=1" });
  assert.equal(t.filter((x) => x.kind === "link").length, 1);
  assert.ok(t.map((x) => x.text).join("").includes("javascript:alert(1)"));
});
test("chat: html stays plain text", () => {
  const t = chatTokens("<img src=x onerror=alert(1)>", "");
  assert.deepEqual(t, [{ kind: "text", text: "<img src=x onerror=alert(1)>" }]);
});
test("chat: @mention, mine is marked", () => {
  const t = chatTokens("привіт @Олена К. і @Тарас", "Олена К.");
  const ats = t.filter((x) => x.kind === "at");
  assert.equal(ats.length, 2);
  assert.equal(ats[0].kind === "at" && ats[0].me, true);
  assert.equal(ats[1].kind === "at" && ats[1].me, false);
});
test("chat: day labels", () => {
  const now = new Date(2026, 9, 22, 12, 0).getTime();
  assert.equal(dayLabel(now - 3_600_000, now), "Сьогодні");
  assert.equal(dayLabel(now - 86_400_000, now), "Вчора");
  assert.match(dayLabel(new Date(2026, 9, 1).getTime(), now), /1 жовтня/);
  assert.match(dayLabel(new Date(2025, 0, 5).getTime(), now), /2025/);
  assert.equal(hm(new Date(2026, 0, 1, 7, 5).getTime()), "07:05");
});
