#!/usr/bin/env node
/**
 * Off-Neon portable backup (plain Postgres, no vendor features).
 *
 *   export:  DATABASE_URL=… ORBIT_BACKUP_KEY=… node scripts/portable-backup.mjs export <out.orbk> [--kv]
 *   restore: ORBIT_BACKUP_KEY=… node scripts/portable-backup.mjs restore <in.orbk> [--pglite <dir> | --url <postgres-url>]
 *
 * The artifact holds DDL (tables, columns, defaults, constraints, indexes rebuilt from the catalog) and every
 * row of every table in schema public, as JSON, gzip'ed and sealed with AES-256-GCM (ORBIT_BACKUP_KEY, 64 hex).
 * Export is read-only (one REPEATABLE READ, READ ONLY transaction). Restore refuses a non-empty target and
 * refuses the production host (ORBIT_PROD_HOST, default ep-lucky-haze). Never prints secrets or row data.
 * --kv also uploads the artifact to Cloudflare Workers KV (free tier) namespace orbit-backups, key "latest".
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";

const MAGIC = Buffer.from("ORBK1");

export function keyOf(hex) {
  if (typeof hex !== "string" || !/^[0-9a-f]{64}$/i.test(hex.trim())) throw new Error("ORBIT_BACKUP_KEY must be 64 hex chars");
  return Buffer.from(hex.trim(), "hex");
}
export function seal(obj, key) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify(obj)))), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}
export function open(buf, key) {
  if (!buf.subarray(0, 5).equals(MAGIC)) throw new Error("not an ORBIT backup");
  const d = createDecipheriv("aes-256-gcm", key, buf.subarray(5, 17));
  d.setAuthTag(buf.subarray(17, 33));
  return JSON.parse(gunzipSync(Buffer.concat([d.update(buf.subarray(33)), d.final()])).toString());
}
export const q = (id) => `"${String(id).replace(/"/g, '""')}"`;

/** DDL for one table from catalog rows (portable: no owners, no Neon roles). */
export function tableDdl(t) {
  const cols = t.columns.map((c) => `  ${q(c.name)} ${c.type}${c.notnull ? " NOT NULL" : ""}${c.default != null && !/nextval\(/.test(c.default) ? ` DEFAULT ${c.default}` : ""}`);
  const serial = t.columns.filter((c) => c.default && /nextval\(/.test(c.default));
  const lines = [`CREATE TABLE IF NOT EXISTS ${q(t.name)} (\n${cols.join(",\n")}\n);`];
  for (const c of serial) {
    const seq = `${t.name}_${c.name}_seq`;
    lines.push(`CREATE SEQUENCE IF NOT EXISTS ${q(seq)} OWNED BY ${q(t.name)}.${q(c.name)};`);
    lines.push(`ALTER TABLE ${q(t.name)} ALTER COLUMN ${q(c.name)} SET DEFAULT nextval('${seq.replace(/'/g, "''")}');`);
  }
  for (const k of t.constraints) lines.push(`ALTER TABLE ${q(t.name)} ADD CONSTRAINT ${q(k.name)} ${k.def};`);
  for (const i of t.indexes) lines.push(`${i.replace(/^CREATE (UNIQUE )?INDEX /, "CREATE $1INDEX IF NOT EXISTS ").replace(/ ON public\./, " ON ")};`);
  return lines;
}

async function catalog(query) {
  const tables = (await query(`select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1`)).map((r) => r.name);
  const out = [];
  for (const name of tables) {
    const columns = (await query(
      `select a.attname as name, format_type(a.atttypid,a.atttypmod) as type, a.attnotnull as notnull, pg_get_expr(d.adbin,d.adrelid) as default
       from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
       where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped order by a.attnum`, [`public.${q(name)}`]));
    const constraints = (await query(`select conname as name, pg_get_constraintdef(oid) as def from pg_constraint where conrelid=$1::regclass and contype in ('p','u','c') order by contype='p' desc, conname`, [`public.${q(name)}`]));
    const indexes = (await query(`select indexdef from pg_indexes where schemaname='public' and tablename=$1 and indexname not in (select conname from pg_constraint where conrelid=$2::regclass) order by indexname`, [name, `public.${q(name)}`])).map((r) => r.indexdef);
    const rows = await query(`select * from public.${q(name)}`);
    const seqs = [];
    for (const c of columns.filter((c) => c.default && /nextval\(/.test(c.default))) {
      const v = (await query(`select coalesce(max(${q(c.name)}),0)::bigint as v from public.${q(name)}`))[0].v;
      seqs.push({ column: c.name, value: String(v) });
    }
    out.push({ name, columns, constraints, indexes, rows, seqs });
  }
  return out;
}

export async function restoreInto(query, dump) {
  const has = await query(`select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`);
  if (has[0].n > 0) throw new Error("target database is not empty — refusing");
  for (const t of dump.tables) for (const s of tableDdl({ ...t, constraints: [], indexes: [] })) await query(s);
  for (const t of dump.tables) {
    const cols = t.columns.map((c) => c.name);
    for (const row of t.rows) {
      const vals = t.columns.map((c) => {
        const v = row[c.name];
        if (v === null || v === undefined || typeof v !== "object") return v ?? null;
        return c.type.endsWith("[]") ? v : JSON.stringify(v);
      });
      await query(`insert into ${q(t.name)} (${cols.map(q).join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, vals);
    }
    for (const s of t.seqs) if (Number(s.value) > 0) await query(`select setval('${`${t.name}_${s.column}_seq`.replace(/'/g, "''")}', ${Number(s.value)})`);
  }
  for (const t of dump.tables) {
    for (const k of t.constraints) await query(`ALTER TABLE ${q(t.name)} ADD CONSTRAINT ${q(k.name)} ${k.def}`);
    for (const i of t.indexes) await query(i.replace(/^CREATE (UNIQUE )?INDEX /, "CREATE $1INDEX IF NOT EXISTS ").replace(/ ON public\./, " ON "));
  }
  const counts = {};
  for (const t of dump.tables) counts[t.name] = (await query(`select count(*)::int as n from ${q(t.name)}`))[0].n;
  return counts;
}

async function kvPut(buf) {
  const acc = process.env.CLOUDFLARE_ACCOUNT_ID, tok = process.env.CLOUDFLARE_API_TOKEN;
  if (!acc || !tok) throw new Error("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN needed for --kv");
  const api = `https://api.cloudflare.com/client/v4/accounts/${acc}/storage/kv/namespaces`;
  const h = { Authorization: `Bearer ${tok}` };
  let ns = (await (await fetch(api, { headers: h })).json()).result?.find((n) => n.title === "orbit-backups");
  if (!ns) ns = (await (await fetch(api, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ title: "orbit-backups" }) })).json()).result;
  if (!ns?.id) throw new Error("KV namespace unavailable");
  if (buf.length > 25 * 1024 * 1024) throw new Error("artifact over KV 25 MB value limit");
  const r = await fetch(`${api}/${ns.id}/values/latest`, { method: "PUT", headers: { ...h, "Content-Type": "application/octet-stream" }, body: buf });
  const j = await r.json();
  if (!j.success) throw new Error(`KV put failed: ${JSON.stringify(j.errors)}`);
  return ns.id;
}

