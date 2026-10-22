/**
 * Листи через Resend (HTTP API, працює на Cloudflare Workers).
 * Активно лише з RESEND_API_KEY і MAIL_FROM (напр. "Орбіти <code@orbits.network>").
 * Без них mailReady() = false: код на пошту не вимагається, а вхід поштою в UI прихований.
 */
export function mailReady(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.MAIL_FROM?.trim());
}

export async function sendMail(to: string, subject: string, text: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!key || !from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false;
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("mail send failed", res.status);
    return res.ok;
  } catch {
    console.error("mail send failed", "network");
    return false;
  }
}

export function codeMail(code: string, purpose: "confirm" | "login") {
  const what = purpose === "login" ? "вхід в Орбіти" : "підтвердження пошти в Орбітах";
  return {
    subject: `${code} — код Орбіт`,
    text: `Твій код (${what}): ${code}\n\nДіє 15 хвилин. Нікому його не передавай. Якщо це був не ти — просто ігноруй лист.\n\n— Орбіти`,
  };
}
