import test from "node:test";
import assert from "node:assert/strict";
import { pickClientIp } from "./client-ip.ts";

const h = (m: Record<string, string>) => (n: string) => m[n];

test("cloudflare: only cf-connecting-ip counts; spoofed netlify/xff headers ignored", () => {
  assert.equal(pickClientIp(h({ "cf-connecting-ip": "1.1.1.1", "x-nf-client-connection-ip": "9.9.9.9", "x-forwarded-for": "8.8.8.8" }), "cloudflare"), "1.1.1.1");
  assert.equal(pickClientIp(h({ "x-nf-client-connection-ip": "9.9.9.9" }), "cloudflare"), "unknown");
});
test("netlify: only x-nf-client-connection-ip", () => {
  assert.equal(pickClientIp(h({ "x-nf-client-connection-ip": "2.2.2.2", "cf-connecting-ip": "6.6.6.6" }), "netlify"), "2.2.2.2");
});
test("other host: last X-Forwarded-For hop, not the client-written first one", () => {
  assert.equal(pickClientIp(h({ "x-forwarded-for": "6.6.6.6, 3.3.3.3" }), ""), "3.3.3.3");
  assert.equal(pickClientIp(h({}), "", "4.4.4.4"), "4.4.4.4");
});
