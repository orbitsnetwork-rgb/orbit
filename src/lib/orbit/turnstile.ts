/**
 * Cloudflare Turnstile: захист реєстрації та входу від ботів.
 * Вмикається лише коли на сервері задано TURNSTILE_SECRET_KEY (і TURNSTILE_SITE_KEY для клієнта).
 * Без ключів (тести, локальна PGlite, Netlify) перевірка пропускається.
 */
export const TURNSTILE_ACTIONS = new Set(["register", "enter", "enterMail"]);
export const TURNSTILE_FAIL = "Перевірка браузера не пройшла. Онови сторінку й спробуй ще раз.";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function clipTurnstile(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 2048 ? value : null;
}

export function turnstileSecret(): string | null {
  const v = typeof process !== "undefined" ? process.env.TURNSTILE_SECRET_KEY?.trim() : "";
  return v ? v : null;
}

export function turnstileSiteKey(): string | null {
  const v = typeof process !== "undefined" ? process.env.TURNSTILE_SITE_KEY?.trim() : "";
  return v ? v : null;
}

/** true — пропускаємо; false — відмова. Мережеві збої Cloudflare = відмова (fail closed), але з тайм-аутом. */
export async function verifyTurnstile(
  token: string | null,
  ip: string | null,
  secret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip && ip !== "unknown") body.append("remoteip", ip);
  try {
    const res = await fetchImpl(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const out = (await res.json()) as { success?: boolean };
    return out.success === true;
  } catch {
    return false;
  }
}
