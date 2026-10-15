import { useAtlas } from "@/lib/store";

const ACK = "vosma-key-ack";

export function offerKey(key: string, recovery?: string) {
  sessionStorage.setItem("vosma-key-fresh", key);
  if (recovery) sessionStorage.setItem("vosma-recovery-once", recovery);
  window.dispatchEvent(new Event("vosma-key"));
}

export function freshKey() {
  const key = sessionStorage.getItem("vosma-key-fresh") ?? "";
  const recovery = sessionStorage.getItem("vosma-recovery-once") ?? "";
  return key ? { key, recovery } : null;
}

export function keyAcked() {
  try {
    return localStorage.getItem(ACK) === "1";
  } catch {
    return false;
  }
}

export function revealKeyOnce() {
  if (keyAcked()) return;
  const profile = useAtlas.getState().profile;
  if (!profile.key) return;
  offerKey(profile.key, profile.recovery ?? "");
}

export function KeyOnce({ secret, recovery, onDone }: { secret: string; recovery: string; onDone: () => void }) {
  function finish() {
    try {
      localStorage.setItem(ACK, "1");
    } catch {
      /* приватний режим */
    }
    sessionStorage.removeItem("vosma-key-fresh");
    sessionStorage.removeItem("vosma-recovery-once");
    onDone();
  }

  return (
    <div className="key-once">
      <p className="key-once-note">Ключ впускає на інший телефон. Код реєстрації потрібен, якщо ключ загубиш. Код показується один раз. Якщо немає обох — повернути не можна.</p>
      <p className="key-once-code">{recovery || secret}</p>
      {recovery ? <p className="key-once-sub">{secret}</p> : null}
      <button type="button" className="chalk-pill" onClick={finish}>Я записав</button>
    </div>
  );
}
