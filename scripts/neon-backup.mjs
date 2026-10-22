#!/usr/bin/env node
/**
 * Резервна копія Neon за правилом «лише одна копія»:
 *  1) якщо досягнуто ліміт гілок — видалити НАЙСТАРІШУ гілку-копію (ім’я pre-*);
 *  2) створити нову копію з прод-гілки й дочекатися стану ready;
 *  3) видалити всі інші копії pre-*, крім нової.
 * Прод-гілку і будь-які гілки не з префіксом pre- ніколи не чіпає.
 * Запуск: NEON_API_KEY=… node scripts/neon-backup.mjs <name>
 */
export const PROD_BRANCH = "br-little-dust-b52akiw4";
export const isBackup = (b) => typeof b?.name === "string" && b.name.startsWith("pre-") && b.id !== PROD_BRANCH && !b.default;

export async function backup(name, { key, fetchImpl = fetch, log = console.log, limit = 10 } = {}) {
  if (!/^pre-[a-z0-9-]{1,60}$/.test(name)) throw new Error("name must be pre-…");
  const api = (path, init = {}) =>
    fetchImpl(`https://console.neon.tech/api/v2${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" } }).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`neon ${r.status}: ${body.message ?? ""}`);
      return body;
    });
  const project = (await api("/projects")).projects[0].id;
  const list = async () => (await api(`/projects/${project}/branches`)).branches;
  let branches = await list();
  if (!branches.some((b) => b.id === PROD_BRANCH)) throw new Error("prod branch not found — refusing");
  const backups = () => branches.filter(isBackup).sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (branches.length >= limit) {
    const oldest = backups()[0];
    if (!oldest) throw new Error("at branch limit and no pre-* backup to free");
    log(`delete oldest backup ${oldest.name} ${oldest.id}`);
    await api(`/projects/${project}/branches/${oldest.id}`, { method: "DELETE" });
    branches = await list();
  }
  const made = await api(`/projects/${project}/branches`, { method: "POST", body: JSON.stringify({ branch: { name, parent_id: PROD_BRANCH } }) });
  const id = made.branch.id;
  for (let i = 0; i < 60; i++) {
    const b = (await api(`/projects/${project}/branches/${id}`)).branch;
    if (b.current_state === "ready") break;
    if (i === 59) throw new Error("backup not ready in time");
    await new Promise((r) => setTimeout(r, 2000));
  }
  log(`created ${name} ${id} (ready)`);
  branches = await list();
  for (const b of backups()) {
    if (b.id === id) continue;
    log(`delete old backup ${b.name} ${b.id}`);
    await api(`/projects/${project}/branches/${b.id}`, { method: "DELETE" });
  }
  return id;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("neon-backup.mjs")) {
  const key = process.env.NEON_API_KEY;
  if (!key) { console.error("NEON_API_KEY missing"); process.exit(2); }
  const id = await backup(process.argv[2] ?? `pre-daily-${new Date().toISOString().slice(0, 10)}`, { key });
  console.log("backup", id);
}
