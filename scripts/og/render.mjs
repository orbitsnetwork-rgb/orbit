// Рендер статичного прев’ю запуску: node scripts/og/render.mjs (потрібен Chrome). Результат — public/og-launch.png.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const html = fileURLToPath(new URL("./launch.html", import.meta.url));
const out = fileURLToPath(new URL("../../public/og-launch.png", import.meta.url));
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox", "--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`file://${html}`); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200);
await page.screenshot({ path: out }); await browser.close(); console.log("wrote", out);
