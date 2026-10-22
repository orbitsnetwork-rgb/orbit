/** Дані користувачів не можна втратити: міграції лише додають. DROP / TRUNCATE / DELETE без WHERE / ALTER … DROP — заборонені. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../migrations/", import.meta.url).pathname;
const files = [...readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => join(dir, f)), ...readdirSync(join(dir, "auth")).filter((f) => f.endsWith(".sql")).map((f) => join(dir, "auth", f))];
// Історичні міграції, які вже застосовані на проді, перевірені вручну (нових сюди не додавати).
const GRANDFATHERED = new Set(["0023_actor_marks.sql"]); // лише змінює первинний ключ (drop constraint), дані не видаляє

export function destructive(sqlText) {
  const s = sqlText.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();
  const bad = [];
  if (/\bdrop\s+(table|schema|database|column|index|view|type|function)\b/.test(s)) bad.push("DROP");
  if (/\btruncate\b/.test(s)) bad.push("TRUNCATE");
  if (/\balter\s+table[^;]*\bdrop\b/.test(s)) bad.push("ALTER … DROP");
  for (const stmt of s.split(";")) if (/\bdelete\s+from\b/.test(stmt) && !/\bwhere\b/.test(stmt)) bad.push("DELETE without WHERE");
  return bad;
}

test("migrations are additive-only", () => {
  for (const f of files) {
    const name = f.slice(dir.length);
    if (GRANDFATHERED.has(name)) continue;
    assert.deepEqual(destructive(readFileSync(f, "utf8")), [], `${name} is destructive`);
  }
});
test("detector catches destructive SQL", () => {
  assert.deepEqual(destructive("drop table x;"), ["DROP"]);
  assert.deepEqual(destructive("truncate x;"), ["TRUNCATE"]);
  assert.deepEqual(destructive("delete from x;"), ["DELETE without WHERE"]);
  assert.deepEqual(destructive("delete from x where a=1;"), []);
  assert.deepEqual(destructive("alter table x drop column y;"), ["DROP", "ALTER … DROP"]);
  assert.deepEqual(destructive("create table if not exists x(a int); -- drop table y"), []);
});
