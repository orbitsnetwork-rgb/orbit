// Security + correctness phase (direct server-fn / HTTP calls). Imported by suite.mjs after the UI flows.
import { createHmac } from "node:crypto";
import { join } from "node:path";
import * as L from "./lib.mjs";
const { check, step } = L;

const WEBHOOK = "e2e-local-webhook-secret-not-real";
const ADMIN = "e2e-local-admin-token-not-real-000000";
const sign = (raw, t = Math.floor((Date.now() + L.clock()) / 1000)) => `t=${t},v1=${createHmac("sha256", WEBHOOK).update(`${t}.${raw}`).digest("hex")}`;
const hook = (body, header) => fetch(L.BASE + "/api/stripe", { method: "POST", headers: { "content-type": "application/json", ...(header ? { "stripe-signature": header } : {}) }, body });
const session = (id, userId, amount, extra = {}) => JSON.stringify({ id: "evt_" + id, type: "checkout.session.completed", data: { object: { id, livemode: false, payment_status: "paid", amount_total: amount, metadata: { userId, amountOd: String(amount) }, ...extra } } });
const balanceOf = async (u) => (await L.act({ type: "pull" }, { sessionId: u.id, sessionKey: u.key, cookie: u.cookie })).reply?.world?.accounts?.find((a) => a.id === u.id);

