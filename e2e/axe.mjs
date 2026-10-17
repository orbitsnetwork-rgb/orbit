// Minimal axe-core runner for Playwright pages (no @axe-core/playwright dependency).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const src = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
export default class AxeBuilder {
  constructor(page) { this.page = page; }
  async analyze() {
    await this.page.evaluate(src);
    return this.page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "best-practice"], resultTypes: ["violations"] }));
  }
}
