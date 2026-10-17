import { test } from "node:test";
import assert from "node:assert/strict";
import { crewStreak, crewWeek, monthRecap, phraseOf, weekStart, THANK_PHRASES } from "./pulse.ts";

const D = 86_400_000;
const mon = Date.UTC(2026, 9, 12); // Monday
const cr = (id: string, userId: string, confirms: [string, number][], status = "done", charge: number | null = null) =>
  ({ id: `cr-${(confirms[0]?.[1] ?? mon).toString(36)}-${id}`, userId, confirms: confirms.map(([witnessId, at]) => ({ witnessId, at })), status, code: null, codeExpires: 0, codeDay: "", codesToday: 0, chargeStartedAt: charge }) as never;

test("weekStart is Monday 00:00 UTC", () => {
  assert.equal(new Date(weekStart(mon + 3 * D)).getUTCDay(), 1);
  assert.equal(weekStart(mon + 3 * D), mon);
});

test("crew streak counts consecutive weeks of in-crew confirms, current week doesn't break it", () => {
  const launch = cr("a", "A", [["B", mon - 14 * D], ["C", mon - 14 * D]], "done", mon - 13 * D);
  const crew = { author: "A", members: ["B", "C"], creation: launch };
  const later = cr("b", "B", [["A", mon - 7 * D + D], ["X", mon - 6 * D]], "collecting");
  const w = { creations: [launch, later] };
  assert.deepEqual(crewStreak(w, crew, mon + D), { weeks: 2, best: 2, thisWeek: false, alive: true });
  const now2 = cr("c", "C", [["B", mon + D]], "collecting");
  assert.deepEqual(crewStreak({ creations: [launch, later, now2] }, crew, mon + 2 * D), { weeks: 3, best: 3, thisWeek: true, alive: true });
  assert.equal(crewStreak(w, crew, mon + 14 * D).alive, false);
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
  assert.deepEqual(crewWeek({ creations: [launch] }, crew, mon + 3 * D, ev), { confirms: 1, orbits: 1, thanks: 1, from: mon });
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