async function main() {
  const [cmd, file, ...rest] = process.argv.slice(2);
  const key = keyOf(process.env.ORBIT_BACKUP_KEY);
  if (cmd === "export") {
    // Neon over WebSocket (port 443) — works where 5432 is blocked; same pg-compatible API.
    const { Client, neonConfig } = await import("@neondatabase/serverless");
    if (globalThis.WebSocket) neonConfig.webSocketConstructor = globalThis.WebSocket;
    else throw new Error("no WebSocket: run with node >=22 or node --experimental-websocket");
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      const tables = await catalog(async (s, p) => (await client.query(s, p)).rows);
      await client.query("commit");
      const dump = { v: 1, at: new Date().toISOString(), tables };
      const buf = seal(dump, key);
      await writeFile(file, buf, { mode: 0o600 });
      console.log(`export ok: ${tables.length} tables, ${tables.reduce((n, t) => n + t.rows.length, 0)} rows, ${buf.length} bytes, sha256 ${createHash("sha256").update(buf).digest("hex").slice(0, 16)}`);
      if (rest.includes("--kv")) console.log(`kv ok: namespace ${await kvPut(buf)} key latest`);
    } finally { await client.end(); }
  } else if (cmd === "restore") {
    const dump = open(await readFile(file), key);
    let query, close;
    const url = rest[rest.indexOf("--url") + 1];
    if (rest.includes("--url")) {
      if (url.includes(process.env.ORBIT_PROD_HOST || "ep-lucky-haze")) throw new Error("refusing to restore into production");
      const pg = (await import("pg")).default;
      const c = new pg.Client({ connectionString: url }); await c.connect();
      query = async (s, p) => (await c.query(s, p)).rows; close = () => c.end();
    } else {
      const { PGlite } = await import("@electric-sql/pglite");
      const dir = rest.includes("--pglite") ? rest[rest.indexOf("--pglite") + 1] : undefined;
      const db = new PGlite(dir);
      query = async (s, p) => (await db.query(s, p)).rows; close = () => db.close();
    }
    try {
      const counts = await restoreInto(query, dump);
      const bad = dump.tables.filter((t) => counts[t.name] !== t.rows.length).map((t) => t.name);
      console.log(`restore ${bad.length ? "MISMATCH" : "ok"}: ${dump.tables.length} tables from ${dump.at}${bad.length ? ` — ${bad.join(",")}` : ""}`);
      if (bad.length) process.exitCode = 1;
    } finally { await close(); }
  } else {
    console.error("usage: portable-backup.mjs export|restore <file> [...]");
    process.exitCode = 2;
  }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(`portable-backup: ${e.message}`); process.exitCode = 1; });
