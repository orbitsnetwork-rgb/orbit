import { getRequest, getRequestIP } from "@tanstack/react-start/server";
import { resolveClientIp } from "@/lib/credential";

export function entryMarks() {
  const trusted = (process.env.TRUSTED_PROXY_IPS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  try {
    const request = getRequest();
    const peer = getRequestIP() || "local";
    return {
      ip: resolveClientIp({
        forwarded: request?.headers.get("x-forwarded-for") ?? null,
        peer,
        trusted,
      }).slice(0, 80),
    };
  } catch {
    return { ip: "local" };
  }
}
