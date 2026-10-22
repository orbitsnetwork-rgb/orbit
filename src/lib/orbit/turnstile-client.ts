/** Клієнт Turnstile: невидимий віджет, токен лише для реєстрації/входу. Без ключа на сервері — нічого не робить. */
import { turnstileConfig } from "@/lib/orbit/remote";

type TS = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window { turnstile?: TS }
}

let siteKey: Promise<string | null> | null = null;
let script: Promise<void> | null = null;

function loadScript(): Promise<void> {
  script ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { script = null; reject(new Error("turnstile script")); };
    document.head.appendChild(s);
  });
  return script;
}

/** Токен або null (вимкнено / не вдалося — тоді сервер сам відповість зрозумілою помилкою). */
export async function turnstileToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  siteKey ??= turnstileConfig().then((r) => r.siteKey).catch(() => { siteKey = null; return null; });
  const key = await siteKey;
  if (!key) return null;
  try {
    await loadScript();
    const ts = window.turnstile;
    if (!ts) return null;
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.bottom = "0";
    host.style.right = "0";
    host.style.zIndex = "2147483647";
    document.body.appendChild(host);
    return await new Promise<string | null>((resolve) => {
      let id = "";
      const done = (v: string | null) => {
        clearTimeout(timer);
        try { if (id) ts.remove(id); } catch { /* ignore */ }
        host.remove();
        resolve(v);
      };
      const timer = setTimeout(() => done(null), 20000);
      id = ts.render(host, {
        sitekey: key,
        action: "auth",
        appearance: "interaction-only",
        callback: (t: string) => done(t),
        "error-callback": () => done(null),
        "expired-callback": () => done(null),
      });
    });
  } catch {
    return null;
  }
}
