import { Check, Copy, Eye, EyeOff, KeyRound, LogOut, ShieldCheck, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Page } from "@/components/orbit/more";
import { SUPPORT_MAIL } from "@/lib/orbit/docs";
import type { Account, World } from "@/lib/orbit/engine";
import { deviceKeys, useOrbits } from "@/lib/orbit/store";
import { useLeave } from "@/components/orbit/key";

const SAVED = (id: string) => `orbits-keysaved-${id}`;

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function deviceId() {
  try {
    return localStorage.getItem("orbits-device") ?? "";
  } catch {
    return "";
  }
}

/** Забути ключ іншого акаунта лише на цьому телефоні. Сервер не змінюється. */
function forget(id: string) {
  try {
    const keys = JSON.parse(localStorage.getItem("orbits-keys") || "{}") as Record<string, string>;
    delete keys[id];
    localStorage.setItem("orbits-keys", JSON.stringify(keys));
  } catch {
    /* приватний режим */
  }
}

function hideMail(mail: string) {
  const [name, host] = mail.split("@");
  if (!host) return mail;
  return `${name.slice(0, 1)}•••@${host}`;
}

function mask(key: string) {
  return key.replace(/[A-Z0-9]/g, "•");
}

const SOON = [
  { title: "Вхід з кодом (2FA)", text: "Другий крок після ключа" },
  { title: "PIN або відбиток", text: "Блокування додатка на телефоні" },
  { title: "Вийти на всіх пристроях", text: "Потрібна дія на сервері" },
  { title: "Заблокувати акаунт", text: "Якщо телефон украли" },
  { title: "Антифішинговий код", text: "Твоє слово в кожному нашому листі" },
];

