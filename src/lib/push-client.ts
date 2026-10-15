import { pushPublic, savePush } from "@/lib/push";

function keyBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function enablePush(personKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!personKey) return { ok: false, error: "Спочатку заведи ключ." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
    return { ok: false, error: "Цей браузер не вміє сповіщення. На iPhone додай 8 на екран «Додому»." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: "Сповіщення лишились вимкнені в браузері." };
  const ready = await navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready);
  const issued = await pushPublic({ data: {} });
  if (!issued.ok) return issued;
  const subscription = await ready.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(issued.publicKey),
  });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return { ok: false, error: "Підписка не вийшла." };
  return savePush({
    data: { personKey, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
}
