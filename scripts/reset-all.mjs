#!/usr/bin/env node
/**
 * Повне скидання даних ORBIT (scripts/reset_all.sql). Відмовляє, якщо:
 *  - не задано ORBIT_ALLOW_RESET=1;
 *  - DATABASE_URL вказує на прод (ендпоінт PROD_ENDPOINT), а не задано ORBIT_RESET_FINAL_PROD=<той самий ендпоінт>
 *    (одноразовий фінальний запуск перед відкриттям; після нього цей прапорець більше не використовувати).
 * Запуск: ORBIT_ALLOW_RESET=1 DATABASE_URL=… node scripts/reset-all.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const PROD_ENDPOINT = "ep-lucky-haze-b5nxeb8m";

export function resetAllowed(env) {
  if (env.ORBIT_ALLOW_RESET !== "1") return { ok: false, why: "ORBIT_ALLOW_RESET=1 не задано" };
  const url = env.DATABASE_URL ?? "";
  let host = "";
  try { host = new URL(url).hostname; } catch { return { ok: false, why: "DATABASE_URL не задано або хибний" }; }
  const prod = host.startsWith(PROD_ENDPOINT + ".") || host.startsWith(PROD_ENDPOINT + "-pooler.");
  if (prod && env.ORBIT_RESET_FINAL_PROD !== PROD_ENDPOINT) return { ok: false, why: "це ПРОД: відмова (потрібен ORBIT_RESET_FINAL_PROD)" };
  return { ok: true, prod };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const gate = resetAllowed(process.env);
  if (!gate.ok) {
    console.error("[reset] відмова:", gate.why);
    process.exit(2);
  }
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  const count = async () => {
    const t = await sql.query(`select tablename from pg_tables where schemaname='public' and tablename <> '_migrations' order by 1`);
    const out = {};
    for (const { tablename } of t) out[tablename] = Number((await sql.query(`select count(*)::int n from "${tablename}"`))[0].n);
    return out;
  };
  console.log("[reset] before", JSON.stringify(await count()));
  await sql.query(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "reset_all.sql"), "utf8"));
  console.log("[reset] after", JSON.stringify(await count()));
}
