/** 16: встановлення як застосунок і офлайн-оболонка (sw.js). Без web push-ключів. */
import { useEffect, useState } from "react";

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: Prompt | null = null;
const listeners = new Set<() => void>();
let wired = false;

export function registerShell() {
  if (typeof window === "undefined" || wired) return;
  wired = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as Prompt;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
  // У розробці SW не реєструємо (щоб не заважати перезавантаженню модулів), крім явного прапорця для тестів.
  let flag = false;
  try {
    flag = localStorage.getItem("orbit-sw") === "1";
  } catch {}
  if (!("serviceWorker" in navigator) || (!import.meta.env.PROD && !flag)) return;
  const go = () => navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}

export function standalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** Чи можна показати кнопку «Встановити» і сама дія. */
export function useInstall() {
  const [can, setCan] = useState(false);
  useEffect(() => {
    const sync = () => setCan(Boolean(deferred) && !standalone());
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  const install = async () => {
    if (!deferred) return false;
    const prompt = deferred;
    deferred = null;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => ({ outcome: "dismissed" }));
    listeners.forEach((fn) => fn());
    return choice.outcome === "accepted";
  };
  return { can, install };
}
