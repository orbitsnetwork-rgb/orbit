import { useEffect, useState } from "react";
import { ownerAct, ownerView, type OwnerView } from "@/lib/orbit/owner";

/**
 * Перевірка власником. Токен вводиться вручну й живе лише в цій вкладці (sessionStorage), у коді додатка його немає.
 * Жодна дія тут не змінює ✦ чи орбіти.
 */
const KEY = "orbits-owner-token";
const when = (at: number) => new Date(at).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function OwnerPage() {
  const [token, setToken] = useState("");
  const [view, setView] = useState<OwnerView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(t = token) {
    setBusy(true);
    setError("");
    try {
      const out = await ownerView({ data: { token: t } });
      if (out.ok) { setView(out); try { sessionStorage.setItem(KEY, t); } catch { /* приватний режим */ } }
      else { setView(null); setError(out.error ?? "Немає доступу."); try { sessionStorage.removeItem(KEY); } catch { /* */ } }
    } catch { setError("Сервер не відповідає."); }
    setBusy(false);
  }
  useEffect(() => {
    let t = "";
    try { t = sessionStorage.getItem(KEY) ?? ""; } catch { /* */ }
    if (t) { setToken(t); void load(t); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function act(op: "restore" | "delete" | "roleSeen" | "botSeen" | "unmute", extra: { id?: number; userId?: string; role?: string }) {
    if (op === "delete" && !window.confirm("Видалити повідомлення назавжди?")) return;
    const out = await ownerAct({ data: { token, op, ...extra } }).catch(() => ({ ok: false, error: "Сервер не відповідає." }));
    if (!out.ok) setError(out.error ?? "Не вдалося.");
    await load();
  }
  function out() {
    try { sessionStorage.removeItem(KEY); } catch { /* */ }
    setToken("");
    setView(null);
  }
  return (
    <main className="ow-page">
      <h1 className="orbit-h">Перевірка власника</h1>
      <p className="orbit-note">Тут нічого не змінює ✦ чи орбіти: лише видимість повідомлень і позначки «переглянуто». Ролі видаються вручну.</p>
      {!view ? (
        <form className="ow-login" onSubmit={(e) => { e.preventDefault(); void load(); }}>
          <label htmlFor="ow-token">Токен власника</label>
          <input id="ow-token" className="orbit-field" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          <button type="submit" className="orbit-go" disabled={busy || token.trim().length < 8}>{busy ? "Перевіряю…" : "Увійти"}</button>
        </form>
      ) : (
        <>
          <div className="ow-bar">
            <button type="button" className="orbit-chip" onClick={() => void load()} disabled={busy}>{busy ? "Оновлюю…" : "Оновити"}</button>
            <button type="button" className="orbit-chip" onClick={out}>Вийти</button>
          </div>
          <p className="orbit-note">Автовидалення старих повідомлень: {view.keepDays ? `через ${view.keepDays} дн.` : "вимкнено (рішення власника)"}.</p>
          <section aria-labelledby="ow-h1" className="ow-sec">
            <h2 id="ow-h1">Сховані скаргами ({view.hidden.length})</h2>
            {view.hidden.length === 0 ? <p className="orbit-note">Порожньо.</p> : null}
            {view.hidden.map((m) => (
              <article key={m.id} className="ow-row" data-msg={m.id}>
                <p><b>{m.name}</b> · {m.room === "world" ? "Світ" : "кімната запуску"} · {when(m.at)} · скарг: {m.reports}</p>
                <p className="ow-text">{m.text}</p>
                <div className="ow-acts">
                  <button type="button" className="orbit-chip" onClick={() => void act("restore", { id: m.id })}>Повернути</button>
                  <button type="button" className="orbit-chip ow-danger" onClick={() => void act("delete", { id: m.id })}>Видалити</button>
                </div>
              </article>
            ))}
          </section>
          <section aria-labelledby="ow-h2" className="ow-sec">
            <h2 id="ow-h2">Заявки на роль ({view.roles.length})</h2>
            {view.roles.length === 0 ? <p className="orbit-note">Порожньо.</p> : null}
            {view.roles.map((r) => (
              <article key={r.userId + r.role} className="ow-row">
                <p><b>{r.name}</b> · {r.role === "admin" ? "адмін" : "підтверджувач"} · {when(r.at)}</p>
                <p className="ow-text">{r.why}</p>
                <div className="ow-acts"><button type="button" className="orbit-chip" onClick={() => void act("roleSeen", { userId: r.userId, role: r.role })}>Переглянуто</button></div>
              </article>
            ))}
          </section>
          <section aria-labelledby="ow-h3" className="ow-sec">
            <h2 id="ow-h3">Схоже на бота ({view.bots.length})</h2>
            <p className="orbit-note">Лише сигнал. Нічого не забирається.</p>
            {view.bots.map((b) => (
              <article key={b.userId} className="ow-row">
                <p><b>{b.name}</b> · {b.reason === "closed-loop" ? "замкнене коло підтверджень" : b.reason === "even-fast-clicks" ? "рівні швидкі дотики" : b.reason} · разів: {b.hits} · {when(b.lastAt)}</p>
                <div className="ow-acts"><button type="button" className="orbit-chip" onClick={() => void act("botSeen", { userId: b.userId })}>Переглянуто</button></div>
              </article>
            ))}
          </section>
          <section aria-labelledby="ow-h4" className="ow-sec">
            <h2 id="ow-h4">Пауза в чаті ({view.mutes.length})</h2>
            {view.mutes.map((m) => (
              <article key={m.userId} className="ow-row">
                <p><b>{m.name}</b> · до {when(m.until)} · схованих: {m.hiddenN}</p>
                <div className="ow-acts"><button type="button" className="orbit-chip" onClick={() => void act("unmute", { userId: m.userId })}>Зняти паузу</button></div>
              </article>
            ))}
          </section>
        </>
      )}
      {error ? <p className="orbit-note" role="alert">{error}</p> : null}
    </main>
  );
}
