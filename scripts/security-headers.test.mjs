import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SECURITY_HEADERS, withSecurityHeaders } from "./security-headers.mjs";

test("netlify.toml static headers match the SSR headers", () => {
  const toml = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    assert.ok(toml.includes(`${k} = "${v}"`), `netlify.toml missing or different: ${k}`);
  }
});

test("adds headers, keeps a route's own value, handles immutable headers", async () => {
  const r = withSecurityHeaders(new Response("x", { headers: { "content-type": "text/html", "X-Frame-Options": "SAMEORIGIN" } }));
  assert.equal(r.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const frozen = await fetch("data:text/plain,hi");
  const r2 = withSecurityHeaders(frozen);
  assert.equal(r2.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(await r2.text(), "hi");
  assert.equal(withSecurityHeaders("plain"), "plain");
});

test("H3: no grok.com; HTML gets a per-request nonce, other responses the static CSP", async () => {
  const { CSP, cspWithNonce } = await import("./security-headers.mjs");
  assert.ok(!CSP.includes("grok.com"));
  const n = "abcdefghijklmnopqrstuvwx";
  assert.match(cspWithNonce(n), /script-src 'self' 'nonce-abcdefghijklmnopqrstuvwx' 'unsafe-inline'/);
  assert.equal(cspWithNonce("bad nonce'"), CSP);
  const html = withSecurityHeaders(new Response("<p>", { headers: { "content-type": "text/html" } }), n);
  assert.match(html.headers.get("content-security-policy"), /nonce-abcdefghijklmnopqrstuvwx/);
  const json = withSecurityHeaders(Response.json({}), n);
  assert.ok(!json.headers.get("content-security-policy").includes("nonce-"));
});
