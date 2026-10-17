import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { buyOldest, emptyWorld, listOrbit, register, type World } from "./engine.ts";
import { archiveCounts, archiveParity, archiveRead, archiveWrite, ensureSocial, launchParity } from "./social-db.ts";

const mig = (name: string) => readFileSync(new URL(`../../../migrations/${name}`, import.meta.url), "utf8");
function wrap(pg: PGlite) {
  const query = async (text: string, params: unknown[] = []) => (await pg.query(text, params)).rows as never[];
  return Object.assign(async () => [], { query }) as unknown as import("@/lib/db").Sql;
}
const T0 = Date.UTC(2026, 9, 19, 12);

test("v16 archive: 0037 backfills trades/log/finished launches from the world row; dual-write appends exactly once", async () => {
  const pg = new PGlite();
  await pg.exec(mig("0030_orbit_world.sql"));
  // a pre-v16 world: one old trade without buyer/seller, two finished launches, a log in «ОД»
  let w: World = emptyWorld(T0);
  for (let i = 0; i < 3; i++) w = { ...register(w, `Л${i}`).world, now: T0 };
  const a = w.accounts.map((x) => x.id);
  w = {
    ...w,
    sessionId: null,
    accounts: w.accounts.map((x) => ({ ...x, balance: 1000 })),
    orbits: [{ id: 1, ownerId: a[0], createdAt: T0 }, { id: 2, ownerId: a[1], createdAt: T0 }],
    nextNo: 3,
    trades: [{ at: T0 - 5000, amount: 100, orbitId: 9 }],
    creations: [
      { id: "c-a-0", userId: a[0], confirms: [], status: "done", code: null, codeExpires: 0, codeDay: "", codesToday: 0, chargeStartedAt: T0 - 9e7 },
      { id: "c-a-1", userId: a[1], confirms: [], status: "failed", code: null, codeExpires: 0, codeDay: "", codesToday: 0, chargeStartedAt: T0 - 9e7 },
      { id: "c-a-2", userId: a[2], confirms: [], status: "collecting", code: null, codeExpires: 0, codeDay: "", codesToday: 0, chargeStartedAt: null },
    ],
    log: [{ at: T0 - 1, text: "Л0 купив #9 за 100 ОД. Продавцю 97. У фонд 2." }],
  };
  await pg.query(`insert into orbit_world (id, doc) values ('world', $1::jsonb)`, [JSON.stringify({ v: 2, world: w, keys: {} })]);
  const sql = wrap(pg);
  await pg.exec(mig("0036_orbit_archive.sql"));
  await pg.exec(mig("0037_orbit_archive_backfill.sql"));
  await pg.exec(mig("0037_orbit_archive_backfill.sql")); // idempotent
  assert.deepEqual(await archiveCounts(sql), { trades: 1, log: 1, launches: 2 });
  await ensureSocial(sql); // runtime safety net re-runs create-if-not-exists without error

  // a v16 trade through the real engine → dual-write adds one trade row with buyer+seller and one log row
  const listed = listOrbit({ ...w, sessionId: a[0] }, 1).world;
  const bought = buyOldest({ ...listed, sessionId: a[2] }).world;
  await archiveWrite(sql, listed, bought, T0);
  await archiveWrite(sql, listed, bought, T0); // retry-safe
  const rows = (await pg.query<{ seq: number; buyer_id: string | null; seller_id: string | null }>(`select seq, buyer_id, seller_id from orbit_trades order by seq`)).rows;
  assert.deepEqual(rows, [
    { seq: 0, buyer_id: null, seller_id: null },
    { seq: 1, buyer_id: a[2], seller_id: a[0] },
  ]);
  const counts = await archiveCounts(sql);
  assert.equal(counts.trades, bought.trades.length);
  assert.equal(counts.log, 2); // backfilled line + «купив … ✦» (the listing line was written by its own earlier write)

  // v17 step 2: read path. Write the listing step too (as the server does), then archive == world.
  await archiveWrite(sql, w, listed, T0);
  const hist = await archiveRead(sql);
  assert.deepEqual(hist.trades, bought.trades);
  assert.deepEqual(archiveParity(bought, hist), { tradesOk: true, logOk: true, ok: true });
  // same lines (order within one millisecond follows insert order; here the listing was archived late on purpose)
  assert.deepEqual(hist.log.map((r) => r.text).sort(), bought.log.map((r) => r.text).sort());
  assert.equal((await launchParity(sql, bought)).ok, true);
  // a lost dual-write is caught: screens fall back to the world row, reconcile reports it
  await pg.query(`delete from orbit_trades where seq = 1`);
  assert.equal(archiveParity(bought, await archiveRead(sql)).tradesOk, false);
  await pg.query(`delete from orbit_launches where id = 'c-a-0'`);
  assert.deepEqual(await launchParity(sql, bought), { worldFinals: 2, archived: 1, missing: 1, ok: false });
  await pg.close();
});