export async function securityPhase() {
  await L.startServer({ ORBIT_DEV_MAIL_CODE: "1", STRIPE_WEBHOOK_SECRET: WEBHOOK, ORBIT_ADMIN_TOKEN: ADMIN }, { fresh: true });
  const v = await L.apiRegister("Віктор", { ip: "10.2.0.1" });
  const w = await L.apiRegister("Ольга", { ip: "10.2.0.2" });
  check("api register returns id + key", v.id?.startsWith("u-") && /^[A-Z0-9-]{14}$/.test(v.key || ""), v.raw.slice(0, 200));

  await step("stripe webhook: signature + idempotency", async () => {
    const body = session("cs_e2e_1", v.id, 500);
    check("webhook: unsigned → 400", (await hook(body)).status === 400);
    check("webhook: bad signature → 400", (await hook(body, sign(body).replace(/v1=./, "v1=0"))).status === 400);
    check("webhook: stale timestamp → 400", (await hook(body, sign(body, Math.floor(Date.now() / 1000) - 3600))).status === 400);
    const live = session("cs_e2e_live", v.id, 500, { livemode: true });
    check("webhook: livemode → 400", (await hook(live, sign(live))).status === 400);
    const wrong = session("cs_e2e_amt", v.id, 500, { amount_total: 1 });
    check("webhook: amount mismatch → 400", (await hook(wrong, sign(wrong))).status === 400);
    check("webhook: signed paid → 200", (await hook(body, sign(body))).status === 200);
    check("webhook: replay → 200", (await hook(body, sign(body))).status === 200);
    const a = await balanceOf(v);
    check("webhook: credited exactly once (500 ✦, toppedUp 500)", a?.balance === 500 && a?.toppedUp === 500, JSON.stringify({ b: a?.balance, t: a?.toppedUp }));
    const orphan = session("cs_e2e_orphan", "u-nobody", 100);
    check("webhook: orphan → 500 (Stripe retries)", (await hook(orphan, sign(orphan))).status === 500);
    check("webhook: orphan retry → 500", (await hook(orphan, sign(orphan))).status === 500);
  });

  await step("login rate limits", async () => {
    let last;
    for (let i = 0; i < 11; i++) last = await L.act({ type: "enterMail", email: v.email }, { key: "WRNG-WRNG-WR" + String(i).padStart(2, "0"), ip: "10.3.0.1" });
    check("10+ wrong keys for one account from one network → blocked", last.reply?.error === "Забагато спроб. Спробуй пізніше.", last.reply?.error);
    const ok = await L.act({ type: "enterMail", email: v.email }, { key: v.key, ip: "10.3.0.2" });
    check("owner still logs in from another network (no remote lockout)", ok.reply?.world?.sessionId === v.id, ok.reply?.error);
    for (let i = 0; i < 12; i++) await L.act({ type: "enterMail", email: "" }, { key: "ZZZZ-ZZZZ-ZZ" + String(i).padStart(2, "0"), ip: "10.3.1.1" });
    const keyOnly = await L.act({ type: "enterMail", email: "" }, { key: w.key, ip: "10.3.1.2" });
    check("key-only login not blocked globally by others' failures", keyOnly.reply?.world?.sessionId === w.id, keyOnly.reply?.error);
    for (let i = 0; i < 31; i++) last = await L.act({ type: "enterMail", email: `ghost${i}@nowhere.test` }, { key: "QQQQ-QQQQ-QQ" + String(i).padStart(2, "0"), ip: "10.3.2.1" });
    check("many wrong logins from one network → network blocked (30/h)", last.reply?.error === "Забагато спроб. Спробуй пізніше.", last.reply?.error);
    let probe;
    for (let i = 0; i < 31; i++) probe = await L.act({ type: "probe", email: `x${i}@nowhere.test` }, { ip: "10.3.3.1" }); // no cookie → fresh device each time
    check("email probe limited per network even without device cookie", probe.reply?.error === "Забагато спроб. Спробуй пізніше.", probe.reply?.error);
    const forged = await L.act({ type: "enter", id: "u-" + "x".repeat(500) }, { key: "AAAA-AAAA-AAAA", ip: "10.3.4.1" });
    check("oversized account id rejected safely", forged.status === 200 && !forged.reply?.world?.sessionId);
  });

  await step("projection + guest view", async () => {
    const g = await L.act({ type: "pull" }, { ip: "10.4.0.1" });
    const gw = g.reply?.world;
    check("guest world: no accounts, creations, queue or log", gw && !gw.accounts.length && !gw.creations.length && !gw.log.length && !gw.queue.length);
    check("guest reply: no emails/phones/keys", !g.raw.includes("@example.test") && !g.raw.includes(v.key) && !/s1\$/.test(g.raw));
    const r = await L.act({ type: "pull" }, { sessionId: w.id, sessionKey: w.key, cookie: w.cookie, ip: "10.4.0.2" });
    const other = r.reply?.world?.accounts?.find((a) => a.id === v.id);
    check("logged-in: other's balance/toppedUp hidden (0)", other && other.balance === 0 && other.toppedUp === 0, JSON.stringify(other));
    const vCode = v.reply?.self?.mailCode;
    check("logged-in: other's email/key/mail code never sent", !r.raw.includes(v.email) && !r.raw.includes(v.key) && (!vCode || !r.raw.includes(`{"t":1,"s":"${vCode}"}`)), vCode);
    const forged = await L.act({ type: "pull" }, { sessionId: v.id, sessionKey: "AAAA-BBBB-CCCC", ip: "10.4.0.3" });
    check("wrong session key → guest view, not the account", !forged.reply?.world?.sessionId && !forged.raw.includes(v.email));
  });

  await step("thanks phrase: forged index dropped; launch page XSS", async () => {
    const x = await L.apiRegister('<img src=x onerror=alert(1)>', { family: '"><b>', ip: "10.5.0.1" });
    check("html-like name accepted as plain text", Boolean(x.id), x.reply?.error);
    const s = await L.act({ type: "start" }, { sessionId: x.id, sessionKey: x.key, cookie: x.cookie, ip: "10.5.0.1" });
    const cr = s.reply?.world?.creations?.find((c) => c.userId === x.id)?.id;
    const html = await (await fetch(`${L.BASE}/l/${cr}`)).text();
    check("/l SSR: name escaped in <title>/og (no raw tag)", !html.includes("<img src=x") && /&lt;img src=x onerror=alert\(1\)&gt;|&lt;img/.test(html), (html.match(/<title>[^<]*<\/title>/) || [""])[0]);
    const p = await L.newPerson("xss");
    let dialog = false;
    p.on("dialog", (d) => { dialog = true; d.dismiss(); });
    await p.goto(`${L.BASE}/l/${cr}`);
    await p.waitForTimeout(1500);
    check("/l page renders name as text, no script runs", !dialog && (await L.text(p)).includes("<img src=x"));
    check("/l page: no emails in HTML", !html.includes("@example.test"));
    await L.shot(p, "30_xss_name_launch_page");
    await p.context().close();
  });

  await step("transparency + reconcile endpoint", async () => {
    const r404 = await fetch(L.BASE + "/api/reconcile");
    check("reconcile: no token → 404", r404.status === 404);
    check("reconcile: wrong token → 404", (await fetch(L.BASE + "/api/reconcile", { headers: { authorization: "Bearer " + ADMIN.replace(/.$/, "x") } })).status === 404);
    const ok = await fetch(L.BASE + "/api/reconcile", { headers: { authorization: "Bearer " + ADMIN } });
    const j = await ok.json();
    check("reconcile: right token → 200 ok, diff 0", ok.status === 200 && j.ok === true && j.diff === 0, JSON.stringify(j));
    check("reconcile: aggregates only (no ids)", !JSON.stringify(j).includes("u-"));
  });

  await step("CSRF on server functions", async () => {
    const evil = await L.act({ type: "register", name: "Злий", family: "Сайт", birth: "1990-01-01", email: "evil@example.test", phone: "+380671234567" }, { origin: "https://evil.example", ip: "10.6.0.1" });
    check("cross-site POST (foreign Origin) → 403 from framework CSRF check", evil.status === 403, String(evil.status));
    const bare = await L.act({ type: "pull" }, { origin: null, ip: "10.6.0.2" });
    check("POST without Origin/Referer/Sec-Fetch-Site → 403", bare.status === 403, String(bare.status));
    const r = await L.act({ type: "list", orbitId: 1 }, { ip: "10.6.0.3", sessionId: v.id });
    check("same-origin POST without the key can't act as the user", !r.reply?.world?.sessionId && Boolean(r.reply?.error), r.reply?.error);
  });
  return { v, w };
}

/** After the server is stopped: look inside the local PGlite. */
export async function securityDb() {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite({ dataDir: join(L.RUN, "data", "pglite") });
  await pg.waitReady;
  const orph = await pg.query(`select count(*)::int as n from orbit_orphans where session_id = 'cs_e2e_orphan'`);
  check("webhook orphan retries → exactly 1 orphan row", orph.rows[0].n === 1, String(orph.rows[0].n));
  const doc = (await pg.query(`select doc from orbit_world where id = 'world'`)).rows[0].doc;
  const limits = Object.keys(doc.limits || {});
  check("no limit records for unknown accounts or devices", !limits.some((k) => k.startsWith("kd:") || k.includes("ghost") || /^k:$/.test(k) || k.startsWith("p:d-")), limits.join(","));
  check("keys stored hashed (s1$), never plaintext", Object.values(doc.keys).every((k) => String(k).startsWith("s1$")));
  await pg.close();
}
