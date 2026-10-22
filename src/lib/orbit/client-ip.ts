/**
 * Аудит H1: справжня IP клієнта лише з заголовка, який ставить САМ хостинг і який клієнт не може підробити.
 * Cloudflare перезаписує cf-connecting-ip; Netlify — x-nf-client-connection-ip. Чужий заголовок (наприклад,
 * x-nf-… на Cloudflare або перший елемент X-Forwarded-For) клієнт може вписати сам, тож ліміти спроб обходились.
 */
export type HeaderGet = (name: string) => string | undefined | null;

export function pickClientIp(get: HeaderGet, host = process.env.ORBIT_HOST?.trim() || (process.env.NETLIFY === "true" ? "netlify" : ""), fallback?: string | null): string {
  const one = (v: string | undefined | null) => (v ?? "").split(",")[0].trim();
  if (host === "cloudflare") return one(get("cf-connecting-ip")) || "unknown";
  if (host === "netlify") return one(get("x-nf-client-connection-ip")) || "unknown";
  // Інший хост (локально, Node): заголовкам платформ не віримо; беремо останній хоп X-Forwarded-For (його додав наш проксі).
  const xff = (get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return xff.at(-1) || one(fallback) || "unknown";
}

export async function requestIp(): Promise<string> {
  const server = await import("@tanstack/react-start/server");
  let socket: string | undefined;
  try {
    socket = server.getRequestIP() ?? undefined;
  } catch {
    socket = undefined;
  }
  return pickClientIp((n) => server.getRequestHeader(n), undefined, socket);
}
