import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { acceptCode, adoptClock, buyOldest, cancelListing, enter, issueCode, listOrbit, register, startCreation, type World } from "./engine.ts";
import { docObject, markDevice, markSeen, packDoc, strike, unpackDoc, type Bag } from "./access.ts";
import { markDay } from "./social.ts";
import { benchWorld } from "./bench-world.ts";
import { clearSnap, HEAD_SQL, makeSnap, putSnap, rememberWrite, RETURNING, snapAt, snapKey, snapStats } from "./world-snap.ts";

const mig = (name: string) => readFileSync(new URL(`../../../migrations/${name}`, import.meta.url), "utf8");
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const args = (b: Bag) => [{ ...b.world, sessionId: null }, b.keys, b.devices, b.people, b.topups, b.limits, b.seen, b.extra] as const;

test("world-snap: hit / miss / lazy write-through; a newer DB read drops a stale pending write", () => {
  clearSnap();
  const bag = unpackDoc(JSON.parse(packDoc(...args(benchWorld(5)))));
  assert.equal(snapAt("1|a"), null);
  putSnap(makeSnap("1|a", "a", bag));
  assert.equal(snapAt("1|a")?.v, "a");
  rememberWrite("2|b", "b", docObject(...args(bag)));
  assert.equal(snapAt("1|a")?.v, "a", "old snapshot still valid for its own key");
  const lazy = snapAt("2|b");
  assert.ok(lazy && isDeepStrictEqual(lazy.bag, makeSnap("x", "b", bag).bag));
  rememberWrite("3|c", "c", docObject(...args(bag)));
  putSnap(makeSnap("4|d", "d", bag)); // інший процес записав новішу версію — лінивий запис 3|c більше не потрібен
  assert.equal(snapAt("3|c"), null);
  assert.deepEqual(snapStats(), { hits: 2, misses: 2, lazy: 1 });
  clearSnap();
});

test("world-snap: snapshot is frozen — writes can't change it in place (deep with ORBIT_SNAP_CHECK=1)", () => {
  const bag = unpackDoc(JSON.parse(packDoc(...args(benchWorld(5)))));
  const prod = makeSnap("k", "v", bag);
  assert.throws(() => (prod.bag.world.accounts as unknown[]).push(1), TypeError);
  assert.throws(() => { (prod.bag.keys as Record<string, string>)["u-x"] = "1"; }, TypeError);
  process.env.ORBIT_SNAP_CHECK = "1";
  try {
    const deep = makeSnap("k", "v", unpackDoc(JSON.parse(packDoc(...args(benchWorld(5))))));
    assert.throws(() => { (deep.bag.world.accounts[0] as { balance: number }).balance = 1; }, TypeError);
    assert.throws(() => { (deep.bag.world.creations[0].confirms as unknown[]).push(1); }, TypeError);
  } finally {
    delete process.env.ORBIT_SNAP_CHECK;
  }
});

