import { useState } from "react";
import { keepPerson, openPerson, confirmCredential } from "@/lib/account";
import { offerKey } from "@/components/key-once";
import { deviceId } from "@/lib/device";
import { useAtlas } from "@/lib/store";
import { fieldClass } from "@/components/ui";

export function Register({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const setProfile = useAtlas((state) => state.setProfile);
  const [mode, setMode] = useState<"new" | "key">("new");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    const who = name.trim();
    if (who.length < 2) {
      setError("Ім’я має бути хоча б із двох літер.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await keepPerson({ data: { name: who, city: city.trim() } });
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      if (!saved.key) {
        setError("Ключ не вийшов. Спробуй ще раз.");
        return;
      }
      setProfile({ name: who, city: city.trim(), key: saved.key, recovery: saved.recovery });
      offerKey(saved.key, saved.recovery);
      onDone();
    } catch {
      setError("Запис не дійшов. Перевір мережу і спробуй ще.");
    } finally {
      setBusy(false);
    }
  }

  async function enter() {
    const code = key.trim().toUpperCase().replace(/\s+/g, "");
    if (!code) {
      setError("Встав ключ.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const found = await openPerson({ data: { key: code, device: deviceId() } });
      if (!found.ok) {
        setError(found.error);
        return;
      }
      if (found.next) {
        const confirmed = await confirmCredential({ data: { key: found.next, device: deviceId() } });
        if (!confirmed.ok) {
          setError(confirmed.error);
          return;
        }
        setProfile({ name: found.name, city: found.city, key: found.next });
      } else {
        setProfile({ name: found.name, city: found.city, key: code });
      }
      onDone();
    } catch {
      setError("Ключ зараз не перевірився.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          void (mode === "new" ? create() : enter());
        }}
      >
        {mode === "new" ? (
          <>
            <h1 className="text-h1 text-white">Завести ключ</h1>
            <p className="text-sm leading-6 text-white/80">Ім’я — підпис. Ключ — це ти на іншому телефоні. Покажемо один раз.</p>
            <label className="grid gap-1 text-sm text-white/70">
              Ім’я
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="nickname" maxLength={40} className={`${fieldClass} h-11`} />
            </label>
            <label className="grid gap-1 text-sm text-white/70">
              Місто
              <input value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" maxLength={40} placeholder="Можна лишити порожнім" className={`${fieldClass} h-11`} />
            </label>
          </>
        ) : (
          <>
            <h1 className="text-h1 text-white">Вже є ключ</h1>
            <p className="text-sm leading-6 text-white/80">Встав ключ з того телефона. Ім’я підтягнеться само.</p>
            <label className="grid gap-1 text-sm text-white/70">
              Ключ
              <input value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} className={`${fieldClass} h-11`} />
            </label>
          </>
        )}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button type="submit" disabled={busy} className="btn-press h-11 rounded-full bg-accent text-sm font-medium text-bg disabled:opacity-60">
          {busy ? "Записую…" : mode === "new" ? "Завести ключ" : "Увійти"}
        </button>
        <button
          type="button"
          className="h-11 rounded-full text-sm text-white/75"
          onClick={() => {
            setError("");
            if (mode === "key") setMode("new");
            else onBack();
          }}
        >
          {mode === "key" ? "Назад до нового ключа" : "Назад"}
        </button>
        {mode === "new" ? (
          <button type="button" className="h-11 text-sm text-white/80" onClick={() => { setError(""); setMode("key"); }}>
            У мене вже є ключ
          </button>
        ) : null}
      </form>
  );
}
