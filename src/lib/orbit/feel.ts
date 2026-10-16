/**
 * Тактильність і рух. Вібрація — лише там, де браузер її вміє (Android Chrome);
 * iOS Safari `navigator.vibrate` не має, тож мовчки пропускаємо.
 * Нічого тут не змінює дані чи правила — тільки відчуття.
 */
export const VIBRATE = "orbits-vibrate";

export function vibrateOn() {
  try {
    return localStorage.getItem(VIBRATE) !== "0";
  } catch {
    return true;
  }
}

export function buzz(pattern: number | number[]) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (!vibrateOn()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* браузер відмовив — не страшно */
  }
}

export function reducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Скопіювати текст. Повертає false, якщо буфер недоступний (http, старий браузер, відмова). */
export async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* спробуємо старий спосіб */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Нативне меню «Поділитися», якщо воно є. */
export function canShare(data?: ShareData) {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (data && typeof navigator.canShare === "function") {
    try {
      return navigator.canShare(data);
    } catch {
      return false;
    }
  }
  return true;
}

/** true — поділились; false — людина закрила меню; null — меню немає або помилка. */
export async function shareSheet(data: ShareData): Promise<boolean | null> {
  if (!canShare(data)) return null;
  try {
    await navigator.share(data);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return false;
    return null;
  }
}

/** Зберегти текст файлом на пристрій. */
export function saveTextFile(name: string, text: string) {
  const blob = new Blob(["\uFEFF", text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
