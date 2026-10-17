/**
 * Security headers on every response of the Nitro function (SSR HTML, /l/ pages, API).
 * netlify.toml [[headers]] only reaches static files, so the HTML had no CSP / X-Frame-Options.
 * Runs after grok-pwa.ts (alphabetical), so the platform PWA head-injection still wraps this response
 * and copies these headers.
 */
// @ts-expect-error JS module shared with the test
import { withSecurityHeaders } from "../../scripts/security-headers.mjs";

export default async function securityHeadersMiddleware(
  _event: unknown,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  return withSecurityHeaders(await next());
}
