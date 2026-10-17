import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const ROOT = process.env.ORBIT_E2E_ROOT || new URL("..", import.meta.url).pathname;
export const RUN = process.env.ORBIT_E2E_RUN_DIR || "/workspace/e2e-run";
export const SCREENS = process.env.ORBIT_E2E_SCREENS || "/workspace/screens";
export const PORT = Number(process.env.ORBIT_E2E_PORT || 3917);
export const BASE = `http://localhost:${PORT}`;
export const VERSION = process.env.ORBIT_E2E_TAG || "ui_v15";
const CLOCK = join(RUN, "clock");
export const H = 60 * 60 * 1000;

// ---------- results ----------
const results = [];
export function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? "  — " + detail : ""}`);
  return Boolean(ok);
}
export async function step(name, fn) {
  try { await fn(); } catch (e) { check(`${name} (threw)`, false, String(e?.message || e).split("\n")[0]); }
}
export const summary = () => ({ pass: results.filter((r) => r.ok).length, fail: results.filter((r) => !r.ok).length, results });

// ---------- server ----------
let server = null;
let lastLogs = "";
export function setClock(ms) { writeFileSync(CLOCK, String(Math.round(ms))); }
export function clock() { try { return Number(readFileSync(CLOCK, "utf8")) || 0; } catch { return 0; } }
export function advance(ms) { setClock(clock() + ms); }
export async function startServer(extraEnv = {}, { fresh = false } = {}) {
  await stopServer();
  mkdirSync(RUN, { recursive: true });
  if (fresh) { rmSync(join(RUN, "data"), { recursive: true, force: true }); setClock(0); }
  const env = { ...process.env, PORT: String(PORT), ORBIT_E2E_CLOCK: CLOCK, REG_PER_IP_HOUR: "100000", DEVICE_SECRET: "e2e-local-only-device-secret-not-real", ...extraEnv };
  delete env.DATABASE_URL; // never Neon
  for (const [k, v] of Object.entries(extraEnv)) if (v === undefined) delete env[k];
  server = spawn("node", ["--import", join(ROOT, "e2e/clock.mjs"), join(ROOT, ".output/server/index.mjs"), "orbit-e2e-server"], { cwd: RUN, env, stdio: ["ignore", "pipe", "pipe"] });
  const proc = server;
  proc.logs = "";
  proc.stdout.on("data", (d) => (proc.logs += d));
  proc.stderr.on("data", (d) => (proc.logs += d));
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(BASE + "/"); if (r.ok) return server; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not start\n" + server.logs);
}
export async function stopServer() {
  if (!server) return;
  const s = server; server = null; lastLogs += s.logs;
  s.kill("SIGTERM");
  await new Promise((r) => { s.once("exit", r); setTimeout(r, 3000); });
}
export const serverLogs = () => lastLogs + (server?.logs || "");

// ---------- browser ----------
let browser = null;
export async function launch() {
  browser = await chromium.launch({ executablePath: existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined, args: ["--no-sandbox"] });
  return browser;
}
export async function closeBrowser() { await browser?.close(); }

/** Every page tracks console errors and server-fn responses (for the projection check). */
export async function newPerson(label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "uk-UA", timezoneId: "Europe/Kyiv", serviceWorkers: "block" });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const page = await ctx.newPage();
  page.label = label;
  page.errors = [];
  page.bodies = [];
  page.on("console", (m) => { if (m.type() === "error" && !page.allowErrors) page.errors.push(m.text()); });
  page.on("pageerror", (e) => page.errors.push("pageerror: " + e.message));
  page.on("response", async (r) => {
    if (!r.url().includes("/_serverFn/")) return;
    try { page.bodies.push(await r.text()); } catch {}
  });
  return page;
}

export async function shot(page, name) {
  mkdirSync(SCREENS, { recursive: true });
  await page.screenshot({ path: join(SCREENS, `${VERSION}_${name}.png`), timeout: 15000, animations: "disabled" }).catch(() => {});
}

export const text = (page) => page.locator("body").innerText();
export async function hasText(page, s, timeout = 8000) {
  try { await page.getByText(s, { exact: false }).first().waitFor({ state: "visible", timeout }); return true; } catch { return false; }
}
export async function click(page, name, opts = {}) {
  const loc = opts.role === false ? page.getByText(name, { exact: opts.exact ?? false }) : page.getByRole(opts.role || "button", { name, exact: opts.exact ?? false });
  await loc.first().click({ timeout: opts.timeout ?? 8000 });
}

let seq = 0;
/** Register a fresh person via the gate form; stops on the key screen. Returns { page, key, email }. */
export async function register(page, given, family = "Тестова") {
  const n = ++seq;
  const email = `e2e${Date.now() % 1e7}${n}@example.test`;
  if (!page.url().startsWith(BASE)) await page.goto(BASE + "/");
  await page.getByRole("button", { name: "Створити акаунт" }).waitFor({ timeout: 15000 });
  const inputs = page.locator("form input");
  await inputs.nth(0).fill(email);
  await inputs.nth(1).fill(`+38050${String(Date.now() + n * 7919).slice(-7)}`);
  await inputs.nth(2).fill(given);
  await inputs.nth(3).fill(family);
  await inputs.nth(4).fill("1990-05-05");
  await page.getByRole("button", { name: "Створити акаунт" }).click();
  await page.getByText("Твій ключ входу").waitFor({ timeout: 15000 });
  const key = (await text(page)).match(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0];
  return { key, email };
}
export async function passKey(page) {
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Продовжити" }).click();
}

// ---------- seroval reply decoding (server-fn responses) ----------
export function decode(raw) {
  let root; try { root = JSON.parse(raw); } catch { return null; }
  const refs = new Map();
  const walk = (n) => {
    if (!n || typeof n !== "object") return n;
    switch (n.t) {
      case 0: return typeof n.s === "string" ? Number(n.s) : n.s;
      case 1: return n.s;
      case 2: return [null, undefined, true, false, undefined, undefined][n.s] ?? undefined;
      case 4: return refs.get(n.i);
      case 9: { const a = []; refs.set(n.i, a); for (const x of n.a || []) a.push(walk(x)); return a; }
      case 10: { const o = {}; refs.set(n.i, o); (n.p?.k || []).forEach((k, i) => (o[k] = walk(n.p.v[i]))); return o; }
      default: return undefined;
    }
  };
  return walk(root);
}

// ---------- navigation ----------
export async function tab(page, name) {
  await page.locator("nav").last().getByRole("button", { name, exact: true }).or(page.locator("nav").last().getByRole("tab", { name, exact: true })).or(page.locator("nav").last().getByRole("link", { name, exact: true })).first().click({ timeout: 8000 });
  await page.waitForTimeout(500);
}
export async function more(page, item) {
  await tab(page, "Я");
  await page.getByRole("button", { name: /^Ще/ }).first().click();
  await page.getByRole("button", { name: new RegExp("^" + item) }).last().click();
  await page.waitForTimeout(700);
}
export async function closePages(page) {
  const all = page.getByRole("button", { name: "Закрити все" });
  if (await all.count()) await all.first().click().catch(() => {});
  else await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
}
export async function confirmMail(page) {
  await tab(page, "Ціна");
  const m = (await text(page)).match(/Код: (\d{6})/);
  if (!m) return false;
  await page.locator("input[inputmode=numeric][maxlength='6']").first().fill(m[1]);
  await page.getByRole("button", { name: "Підтвердити пошту" }).last().click();
  await page.waitForTimeout(800);
  return !(await text(page)).includes("Підтвердь пошту: 6 цифр");
}
export async function skipIntro(page) {
  const s = page.getByRole("button", { name: "Пропустити" });
  try { await s.first().waitFor({ timeout: 4000 }); await s.first().click(); } catch {}
}
