// Migration simulation: a realistic world written by the code at origin/main (939bf74, pre-v7 document) is put into a local
// PGlite that has only migrations ≤ 0030, then the current build boots on it. Never Neon. Needs the TS loader (run.sh adds it).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as L from "./lib.mjs";
const { check } = L;
const BASE_REV = process.env.ORBIT_E2E_BASE_REV || "939bf74";
const DAY = 86_400_000, H = 3_600_000;

async function oldModules() {
  const dir = join(L.RUN, "old");
  mkdirSync(dir, { recursive: true });
  for (const f of ["engine", "access"]) {
    const src = execFileSync("git", ["show", `${BASE_REV}:src/lib/orbit/${f}.ts`], { cwd: L.ROOT, encoding: "utf8" }).replace(/"@\/lib\/orbit\/engine"/g, '"./engine.ts"');
    writeFileSync(join(dir, `${f}.ts`), src);
  }
  return { E: await import(join(dir, "engine.ts")), A: await import(join(dir, "access.ts")) };
}

/** Build the old world with the old engine: 24 people, 3 launches done/charging/collecting, a trade, a fund split, a paid top-up. */
export async function buildOldWorld(wall = Date.now() + L.clock()) {
  const { E, A } = await oldModules();
  let seed = 11; const rnd = Math.random; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  try {
    let w = E.emptyWorld(wall - 9 * DAY);
    const ids = [];
    const as = (id) => ({ ...w, sessionId: id });
    for (let i = 0; i < 24; i++) { const s = E.register({ ...w, sessionId: null }, `Old${String.fromCharCode(65 + i)} K.`); w = { ...s.world, sessionId: null }; ids.push(w.accounts.at(-1).id); w = E.skip(w, 60_000); }
    const [A1, B1, C1, D1] = ids;
    const launch = (owner, witnesses) => { w = E.startCreation(as(owner)).world; let used = 0; for (const wit of witnesses) { if (used === 3) { w = E.skip(w, DAY); used = 0; } const st = E.issueCode(as(owner)); w = st.world; w = E.acceptCode(as(wit), st.notice).world; used += 1; w = E.skip(w, 60_000); } };
    launch(A1, ids.slice(4, 12));
    w = E.skip(w, DAY + H); // A1's charge resolves
    w = { ...w, sessionId: null };
    const orbitA = w.orbits.find((o) => o.ownerId === A1)?.id;
    if (orbitA) { w = E.listOrbit(as(A1), orbitA).world; w = E.buyOldest(as(ids[4])).world; }
    w = E.skip(w, 3 * DAY); // fund split
    launch(C1, ids.slice(12, 20)); // ends charging (started < 24 h before wall)
    w = { ...w, sessionId: null };
    w = E.startCreation(as(D1)).world; // collecting with 2 confirms
    for (const wit of ids.slice(20, 22)) { const st = E.issueCode(as(D1)); w = st.world; w = E.acceptCode(as(wit), st.notice).world; w = E.skip(w, 60_000); }
    w = { ...w, now: Math.min(w.now, wall - H), sessionId: null };
    // plaintext keys (as at 939bf74), identities, one unconfirmed mail, a paid Stripe top-up
    const keys = {}, people = [];
    ids.forEach((id, i) => {
      keys[id] = `OLD${String(i).padStart(2, "0")}-KEYS-${String.fromCharCode(65 + i)}${String.fromCharCode(65 + i)}`.slice(0, 14);
      people.push({ userId: id, given: `Old${String.fromCharCode(65 + i)}`, family: "Колишній", birth: "1985-02-02", email: `old${i}@example.test`, phone: `+38063${String(1000000 + i).slice(-7)}`, confirmed: i !== 23, mailCode: i === 23 ? "123456" : null });
    });
    const topper = ids[5];
    w = { ...w, accounts: w.accounts.map((a) => (a.id === topper ? { ...a, balance: a.balance + 500 } : a)) };
    const topups = [{ id: "cs_old_paid_1", userId: topper, amount: 500, status: "paid", at: w.now - DAY }];
    const doc = A.packDoc(w, keys, { "d-AAAAAAAA": { day: E.utcDay(w.now), count: 1 } }, people, topups);
    return { doc, world: w, keys, people, ids, A1, B1, C1, D1, topper, mass: w.accounts.reduce((s, a) => s + a.balance, 0) + w.fund + (w.reserve || 0) };
  } finally { Math.random = rnd; }
}

