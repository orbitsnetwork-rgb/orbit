// OG-картка 1200×630 з новою іконкою. Запуск: node design/icon/og.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const icon = readFileSync(new URL("./orbit-icon.svg", import.meta.url), "utf8").replace("<svg ", '<svg width="300" height="300" ');
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const pg = await b.newPage({ viewport: { width: 1200, height: 630 } });
await pg.setContent(`<html><body style="margin:0;width:1200px;height:630px;display:flex;align-items:center;gap:64px;padding:0 96px;box-sizing:border-box;font-family:Manrope,system-ui,sans-serif;color:#f2f1ec;background:radial-gradient(ellipse at 20% 20%,#2a2370 0%,#121338 45%,#05060f 100%)">
<div style="flex:none;border-radius:66px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.55)">${icon}</div>
<div><div style="font-size:112px;font-weight:800;letter-spacing:.08em;line-height:1">ORBIT</div>
<div style="margin-top:22px;font-size:38px;line-height:1.3;color:#d5deea">Вісім мільйонів рівних орбіт.<br>Одна ціна. Запускаємо разом.</div>
<div style="margin-top:26px;font-size:26px;color:#8ff0ff">Іскра ✦ — внутрішня одиниця світу</div></div></body></html>`);
await pg.screenshot({ path: new URL("../../public/og.jpg", import.meta.url).pathname, type: "jpeg", quality: 88 });
await b.close();
