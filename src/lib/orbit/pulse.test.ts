import { test } from "node:test";
import assert from "node:assert/strict";
import { CREW_GOAL, crewGoal, crewStreak, crewWeek, monthRecap, phraseIndex, phraseOf, weekStart, THANK_PHRASES } from "./pulse.ts";

const D = 86_400_000;
const mon = Date.UTC(2026, 9, 12); // Monday
const cr = (id: string, userId: string, confirms: [string, number][], status = "done", charge: number | null = null) =>
  ({ id: `cr-${(confirms[0]?.[1] ?? mon).toString(36)}-${id}`, userId, confirms: confirms.map(([witnessId, at]) => ({ witnessId, at })), status, code: null, codeExpires: 0, codeDay: "", codesToday: 0, chargeStartedAt: charge }) as never;

test("weekStart is Monday 00:00 UTC", () => {
  assert.equal(new Date(weekStart(mon + 3 * D)).getUTCDay(), 1);
  assert.equal(weekStart(mon + 3 * D), mon);
});

test("crew streak counts consecutive weeks the crew confirmed someone new, current week doesn't break it", () => {
  const launch = cr("a", "A", [["B", mon - 14 * D]], "done", mon - 13 * D);
  const crew = { author: "A", members: ["B"], creation: launch };
  const w1 = cr("x", "X", [["A", mon - 7 * D + D]], "done", mon - 6 * D);
  const w2 = cr("y", "Y", [["B", mon - 14 * D + D]], "done", mon - 13 * D);
  const w = { creations: [launch, w1, w2] };
  assert.deepEqual(crewStreak(w, crew, mon + D), { weeks: 2, best: 2, thisWeek: false, alive: true });
  const now2 = cr("z", "Z", [["B", mon + D]], "collecting");
  assert.deepEqual(crewStreak({ creations: [launch, w1, w2, now2] }, crew, mon + 2 * D), { weeks: 3, best: 3, thisWeek: true, alive: true });
  assert.equal(crewStreak(w, crew, mon + 14 * D).alive, false);
  // Запуск, що створив екіпаж, у серію не входить.
  assert.equal(crewStreak({ creations: [launch] }, crew, mon - 13 * D).alive, false);
});

test("outsiders don't count", () => {
  const launch = cr("a", "A", [["B", mon]], "done", mon);
  const other = cr("x", "Z", [["A", mon + D]], "collecting");
  assert.equal(crewWeek({ creations: [launch, other] }, { author: "A", members: ["B"], creation: launch }, mon + 2 * D).confirms, 1);
});

test("crew week report: confirms, orbits born, own thanks", () => {
  const launch = cr("a", "A", [["B", mon + 60_000]], "done", mon + 60_000);
  const crew = { author: "A", members: ["B"], creation: launch };
  const ev = [{ t: "thanksSent", at: mon + 2 * D, other: "B" }, { t: "thanksGot", at: mon - D, other: "B" }, { t: "thanksGot", at: mon + 2 * D, other: "Q" }];
  assert.deepEqual(crewWeek({ creations: [launch] }, crew, mon + 3 * D, ev), { confirms: 0, orbits: 1, thanks: 1, from: mon });
});

test("month recap has only own actions", () => {
  const oct = Date.UTC(2026, 9, 20, 12);
  const mine = cr("m", "me", [["p", Date.UTC(2026, 9, 2)]], "done", Date.UTC(2026, 9, 3));
  const theirs = cr("t", "p", [["me", Date.UTC(2026, 9, 5)], ["me2", Date.UTC(2026, 8, 5)]], "done", Date.UTC(2026, 9, 6));
  const r = monthRecap({ creations: [mine, theirs] }, "me", oct, [{ t: "thanksGot", at: Date.UTC(2026, 9, 7) }, { t: "thanksGot", at: Date.UTC(2026, 8, 7) }]);
  assert.equal(r.confirms, 1);
  assert.equal(r.orbits, 1);
  assert.equal(r.thanks, 1);
  assert.equal(r.crews, 2);
  assert.ok(r.month.startsWith("жовтень"));
  assert.ok(!("balance" in r));
});

test("thank phrases: 6, index-only", () => {
  assert.equal(THANK_PHRASES.length, 6);
  assert.equal(phraseOf(2), THANK_PHRASES[2]);
  assert.equal(phraseOf(6), null);
  assert.equal(phraseOf("1"), null);
  assert.equal(phraseOf(1.5), null);
});

test("phraseIndex sanitises client input", () => {
  for (const ok of [0, 5, "3"]) assert.equal(typeof phraseIndex(ok), "number");
  for (const bad of [6, -1, 1.5, "7", "1e0", "", null, undefined, {}, [], "0x1", Infinity, NaN]) assert.equal(phraseIndex(bad), undefined);
});

test("crewGoal: 3 confirmations from the crew a week, cosmetic progress", () => {
  assert.equal(CREW_GOAL, 3);
  assert.deepEqual(crewGoal({ confirms: 0 }), { goal: 3, done: 0, left: 3, reached: false, pct: 0 });
  assert.deepEqual(crewGoal({ confirms: 2 }), { goal: 3, done: 2, left: 1, reached: false, pct: 67 });
  assert.deepEqual(crewGoal({ confirms: 5 }), { goal: 3, done: 5, left: 0, reached: true, pct: 100 });
  assert.equal(crewGoal({ confirms: -3 }).done, 0);
});
