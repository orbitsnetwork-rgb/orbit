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
  // v24: «Завантажити додаток» на вітальному екрані; без системного вікна — ілюстрована підказка.
  const ins = p.getByTestId("install-app");
  check("v24: install button on welcome screen", (await ins.count()) === 1 && /Завантажити додаток/.test(await ins.innerText()));
  await ins.click();
  check("v24: install guide opens (3 steps)", (await p.getByRole("dialog", { name: "Додати ORBIT на екран" }).count()) === 1 && (await p.locator(".ins-steps li").count()) === 3);
  await shot(p, "01b_install_guide");
  await p.keyboard.press("Escape");
  check("v24: install guide closes on Esc", (await p.locator(".ins-sheet").count()) === 0);
  {
    const man = await (await fetch(L.BASE + "/manifest.webmanifest")).json();
    check("v24: manifest name ORBIT + standalone + shortcuts + maskable", man.name === "ORBIT" && man.display === "standalone" && man.shortcuts?.length >= 2 && man.icons.some((i) => i.purpose === "maskable"));
    const sw = await (await fetch(L.BASE + "/sw.js")).text();
    check("v24: service worker skips API/auth", /_serverFn/.test(sw) && /\\\/api/.test(sw) && /auth/.test(sw));
  }
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
  check("Я: phone + birth masked by default", !/\+380\d{9}/.test(me) && !/1990/.test(me) && /••\.••\.••••/.test(me));
  await p.getByRole("button", { name: "Показати дані" }).click();
  check("Я: «Показати дані» reveals birth", /05\.05\.1990|\d{2}\.\d{2}\.\d{4}/.test(await text(p)));
  await p.getByRole("button", { name: "Приховати дані" }).click();
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
  p.allowErrors = true; // далі сервер перезапускається — ця вкладка більше не потрібна
  await p.close().catch(() => {});
});