test("world-snap: 400 random engine steps on a frozen write-through snapshot == JSON round trip (what a DB read gives)", () => {
  process.env.ORBIT_SNAP_CHECK = "1"; // deep freeze: any in-place mutation by the engine/access helpers throws
  try {
    const r = rng(77);
    // «snap»: як у процесі — лише розпаковка обʼєкта, що записали; «db»: як після select doc (JSON).
    let snap = makeSnap("0", "0", unpackDoc(JSON.parse(packDoc(...args(benchWorld(30)))))).bag;
    let db = unpackDoc(JSON.parse(packDoc(...args(snap))));
    const as = (w: World, id: string) => enter({ ...w, sessionId: null }, id).world;
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const dev = () => "d-" + Array.from({ length: 8 }, () => A[Math.floor(r() * A.length)]).join("");
    for (let step = 0; step < 400; step++) {
      const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
      const ids = snap.world.accounts.map((x) => x.id);
      const x = r();
      let w = adoptClock({ ...snap.world, sessionId: null }, snap.world.now + Math.floor(r() * 4 * 3_600_000));
      let next: Bag = { ...snap };
      if (x < 0.12) {
        const s = register(w, `Нова${step}`);
        if (!s.error && s.world.sessionId) {
          const id = s.world.sessionId;
          w = s.world;
          next = { ...next, keys: { ...next.keys, [id]: `h1$${"b".repeat(64)}` }, people: [...next.people, { userId: id, given: "Н", family: "Н", birth: "1990-01-01", email: `n${step}@x.y`, phone: `+38067${String(1000000 + step)}`, confirmed: true, mailCode: null }] };
        }
      } else if (x < 0.3) w = startCreation(as(w, pick(ids))).world;
      else if (x < 0.45) w = issueCode(as(w, pick(ids))).world;
      else if (x < 0.6) {
        const open = w.creations.filter((c) => c.status === "collecting" && c.code);
        if (open.length) w = acceptCode(as(w, pick(ids)), pick(open).code!).world;
      } else if (x < 0.68) {
        const free = w.orbits.filter((o) => !w.queue.some((q) => q.orbitId === o.id));
        if (free.length) { const o = pick(free); w = listOrbit(as(w, o.ownerId), o.id).world; }
      } else if (x < 0.72 && w.queue.length) { const q = pick(w.queue); w = cancelListing(as(w, q.userId), q.orbitId).world; }
      else if (x < 0.8) w = buyOldest(as(w, pick(ids))).world;
      else if (x < 0.88) next = { ...next, seen: markSeen(next.seen, dev(), pick(ids)), devices: markDevice(next.devices, dev(), new Date(w.now).toISOString().slice(0, 10)) };
      else if (x < 0.94) next = { ...next, limits: strike(next.limits, `k:${pick(ids)}|n`, w.now, 10, 3_600_000, 3_600_000) };
      else next = { ...next, extra: { ...next.extra, days: markDay(next.extra.days, pick(ids), w.now) } };
      next = { ...next, world: { ...w, sessionId: null } };
      const written = docObject(...args(next));
      const fromSnap = makeSnap(String(step), "v", unpackDoc(written)).bag;
      const fromDb = unpackDoc(JSON.parse(JSON.stringify(written)));
      assert.ok(isDeepStrictEqual(fromSnap, { ...fromDb, world: { ...fromDb.world, sessionId: null } }), `step ${step}: write-through snapshot differs from the JSON round trip`);
      snap = fromSnap;
      db = fromDb;
    }
    assert.ok(snap.world.creations.some((c) => c.status === "done") && snap.world.trades.length > 0, "walk exercised launches and trades");
    assert.equal(JSON.stringify(snap.world), JSON.stringify({ ...db.world, sessionId: null }));
  } finally {
    delete process.env.ORBIT_SNAP_CHECK;
  }
});

test("world-snap: row version key (xmin|updated_at) changes on every committed write, even with the same updated_at", async () => {
  const pg = new PGlite();
  await pg.exec(mig("0030_orbit_world.sql"));
  await pg.query(`insert into orbit_world (id, doc) values ('world', '{}'::jsonb)`);
  const head = async () => snapKey((await pg.query<{ rev: string; v: string }>(HEAD_SQL)).rows[0]);
  const k0 = await head();
  const w1 = (await pg.query<{ rev: string; v: string }>(`update orbit_world set doc = '{"a":1}'::jsonb, updated_at = now() where id = 'world' ${RETURNING}`)).rows[0];
  assert.equal(snapKey(w1), await head(), "returning gives exactly the key the next reader sees");
  assert.notEqual(snapKey(w1), k0);
  // Той самий updated_at, інший вміст (інша транзакція) — ключ усе одно інший завдяки xmin.
  const w2 = (await pg.query<{ rev: string; v: string }>(`update orbit_world set doc = '{"a":2}'::jsonb, updated_at = $1::timestamptz where id = 'world' ${RETURNING}`, [w1.v])).rows[0];
  assert.equal(w2.v, w1.v);
  assert.notEqual(snapKey(w2), snapKey(w1));
  assert.equal((await pg.query<{ rev: string; v: string }>(`${HEAD_SQL} for update`)).rows.length, 1);
  await pg.close();
});