export function Security({ world, user, onBack, onClose }: { world: World; user: Account; onBack: () => void; onClose?: () => void }) {
  const self = useOrbits((state) => state.self);
  const [held, setHeld] = useState<Record<string, string>>({});
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [device, setDevice] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const leave = useLeave(user.id, user.name);
  useEffect(() => {
    setHeld(deviceKeys());
    setSaved(readFlag(SAVED(user.id)));
    setDevice(deviceId());
  }, [user.id]);
  const key = held[user.id];
  const local = world.accounts.filter((account) => held[account.id]);
  const checks = [
    { ok: Boolean(self?.confirmed), title: "Пошта підтверджена", hint: self?.confirmed ? hideMail(self.email) : "Код на пошті — на вкладці «Ціна»" },
    { ok: Boolean(key), title: "Ключ на цьому телефоні", hint: key ? "Вхід без пошти" : "Увійди ключем, щоб зберегти" },
    { ok: saved, title: "Ключ записано окремо", hint: saved ? "Позначено тобою" : "Не лише в телефоні" },
    { ok: false, title: "Вхід з кодом (2FA)", hint: "У розробці", soon: true },
  ];
  const score = checks.filter((row) => row.ok).length;
  const level = score >= 3 ? "Добрий" : score === 2 ? "Середній" : "Низький";

  return (
    <Page title="Безпека" kicker="Акаунт і пристрій" onBack={onBack} onClose={onClose}>
      <section className="se-score" data-level={score >= 3 ? "good" : score === 2 ? "mid" : "low"} aria-label="Рівень захисту">
        <ShieldCheck size={28} strokeWidth={1.4} aria-hidden />
        <div>
          <small>Рівень захисту</small>
          <b>{level}</b>
        </div>
        <span className="se-count">{score} / {checks.length}</span>
      </section>
      <div className="mo-card">
        {checks.map((row) => (
          <div key={row.title} className="se-check" data-ok={row.ok ? "1" : "0"} data-soon={row.soon ? "1" : "0"}>
            <span className="se-mark" aria-hidden>{row.ok ? <Check size={14} strokeWidth={2.4} /> : row.soon ? "…" : <X size={14} strokeWidth={2.4} />}</span>
            <span className="mo-row-text">
              <b>{row.title}</b>
              <small>{row.hint}</small>
            </span>
            <span className="visually-hidden">{row.ok ? "Готово" : row.soon ? "У розробці" : "Не зроблено"}</span>
          </div>
        ))}
      </div>

      <section className="mo-group" aria-label="Ключ входу">
        <p className="mo-group-title">Ключ входу</p>
        {key ? (
          <div className="se-key">
            <div className="se-key-line">
              <KeyRound size={17} strokeWidth={1.6} aria-hidden />
              <code aria-label={show ? `Ключ ${key}` : "Ключ приховано"}>{show ? key : mask(key)}</code>
              <button type="button" className="mo-icon" onClick={() => setShow((value) => !value)} aria-pressed={show} aria-label={show ? "Сховати ключ" : "Показати ключ"}>
                {show ? <EyeOff size={16} strokeWidth={1.6} /> : <Eye size={16} strokeWidth={1.6} />}
              </button>
              <button
                type="button"
                className="mo-icon"
                aria-label="Копіювати ключ"
                onClick={() => {
                  void navigator.clipboard?.writeText(key).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  });
                }}
              >
                {copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={1.6} />}
              </button>
            </div>
            <p className="orbit-note as-small" role="status">{copied ? "Скопійовано. Не надсилай ключ нікому." : "Ми ніколи не просимо ключ у листах чи повідомленнях."}</p>
            <label className="se-tick">
              <input
                type="checkbox"
                checked={saved}
                onChange={(event) => {
                  setSaved(event.target.checked);
                  try {
                    localStorage.setItem(SAVED(user.id), event.target.checked ? "1" : "0");
                  } catch {
                    /* приватний режим */
                  }
                }}
              />
              <span>Я записав ключ окремо від телефону</span>
            </label>
          </div>
        ) : (
          <p className="orbit-empty">Ключа немає на цьому телефоні. Увійди ним ще раз або напиши нам з пошти акаунта.</p>
        )}
        <button
          type="button"
          className="orbit-quiet se-left"
          onClick={() => {
            window.location.href = `mailto:${SUPPORT_MAIL}?subject=${encodeURIComponent("Відновити ключ")}`;
          }}
        >
          Загубив ключ? Напиши нам
        </button>
      </section>

      <section className="mo-group" aria-label="Пристрої">
        <p className="mo-group-title">Цей пристрій</p>
        <div className="mo-card">
          <div className="se-device">
            <span className="mo-row-ico" aria-hidden><Smartphone size={18} strokeWidth={1.5} /></span>
            <span className="mo-row-text">
              <b>Цей телефон <em className="se-this">зараз</em></b>
              <small>{device ? `Код пристрою ${device}` : "Код пристрою ще не створено"}</small>
            </span>
          </div>
          {local.map((account) => (
            <div key={account.id} className="se-device">
              <span className="mo-row-ico se-face" aria-hidden>{account.name.slice(0, 1).toUpperCase()}</span>
              <span className="mo-row-text">
                <b>{account.name}{account.id === user.id ? " · ти" : ""}</b>
                <small>Ключ збережено на цьому телефоні</small>
              </span>
              {account.id !== user.id ? (
                asking === account.id ? (
                  <span className="se-ask">
                    <button type="button" className="orbit-chip fe-mini" onClick={() => setAsking(null)}>Ні</button>
                    <button
                      type="button"
                      className="orbit-chip fe-mini se-danger"
                      onClick={() => {
                        forget(account.id);
                        setHeld(deviceKeys());
                        setAsking(null);
                      }}
                    >
                      Забути
                    </button>
                  </span>
                ) : (
                  <button type="button" className="orbit-quiet" onClick={() => setAsking(account.id)} aria-label={`Забути ${account.name} на цьому телефоні`}>Забути</button>
                )
              ) : null}
            </div>
          ))}
        </div>
        <p className="orbit-note as-small">«Забути» прибирає ключ лише з цього телефону. Без ключа зайти в той акаунт тут уже не вийде.</p>
      </section>

      <button type="button" className="se-out" onClick={leave.ask}>
        <LogOut size={17} strokeWidth={1.6} aria-hidden /> Вийти на цьому телефоні
      </button>
      {leave.sheet}

      <section className="ex-soon" aria-label="Скоро">
        <p className="orbit-kicker">Скоро · без дат</p>
        {SOON.map((item) => (
          <div key={item.title} className="ex-soon-row">
            <div>
              <b>{item.title}</b>
              <p className="orbit-note">{item.text}</p>
            </div>
            <button type="button" className="ex-soon-btn" disabled aria-disabled="true">У розробці</button>
          </div>
        ))}
      </section>
    </Page>
  );
}
