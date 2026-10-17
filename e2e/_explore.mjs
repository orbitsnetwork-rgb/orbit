import * as L from "./lib.mjs";
await L.launch();
const p = await L.newPerson("a");
const dump = async (t) => { console.log("=== "+t); console.log((await L.text(p)).slice(0,2500)); console.log("BTN:", (await p.locator("button,a,[role=tab]").allInnerTexts()).map(s=>s.trim().replace(/\s+/g," ")).filter(Boolean).join(" | ")); };
const r = await L.register(p, "Олена"); console.log(r);
await L.passKey(p); await p.waitForTimeout(1500); await dump("after key");
await L.shot(p,"x_onb");
const steps = process.argv.slice(2);
for (const s of steps) { try { await p.getByRole("button",{name:s}).or(p.getByRole("tab",{name:s})).or(p.getByRole("link",{name:s})).last().click({timeout:5000}); } catch(e){console.log("noclick",s)} await p.waitForTimeout(1200); await dump(s); }
console.log("ERR", p.errors);
await L.closeBrowser();
