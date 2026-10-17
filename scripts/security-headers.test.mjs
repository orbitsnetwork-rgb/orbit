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
