import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { acceptCode, adoptClock, buyOldest, enter, issueCode, listOrbit, register, startCreation, type World } from "./engine.ts";
import { markDevice, markSeen, packDoc, unpackDoc, type Bag } from "./access.ts";
import { benchWorld } from "./bench-world.ts";
import { splitDiff, splitDoc } from "./split.ts";

const mig = (name: string) => readFileSync(new URL(`../../../migrations/${name}`, import.meta.url), "utf8");
const sorted = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)])) : v;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test("C1 split: trigger mirrors doc into tables; tables rebuild an identical bag; engine results identical (300 random steps)", async () => {
  const pg = new PGlite();
  await pg.exec(mig("0030_orbit_world.sql"));
  const start = benchWorld(40);
  await pg.query(`insert into orbit_world (id, doc) values ('world', $1::jsonb)`, [packDoc(start.world, start.keys, start.devices, start.people, [], {}, start.seen)]);
  await pg.exec(mig("0046_orbit_split_tables.sql")); // backfill from the existing row
  const query = async <T,>(text: string, params: unknown[]) => (await pg.query(text, params)).rows as T[];
  const load = async () => (await query<{ doc: Record<string, unknown> }>(`select doc from orbit_world where id = 'world'`, []))[0].doc;
  const check = async (step: number) => {
    const diff = await splitDiff(query);
    assert.ok(diff?.ok, `step ${step}: ${JSON.stringify(diff?.rows)}`);
    const doc = await load();
    const a = unpackDoc(doc);
    const b = unpackDoc(await splitDoc(query, doc));
    assert.deepEqual(sorted(b), sorted(a), `step ${step}: bag differs`);
    return { a, b };
  };
  await check(-1);
  const r = rng(2026);
  let bag: Bag = unpackDoc(await load());
  const save = async (next: Bag) => {
    bag = next;
    await pg.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
      packDoc({ ...next.world, sessionId: null }, next.keys, next.devices, next.people, next.topups, next.limits, next.seen, next.extra),
    ]);
  };
  const ids = () => bag.world.accounts.map((x) => x.id);
  const as = (w: World, id: string) => enter({ ...w, sessionId: null }, id).world;
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const dev = () => "d-" + Array.from({ length: 8 }, () => A[Math.floor(r() * A.length)]).join("");
  for (let step = 0; step < 300; step++) {
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    const x = r();
    let w = adoptClock({ ...bag.world, sessionId: null }, bag.world.now + Math.floor(r() * 3_600_000));
    let next: Bag = { ...bag };
    if (x < 0.15) {
      const s = register(w, `Нова${step}`);
      if (!s.error && s.world.sessionId) {
        const id = s.world.sessionId;
        w = s.world;
        next = { ...next, keys: { ...next.keys, [id]: `h1$${"b".repeat(64)}` }, people: [...next.people, { userId: id, given: "Н", family: "Н", birth: "1990-01-01", email: `n${step}@x.y`, phone: `+38067${String(1000000 + step)}`, confirmed: true, mailCode: null }] };
      }
    } else if (x < 0.35) w = startCreation(as(w, pick(ids()))).world;
    else if (x < 0.5) w = issueCode(as(w, pick(ids()))).world;
    else if (x < 0.65) {
      const open = w.creations.filter((c) => c.status === "collecting" && c.code);
      if (open.length) w = acceptCode(as(w, pick(ids())), pick(open).code!).world;
    } else if (x < 0.72) {
      const mine = w.orbits.filter((o) => !w.queue.some((q) => q.orbitId === o.id));
      if (mine.length) { const o = pick(mine); w = listOrbit(as(w, o.ownerId), o.id).world; }
    } else if (x < 0.78) w = buyOldest(as(w, pick(ids()))).world;
    else if (x < 0.86) next = { ...next, seen: markSeen(next.seen, r() < 0.5 ? dev() : pick(Object.keys(next.seen)), pick(ids())), devices: markDevice(next.devices, dev(), new Date(w.now).toISOString().slice(0, 10)) };
    else if (x < 0.92) { const id = pick(ids()); next = { ...next, keys: { ...next.keys, [id]: `h1$${step.toString(16).padStart(64, "c")}` } }; }
    else if (x < 0.96) next = { ...next, people: next.people.map((p, i) => (i === step % next.people.length ? { ...p, phone: `+4477${String(1000000 + step)}`, phoneVerified: false } : p)) };
    else { const victim = pick(next.people); next = { ...next, people: next.people.filter((p) => p !== victim), keys: Object.fromEntries(Object.entries(next.keys).filter(([k]) => k !== victim.userId)) }; }
    await save({ ...next, world: { ...w, sessionId: null } });
    if (step % 10 === 0 || step === 299) {
      const { a, b } = await check(step);
      // Економіка ✦ і підтвердження: та сама дія на обох «джерелах» дає однаковий світ.
      const who = pick(a.world.accounts).id;
      const wa = adoptClock({ ...a.world, sessionId: null }, a.world.now + 5000);
      const wb = adoptClock({ ...b.world, sessionId: null }, a.world.now + 5000);
      for (const act of [buyOldest, startCreation, issueCode] as const) {
        const real = Math.random;
        try {
          Math.random = rng(step);
          const fromTables = act(as(wb, who));
          Math.random = rng(step);
          const fromDoc = act(as(wa, who));
          // Код запуску — криптовипадковий (не Math.random): порівнюємо все, крім самого значення коду.
          const noCode = (v: unknown) => JSON.parse(JSON.stringify(sorted(v)).replace(/"(code|notice)":"\d{6}"/g, '"$1":"######"'));
          assert.deepEqual(noCode(fromTables), noCode(fromDoc));
        } finally {
          Math.random = real;
        }
      }
    }
  }
  const counts = (await query<{ n: number }>(`select count(*)::int as n from orbit_creation`, []))[0].n;
  assert.ok(counts > 80, `creations mirrored: ${counts}`);
});

test("C1 split: a broken mirror never blocks the world write (duplicate ids) and shows up in the diff", async () => {
  const pg = new PGlite();
  await pg.exec(mig("0030_orbit_world.sql"));
  await pg.exec(mig("0046_orbit_split_tables.sql"));
  const query = async <T,>(text: string, params: unknown[]) => (await pg.query(text, params)).rows as T[];
  const b = benchWorld(3);
  await pg.query(`insert into orbit_world (id, doc) values ('world', $1::jsonb)`, [packDoc(b.world, b.keys, b.devices, [...b.people, b.people[0]], [], {}, b.seen)]);
  const rows = await query<{ n: number }>(`select count(*)::int as n from orbit_world`, []);
  assert.equal(rows[0].n, 1);
  const diff = await splitDiff(query);
  assert.ok(diff);
});
