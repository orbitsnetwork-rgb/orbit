/**
 * Заголовки безпеки — одне джерело для SSR-відповідей (server/middleware/security-headers.ts).
 * Мають збігатися з [[headers]] у netlify.toml (там вони лише для статичних файлів;
 * Netlify не застосовує їх до відповідей функції). Перевіряє scripts/security-headers.test.mjs.
 * script-src: для HTML від SSR middleware додає одноразовий nonce (аудит H3) — тоді сучасні браузери ігнорують
 * 'unsafe-inline' (лишається лише як запасний варіант для дуже старих). https://grok.com прибрано: скрипт платформи
 * на живому сайті вимкнено (VITE_GROK_EXTENSIONS=0).
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://accounts.google.com https://apis.google.com https://www.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' https://challenges.cloudflare.com https://accounts.google.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com",
  "frame-src https://challenges.cloudflare.com https://accounts.google.com https://www.google.com https://*.firebaseapp.com",
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
/** CSP з nonce: у script-src перед 'unsafe-inline' додається 'nonce-…'. */
/** @param {string} nonce */
export function cspWithNonce(nonce) {
  if (!/^[A-Za-z0-9+/=_-]{16,64}$/.test(nonce)) return CSP;
  return CSP.replace("script-src 'self' 'unsafe-inline'", `script-src 'self' 'nonce-${nonce}' 'unsafe-inline'`);
}

/** @param {unknown} response @param {string} [nonce] */
export function withSecurityHeaders(response, nonce) {
  if (!(response instanceof Response)) return response;
  const html = Boolean(nonce) && (response.headers.get("content-type") ?? "").includes("text/html");
  const values = html ? { ...SECURITY_HEADERS, "Content-Security-Policy": cspWithNonce(/** @type {string} */ (nonce)) } : SECURITY_HEADERS;
  const apply = (/** @type {Headers} */ h) => { for (const [k, v] of Object.entries(values)) if (!h.has(k)) h.set(k, v); };
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
