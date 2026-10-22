/**
 * Заголовки безпеки — одне джерело для SSR-відповідей (server/middleware/security-headers.ts).
 * Мають збігатися з [[headers]] у netlify.toml (там вони лише для статичних файлів;
 * Netlify не застосовує їх до відповідей функції). Перевіряє scripts/security-headers.test.mjs.
 * 'unsafe-inline' у script-src: SSR вставляє інлайн-скрипти гідрації. https://grok.com — скрипт платформи
 * (grok-app-builder/extensions.js), який підключає шаблон.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://grok.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "object-src 'none'",
].join("; ");

export const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP,
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

/** Returns a Response carrying the security headers (headers already set by a route win). */
/** @param {unknown} response */
export function withSecurityHeaders(response) {
  if (!(response instanceof Response)) return response;
  const apply = (/** @type {Headers} */ h) => { for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!h.has(k)) h.set(k, v); };
  try {
    apply(response.headers);
    return response;
  } catch {
    // immutable headers (e.g. a fetched Response): copy into a new one
    const headers = new Headers(response.headers);
    apply(headers);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}
