import { test } from "node:test";
import assert from "node:assert/strict";
import { makeWorldCache } from "./world-cache.ts";

function fakeDb() {
  const row = { v: "1", doc: { n: 1 } };
  let docReads = 0;
  const query = async (text: string) => {
    if (text.includes("select doc")) { docReads += 1; return [{ doc: { ...row.doc }, v: row.v }]; }
    return [{ v: row.v }];
  };
  return { row, query: query as never, reads: () => docReads };
}
test("world cache: reuses unpacked doc while version is unchanged", async () => {
  const db = fakeDb();
  const c = makeWorldCache((d) => d as { n: number });
  await c.get(db.query); await c.get(db.query); await c.get(db.query);
  assert.equal(db.reads(), 1);
  assert.deepEqual(c.stats, { hits: 2, misses: 1 });
});
test("world cache: any world write (new updated_at) invalidates", async () => {
  const db = fakeDb();
  const c = makeWorldCache((d) => d as { n: number });
  assert.equal((await c.get(db.query))?.n, 1);
  db.row.v = "2"; db.row.doc = { n: 2 };
  assert.equal((await c.get(db.query))?.n, 2);
  assert.equal(db.reads(), 2);
});
