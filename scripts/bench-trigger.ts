/** C1: DB-side cost of the 0048 mirror trigger. node --import ./scripts/ts-register.mjs scripts/bench-trigger.ts */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { benchWorld } from "../src/lib/orbit/bench-world.ts";
import { packDoc } from "../src/lib/orbit/access.ts";
const mig = (n: string) => readFileSync(`${new URL("../migrations/", import.meta.url).pathname}${n}`, "utf8");
for (const withT of [false, true]) {
  const pg = new PGlite();
  await pg.exec(mig("0030_orbit_world.sql"));
  const b = benchWorld(2000);
  const docs = [0, 1, 2, 3, 4, 5].map((i) => { const w = { ...b.world, creations: b.world.creations.map((c, j) => (j === i ? { ...c, codesToday: i + 1 } : c)), fund: 500 + i }; return packDoc(w, b.keys, b.devices, b.people, [], {}, b.seen); });
  await pg.query(`insert into orbit_world (id, doc) values ('world', $1::jsonb)`, [docs[0]]);
  if (withT) await pg.exec(mig("0048_orbit_split_tables.sql"));
  const t = performance.now();
  for (let i = 1; i < 6; i++) await pg.query(`update orbit_world set doc = $1::jsonb where id = 'world'`, [docs[i]]);
  console.log(withT ? "with trigger" : "no trigger", ((performance.now() - t) / 5).toFixed(1), "ms per world write (DB side, PGlite, 2000 users, 1 creation changed)");
}
