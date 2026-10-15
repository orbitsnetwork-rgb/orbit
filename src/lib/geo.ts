import { haversine, placeFixError } from "@/lib/model";

export type Fix = { lat: number; lng: number; accuracy: number; at: number };

export function geoErrorText(code: number) {
  if (code === 1) return "Місце заборонено. Дозволь його в браузері для цього сайту.";
  if (code === 2) return "GPS зараз не бачить тебе. Вийди на відкрите місце.";
  return "GPS ще шукає. Зачекай кілька секунд на вулиці.";
}

export function watchFix(onFix: (fix: Fix) => void, onError: (text: string) => void) {
  if (!navigator.geolocation) {
    onError("Геолокація недоступна в цьому браузері.");
    return () => {};
  }
  let last: Fix | null = null;
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      const next: Fix = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        at: pos.timestamp,
      };
      if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng) || !Number.isFinite(next.accuracy)) return;
      const moved = last ? haversine(last, next) * 1000 : 999;
      if (last && next.accuracy > last.accuracy + 15 && moved < 20) return;
      last = next;
      onFix(next);
    },
    (error) => onError(geoErrorText(error.code)),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

export function awaitFix(ms = 12000) {
  return new Promise<Fix>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Геолокація недоступна в цьому браузері."));
      return;
    }
    let best: Fix | null = null;
    let settled = false;
    const finish = (ok: Fix | null, error?: string) => {
      if (settled) return;
      settled = true;
      stop();
      window.clearTimeout(timer);
      if (ok && !placeFixError(ok.accuracy)) resolve(ok);
      else reject(new Error(error || (ok ? placeFixError(ok.accuracy) : "GPS не встиг. Вийди на відкрите місце.")));
    };
    const stop = watchFix(
      (fix) => {
        if (!best || fix.accuracy < best.accuracy) best = fix;
        if (!placeFixError(fix.accuracy)) finish(fix);
      },
      (text) => {
        if (!best) finish(null, text);
      },
    );
    const timer = window.setTimeout(() => finish(best), ms);
  });
}