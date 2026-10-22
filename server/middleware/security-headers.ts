/**
 * Security headers on every response of the Nitro function (SSR HTML, /l/ pages, API).
 * netlify.toml [[headers]] only reaches static files, so the HTML had no CSP / X-Frame-Options.
 * Runs after grok-pwa.ts (alphabetical), so the platform PWA head-injection still wraps this response
 * and copies these headers.
 * Audit H3: a fresh CSP nonce per request lives in AsyncLocalStorage; src/router.tsx reads it
 * (router ssr.nonce → every SSR inline script carries it) and the HTML response's CSP names it.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { withSecurityHeaders } from "../../scripts/security-headers.mjs";

type NonceStore = AsyncLocalStorage<{ nonce: string }>;
const g = globalThis as { __orbitNonce__?: NonceStore };
const store: NonceStore = (g.__orbitNonce__ ??= new AsyncLocalStorage<{ nonce: string }>());

function freshNonce() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
}

export default async function securityHeadersMiddleware(
  _event: unknown,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const nonce = freshNonce();
  return withSecurityHeaders(await store.run({ nonce }, () => next()), nonce);
}
