// Node 20 has no --experimental-strip-types: transpile .ts test files with the project's TypeScript (types only stripped).
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import ts from "typescript";
const SRC = new URL("../src/", import.meta.url);
export async function resolve(spec, ctx, next) {
  // Vite-style `?raw` (SQL schemas): resolve the file next to the importer and hand back its text in load().
  if (spec.endsWith("?raw") && ctx.parentURL) return { url: new URL(spec, ctx.parentURL).href, shortCircuit: true };
  if (spec.startsWith("@/")) {
    const base = new URL(spec.slice(2), SRC);
    for (const ext of ["", ".ts", ".tsx", "/index.ts"]) {
      const u = new URL(base.href + ext);
      if (existsSync(fileURLToPath(u)) && !fileURLToPath(u).endsWith("/")) return { url: u.href, shortCircuit: true };
    }
  }
  if ((spec.startsWith("./") || spec.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(spec) && ctx.parentURL?.endsWith(".ts")) {
    const u = new URL(spec + ".ts", ctx.parentURL);
    if (existsSync(fileURLToPath(u))) return { url: u.href, shortCircuit: true };
  }
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (url.endsWith("?raw")) {
    const text = await readFile(fileURLToPath(url.slice(0, -4)), "utf8");
    return { format: "module", source: `export default ${JSON.stringify(text)};`, shortCircuit: true };
  }
  if (!url.endsWith(".ts") && !url.endsWith(".tsx")) return next(url, ctx);
  const src = await readFile(fileURLToPath(url), "utf8");
  const out = ts.transpileModule(src, { fileName: fileURLToPath(url), compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false, allowImportingTsExtensions: true, rewriteRelativeImportExtensions: false } });
  return { format: "module", source: out.outputText, shortCircuit: true };
}