async function seedDb(doc) {
  const dir = join(L.RUN, "data", "pglite");
  rmSync(join(L.RUN, "data"), { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite({ dataDir: dir });
  await pg.waitReady;
  await pg.exec("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
  const files = readdirSync(join(L.ROOT, "migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f) && f <= "0030_orbit_world.sql").sort();
  for (const f of files) { await pg.exec(readFileSync(join(L.ROOT, "migrations", f), "utf8")); await pg.query("insert into _migrations (name) values ($1)", [f]); }
  await pg.query("insert into orbit_world (id, doc) values ('world', $1::jsonb)", [doc]);
  await pg.close();
  return files.length;
}

export async function migrationPhase() {
  L.setClock(0);
  const old = await buildOldWorld(Date.now());
  check("old world built by 939bf74 engine (24 people, ≥1 orbit, 1 charging, 1 collecting)", old.world.accounts.length === 24 && old.world.orbits.length >= 1 && old.world.creations.some((c) => c.status === "charging") && old.world.creations.some((c) => c.status === "collecting"), JSON.stringify(old.world.creations.map((c) => c.status)));
  const n = await seedDb(old.doc);
  check(`seeded local PGlite with migrations ≤0030 (${n} files) + old doc`, n >= 25);
  const ADMIN = "e2e-local-admin-token-not-real-000000";
  await L.startServer({ ORBIT_DEV_MAIL_CODE: "1", ORBIT_ADMIN_TOKEN: ADMIN });
  const g = await L.act({ type: "pull" }, { ip: "10.7.0.1" });
  check("new build boots on the old document (guest pull ok)", g.status === 200 && g.reply?.pub?.people === 24, g.raw.slice(0, 200));
  const oldA = old.world.accounts.find((a) => a.id === old.A1);
  const inA = await L.act({ type: "enterMail", email: "old0@example.test" }, { key: old.keys[old.A1], ip: "10.7.0.2" });
  const meA = inA.reply?.world?.accounts?.find((a) => a.id === old.A1);
  check("old plaintext key + email still logs in", inA.reply?.world?.sessionId === old.A1, inA.reply?.error);
  check("balance and stability preserved", meA && meA.balance === oldA.balance && meA.stability === oldA.stability, JSON.stringify({ was: oldA.balance, now: meA?.balance }));
  const inB = await L.act({ type: "enterMail", email: "" }, { key: old.keys[old.B1], ip: "10.7.0.3" });
  check("old plaintext key alone (no email) logs in", inB.reply?.world?.sessionId === old.B1, inB.reply?.error);
  const inT = await L.act({ type: "enterMail", email: "old5@example.test" }, { key: old.keys[old.topper], ip: "10.7.0.4" });
  const t = inT.reply?.world?.accounts?.find((a) => a.id === old.topper);
  check("toppedUp derived from paid top-ups (≤ balance)", t && t.toppedUp === Math.min(500, t.balance), JSON.stringify({ b: t?.balance, t: t?.toppedUp }));
  const inC = await L.act({ type: "enterMail", email: "old2@example.test" }, { key: old.keys[old.C1], ip: "10.7.0.5" });
  const cr = inC.reply?.world?.creations?.find((c) => c.userId === old.C1);
  check("old charging launch keeps charging and keeps its 8 confirms", cr?.status === "charging" && cr.confirms.length === 8, cr?.status);
  L.advance(25 * H);
  await new Promise((r) => setTimeout(r, 400)); // clock.mjs caches the shift for 100 ms
  const inC2 = await L.act({ type: "pull" }, { sessionId: old.C1, sessionKey: old.keys[old.C1], ip: "10.7.0.5" });
  const cr2 = inC2.reply?.world?.creations?.find((c) => c.id === cr?.id);
  check("old charging launch resolves on the new code", cr2 && (cr2.status === "done" || cr2.status === "failed"), cr2?.status);
  const inD = await L.act({ type: "enterMail", email: "old3@example.test" }, { key: old.keys[old.D1], ip: "10.7.0.6" });
  check("old collecting launch keeps its 2 confirms", inD.reply?.world?.creations?.find((c) => c.userId === old.D1)?.confirms.length === 2);
  const unconf = await L.act({ type: "enterMail", email: "old23@example.test" }, { key: old.keys[old.ids[23]], ip: "10.7.0.7" });
  check("old unconfirmed mail stays unconfirmed", unconf.reply?.self?.confirmed === false);
  const rec = await (await fetch(L.BASE + "/api/reconcile", { headers: { authorization: "Bearer " + ADMIN } })).json();
  check("reconcile after migration: genesis = old mass, diff 0, unexplained 0", rec.ok === true && rec.genesis === old.mass, JSON.stringify({ ...rec, oldMass: old.mass }));
  const p = await L.newPerson("migrated");
  await p.goto(L.BASE + "/");
  await p.getByRole("button", { name: "Вже є ключ" }).click();
  const inputs = p.locator("form input");
  await inputs.nth(0).fill("old0@example.test");
  await inputs.nth(1).fill(old.keys[old.A1]);
  await p.getByRole("button", { name: "Увійти" }).first().click();
  check("migrated account opens the app in the browser", await L.hasText(p, "OldA", 10000));
  await p.waitForTimeout(1200);
  await L.shot(p, "31_migrated_home");
  check("migrated session: console errors = 0", p.errors.length === 0, p.errors.join(" | "));
  await p.context().close();
  await L.stopServer();
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite({ dataDir: join(L.RUN, "data", "pglite") });
  await pg.waitReady;
  const names = (await pg.query("select name from _migrations order by name")).rows.map((r) => r.name);
  check("migrations 0031–0033 applied on top", ["0031_orbit_social.sql", "0032_orbit_payouts.sql", "0033_orbit_emission.sql"].every((x) => names.includes(x)), names.slice(-4).join(","));
  const doc = (await pg.query("select doc from orbit_world where id = 'world'")).rows[0].doc;
  const plain = Object.values(doc.keys).filter((k) => !String(k).startsWith("s1$")).length;
  check("logged-in old keys hashed; the rest is being hashed gradually", doc.keys[old.A1].startsWith("s1$") && plain < 24 - 5, `plaintext left ${plain}`);
  const ev = (await pg.query("select count(*)::int as n from orbit_events")).rows[0].n;
  check("events now go to orbit_events", ev > 0, String(ev));
  check("document keeps people/identities (24)", doc.people.length === 24);
  await pg.close();
  execFileSync(process.execPath, ["--import", join(L.ROOT, "scripts/ts-register.mjs"), join(L.ROOT, "scripts/hash-keys.mjs")], { cwd: L.RUN, env: { ...process.env, DATABASE_URL: "", DEVICE_SECRET: L.E2E_DEVICE_SECRET }, stdio: "pipe" });
  const pg2 = new PGlite({ dataDir: join(L.RUN, "data", "pglite") });
  await pg2.waitReady;
  const doc2 = (await pg2.query("select doc from orbit_world where id = 'world'")).rows[0].doc;
  check("scripts/hash-keys.mjs hashes all remaining plaintext keys", Object.values(doc2.keys).every((k) => String(k).startsWith("s1$")));
  await pg2.close();
}
