/**
 * C1 benchmark: CPU per request (in-process, без мережі/бази) для N людей.
 * Запуск: node --import ./scripts/ts-register.mjs scripts/bench-pull.ts 2000
 */
import { benchWorld } from "../src/lib/orbit/bench-world.ts";
import { docObject, packDoc, unpackDoc } from "../src/lib/orbit/access.ts";
import { makeSnap } from "../src/lib/orbit/world-snap.ts";
import { adoptClock, emptyWorld } from "../src/lib/orbit/engine.ts";
import { clockQuiet, clockWindow } from "../src/lib/orbit/clock-window.ts";
import { project } from "../src/lib/orbit/remote.ts";
import { hashKey, verifyKey } from "../src/lib/orbit/key-hash.ts";

const n = Number(process.argv[2] ?? 2000);
const bag = benchWorld(n);
const self = bag.world.accounts[5].id;
const key = "ABCD-EFGH-JKLM";
bag.keys[self] = hashKey(key);
const docText = packDoc(bag.world, bag.keys, bag.devices, bag.people, bag.topups, bag.limits, bag.seen, bag.extra);
const wall = bag.world.now + 1000;

function time(label: string, fn: () => unknown, reps = 30) {
  for (let i = 0; i < 3; i++) fn();
  const t = performance.now();
  for (let i = 0; i < reps; i++) fn();
  const ms = (performance.now() - t) / reps;
  console.log(`${label.padEnd(58)} ${ms.toFixed(2)} ms`);
  return ms;
}
const same = (a: object, b: object) => JSON.stringify({ ...a, now: 0, sessionId: null }) === JSON.stringify({ ...b, now: 0, sessionId: null });

console.log(`N=${n}  doc=${(docText.length / 1024).toFixed(0)} KB`);
const before = time("BEFORE pull (parse+unpack+adoptClock+sameWorld+project+serialize)", () => {
  const b = unpackDoc(JSON.parse(docText));
  const stored = { ...b.world, sessionId: null };
  const clocked = adoptClock(stored, wall);
  same(stored, clocked);
  verifyKey(b.keys, self, key);
  const w = project({ ...clocked, sessionId: self }, self, b.people);
  return JSON.stringify({ world: w, self: b.people[5] });
});
const parsed = unpackDoc(JSON.parse(docText));
const cached = { bag: parsed, win: clockWindow(parsed.world), people: new Map(parsed.people.map((p) => [p.userId, p])) };
const miss = time("AFTER  cache miss (once per isolate per world change)", () => {
  const b = unpackDoc(JSON.parse(docText));
  return [clockWindow(b.world), new Map(b.people.map((p) => [p.userId, p]))];
});
const sameMs = time("AFTER  pull, world unchanged since client v (same:true)", () => {
  if (!clockQuiet(cached.win, wall)) throw new Error("window");
  verifyKey(cached.bag.keys, self, key);
  const me = cached.people.get(self);
  return JSON.stringify({ world: { ...emptyWorld(wall), sessionId: self }, self: me, same: true, v: "2026-10-22 21:10:59.593+00" });
}, 300);
const changed = time("AFTER  pull, world changed (cached bag: project+serialize)", () => {
  const w = project({ ...cached.bag.world, sessionId: self, now: wall }, self, cached.bag.people);
  return JSON.stringify({ world: w, self: cached.people.get(self) });
});
const write = time("write path (unchanged: parse+unpack+adoptClock+packDoc)", () => {
  const b = unpackDoc(JSON.parse(docText));
  const w = adoptClock({ ...b.world, sessionId: null }, wall);
  return packDoc(w, b.keys, b.devices, b.people, b.topups, b.limits, b.seen, b.extra);
});
// C1 крок 2 (scale-2): запис під FOR UPDATE бере знімок процесу, якщо версія рядка (xmin|updated_at) та сама.
const snap = makeSnap("k", "v", unpackDoc(JSON.parse(docText)));
const writeHit = time("scale-2 write path, snapshot hit (adoptClock+packDoc)", () => {
  const b = { ...snap.bag };
  const w = adoptClock({ ...b.world, sessionId: null }, wall);
  return packDoc(w, b.keys, b.devices, b.people, b.topups, b.limits, b.seen, b.extra);
});
const written = docObject(snap.bag.world, snap.bag.keys, snap.bag.devices, snap.bag.people, snap.bag.topups, snap.bag.limits, snap.bag.seen, snap.bag.extra);
const lazy = time("scale-2 lazy write-through unpack (next request, same isolate)", () => makeSnap("k2", "v2", unpackDoc(written)));
const writeMiss = time("scale-2 write path, snapshot miss (= old write path)", () => {
  const b = unpackDoc(JSON.parse(docText));
  const w = adoptClock({ ...b.world, sessionId: null }, wall);
  return packDoc(w, b.keys, b.devices, b.people, b.topups, b.limits, b.seen, b.extra);
});
console.log(JSON.stringify({ n, docKB: Math.round(docText.length / 1024), before, miss, same: sameMs, changed, write, writeHit, lazy, writeMiss }));