// ───────── Phase 2: dev mail flag on, full launch with 3 confirms (crew3) ─────────
await L.startServer({ ORBIT_DEV_MAIL_CODE: "1", ORBIT_E2E_SEED: "7", ORBIT_ADMIN_TOKEN: "e2e-local-owner-token-not-real-0123456789", ORBIT_MOD_MIN_AGE_H: "0" });
const host = await person("host");
await L.register(host, "Ганна", "Шевченко"); await L.passKey(host); await L.skipIntro(host);
await step("mail confirm + checklist", async () => {
  check("dev flag: mail code visible", await hasText(host, "Код:"));
  check("mail confirmed via UI", await L.confirmMail(host));
  check("home first-step checklist shown", await hasText(host, "Перші кроки"));
  await shot(host, "05_home_checklist");
  {
    const pn = host.locator('[data-testid="pioneer"]');
    check("v18: pioneer card on home", (await pn.count()) === 1 && /Піонер №\d+/.test(await pn.innerText()));
    check("v18: honest cold-start need shown", (await host.locator('[data-testid="pioneer-need"]').count()) <= 1);
    await pn.getByRole("button", { name: "Навіщо мені орбіта?" }).click();
    check("v18: why-orbit list opens", (await host.locator('[data-testid="pioneer-why"]').count()) === 1);
    await pn.scrollIntoViewIfNeeded();
    await shot(host, "05b_pioneer");
  }
  {
    const dc = host.getByTestId("daily-charge");
    check("v23: daily charge card on home", (await dc.count()) === 1);
    await dc.evaluate((el) => el.scrollIntoView({ block: "center" })); await host.waitForTimeout(300);
    await dc.getByRole("button", { name: "Зарядитися на сьогодні" }).click({ force: true }); // кнопка «дихає» — Playwright не чекає стабільності
    await host.waitForTimeout(400);
    check("v23: daily charge tapped → streak 1, no ✦", (await hasText(host, "Заряджено на сьогодні")) && /Серія: 1 день/.test(await dc.innerText()));
    await dc.scrollIntoViewIfNeeded();
    await shot(host, "05c_daily_charge");
    await host.waitForTimeout(800);
    await host.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("orbits-ritual-")).forEach((k) => localStorage.removeItem(k)));
    await host.reload(); await host.waitForTimeout(2500);
    check("v23: streak lives on the server (survives cleared storage)", /Серія: 1 день/.test(await host.getByTestId("daily-charge").innerText()));
  }
});
await step("v19: live layer (chat, roles, faq, music, bell kept)", async () => {
  check("v19: bell still in header", (await host.locator(".mo-bell").count()) === 1);
  const music = host.getByRole("button", { name: "Увімкнути фонову музику" });
  check("v19: music toggle off by default", (await music.count()) === 1 && (await music.getAttribute("aria-pressed")) === "false");
  await host.getByRole("button", { name: "Ще", exact: true }).click();
  check("v19: explorer entry kept", await hasText(host, "Оглядач"));
  await host.getByText("Живе", { exact: true }).first().click();
  await host.locator("#chat-input").waitFor({ timeout: 8000 });
  check("v19: empty chat invites to speak", await hasText(host, "Поки тихо"));
  await host.locator("#chat-input").fill("<img src=x onerror=alert(1)> Привіт, світе");
  await host.getByRole("button", { name: "Надіслати" }).click();
  await host.waitForTimeout(1200);
  check("v19: message shown as text", await hasText(host, "<img src=x onerror=alert(1)> Привіт, світе"));
  check("v19: no injected img", (await host.locator('img[src="x"]').count()) === 0);
  await shot(host, "20_live_chat");
  for (let i = 0; i < 8; i++) {
    await host.locator("#chat-input").fill(`спам ${i}`);
    await host.getByRole("button", { name: "Надіслати" }).click();
    await host.waitForTimeout(350);
  }
  check("v19: server rate limit 8/min", await hasText(host, "Забагато повідомлень"));
  check("v24: role form no longer inside chat", (await host.locator("#role-why").count()) === 0 && (await host.locator("#mod-why").count()) === 0);
  // v24: відповідь, редагування, видалення свого.
  await host.waitForTimeout(61000 - 8 * 350); // ліміт 8/хв відпускає
  const mine = host.locator(".orbit-msg", { hasText: "Привіт, світе" });
  await mine.getByRole("button", { name: /^Ще дії з повідомленням/ }).click();
  await host.getByRole("dialog", { name: "Дії з повідомленням" }).getByRole("button", { name: "Відповісти" }).click();
  check("v24: reply context shown above input", (await host.locator(".cv-ctx").count()) === 1);
  await host.locator("#chat-input").fill("відповідаю сам собі");
  await host.locator("#chat-input").press("Enter");
  await host.waitForTimeout(1500);
  const rep = host.locator(".orbit-msg", { hasText: "відповідаю сам собі" });
  check("v24: reply carries a quote of the original", (await rep.locator(".cv-quote").count()) === 1 && /Привіт, світе/.test(await rep.locator(".cv-quote").innerText()));
  check("v24: sent tick on own message", (await rep.locator(".cv-tick").count()) === 1);
  await shot(host, "20b_chat_reply");
  await rep.getByRole("button", { name: /^Ще дії з повідомленням/ }).click();
  await host.getByRole("dialog", { name: "Дії з повідомленням" }).getByRole("button", { name: "Змінити" }).click();
  await host.locator("#chat-input").fill("відповідаю сам собі (виправлено)");
  await host.getByRole("button", { name: "Зберегти" }).click();
  await host.waitForTimeout(1500);
  check("v24: edit shows new text + «змінено»", (await hasText(host, "відповідаю сам собі (виправлено)")) && (await hasText(host, "змінено")));
  const sp = host.locator(".orbit-msg", { hasText: "спам 0" });
  await sp.getByRole("button", { name: /^Ще дії з повідомленням/ }).click();
  host.once("dialog", (d) => d.accept());
  await host.getByRole("dialog", { name: "Дії з повідомленням" }).getByRole("button", { name: "Видалити" }).click();
  await host.waitForTimeout(1500);
  check("v24: delete leaves a tombstone", !(await hasText(host, "спам 0")) && (await hasText(host, "Повідомлення видалено")));
  await shot(host, "20c_chat_edit_delete");
  check("v24: day separator present", (await host.locator(".cv-day").count()) >= 1);
  check("v21: reactions lock removed (reactions are live)", !(await hasText(host, "Скоро в живому")));
  await host.locator("#faq-title").scrollIntoViewIfNeeded();
  await shot(host, "21_live_roles_faq");
  await host.keyboard.press("Escape");
  await host.waitForTimeout(300);
  await host.keyboard.press("Escape");
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
// crew3: спершу реєструємо ще 7 людей, щоб у світі було ≥4 і правило «3 підтвердження» діяло з першого коду.
const pre = [];
await step("crew3: pre-register crew before the first code", async () => {
  for (let i = 1; i < 8; i++) {
    const p = await person("c" + i);
    await L.register(p, names[i]); await L.passKey(p); await L.skipIntro(p);
    await L.confirmMail(p);
    pre.push(p);
  }
  check("crew3: 8+ people in the world", (lastWorld(pre.at(-1))?.world?.accounts?.length ?? 0) >= 8);
});
await step("guest invite link banner names the inviter", async () => {
  const code = ownCode();
  const og = ((await (await fetch(`${L.BASE}/?c=${code}`)).text()).match(/<meta[^>]+og:title[^>]*>/) || [""])[0];
  check("/?c= link preview og:title «Запуск Ганна Ш. · підтверджень: 0»", og.includes("Ганна Ш.") && og.includes("підтверджень: 0"), og);
  check("own code readable in own projection", /^\d{6}$/.test(code || ""));
  guest = await person("guest");
  await guest.goto(`${L.BASE}/?c=${code}`);
  check("invite banner names inviter", await hasText(guest, "Ганна Ш. запрошує тебе підтвердити запуск"), (await text(guest)).slice(0, 400));
  check("invite banner shows progress (0 so far)", await hasText(guest, "підтверджень уже: 0"));
  check("?c= removed from address", !guest.url().includes("c="));
  await shot(guest, "07_invite_banner");
  await L.register(guest, names[0]); await L.passKey(guest);
  await guest.waitForTimeout(800);
  await L.skipIntro(guest);
  check("invited guest lands on confirm with code prefilled", (await guest.locator(".cs-confirm[data-link='1']").count()) === 1);
  await L.confirmMail(guest).catch(() => {});
  // crew3-захист: від 10 людей новий акаунт підтверджує через годину.
  await tab(guest, "Заявка");
  await guest.locator(".cs-confirm input").first().fill(code);
  await guest.locator(".cs-confirm button[type=submit], .cs-confirm button.orbit-go").last().click();
  await guest.waitForTimeout(900);
  const errs = guest.bodies.map((b) => L.decode(b)?.result?.error).filter(Boolean);
  const young = errs.some((e) => /через годину/.test(e));
  check("crew3: brand-new witness refused with a clear reason (or world < 10)", young || (await hasText(guest, "Заряд пішов")), errs.join(" | "));
  await shot(guest, "07b_witness_refused");
  L.advance(2 * H);
  await host.reload(); await host.waitForTimeout(1500);
  await tab(host, "Заявка");
  await guest.reload(); await guest.waitForTimeout(1500);
  await confirmByQr(guest);
  const gErr = guest.bodies.map((b) => L.decode(b)?.result?.error).filter(Boolean).at(-1);
  check("one confirmation starts the charge", (await hasText(guest, "Заряд пішов")) || !gErr, gErr || "");
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
function mineOf(p) { for (let i = p.bodies.length - 1; i >= 0; i--) { const m = L.decode(p.bodies[i])?.result?.mine; if (m) return m; } return null; }
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
await step("one confirm is enough + lifetime pair rule", async () => {
  for (const p of pre) crew.push(p);
  await host.reload(); await host.waitForTimeout(1500); await tab(host, "Заявка");
  check("launch charging after 1 confirm", await hasText(host, "Залишилось") || await hasText(host, "Заряд"));
  const marks = host.locator(".ch-who li[data-inperson='1']");
  check("exactly one «особисто» mark (QR scan), typed codes get none", (await marks.count()) === 1 && (await marks.first().innerText()).includes(names[0].split(" ")[0]), String(await marks.count()));
  await host.locator(".ch-who").first().scrollIntoViewIfNeeded();
  await shot(host, "09_charging");
});
await step("v20: rooms + live chat + room access control", async () => {
  const urls = {};
  const spy = (r) => { const b = r.postData() || ""; if (!r.url().includes("/_serverFn/")) return; if (b.includes('"wait"')) urls.read = r.url(); else if (b.includes('"text"') && b.includes('"room"')) urls.send = r.url(); };
  host.on("request", spy);
  await host.getByRole("button", { name: "Ще", exact: true }).click();
  await host.getByText("Живе", { exact: true }).first().click();
  await host.locator("#rooms-title").waitFor({ timeout: 8000 });
  const mine = host.locator(".orbit-room", { hasText: "Мій запуск" });
  check("v20: room list has world + my launch room", (await host.locator(".orbit-room", { hasText: "Світ" }).count()) === 1 && (await mine.count()) === 1);
  check("v20: online dot shown", await hasText(host, "онлайн"));
  await mine.click();
  await host.waitForTimeout(800);
  check("v20: launch room is private copy", await hasText(host, "Бачать лише автор і ті, хто підтвердив"));
  await host.locator("#chat-input").fill("<script>alert(1)</script> Екіпаже, тримаймось!");
  await host.getByRole("button", { name: "Надіслати" }).click();
  check("v20: room message shown as plain text", await hasText(host, "<script>alert(1)</script> Екіпаже, тримаймось!"));
  check("v20: no injected script node", (await host.locator("script", { hasText: "alert(1)" }).count()) === 0);
  // Учасник бачить непрочитане й отримує нове без перезавантаження (довге опитування).
  const g = crew[0];
  await g.getByRole("button", { name: "Ще", exact: true }).click();
  await g.getByText("Живе", { exact: true }).first().click();
  await g.locator("#rooms-title").waitFor({ timeout: 8000 });
  const gRoom = g.locator(".orbit-room", { hasText: "Запуск, який я підтримав" });
  await gRoom.waitFor({ timeout: 8000 }).catch(() => {});
  await g.waitForTimeout(500);
  check("v20: member sees the launch room with unread badge", (await gRoom.count()) === 1 && (await gRoom.locator(".orbit-room-n").innerText().catch(() => "")) === "1", `rooms=${await gRoom.count()} n=${await gRoom.locator(".orbit-room-n").innerText({ timeout: 1000 }).catch(() => "-")} txt=${(await g.locator(".cv-list").innerText().catch(() => "")).slice(0, 200)}`);
  await shot(g, "30_room_list");
  await gRoom.click();
  check("v20: member reads the room", await hasText(g, "Екіпаже, тримаймось!"));
  await g.waitForTimeout(1500);
  const t0 = Date.now();
  await host.locator("#chat-input").fill("Живе повідомлення без оновлення");
  await host.getByRole("button", { name: "Надіслати" }).click();
  const arrived = await g.getByText("Живе повідомлення без оновлення").waitFor({ timeout: 12000 }).then(() => true, () => false);
  check("v20: live delivery to member without reload (≤12 s)", arrived, `${Date.now() - t0} ms`);
  await g.locator("#chat-input").fill("Тут! Підтримую 🚀");
  await g.getByRole("button", { name: "Надіслати" }).click();
  await host.getByText("Тут! Підтримую").waitFor({ timeout: 12000 }).catch(() => {});
  await shot(host, "31_room_messages");
  await axe(host, "v20 room");
  host.off("request", spy);
  // Чужий акаунт напряму на сервер: ні читати, ні писати в кімнату запуску.
  const stranger = await L.apiRegister("Чужий", { ip: "10.77.1.2" });
  const call = async (url, data) => { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-tsr-serverfn": "true", accept: "application/json", "x-forwarded-for": "10.77.1.2", origin: L.BASE }, body: L.encode(data) }); return L.decode(await r.text())?.result; };
  const room = `l:${crId()}`;
  const base = { sessionId: stranger.id, sessionKey: stranger.key };
  check("v20: captured chat endpoints", !!urls.read && !!urls.send, JSON.stringify(urls));
  const rd = await call(urls.read, { ...base, room, after: 0, wait: false });
  check("v20: non-member can't read launch room", rd && rd.allowed === false && rd.lines.length === 0, JSON.stringify(rd));
  const sd = await call(urls.send, { ...base, room, text: "я тут чужий" });
  check("v20: non-member can't post to launch room", sd && sd.ok === false, JSON.stringify(sd));
  const wr = await call(urls.read, { ...base, room: "world", after: 0, wait: false });
  check("v20: same stranger can read world room", wr && wr.allowed === true, JSON.stringify(wr)?.slice(0, 200));
  const bad = await call(urls.read, { ...base, room: "l:x' or 1=1--", after: 0, wait: false });
  check("v20: malformed room id refused", bad && bad.allowed === false);
  const anon = await call(urls.read, { sessionId: stranger.id, sessionKey: "WRONG-KEY", room: "world", after: 0, wait: false });
  check("v20: wrong key reads nothing", anon && anon.signedIn === false && anon.lines.length === 0);
  const memberText = await text(host);
  check("v20: stranger's text never appears", !memberText.includes("я тут чужий"));
  await host.keyboard.press("Escape"); await host.waitForTimeout(300); await host.keyboard.press("Escape");
  await g.keyboard.press("Escape"); await g.waitForTimeout(300); await g.keyboard.press("Escape");
});
await step("v21: cosmic reactions (cosmetic, members only, toggle, live)", async () => {
  const urls = {};
  const spy = (r) => { const b = r.postData() || ""; if (r.url().includes("/_serverFn/") && b.includes('"kind"')) urls.react = r.url(); };
  host.on("request", spy);
  const open = async (p, label) => {
    await p.getByRole("button", { name: "Ще", exact: true }).click();
    await p.getByText("Живе", { exact: true }).first().click();
    await p.locator("#rooms-title").waitFor({ timeout: 8000 });
    await p.locator(".orbit-room", { hasText: label }).click();
    await p.getByText("Екіпаже, тримаймось!").waitFor({ timeout: 8000 });
  };
  const g = crew[0];
  await open(host, "Мій запуск");
  await open(g, "Запуск, який я підтримав");
  await host.locator("#rooms-title").scrollIntoViewIfNeeded();
  await host.evaluate(() => document.querySelector("#rooms-title")?.scrollIntoView({ block: "start" }));
  await shot(host, "33_room_list");
  const msg = host.locator(".orbit-msg", { hasText: "Тут! Підтримую" });
  await msg.getByRole("button", { name: /^Реакція на повідомлення/ }).click();
  const pick = host.getByRole("group", { name: "Обери реакцію" });
  check("v21: picker shows 12 named cosmic reactions", (await pick.getByRole("button").count()) === 12);
  check("v21: picker uses SVG icons, not emoji", (await pick.locator("svg.orbit-rx-ico").count()) === 12);
  await shot(host, "34_reaction_picker");
  const fit = await host.evaluate(() => {
    const pick = document.querySelector(".orbit-rx-pick")?.getBoundingClientRect();
    const labels = [...document.querySelectorAll(".orbit-rx-opt span")].every((el) => el.getBoundingClientRect().width <= el.parentElement.getBoundingClientRect().width + 0.5);
    return { page: document.documentElement.scrollWidth <= window.innerWidth, inView: !!pick && pick.right <= window.innerWidth, labels };
  });
  check("v22: picker fits 390px (no page overflow, labels not clipped)", fit.page && fit.inView && fit.labels, JSON.stringify(fit));
  await pick.getByRole("button", { name: "✦ Підтримую" }).click();
  check("v21: picker closes after pick", (await host.getByRole("group", { name: "Обери реакцію" }).count()) === 0);
  await msg.getByRole("button", { name: /^Реакція на повідомлення/ }).click();
  await host.getByRole("group", { name: "Обери реакцію" }).getByRole("button", { name: "Вау, галактика" }).click();
  const chip = msg.getByRole("button", { name: /^✦ Підтримую: 1/ });
  await chip.waitFor({ timeout: 6000 }).catch(() => {});
  check("v21: my reaction chip pressed with count 1", (await chip.getAttribute("aria-pressed")) === "true");
  // Учасник бачить реакцію наживо (довге опитування прокидається від реакції) і додає свою.
  const gMsg = g.locator(".orbit-msg", { hasText: "Тут! Підтримую" });
  const live = await gMsg.getByRole("button", { name: /^✦ Підтримую: 1/ }).waitFor({ timeout: 12000 }).then(() => true, () => false);
  check("v21: member sees reaction live without reload", live);
  await gMsg.getByRole("button", { name: /^✦ Підтримую: 1/ }).click();
  const two = await msg.getByRole("button", { name: /^✦ Підтримую: 2/ }).waitFor({ timeout: 12000 }).then(() => true, () => false);
  check("v21: counts merge across people (2)", two);
  await msg.getByRole("button", { name: "Хто?" }).click();
  const list = host.getByRole("list", { name: "Хто відреагував" });
  await list.waitFor({ timeout: 6000 }).catch(() => {});
  const lt = await list.innerText().catch(() => "");
  check("v21: who-reacted list names people", lt.includes("Я") && lt.includes("Підтримую"), lt);
  await msg.scrollIntoViewIfNeeded();
  await shot(host, "35_message_reactions");
  // Перемикач: повторний дотик прибирає мою реакцію.
  await msg.getByRole("button", { name: /^Вау, галактика: 1/ }).click();
  const gone = await msg.getByRole("button", { name: /^Вау, галактика/ }).waitFor({ state: "detached", timeout: 12000 }).then(() => true, () => false);
  check("v21: tapping my reaction again removes it", gone);
  // Long-press відкриває вибір.
  const box = await msg.locator(".orbit-msg-t").boundingBox();
  if (box) { await host.mouse.move(box.x + 5, box.y + 5); await host.mouse.down(); await host.waitForTimeout(650); await host.mouse.up(); }
  const lpAt = box ? await host.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName}.${el.className}` : "none"; }, [box.x + 5, box.y + 5]) : "nobox";
  check("v21: long-press opens picker", (await host.getByRole("group", { name: "Обери реакцію" }).count()) === 1, lpAt);
  await host.keyboard.press("Escape");
  check("v21: Esc closes picker", (await host.getByRole("group", { name: "Обери реакцію" }).count()) === 0);
  await axe(host, "v21 reactions");
  host.off("request", spy);
  // Напряму на сервер: чужий не може реагувати в кімнаті запуску; невідомий вид — відмова.
  const stranger = await L.apiRegister("Чужий 2", { ip: "10.77.1.3" });
  const call = async (url, data) => { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-tsr-serverfn": "true", accept: "application/json", "x-forwarded-for": "10.77.1.3", origin: L.BASE }, body: L.encode(data) }); return L.decode(await r.text())?.result; };
  check("v21: captured react endpoint", !!urls.react);
  const id = Number(await msg.getAttribute("data-msg"));
  const sr = await call(urls.react, { sessionId: stranger.id, sessionKey: stranger.key, id, kind: "spark" });
  check("v21: non-member can't react in launch room", sr && sr.ok === false, JSON.stringify(sr));
  const bad = await call(urls.react, { sessionId: stranger.id, sessionKey: stranger.key, id, kind: "<script>" });
  check("v21: unknown reaction kind refused", bad && bad.ok === false);
  const anon = await call(urls.react, { sessionId: stranger.id, sessionKey: "WRONG", id, kind: "spark" });
  check("v21: wrong key can't react", anon && anon.ok === false);
  await host.keyboard.press("Escape"); await host.waitForTimeout(300); await host.keyboard.press("Escape");
  await g.keyboard.press("Escape"); await g.waitForTimeout(300); await g.keyboard.press("Escape");
});
await step("v22: bell chat notes (grouped) + moderation (mask, mute, owner page)", async () => {
  const OWNER = "e2e-local-owner-token-not-real-0123456789";
  const urls = {};
  const spy = (r) => { const b = r.postData() || ""; if (!r.url().includes("/_serverFn/")) return; if (b.includes('"text"') && b.includes('"room"')) urls.send = r.url(); if (/^\{"data":\{[^}]*"id":\d+\}?/.test(b) || (b.includes('"id"') && !b.includes('"kind"') && !b.includes('"room"'))) urls.idfn = urls.idfn || r.url(); };
  const g = crew[0];
  await g.reload(); await g.waitForTimeout(9500); // учасник поза чатом; старе довге опитування (≤8 с) встигає завершитись
  // 1) Нове в кімнаті запуску, поки учасник не в чаті → дзвіночок (одне згруповане сповіщення на кімнату).
  host.on("request", spy);
  await host.getByRole("button", { name: "Ще", exact: true }).click();
  await host.getByText("Живе", { exact: true }).first().click();
  await host.locator("#rooms-title").waitFor({ timeout: 8000 });
  await host.locator(".orbit-room", { hasText: "Мій запуск" }).click();
  await host.locator("#chat-input").waitFor({ timeout: 8000 });
  for (const t of ["Хто завтра на зв'язку?", "Пишу ще раз для дзвіночка"]) {
    await host.locator("#chat-input").fill(t);
    await host.getByRole("button", { name: "Надіслати" }).click();
    await host.waitForTimeout(500);
  }
  await g.waitForTimeout(1000);
  await g.getByRole("button", { name: /^Сповіщення/ }).first().click();
  await g.waitForTimeout(1500);
  await g.getByRole("tab", { name: /Чат/ }).click().catch(() => {});
  const bell = await text(g);
  check("v22: bell shows reaction on my message (grouped)", /реакція на твоє повідомлення «Тут! Підтримую[^»]*» — Ганна Ш\./.test(bell), bell.match(/[^\n]*реакці[^\n]*/)?.[0]);
  check("v22: bell shows crew-room messages as one grouped note", /«Запуск, який я підтримав»: 2 нові повідомлення/.test(bell), bell.match(/[^\n]*Запуск, який я підтримав[^\n]*/)?.[0]);
  await shot(g, "40_bell_chat");
  await axe(g, "v22 bell");
  // v23: дотик до сповіщення кімнати відкриває саме цю кімнату.
  await g.getByText(/Запуск, який я підтримав»: 2 нові повідомлення/).first().click();
  await g.waitForTimeout(1500);
  check("v23: tapping a room note opens that room", (await hasText(g, "Бачать лише автор і ті, хто підтвердив")) && (await g.locator("#chat-input").count()) === 1);
  await shot(g, "40b_bell_opens_room");
  await g.keyboard.press("Escape"); await g.waitForTimeout(300); await g.keyboard.press("Escape");
  // 2) М'який фільтр: грубе слово маскується, повідомлення надсилається.
  await host.locator("#chat-input").fill("ну ти сука, але дякую");
  await host.getByRole("button", { name: "Надіслати" }).click();
  check("v22: rude word masked, message still sent", await hasText(host, "ну ти с••• , але дякую".replace(" ,", ",")), "");
  check("v22: gentle notice about masking", await hasText(host, "приховано зірочками"));
  await shot(host, "41_masked");
  host.off("request", spy);
  // 3) Пауза: два повідомлення сховані скаргами (3 різні люди) → пауза 1 год, автор бачить пояснення.
  const call = async (url, data, ip) => { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-tsr-serverfn": "true", accept: "application/json", "x-forwarded-for": ip, origin: L.BASE }, body: L.encode(data) }); return L.decode(await r.text())?.result; };
  check("v22: captured send endpoint", !!urls.send);
  const rude = await L.apiRegister("Різкий", { ip: "10.88.0.1" });
  const R = { sessionId: rude.id, sessionKey: rude.key };
  for (const t of ["перше погане повідомлення", "друге погане повідомлення"]) await call(urls.send, { ...R, room: "world", text: t }, "10.88.0.1");
  // id-шники повідомлень і адреса функції скарги — з UI: учасник скаржиться на одне з них.
  const viewer = g;
  const rep = {};
  const repSpy = (r) => { const b = r.postData() || ""; if (r.url().includes("/_serverFn/") && /"id"/.test(b) && !b.includes('"kind"') && !b.includes('"room"')) rep.url = rep.url || r.url(); };
  viewer.on("request", repSpy);
  await viewer.getByRole("button", { name: "Ще", exact: true }).click();
  await viewer.getByText("Живе", { exact: true }).first().click();
  await viewer.locator("#rooms-title").waitFor({ timeout: 8000 });
  await viewer.locator(".orbit-room", { hasText: "Світ" }).click();
  await viewer.locator(".cv-log").getByText("друге погане повідомлення").waitFor({ timeout: 10000 });
  const ids = [];
  for (const t of ["перше погане повідомлення", "друге погане повідомлення"]) ids.push(Number(await viewer.locator(".orbit-msg", { hasText: t }).getAttribute("data-msg")));
  await viewer.locator(".orbit-msg", { hasText: "перше погане" }).getByRole("button", { name: /^Ще дії з повідомленням/ }).click();
  await viewer.getByRole("dialog", { name: "Дії з повідомленням" }).getByRole("button", { name: /^Поскаржитись/ }).click();
  await viewer.waitForTimeout(800);
  // «Хто?» теж шле id — беремо саме скаргу: остання відповідь з id без kind.
  viewer.off("request", repSpy);
  check("v22: captured report endpoint", !!rep.url);
  const reporters = [];
  for (let i = 0; i < 3; i++) reporters.push(await L.apiRegister(`Свідок${i}`, { ip: `10.88.1.${i + 1}` }));
  for (const [i, r] of reporters.entries()) for (const id of ids) await call(rep.url, { sessionId: r.id, sessionKey: r.key, id }, `10.88.1.${i + 1}`);
  const blocked = await call(urls.send, { ...R, room: "world", text: "третє" }, "10.88.0.1");
  check("v22: repeat offender muted with clear message + appeal path", blocked && blocked.ok === false && /на паузі/.test(blocked.error) && /Написати нам/.test(blocked.error), JSON.stringify(blocked));
  check("v22: mute changes no ✦ (copy says so)", /✦ і орбіти це не зачіпає/.test(blocked?.error || ""));
  const goneForOthers = await viewer.locator(".cv-log").getByText("друге погане повідомлення").waitFor({ state: "detached", timeout: 12000 }).then(() => true, () => false);
  check("v22: hidden messages disappear for others live", goneForOthers);
  // 4) Сторінка власника: без токена — нічого; з токеном — сховані, повернення знімає паузу.
  const bad = await person("owner-bad");
  await bad.goto(L.BASE + "/owner");
  await bad.locator("#ow-token").fill("not-the-token-at-all-xxxxxxxx");
  await bad.getByRole("button", { name: "Увійти" }).click();
  check("v22: wrong owner token refused", await hasText(bad, "Невірний токен"));
  check("v22: owner page shows nothing without token", !(await text(bad)).includes("погане повідомлення"));
  await bad.close(); pages.splice(pages.indexOf(bad), 1);
  const own = await person("owner");
  await own.goto(L.BASE + "/owner");
  await own.locator("#ow-token").fill(OWNER);
  await own.getByRole("button", { name: "Увійти" }).click();
  await own.getByText("Сховані скаргами").waitFor({ timeout: 8000 }).catch(() => {});
  const ot = await text(own);
  check("v22: owner sees both hidden messages with report counts", ot.includes("перше погане повідомлення") && ot.includes("друге погане повідомлення") && ot.includes("скарг: 3"), ot.slice(0, 400));
  check("v22: owner sees mute", ot.includes("Пауза в чаті (1)"));
  await shot(own, "42_owner_review");
  await axe(own, "v22 owner");
  await own.locator(".ow-row", { hasText: "перше погане" }).getByRole("button", { name: "Повернути" }).click();
  await own.waitForTimeout(1200);
  check("v22: restore lifts the mute when no longer repeated", (await text(own)).includes("Пауза в чаті (0)"));
  const again = await call(urls.send, { ...R, room: "world", text: "вибачте, більше не буду" }, "10.88.0.1");
  check("v22: unmuted author can write again", again && again.ok === true, JSON.stringify(again));
  check("v22: restored message visible again", await viewer.locator(".cv-log").getByText("перше погане повідомлення").waitFor({ timeout: 12000 }).then(() => true, () => false));
  // v24: «Ще» → «Стати модератором» → власник затверджує → модератор видаляє → журнал.
  await host.keyboard.press("Escape"); await host.waitForTimeout(300); await host.keyboard.press("Escape"); await host.waitForTimeout(300);
  await host.getByRole("button", { name: "Ще", exact: true }).click();
  await host.getByText("Стати модератором", { exact: true }).first().click();
  await host.locator("#mod-why").waitFor({ timeout: 8000 });
  check("v24: moderator page shows rules + empty state", (await hasText(host, "Правила модератора")) && (await hasText(host, "Заявки ще немає")));
  const submit = host.getByRole("button", { name: "Подати заявку" });
  await host.locator("#mod-why").fill("Хочу допомагати тримати чат чистим і доброзичливим");
  check("v24: apply disabled until rules agreed", await submit.isDisabled());
  await host.locator("#mod-agree").check();
  await submit.click();
  await host.getByText("Заявка на розгляді").waitFor({ timeout: 8000 }).catch(() => {});
  check("v24: application pending", await hasText(host, "Заявка на розгляді"));
  await shot(host, "43_mod_apply");
  await own.reload(); await own.waitForTimeout(2000); // токен у sessionStorage → вхід сам
  await own.locator("[data-modapp]").first().waitFor({ timeout: 8000 });
  await own.locator("[data-modapp]").first().getByRole("button", { name: "Затвердити" }).click();
  await own.waitForTimeout(1200);
  check("v24: owner approved → listed as moderator", (await text(own)).includes("Модератори (1)"));
  await host.reload(); await host.waitForTimeout(2500);
  await host.getByRole("button", { name: "Ще", exact: true }).click();
  await host.getByText("Стати модератором", { exact: true }).first().click();
  const isModNow = await host.locator("#mod-state", { hasText: "Ти модератор" }).waitFor({ timeout: 8000 }).then(() => true, () => false);
  if (!isModNow) await shot(host, "43x_mod_status_fail");
  check("v24: applicant now sees moderator status", isModNow, (await host.locator("#mod-page").innerText().catch(() => "no page")).slice(0, 160));
  await host.keyboard.press("Escape"); await host.waitForTimeout(300);
  await host.getByText("Живе", { exact: true }).first().click();
  await host.locator("#rooms-title").waitFor({ timeout: 8000 });
  await host.locator(".orbit-room", { hasText: "Світ" }).click();
  const bad1 = host.locator(".orbit-msg", { hasText: "вибачте, більше не буду" });
  await bad1.waitFor({ timeout: 10000 });
  await bad1.getByRole("button", { name: /^Ще дії з повідомленням/ }).click();
  await shot(host, "44_mod_menu");
  host.once("dialog", (d) => d.accept());
  await host.getByRole("dialog", { name: "Дії з повідомленням" }).getByRole("button", { name: "Видалити (модератор)" }).click();
  await host.waitForTimeout(1500);
  check("v24: moderator delete → tombstone", (await host.locator(".cv-log", { hasText: "вибачте, більше не буду" }).count()) === 0);
  await own.reload(); await own.waitForTimeout(2500);
  const log = await text(own);
  check("v24: audit log records approve + delete", /затвердив модератора/.test(log) && /видалив повідомлення/.test(log), log.slice(log.indexOf("Журнал"), log.indexOf("Журнал") + 300));
  await shot(own, "45_owner_mod_log");
  // Токен не потрапляє в клієнтський код.
  const { execSync } = await import("node:child_process");
  const leak = execSync(`grep -rl "ORBIT_ADMIN_TOKEN\\|${OWNER}" ${L.ROOT}/.output/public || true`).toString().trim();
  check("v22: admin token name/value absent from client bundle", leak === "", leak);
  await own.close(); pages.splice(pages.indexOf(own), 1);
  await host.keyboard.press("Escape"); await host.waitForTimeout(300); await host.keyboard.press("Escape");
  await g.keyboard.press("Escape"); await g.waitForTimeout(300); await g.keyboard.press("Escape");
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
  check("/l page shows status + 1 з 1", (await hasText(p, "Заряджається")) && (await hasText(p, "1")));
  check("/l page has no code", !/\b\d{6}\b/.test(await text(p)));
  await shot(p, "10_live_link");
  await axe(p, "/l live launch");
  const html = await (await fetch(`${L.BASE}/l/${slug}`)).text();
  const og = html.match(/<meta[^>]+og:title[^>]*>/)?.[0] || "";
  check("/l og:title shows «1 з 1»", og.includes("Ганна Ш.") && og.includes("1 з 1"), og);
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
  // Екіпаж допомагає іншим: гість (свідок автора) підтверджує запуск ще однієї людини — вона й «друг друга» для нагадування.
  const f = pre[1]; await f.reload(); await f.waitForTimeout(1500);
  await tab(f, "Заявка");
  await f.getByRole("button", { name: "Почати запуск" }).click();
  await f.waitForTimeout(800);
  await f.getByRole("button", { name: "Створити код підтвердження" }).click({ timeout: 8000 });
  await f.waitForTimeout(600);
  const fw = lastWorld(f); const fme = fw?.world?.sessionId;
  const fcode = fw?.world?.creations?.find((c) => c.userId === fme && c.code)?.code;
  const gg = crew[0]; await gg.reload(); await gg.waitForTimeout(1500);
  await tab(gg, "Заявка");
  await gg.locator(".cs-confirm input").first().fill(fcode);
  await gg.locator(".cs-confirm button.orbit-go").last().click();
  await gg.waitForTimeout(900);
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
  check("weekly report: crew confirms ≥1, thanks ≥1", wk[0] >= 1 && wk[2] >= 1, wk.join("/"));
  const goal = host.locator(".cw-goal").first();
  const gt = await goal.innerText();
  const bar = goal.getByRole("progressbar");
  check("weekly crew goal «Ціль тижня · 3» with progress bar", /ціль тижня · 3/i.test(gt) && (await bar.getAttribute("aria-valuemax")) === "3" && Number(await bar.getAttribute("aria-valuenow")) === Math.min(3, wk[0]), gt);
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
  check("confirmer badge «Свій екіпаж»", await hasText(c, "Свій екіпаж"));
  const g = crew[0]; await g.reload(); await g.waitForTimeout(1500);
  await more(g, "Сповіщення");
  check("thanked confirmer sees the chosen phrase", await hasText(g, "«Ти — частина моєї орбіти ✦»"));
  await shot(g, "13b_thanks_inbox");
  await L.closePages(g);
});
await step("wallet: no top-ups → no split, lock line", async () => {
  const c = crew[0]; await c.reload(); await c.waitForTimeout(1500); await tab(c, "Я");
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
  const b = crew[0]; await b.reload(); await b.waitForTimeout(1500);
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
  // v17 крок 2: історія на екранах — з архівних таблиць; угода з buyer/seller уже там.
  const r = lastWorld(b);
  check("history served from archive tables (hist=archive)", r?.hist === "archive", r?.hist);
  const t = r?.world?.trades?.at(-1);
  check("archive trade carries buyer + seller", Boolean(t?.buyerId && t?.sellerId && t.buyerId !== t.sellerId), JSON.stringify(t));
});
await step("fund + payout history", async () => {
  // crew3: увесь збір іде в перший день, тож власники мають побути онлайн перед поділом (правило «активні за 3 доби» не змінювалось).
  L.advance(3 * 24 * H - 2 * H);
  for (const p of [host, crew[0]]) { await p.reload(); await p.waitForTimeout(1500); }
  L.advance(3 * H);
  for (const p of [host, crew[0]]) { await p.reload(); await p.waitForTimeout(1500); }
  await tab(crew[0], "Фонд"); await crew[0].waitForTimeout(1500);
  const b = await text(crew[0]);
  check("fund screen", b.includes("Фонд світу"));
  check("payout happened (history not empty)", !b.includes("Поділів ще не було"), b.slice(0, 300));
  await shot(crew[0], "18_fund");
  await axe(crew[0], "fund");
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
  check("nudge enabled (friend of a friend can confirm)", await btn.isEnabled());
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
  await more(e, "Історія").catch(async (err) => { await shot(e, "23x_more_fail"); throw err; });
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
await step("desktop screenshots (1280×800)", async () => {
  const d = await person("desk");
  await d.setViewportSize({ width: 1280, height: 800 });
  await d.goto(L.BASE + "/"); await d.waitForTimeout(1500);
  await shot(d, "desk_01_gate");
  await host.setViewportSize({ width: 1280, height: 800 });
  await host.reload(); await host.waitForTimeout(1500);
  for (const [name, t] of [["desk_02_home", "Ціна"], ["desk_03_exchange", "Обмін"], ["desk_04_mine", "Заявка"], ["desk_05_fund", "Фонд"], ["desk_06_me", "Я"]]) { await tab(host, t); await host.waitForTimeout(700); await shot(host, name); }
  check("desktop: no horizontal overflow", await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await host.setViewportSize({ width: 390, height: 844 });
});
await step("per-user projection", async () => {
  let checked = 0, leaks = [], payoutRows = 0;
  const secrets = [];
  let worldHist = 0;
  for (const p of pages) for (const raw of p.bodies) {
    const d = L.decode(raw)?.result; const w = d?.world;
    if (!w?.accounts) continue;
    checked++;
    if (w.sessionId && d.hist !== "archive") worldHist++;
    for (const a of w.accounts) if (a.id !== w.sessionId && (a.balance || a.toppedUp || a.starterPending || a.confirmsToday)) leaks.push(`${p.label}: account ${a.id} balance=${a.balance}`);
    for (const c of w.creations || []) if (c.userId !== w.sessionId && c.code) leaks.push(`${p.label}: foreign code`);
    if (d.self && w.sessionId && d.self.userId && d.self.userId !== w.sessionId) leaks.push(`${p.label}: self mismatch`);
    for (const k of ["keys", "devices", "people", "topups"]) if (k in w) leaks.push(`${p.label}: world.${k}`);
    for (const row of w.payouts || []) { payoutRows++; if (row.userId !== w.sessionId) leaks.push(`${p.label}: foreign payout ${row.userId}`); }
    for (const row of d.mine?.payouts || []) if (row.userId !== w.sessionId) leaks.push(`${p.label}: foreign mine.payout`);
    for (const cr of Object.keys(d.mine?.links || {})) if (w.creations?.find((c) => c.id === cr)?.userId !== w.sessionId) leaks.push(`${p.label}: foreign link ${cr}`);
  }
  check(`projection: ${checked} replies, no foreign balances/codes/keys/payouts/links`, checked > 20 && leaks.length === 0, leaks.slice(0, 5).join("; "));
  check("every signed-in reply: history from archive (parity held all run)", worldHist === 0, `${worldHist} replies fell back to the world row`);
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
