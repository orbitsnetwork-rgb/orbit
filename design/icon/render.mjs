import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const [,, src, out, size, pad, round] = process.argv;
const svg = readFileSync(src, "utf8");
const S = Number(size), P = Number(pad || 0), R = round === "1";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }); const pg = await b.newPage({ viewport: { width: S, height: S } });
await pg.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${S}px;height:${S}px;${R ? `border-radius:${S*0.22}px;overflow:hidden;` : ""}${P ? `padding:${P}px;box-sizing:border-box;background:#05060f` : ""}">${svg.replace("<svg ", `<svg width="${S - 2*P}" height="${S - 2*P}" `)}</div></body></html>`);
writeFileSync(out, await pg.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: S, height: S } }));
await b.close();
