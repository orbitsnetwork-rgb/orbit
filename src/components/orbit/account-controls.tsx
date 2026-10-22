/** Керування акаунтом у «Безпеці»: пошта, телефон, вийти всюди, видалити акаунт. Кожна дія — з підтвердженням і захистом від подвійного натискання. */
import { useState } from "react";
import { useOrbits } from "@/lib/orbit/store";
import { DELETE_WORD, type AccountOp } from "@/lib/orbit/account";

function useRun() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const run = async (action: AccountOp) => {
    if (busy) return false;
    setBusy(true);
    setMsg(null);
    const r = await useOrbits.getState().account(action);
    setBusy(false);
    setMsg({ text: r.text, ok: r.ok });
    return r.ok;
  };
  return { busy, msg, run };
}

function EditRow({ label, value, type, onSave, busy }: { label: string; value: string; type: "email" | "tel"; onSave: (v: string) => Promise<boolean>; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  if (!open)
    return (
      <div className="se-device">
        <span className="mo-row-text">
          <b>{label}</b>
          <small>{value}</small>
        </span>
        <button type="button" className="orbit-quiet" onClick={() => { setDraft(""); setOpen(true); }} aria-label={`Змінити: ${label}`}>Змінити</button>
      </div>
    );
  return (
    <form
      className="grid gap-2 se-edit"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(draft.trim()).then((ok) => ok && setOpen(false));
      }}
    >
      <label className="grid gap-1.5">
        <span className="orbit-kicker">Нова {label.toLowerCase()}</span>
        <input className="orbit-field" type={type} inputMode={type === "email" ? "email" : "tel"} autoComplete={type === "email" ? "email" : "tel"} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
      </label>
      <div className="se-ask">
        <button type="button" className="orbit-quiet" onClick={() => setOpen(false)} disabled={busy}>Скасувати</button>
        <button type="submit" className="orbit-go" disabled={busy || draft.trim().length < 5}>{busy ? "Зберігаю…" : "Зберегти"}</button>
      </div>
    </form>
  );
}

export function AccountControls() {
  const self = useOrbits((s) => s.self);
  const { busy, msg, run } = useRun();
  const [out, setOut] = useState(false);
  const [del, setDel] = useState(false);
  const [word, setWord] = useState("");
  return (
    <>
      {self ? (
        <section className="mo-group" aria-label="Контакти">
          <p className="mo-group-title">Контакти</p>
          <div className="mo-card">
            <EditRow label="Пошта" value={self.email} type="email" busy={busy} onSave={(email) => run({ op: "email", email })} />
            <EditRow label="Телефон" value={self.phone} type="tel" busy={busy} onSave={(phone) => run({ op: "phone", phone })} />
          </div>
          <p className="orbit-note as-small">Пошта й телефон потрібні, щоб відновити вхід на новому пристрої. Іншим учасникам вони не видні.</p>
        </section>
      ) : null}

      <section className="mo-group" aria-label="Сесії">
        <p className="mo-group-title">Сесії</p>
        {out ? (
          <div className="mo-card se-confirm">
            <p>Усі інші пристрої вийдуть з акаунта. Тут ти лишишся — з новим ключем, який ми одразу покажемо.</p>
            <div className="se-ask">
              <button type="button" className="orbit-quiet" onClick={() => setOut(false)} disabled={busy}>Скасувати</button>
              <button type="button" className="orbit-go" disabled={busy} onClick={() => void run({ op: "logoutAll" }).then(() => setOut(false))}>{busy ? "Виходжу…" : "Так, вийти всюди"}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="orbit-quiet se-left" onClick={() => setOut(true)}>Вийти на всіх інших пристроях</button>
        )}
      </section>

      {msg ? <p className={msg.ok ? "orbit-ok" : "orbit-flash"} role="status">{msg.text}</p> : null}

      <section className="mo-group" aria-label="Видалення акаунта">
        {del ? (
          <div className="mo-card se-confirm se-danger-zone">
            <p><b>Видалити акаунт?</b> Вхід вимкнеться, пошта й телефон зникнуть з профілю. Твоє ім’я лишиться в історії світу. 30 днів ще можна відновити через підтримку.</p>
            <label className="grid gap-1.5">
              <span className="orbit-kicker">Напиши {DELETE_WORD}, щоб підтвердити</span>
              <input className="orbit-field" value={word} autoComplete="off" onChange={(e) => setWord(e.target.value)} />
            </label>
            <div className="se-ask">
              <button type="button" className="orbit-quiet" onClick={() => { setDel(false); setWord(""); }} disabled={busy}>Скасувати</button>
              <button type="button" className="orbit-go se-danger" disabled={busy || word.trim().toUpperCase() !== DELETE_WORD} onClick={() => void run({ op: "delete", confirm: word })}>{busy ? "Видаляю…" : "Видалити назавжди"}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="orbit-quiet se-left se-danger" onClick={() => setDel(true)}>Видалити акаунт…</button>
        )}
      </section>
    </>
  );
}
