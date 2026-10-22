import { test } from "node:test";
import assert from "node:assert/strict";
import { backup, isBackup, PROD_BRANCH } from "./neon-backup.mjs";

function fakeNeon(initial) {
  let branches = initial.map((b) => ({ ...b }));
  const deleted = [];
  let n = 0;
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname.replace("/api/v2", "");
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    if (path === "/projects") return ok({ projects: [{ id: "p" }] });
    if (path === "/projects/p/branches" && (init.method ?? "GET") === "GET") return ok({ branches });
    if (path === "/projects/p/branches" && init.method === "POST") {
      const b = { id: `br-new-${++n}`, name: JSON.parse(init.body).branch.name, created_at: "2099-01-01T00:00:00Z", current_state: "ready" };
      branches.push(b);
      return ok({ branch: b });
    }
    const m = path.match(/^\/projects\/p\/branches\/(.+)$/);
    if (m && init.method === "DELETE") { deleted.push(m[1]); branches = branches.filter((b) => b.id !== m[1]); return ok({}); }
    if (m) return ok({ branch: branches.find((b) => b.id === m[1]) });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchImpl, deleted, list: () => branches };
}

test("backup: at limit deletes oldest pre-*, creates new, keeps only new; never touches prod or non-backup", async () => {
  const init = [
    { id: PROD_BRANCH, name: "production", created_at: "2026-01-01T00:00:00Z", default: true },
    { id: "br-dev", name: "dev-work", created_at: "2026-01-02T00:00:00Z" },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `br-b${i}`, name: `pre-x${i}`, created_at: `2026-02-0${i + 1}T00:00:00Z` })),
  ];
  const f = fakeNeon(init);
  const id = await backup("pre-today", { key: "k", fetchImpl: f.fetchImpl, log: () => {} });
  assert.equal(f.deleted[0], "br-b0", "oldest first");
  const left = f.list();
  assert.ok(left.some((b) => b.id === PROD_BRANCH) && left.some((b) => b.id === "br-dev"));
  assert.deepEqual(left.filter(isBackup).map((b) => b.id), [id]);
});
test("backup: refuses bad names and missing prod", async () => {
  await assert.rejects(backup("daily", { key: "k", fetchImpl: fakeNeon([]).fetchImpl }));
  await assert.rejects(backup("pre-a", { key: "k", fetchImpl: fakeNeon([{ id: "x", name: "main", created_at: "" }]).fetchImpl, log: () => {} }));
});
