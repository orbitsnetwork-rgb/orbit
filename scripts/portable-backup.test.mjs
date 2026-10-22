import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { seal, open, keyOf, restoreInto, tableDdl } from "./portable-backup.mjs";

test("seal/open round-trip and wrong key fails", () => {
  const k = randomBytes(32);
  const buf = seal({ a: [1, "✦"] }, k);
  assert.deepEqual(open(buf, k), { a: [1, "✦"] });
  assert.throws(() => open(buf, randomBytes(32)));
  assert.throws(() => keyOf("short"));
});

test("restore into PGlite rebuilds schema, rows, constraints, sequences", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const src = new PGlite();
  const q = (db) => async (s, p) => (await db.query(s, p)).rows;
  await src.exec(`create table t (id bigserial primary key, doc jsonb not null default '{}', n int check (n >= 0), u text unique);
    create index t_n on t (n); insert into t (doc, n, u) values ('{"x":1}', 1, 'a'), ('{}', 2, 'b');`);
  // mimic catalog() via a direct export
  const { default: mod } = { default: await import("./portable-backup.mjs") };
  assert.ok(mod);
  const columns = (await src.query(`select a.attname as name, format_type(a.atttypid,a.atttypmod) as type, a.attnotnull as notnull, pg_get_expr(d.adbin,d.adrelid) as default from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='t'::regclass and a.attnum>0 and not a.attisdropped order by a.attnum`)).rows;
  const constraints = (await src.query(`select conname as name, pg_get_constraintdef(oid) as def from pg_constraint where conrelid='t'::regclass and contype in ('p','u','c')`)).rows;
  const dump = { tables: [{ name: "t", columns, constraints, indexes: ["CREATE INDEX t_n ON public.t USING btree (n)"], rows: (await src.query("select * from t")).rows, seqs: [{ column: "id", value: "2" }] }] };
  assert.ok(tableDdl(dump.tables[0]).some((l) => l.includes("CREATE SEQUENCE")));
  const dst = new PGlite();
  const counts = await restoreInto(q(dst), JSON.parse(JSON.stringify(dump)));
  assert.equal(counts.t, 2);
  await dst.query(`insert into t (u) values ('c')`);
  assert.equal((await dst.query(`select max(id)::int as m from t`)).rows[0].m, 3);
  await assert.rejects(dst.query(`insert into t (n) values (-1)`));
  await assert.rejects(restoreInto(q(dst), dump), /not empty/);
});
