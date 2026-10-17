// ORBIT e2e regression — run via e2e/run.sh (moves .env.local aside, never touches Neon).
import AxeBuilder from "./axe.mjs";
import * as L from "./lib.mjs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const { check, step, shot, text, hasText, tab, more, H } = L;
const pages = [];
const person = async (label) => { const p = await L.newPerson(label); pages.push(p); return p; };
const lastWorld = (p) => { for (let i = p.bodies.length - 1; i >= 0; i--) { const d = L.decode(p.bodies[i]); const w = d?.result?.world; if (w?.accounts) return d.result; } return null; };
const axeIssues = [];
async function axe(page, where) {
  await page.waitForTimeout(900); // let entrance animations finish (opacity fades trip color-contrast)
  const r = await new AxeBuilder(page).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  if (bad.length) axeIssues.push(`${where}: ${bad.map((v) => v.id).join(",")}`);
  check(`axe ${where}: no serious/critical`, bad.length === 0, bad.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0]?.target}`).join("; "));
}

await L.launch();
try {
// ───────── Phase 1: production-like server, no dev mail flag ─────────
await L.startServer({ ORBIT_E2E_SEED: "7" }, { fresh: true });
await step("gate + key screen", async () => {
  const p = await person("nomail");
  await p.goto(L.BASE + "/");
  check("gate shows create form", await hasText(p, "Створити акаунт"));
  await axe(p, "gate");
  await shot(p, "01_gate");
  const { key } = await L.register(p, "Марта");
  check("key screen shows 12-char key", /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key || ""), key);
  check("continue disabled until checkbox", await p.getByRole("button", { name: "Продовжити" }).isDisabled());
  await axe(p, "key screen");
  await shot(p, "02_key");
  await L.passKey(p);
  // late-onboarding race: the intro (or its dark placeholder) must cover home right away, not pop later
  const t0 = Date.now();
  await p.locator(".ob-screen").first().waitFor({ timeout: 3000 });
  check("onboarding covers home immediately after key (<3s)", Date.now() - t0 < 3000);
  check("onboarding step 1/3", await hasText(p, "1 / 3"));
  await shot(p, "03_onboarding");
  await axe(p, "onboarding");
  await L.skipIntro(p);
  await p.waitForTimeout(1500);
  check("onboarding does not re-appear after skip", (await p.locator(".ob-screen").count()) === 0);
  const body = await text(p);
  check("mail code hidden without dev flag (UI)", body.includes("Код на пошті.") && !/Код: \d{6}/.test(body));
  const self = lastWorld(p)?.self;
  check("mail code hidden without dev flag (server reply)", self && !self.mailCode, JSON.stringify(self?.mailCode));
  await p.reload(); await p.waitForTimeout(2000);
  check("reload: onboarding not shown again", (await p.locator(".ob-screen").count()) === 0);
  check("reload: key screen not shown again", !(await text(p)).includes("Твій ключ входу"));
  await shot(p, "04_home_new");
  await axe(p, "home");
});

// ───────── Phase 2: dev mail flag on, full launch with 8 confirms ─────────
await L.startServer({ ORBIT_DEV_MAIL_CODE: "1", ORBIT_E2E_SEED: "7" });
const host = await person("host");
await L.register(host, "Ганна", "Шевченко"); await L.passKey(host); await L.skipIntro(host);
await step("mail confirm + checklist", async () => {
  check("dev flag: mail code visible", await hasText(host, "Код:"));
  check("mail confirmed via UI", await L.confirmMail(host));
  check("home first-step checklist shown", await hasText(host, "Перші кроки"));
  await shot(host, "05_home_checklist");
});
const crew = [];
const names = ["Богдан", "Віра", "Галина", "Дмитро", "Євген", "Жанна", "Зоряна", "Ігор"];
await step("start launch + code", async () => {
  await tab(host, "Заявка");
  await host.getByRole("button", { name: "Почати запуск" }).click();
  await host.getByRole("button", { name: "Створити код підтвердження" }).click({ timeout: 8000 });
  check("code share shown", await hasText(host, "Код підтвердження"));
  await shot(host, "06_code");
});
const ownCode = () => { const w = lastWorld(host); const me = w?.world?.sessionId; return w?.world?.creations?.find((c) => c.userId === me && c.code)?.code; };
const crId = () => { const w = lastWorld(host); const me = w?.world?.sessionId; return w?.world?.creations?.filter((c) => c.userId === me).at(-1)?.id; };
let guest;
await step("guest invite link banner names the inviter", async () => {
  const code = ownCode();
  const og = ((await (await fetch(`${L.BASE}/?c=${code}`)).text()).match(/<meta[^>]+og:title[^>]*>/) || [""])[0];
  check("/?c= link preview og:title «Запуск Ганна Ш. · 0 з 8»", og.includes("Ганна Ш.") && og.includes("0 з 8"), og);
  check("own code readable in own projection", /^\d{6}$/.test(code || ""));
  guest = await person("guest");
  await guest.goto(`${L.BASE}/?c=${code}`);
  check("invite banner names inviter", await hasText(guest, "Ганна Ш. запрошує тебе підтвердити запуск"), (await text(guest)).slice(0, 400));
  check("invite banner shows progress 0 з 8", await hasText(guest, "зараз 0 з 8"));
  check("?c= removed from address", !guest.url().includes("c="));
  await shot(guest, "07_invite_banner");
  await L.register(guest, names[0]); await L.passKey(guest);
  await guest.waitForTimeout(800);
  await L.skipIntro(guest);
  check("invited guest lands on confirm with code prefilled", (await guest.locator(".cs-confirm[data-link='1']").count()) === 1);
  await L.confirmMail(guest).catch(() => {});
  await tab(guest, "Заявка");
  await guest.locator(".cs-confirm input").first().fill(code);
  await guest.locator(".cs-confirm button[type=submit], .cs-confirm button.orbit-go").last().click();
  check("guest confirm accepted (1 з 8)", await hasText(guest, "1 з 8"));
  crew.push(guest);
});
async function confirmBy(p) {
  await tab(host, "Заявка");
  await host.getByRole("button", { name: "Створити код підтвердження" }).click({ timeout: 8000 });
  await host.waitForTimeout(600);
  const code = ownCode();
  await tab(p, "Заявка");
  await p.locator(".cs-confirm input").first().fill(code);
  await p.locator(".cs-confirm button.orbit-go").last().click();
  await p.waitForTimeout(900);
}
await step("collect 8 confirms over 3 days", async () => {
  for (let i = 1; i < 8; i++) {
    if (i === 3 || i === 6) L.advance(24 * H);
    const p = await person("c" + i);
    await L.register(p, names[i]); await L.passKey(p); await L.skipIntro(p);
    await L.confirmMail(p);
    await confirmBy(p);
    crew.push(p);
    if (i === 3) { await host.reload(); await host.waitForTimeout(1500); await tab(host, "Заявка"); await shot(host, "08_collecting_4of8"); }
  }
  await host.reload(); await host.waitForTimeout(1500); await tab(host, "Заявка");
  check("launch charging after 8 confirms", await hasText(host, "Усі 8 супутників") || await hasText(host, "Залишилось"));
  await shot(host, "09_charging");
});
await step("share link /l/:cr", async () => {
  const p = await person("viewer");
  await p.goto(`${L.BASE}/l/${crId()}`);
  check("/l page shows status + 8 з 8", (await hasText(p, "Заряджається")) && (await hasText(p, "8")));
  check("/l page has no code", !/\b\d{6}\b/.test(await text(p)));
  await shot(p, "10_live_link");
  await axe(p, "/l live launch");
  const html = await (await fetch(`${L.BASE}/l/${crId()}`)).text();
  const og = html.match(/<meta[^>]+og:title[^>]*>/)?.[0] || "";
  check("/l og:title shows «8 з 8»", og.includes("Ганна Ш.") && og.includes("8 з 8"), og);
});
await step("charge result + numbered orbit", async () => {
  L.advance(25 * H);
  await host.reload(); await host.waitForTimeout(2500);
  check("charge result shown", await hasText(host, "Результат заряду"));
  await shot(host, "11_charge_result");
  check("charge succeeded (seeded)", await hasText(host, "№"));
  const thanks = host.getByRole("button", { name: /^Подякувати / });
  check("charge result: «Дякую» per confirmer", (await thanks.count()) >= 1, String(await thanks.count()));
  if (await thanks.count()) { await thanks.first().click(); await host.waitForTimeout(800); check("thanks → «Подякувано»", await hasText(host, "Подякувано")); }
  await host.keyboard.press("Escape");
  const close = host.getByRole("button", { name: /До моїх орбіт|Зрозуміло|Закрити/ });
  if (await close.count()) await close.first().click().catch(() => {});
  await host.waitForTimeout(500);
  await tab(host, "Я");
  check("profile: numbered orbit «№ … з 8 000 000»", await hasText(host, "з 8 000 000"));
  await shot(host, "12_profile_orbit");
});
await step("profile: badges, streak, crew, thanks", async () => {
  await host.reload(); await host.waitForTimeout(1500); await tab(host, "Я");
  const b = await text(host);
  check("badges block", b.includes("Відзнаки"));
  check("badge «Перша орбіта» earned", b.includes("Перша орбіта"));
  check("streak «Орбітальна серія»", b.includes("Орбітальна серія"));
  check("crew «Екіпаж» shown", b.includes("Екіпаж"));
  await shot(host, "13_profile_badges");
  await axe(host, "profile");
  const c = crew[1]; await c.reload(); await c.waitForTimeout(1500); await tab(c, "Я");
  check("confirmer sees thanks count ≥1", /\n?[1-9]\d*\s*\n?подяк/.test(await text(c)));
  check("confirmer badge «Екіпаж вісімки»", await hasText(c, "Екіпаж вісімки"));
});
await step("wallet Поповнено/Отримано", async () => {
  const c = crew[2]; await c.reload(); await c.waitForTimeout(1500); await tab(c, "Я");
  let b = await text(c);
  check("confirmer got starter+reward (>0 ✦)", /\n(2\d\d|1\d\d) ✦/.test(b) || /22\d ✦/.test(b), b.match(/\d+ ✦/g)?.join(","));
  await more(c, "Активи"); b = await text(c);
  check("wallet shows «Отримано»", /Отримано/i.test(b));
  check("wallet shows «Поповнено»", /Поповнено/i.test(b));
  check("no «Зароблено» wording", !b.includes("Зароблено"));
  await shot(c, "14_wallet");
  await L.closePages(c);
});
await step("exchange sell with confirmation sheet + trust stats", async () => {
  await host.reload(); await host.waitForTimeout(1500);
  await tab(host, "Обмін");
  await host.getByRole("button", { name: /^Продати/ }).first().click();
  await host.waitForTimeout(500);
  check("sell sheet: «Тобі після продажу»", await hasText(host, "Тобі після продажу"));
  check("sell sheet shows 97/2/1-style split", (await hasText(host, "97")));
  await shot(host, "15_sell_sheet");
  await host.getByRole("button", { name: /Поставити в чергу/ }).last().click();
  await host.waitForTimeout(1000);
  check("listing in queue (Зняти / Місце в черзі)", (await hasText(host, "у черзі: 1")) || (await hasText(host, "перша твоя")), (await text(host)).slice(0, 900));
});
await step("exchange buy + trust stats", async () => {
  const b = crew[3]; await b.reload(); await b.waitForTimeout(1500);
  await tab(b, "Обмін");
  check("trust stats on seller card", (await hasText(b, "Новий продавець")) || (await hasText(b, "угод")));
  await shot(b, "16_exchange_buyer");
  await axe(b, "exchange");
  await b.getByRole("button", { name: /^Купити/ }).first().click();
  await b.waitForTimeout(500);
  check("buy sheet: «Баланс після»", await hasText(b, "Баланс після"));
  await shot(b, "17_buy_sheet");
  await b.getByRole("button", { name: /Купити першу орбіту з черги|^Купити за/ }).last().click();
  await b.waitForTimeout(1500);
  await tab(b, "Я");
  check("buyer now owns a numbered orbit", await hasText(b, "з 8 000 000"));
});
await step("fund + payout history", async () => {
  L.advance(3 * 24 * H + H);
  for (const p of [host, crew[3]]) { await p.reload(); await p.waitForTimeout(1500); }
  await tab(crew[3], "Фонд");
  const b = await text(crew[3]);
  check("fund screen", b.includes("Фонд світу"));
  check("payout happened (history not empty)", !b.includes("Поділів ще не було"), b.slice(0, 300));
  await shot(crew[3], "18_fund");
  await axe(crew[3], "fund");
});
await step("transparency + CSV", async () => {
  await more(host, "Прозорість");
  check("transparency page", await hasText(host, "Випущено"));
  check("reconcile shows 0", /Розбіжн[^\n]*\n?\s*0|звірк[^\n]*0/i.test(await text(host)) || (await hasText(host, "0 ✦")));
  await shot(host, "19_transparency");
  await axe(host, "transparency");
  const csvBtn = host.getByRole("button", { name: /CSV/ }).or(host.getByRole("link", { name: /CSV/ }));
  const [dl] = await Promise.all([host.waitForEvent("download", { timeout: 8000 }), csvBtn.first().click()]);
  const path = await dl.path();
  const csv = (await import("node:fs")).readFileSync(path, "utf8");
  check("CSV downloaded with header + rows", csv.split("\n").filter(Boolean).length >= 2, csv.slice(0, 120));
  await L.closePages(host);
});
await step("fees 97/2/1", async () => {
  await more(host, "Комісії");
  const b = await text(host);
  check("fees: 97%", b.includes("97"));
  check("fees: 2% / 2,5%", /2(,5)?\s?%/.test(b));
  check("fees: 1% / 0,5% reserve", /(1|0,5)\s?%/.test(b));
  await shot(host, "20_fees");
  await axe(host, "fees");
  await L.closePages(host);
});
await step("nudge on second launch", async () => {
  await host.reload(); await host.waitForTimeout(1500);
  await tab(host, "Заявка");
  await host.getByRole("button", { name: "Почати запуск" }).click();
  await host.waitForTimeout(800);
  const btn = host.getByRole("button", { name: "Нагадати", exact: true });
  check("nudge enabled (crew from last launch)", await btn.isEnabled());
  await btn.click(); await host.waitForTimeout(800);
  check("nudge sent → «Уже нагадали»", await hasText(host, "Уже нагадали"));
  await shot(host, "21_nudge");
});
await step("offline / empty / error states", async () => {
  const p = crew[4];
  await p.context().setOffline(true);
  p.allowErrors = true;
  await p.waitForTimeout(6000);
  check("offline banner «Немає зв’язку»", await hasText(p, "Телефон без інтернету", 10000));
  await shot(p, "22_offline");
  await p.context().setOffline(false);
  await p.waitForTimeout(500);
  const retry = p.getByRole("button", { name: /Спробувати|Ще раз/ });
  if (await retry.count()) await retry.first().click().catch(() => {});
  await p.waitForTimeout(3000);
  check("offline banner clears when back online", !(await text(p)).includes("Телефон без інтернету"));
  p.allowErrors = false;
  const e = await person("empty"); await L.register(e, "Оксана"); await L.passKey(e); await L.skipIntro(e);
  await tab(e, "Обмін");
  check("empty state: no own orbits", await hasText(e, "У тебе ще немає орбіт") || await hasText(e, "Черга порожня") || await hasText(e, "Поки"));
  await shot(e, "23_empty");
  await more(e, "Історія");
  check("history page renders", await hasText(e, "Історія"));
  await L.closePages(e);
  e.allowErrors = true;
  await e.route("**/_serverFn/**", (r) => r.fulfill({ status: 500, body: "boom" }));
  await more(e, "Прозорість");
  check("error state on transparency («недоступний»)", await hasText(e, "недоступний", 10000));
  await shot(e, "24_error");
  await e.unroute("**/_serverFn/**");
  e.errors = []; e.allowErrors = false;
});
await step("per-user projection", async () => {
  let checked = 0, leaks = [];
  const secrets = [];
  for (const p of pages) for (const raw of p.bodies) {
    const d = L.decode(raw)?.result; const w = d?.world;
    if (!w?.accounts) continue;
    checked++;
    for (const a of w.accounts) if (a.id !== w.sessionId && (a.balance || a.toppedUp || a.starterPending || a.confirmsToday)) leaks.push(`${p.label}: account ${a.id} balance=${a.balance}`);
    for (const c of w.creations || []) if (c.userId !== w.sessionId && c.code) leaks.push(`${p.label}: foreign code`);
    if (d.self && w.sessionId && d.self.userId && d.self.userId !== w.sessionId) leaks.push(`${p.label}: self mismatch`);
    for (const k of ["keys", "devices", "people", "topups"]) if (k in w) leaks.push(`${p.label}: world.${k}`);
  }
  check(`projection: ${checked} replies, no foreign balances/codes/keys`, checked > 20 && leaks.length === 0, leaks.slice(0, 5).join("; "));
  const hostMail = lastWorld(host)?.self?.email;
  const foreign = pages.filter((p) => p !== host).some((p) => hostMail && p.bodies.some((b) => b.includes(hostMail)));
  check("host email never sent to others", hostMail && !foreign);
});
} finally {
  const errs = pages.flatMap((p) => p.errors.map((e) => `${p.label}: ${e}`));
  check("console errors = 0", errs.length === 0, errs.slice(0, 5).join(" | "));
  await L.closeBrowser();
  const logs = L.serverLogs();
  await L.stopServer();
  const s = L.summary();
  writeFileSync(join(L.SCREENS, `${L.VERSION}_report.json`), JSON.stringify({ at: new Date().toISOString(), ...s, axeIssues }, null, 2));
  writeFileSync(join(L.RUN, "server-last.log"), logs);
  console.log(`\n${s.pass} PASS, ${s.fail} FAIL`);
  process.exitCode = s.fail ? 1 : 0;
}
