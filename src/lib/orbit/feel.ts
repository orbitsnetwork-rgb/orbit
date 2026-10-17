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
  // Без жодного дотику браузер блокує вібрацію і пише помилку в консоль (напр. результат заряду після перезавантаження).
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (activation && !activation.hasBeenActive) return;
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

/** Тихий звук (синус, атака 5 мс, спад 180 мс, гучність ≤ 0.04). Лише якщо «Звук» увімкнено. */
export function chime(freqs: number[], gap = 0.08) {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem("orbits-sound") !== "1") return;
  } catch {
    return;
  }
  const Ctx = window.AudioContext;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    freqs.forEach((freq, i) => {
      const at = ctx.currentTime + i * gap;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.035, at + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.19);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.2);
    });
    window.setTimeout(() => void ctx.close(), (freqs.length * gap + 0.4) * 1000);
  } catch {
    /* звук не обов’язковий */
  }
}
