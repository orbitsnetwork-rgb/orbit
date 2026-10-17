// ORBIT e2e regression — run via e2e/run.sh (moves .env.local aside, never touches Neon).
import AxeBuilder from "./axe.mjs";
import * as L from "./lib.mjs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const { check, step, shot, text, hasText, tab, more, H } = L;
const pages = [];
const person = async (label) => { const p = await L.newPerson(label); pages.push(p); return p; };
const lastWorld = (p) => { for (let i = p.bodies.length - 1; i >= 0; i--) { const d = L.decode(p.bodies[i]); const w = d?.result?.world; if (w?.accounts) return d.result; } return null; };
const linkOf = (p, cr) => { for (let i = p.bodies.length - 1; i >= 0; i--) { const l = L.decode(p.bodies[i])?.result?.mine?.links?.[cr]; if (l) return l; } return null; };
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

await step("money locked: visible, lock sheet, no dates/income; legacy routes 404", async () => {
  const p = await person("locks");
  await L.register(p, "Ліна"); await L.passKey(p); await L.skipIntro(p); await p.waitForTimeout(1200);
  const buy = p.getByRole("button", { name: /Купити ✦/ }).first();
  check("home: «Купити ✦» visible", await buy.isVisible().catch(() => false));
  await buy.click();
  const sheet = p.locator(".lk-sheet");
  await sheet.waitFor({ timeout: 4000 }).catch(() => {});
  const st = (await sheet.innerText().catch(() => "")) || "";
  check("lock sheet says «Після юридичного оформлення»", /Після юридичного оформлення/.test(st), st.slice(0, 120));
  check("lock sheet: no dates", !/\b20\d\d\b|січн|лютого|берез|квітн|травн|червн|липн|серпн|вересн|жовтн|листопад|грудн/i.test(st), st.slice(0, 200));
  check("lock sheet: no income promises", !/дохід гарант|заробиш|прибут/i.test(st));
  await shot(p, "04b_lock_sheet");
  await axe(p, "lock sheet");
  await p.getByRole("button", { name: "Зрозуміло" }).click();
  check("lock sheet closes", (await p.locator(".lk-sheet").count()) === 0);
  await tab(p, "Я");
  const me = await text(p);
  check("Я: deposit + withdraw rows locked", /Ввід гривні/.test(me) && /Вивід на картку/.test(me) && /Після юриста/.test(me), me.match(/(Вв[^\n]*|Вив[^\n]*)/g)?.slice(0, 4).join(" | "));
  check("Я: no Stripe/top-up button", !/Поповнити (картою|через)/i.test(me));
  await shot(p, "04c_me_locks");
  p.allowErrors = true; // ці адреси навмисно відповідають 404
  for (const route of ["/create", "/map", "/hall", "/talk", "/open/abc"]) {
    await p.goto(L.BASE + route); await p.waitForTimeout(800);
    check(`legacy ${route} → not-found page`, await hasText(p, "Цієї сторінки немає"));
  }
  p.allowErrors = false;
  await shot(p, "04d_not_found");
  await axe(p, "not found");
  await p.getByRole("link", { name: /Відкрити Орбіти/ }).click(); await p.waitForTimeout(1500);
  check("not-found → back home", !(await hasText(p, "Цієї сторінки немає")));
  await L.closePages(p);
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
const mineOf = (p) => { for (let i = p.bodies.length - 1; i >= 0; i--) { const m = L.decode(p.bodies[i])?.result?.mine; if (m) return m; } return null; };
/** «Підтвердив особисто»: учасник відкриває посилання з QR на екрані автора (з коротким токеном q) і підтверджує. */
async function confirmByQr(p) {
  await tab(host, "Заявка");
  await host.getByRole("button", { name: "Створити код підтвердження" }).click({ timeout: 8000 });
  await host.waitForTimeout(600);
  await host.getByRole("button", { name: "Показати QR-код" }).click();
  await host.waitForTimeout(800);
  check("author's QR carries the in-person hint", await host.getByTestId("qr-inperson").isVisible());
  const img = await host.locator("#cs-qr img").getAttribute("src");
  check("QR rendered (svg)", (img || "").startsWith("data:image/svg+xml"));
  await shot(host, "08b_qr_inperson");
  const code = ownCode();
  const qr = mineOf(host)?.qr;
  check("server gives the author a short-lived QR token (≤90 s)", qr && qr.t && qr.exp - (Date.now() + L.clock()) <= 90_000 && qr.exp > Date.now() + L.clock(), JSON.stringify(qr));
  await p.goto(`${L.BASE}/?c=${code}&q=${encodeURIComponent(qr.t)}`);
  await p.waitForTimeout(1500);
  await tab(p, "Заявка");
  check("code from QR prefilled", (await p.locator(".cs-confirm input").first().inputValue()).replace(/\D/g, "") === code);
  check("q removed from the address bar", !p.url().includes("q="));
  await p.locator(".cs-confirm button.orbit-go").last().click();
  await p.waitForTimeout(900);
}
await step("collect 8 confirms over 3 days", async () => {
  for (let i = 1; i < 8; i++) {
    if (i === 3 || i === 6) L.advance(24 * H);
    const p = await person("c" + i);
    await L.register(p, names[i]); await L.passKey(p); await L.skipIntro(p);
    await L.confirmMail(p);
    if (i === 7) await confirmByQr(p); else await confirmBy(p);
    crew.push(p);
    if (i === 3) { await host.reload(); await host.waitForTimeout(1500); await tab(host, "Заявка"); await shot(host, "08_collecting_4of8"); }
  }
  await host.reload(); await host.waitForTimeout(1500); await tab(host, "Заявка");
  check("launch charging after 8 confirms", await hasText(host, "Усі 8 супутників") || await hasText(host, "Залишилось"));
  const marks = host.locator(".ch-who li[data-inperson='1']");
  check("exactly one «особисто» mark (QR scan), typed codes get none", (await marks.count()) === 1 && (await marks.first().innerText()).includes(names[7].split(" ")[0]), String(await marks.count()));
  const bal = lastWorld(crew[6])?.world?.accounts?.find((a) => a.id === lastWorld(crew[6])?.world?.sessionId)?.balance;
  const bal5 = lastWorld(crew[5])?.world?.accounts?.find((a) => a.id === lastWorld(crew[5])?.world?.sessionId)?.balance;
  check("in-person mark changes no ✦ (QR witness balance = typed witness balance)", bal === bal5, `${bal} vs ${bal5}`);
  await host.locator(".ch-who").first().scrollIntoViewIfNeeded();
  await shot(host, "09_charging");
});
await step("share link /l/:slug", async () => {
  const slug = linkOf(host, crId());
  check("author gets an unguessable /l slug (16 base64url chars)", /^[A-Za-z0-9_-]{16}$/.test(slug || ""), slug);
  const old = await fetch(`${L.BASE}/l/${crId()}`);
  const oldHtml = await old.text();
  check("old /l/<launch id> → 404 for others, no launch data", old.status === 404 && oldHtml.includes("Запуск не знайдено") && !oldHtml.includes("Ганна Ш."), String(old.status));
  const guess = await fetch(`${L.BASE}/l/AAAAAAAAAAAAAAAA`);
  check("random slug → 404", guess.status === 404, String(guess.status));
  host.allowErrors = true; // the 404 document itself logs "Failed to load resource: 404" — expected here
  await host.goto(`${L.BASE}/l/${crId()}`);
  await host.waitForURL((u) => u.pathname === `/l/${slug}`, { timeout: 10000 }).catch(() => {});
  check("old /l/<launch id> redirects the author to the new link", new URL(host.url()).pathname === `/l/${slug}`, host.url());
  await host.goto(L.BASE + "/"); await host.waitForTimeout(1200);
  host.allowErrors = false;
  const p = await person("viewer");
  p.allowErrors = true;
  const viewerOld = await p.goto(`${L.BASE}/l/${crId()}`);
  await p.waitForTimeout(1500);
  check("old link in another person's browser: 404 page, no redirect", viewerOld.status() === 404 && new URL(p.url()).pathname === `/l/${crId()}` && (await hasText(p, "Запуск не знайдено")), p.url());
  p.allowErrors = false;
  await p.goto(`${L.BASE}/l/${slug}`);
  check("/l page shows status + 8 з 8", (await hasText(p, "Заряджається")) && (await hasText(p, "8")));
  check("/l page has no code", !/\b\d{6}\b/.test(await text(p)));
  await shot(p, "10_live_link");
  await axe(p, "/l live launch");
  const html = await (await fetch(`${L.BASE}/l/${slug}`)).text();
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
  if (await thanks.count()) {
    await thanks.first().click();
    const pick = host.getByRole("group", { name: /^Фраза подяки для / });
    check("thanks: phrase picker with 6 phrases", (await pick.getByRole("button").count()) === 6);
    await shot(host, "11b_thank_phrases");
    await pick.getByRole("button", { name: "Ти — частина моєї орбіти ✦" }).click();
    await host.waitForTimeout(900);
    check("thanks → «Подякувано»", await hasText(host, "Подякувано"));
  }
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
  check("crew streak shown and alive", /Серія екіпажу · [1-9]\d* (тиждень|тижні|тижнів) поспіль/.test(b), b.match(/Серія екіпажу[^\n]*/)?.[0]);
  const week = host.getByLabel("Табель екіпажу за тиждень").first();
  check("weekly crew report card (3 stats)", (await week.locator("dd").count()) === 3);
  const wk = (await week.locator("dd").allInnerTexts()).map(Number);
  check("weekly report: in-crew confirms ≥1, thanks ≥1", wk[0] >= 1 && wk[2] >= 1, wk.join("/"));
  const goal = host.locator(".cw-goal").first();
  const gt = await goal.innerText();
  const bar = goal.getByRole("progressbar");
  check("weekly crew goal «Ціль тижня · 12» with progress bar", /ціль тижня · 12/i.test(gt) && (await bar.getAttribute("aria-valuemax")) === "12" && Number(await bar.getAttribute("aria-valuenow")) === Math.min(12, wk[0]), gt);
  await week.scrollIntoViewIfNeeded(); await shot(host, "13c_crew_streak_week");
  const recap = host.locator(".mr-card");
  const rt = await recap.innerText();
  check("month recap «Твій місяць на орбіті»", rt.includes("Твій місяць на орбіті"));
  const nums = (await recap.locator("dd").allInnerTexts()).map(Number);
  check("month recap: launches ≥1, orbits ≥1, 6 stats", nums.length === 6 && nums[1] >= 1 && nums[2] >= 1, nums.join("/"));
  check("month recap shows no balances (no ✦ amounts)", !/\d\s*✦/.test(rt));
  await recap.scrollIntoViewIfNeeded(); await shot(host, "13d_month_recap");
  const [dl] = await Promise.all([host.waitForEvent("download", { timeout: 10000 }), recap.getByRole("button", { name: "Поділитися картинкою" }).click()]);
  const png = (await import("node:fs")).readFileSync(await dl.path());
  const isPng = png.subarray(1, 4).toString() === "PNG";
  check("month recap image: PNG 1080×1350", isPng && png.readUInt32BE(16) === 1080 && png.readUInt32BE(20) === 1350, `${png.length}b`);
  if (isPng) (await import("node:fs")).writeFileSync(join(L.SCREENS, `${L.VERSION}_month_card.png`), png);
  await shot(host, "13_profile_badges");
  await axe(host, "profile");
  const c = crew[1]; await c.reload(); await c.waitForTimeout(1500); await tab(c, "Я");
  check("confirmer sees thanks count ≥1", /\n?[1-9]\d*\s*\n?подяк/.test(await text(c)));
  check("confirmer badge «Екіпаж вісімки»", await hasText(c, "Екіпаж вісімки"));
  const g = crew[0]; await g.reload(); await g.waitForTimeout(1500);
  await more(g, "Сповіщення");
  check("thanked confirmer sees the chosen phrase", await hasText(g, "«Ти — частина моєї орбіти ✦»"));
  await shot(g, "13b_thanks_inbox");
  await L.closePages(g);
});
await step("wallet: no top-ups → no split, lock line", async () => {
  const c = crew[2]; await c.reload(); await c.waitForTimeout(1500); await tab(c, "Я");
  let b = await text(c);
  check("confirmer got starter+reward (>0 ✦)", /\n(2\d\d|1\d\d) ✦/.test(b) || /22\d ✦/.test(b), b.match(/\d+ ✦/g)?.join(","));
  await more(c, "Активи"); b = await text(c);
  check("wallet: no «Поповнено» tile without top-ups", !/Поповнено/i.test(b));
  check("wallet: lock line «після юридичного оформлення»", /ввід і вивід — після юридичного оформлення/.test(b));
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
await step("thank phrase index validated server-side", async () => {
  // A forged phrase index must never reach anyone's inbox: only 0–5 are kept.
  const evs = (lastWorld(crew[0]) ? crew[0].bodies.map((b) => L.decode(b)?.result?.mine?.events).filter(Boolean).at(-1) : []) || [];
  const got = evs.filter((e) => e.t === "thanksGot");
  check("thanksGot event carries p within 0–5", got.length >= 1 && got.every((e) => e.p === undefined || (Number.isInteger(e.p) && e.p >= 0 && e.p < 6)), JSON.stringify(got));
});
await step("per-user projection", async () => {
  let checked = 0, leaks = [], payoutRows = 0;
  const secrets = [];
  for (const p of pages) for (const raw of p.bodies) {
    const d = L.decode(raw)?.result; const w = d?.world;
    if (!w?.accounts) continue;
    checked++;
    for (const a of w.accounts) if (a.id !== w.sessionId && (a.balance || a.toppedUp || a.starterPending || a.confirmsToday)) leaks.push(`${p.label}: account ${a.id} balance=${a.balance}`);
    for (const c of w.creations || []) if (c.userId !== w.sessionId && c.code) leaks.push(`${p.label}: foreign code`);
    if (d.self && w.sessionId && d.self.userId && d.self.userId !== w.sessionId) leaks.push(`${p.label}: self mismatch`);
    for (const k of ["keys", "devices", "people", "topups"]) if (k in w) leaks.push(`${p.label}: world.${k}`);
    for (const row of w.payouts || []) { payoutRows++; if (row.userId !== w.sessionId) leaks.push(`${p.label}: foreign payout ${row.userId}`); }
    for (const row of d.mine?.payouts || []) if (row.userId !== w.sessionId) leaks.push(`${p.label}: foreign mine.payout`);
    for (const cr of Object.keys(d.mine?.links || {})) if (w.creations?.find((c) => c.id === cr)?.userId !== w.sessionId) leaks.push(`${p.label}: foreign link ${cr}`);
  }
  check(`projection: ${checked} replies, no foreign balances/codes/keys/payouts/links`, checked > 20 && leaks.length === 0, leaks.slice(0, 5).join("; "));
  check(`world.payouts carries only own rows (${payoutRows} seen)`, leaks.every((l) => !l.includes("payout")));
  const hostMail = lastWorld(host)?.self?.email;
  const foreign = pages.filter((p) => p !== host).some((p) => hostMail && p.bodies.some((b) => b.includes(hostMail)));
  check("host email never sent to others", hostMail && !foreign);
});
  // App console must be clean while the server is up; then close the phase-2 tabs so their polling
  // doesn't log ERR_CONNECTION_REFUSED when phase 3 restarts the server.
  const appErrs = pages.flatMap((p) => p.errors.map((e) => `${p.label}: ${e}`));
  check("console errors = 0 (phases 1–2)", appErrs.length === 0, appErrs.slice(0, 5).join(" | "));
  for (const p of pages) { await p.close().catch(() => {}); p.errors = []; }
  // ───────── Phase 3: security / correctness ─────────
  const sec = await import("./security.mjs");
  await sec.securityPhase();
  await L.stopServer();
  await step("security: DB state", sec.securityDb);
  // ───────── Phase 4: migration of an existing (pre-v7) world ─────────
  const mig = await import("./migrate-sim.mjs");
  await step("migration simulation", mig.migrationPhase);
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
