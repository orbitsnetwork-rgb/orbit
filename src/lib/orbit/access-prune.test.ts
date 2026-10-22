import test from "node:test";
import assert from "node:assert/strict";
import { markDevice, namesLeft } from "./access.ts";

test("markDevice drops other days' rows but keeps today's counts", () => {
  const d = markDevice({ "d-AAAAAAAA": { day: "2026-10-21", count: 3 }, "d-BBBBBBBB": { day: "2026-10-22", count: 1 } }, "d-CCCCCCCC", "2026-10-22");
  assert.deepEqual(Object.keys(d).sort(), ["d-BBBBBBBB", "d-CCCCCCCC"]);
  assert.equal(namesLeft(d, "d-BBBBBBBB", "2026-10-22"), namesLeft({ x: { day: "2026-10-22", count: 1 } }, "x", "2026-10-22"));
  const again = markDevice(d, "d-BBBBBBBB", "2026-10-22");
  assert.equal(again["d-BBBBBBBB"].count, 2);
});
