#!/usr/bin/env node
/**
 * One-off: hash every remaining plaintext login key in the world document (scrypt, see src/lib/orbit/key-hash.ts).
 * Usage (owner only, after deploy, with DEVICE_SECRET set exactly as on the site):
 *   DATABASE_URL=… DEVICE_SECRET=… node --import ./scripts/ts-register.mjs scripts/hash-keys.mjs [--dry-run]
 * Without DATABASE_URL it works on the local PGlite in ./data/pglite. Prints counts only, never keys.
 */
import { hashAll } from "../src/lib/orbit/key-hash.ts";

const dry = process.argv.includes("--dry-run");
const url = process.env.DATABASE_URL?.trim();
let q, done;
if (url) {
  const pg = (await import("pg")).default;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  q = (t, p) => client.query(t, p).then((r) => r.rows);
  done = () => client.end();
} else {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite({ dataDir: "data/pglite" });
  await db.waitReady;
  q = (t, p) => db.query(t, p).then((r) => r.rows);
  done = () => db.close();
}
try {
  await q("begin");
  const rows = await q("select doc from orbit_world where id = 'world' for update");
  if (!rows[0]) { console.log("no world row"); await q("rollback"); process.exit(0); }
  const doc = typeof rows[0].doc === "string" ? JSON.parse(rows[0].doc) : rows[0].doc;
  const { keys, changed } = hashAll(doc.keys || {});
  console.log(`keys: ${Object.keys(keys).length}, plaintext hashed now: ${changed}${dry ? " (dry run)" : ""}`);
  if (dry || !changed) { await q("rollback"); }
  else {
    await q("update orbit_world set doc = jsonb_set(doc, '{keys}', $1::jsonb), updated_at = now() where id = 'world'", [JSON.stringify(keys)]);
    await q("commit");
  }
} catch (e) {
  await q("rollback").catch(() => {});
  console.error("hash-keys failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await done();
}
