/** Вкладка «Я» — окремим чанком. */
import { OrbitCards, ProfileStats, ThanksDue, daysWith } from "@/components/orbit/person-extras";
import { MyCrews } from "@/components/orbit/crew";
import { MonthRecapCard } from "@/components/orbit/month-recap";
import { OrbitDays } from "@/components/orbit/badges";
import { NumberedOrbits } from "@/components/orbit/orbit-card";
import { FileText, Shield, History as HistoryIcon, LayoutGrid, Wallet } from "lucide-react";
import { Row, type Route } from "@/components/orbit/more";
import { LockedRow, LockedSheet } from "@/components/orbit/locked";
import type { LockId } from "@/lib/orbit/locked";
import { MASK, useHidden } from "@/lib/orbit/prefs";
import { useEffect, useState } from "react";
import { sparkWord, t, type Lang } from "@/lib/orbit/copy";
import { type Account, type World } from "@/lib/orbit/engine";
import { deviceKeys, useOrbits } from "@/lib/orbit/store";
import { useLeave } from "@/components/orbit/key";
import { buzz, VIBRATE } from "@/lib/orbit/feel";
import { LangRow, left, useLang, CountUp } from "@/components/orbit/app-bits";

export function Person({ world, user, onOpen }: { world: World; user: Account; onOpen: (route: Route) => void }) {
  const lang = useLang();
  const [other, setOther] = useState("");
  const [pass, setPass] = useState("");
  const mine = world.orbits.filter((orbit) => orbit.ownerId === user.id);
  const held = deviceKeys();
  const [copied, setCopied] = useState(false);
  const ownKey = held[user.id];
  const local = world.accounts.filter((account) => held[account.id]);
  const [hidden] = useHidden();
  const leave = useLeave(user.id, user.name);
  const [lock, setLock] = useState<LockId | null>(null);
  return (
    <div className="orbit-stack">
      <section className="orbit-block pr-hero" aria-labelledby="pr-name">
        <div className="pr-hero-glow" aria-hidden />
        <div className="orbit-profile">
          <Face userId={user.id} letter={user.name.slice(0, 1).toUpperCase()} />
          <div>
            <h1 className="orbit-h pr-name" id="pr-name">{user.name}</h1>
            <p className="orbit-note">В Орбітах {daysWith(user, world.now)} д · стабільність {user.stability} · орбіт {mine.length}</p>
            {user.impulseUntil > world.now ? <span className="mn-tag" data-tone="ion">Імпульс ще {left(user.impulseUntil - world.now)}</span> : null}
          </div>
        </div>
        <SelfCard />
      </section>
      <ProfileStats world={world} user={user} />
      <OrbitDays world={world} userId={user.id} />
      <NumberedOrbits world={world} userId={user.id} />
      <ThanksDue world={world} user={user} />
      <section className="orbit-block pr-bal" aria-labelledby="pr-bal-title">
        <div className="hm-wallet-head">
          <h2 id="pr-bal-title">Баланс</h2>
        </div>
        <p className="hm-bal">{hidden ? MASK : <CountUp value={user.balance} />}<span> ✦</span></p>
        <p className="hm-bal-sub">{hidden ? "приховано" : `${sparkWord(user.balance)} ✦ · внутрішні одиниці`}</p>
        {user.starterPending ? <p className="hm-bal-sub pr-pending">+{user.starterPending} ✦ стартових — після першого внеску</p> : null}
        <div className="pr-bal-links">
          <button type="button" className="k-ghost" onClick={() => onOpen("history")}><HistoryIcon size={16} strokeWidth={1.8} aria-hidden /> Історія</button>
          <button type="button" className="k-ghost" onClick={() => onOpen("assets")}><Wallet size={16} strokeWidth={1.8} aria-hidden /> Активи</button>
        </div>
        <div className="lk-rows pr-locks">
          <LockedRow id="buy" onOpen={setLock} />
          <LockedRow id="deposit" onOpen={setLock} />
          <LockedRow id="withdraw" onOpen={setLock} />
        </div>
        {lock ? <LockedSheet id={lock} onClose={() => setLock(null)} /> : null}
      </section>
      <OrbitCards world={world} user={user} onAll={() => onOpen("assets")} />
      <MyCrews world={world} userId={user.id} />
      <MonthRecapCard world={world} user={user} />
      <section className="orbit-block">
        <p className="orbit-kicker">Ключ</p>
        {ownKey ? (
          <p className="orbit-key">
            <span>{ownKey}</span>
            <button
              type="button"
              className="orbit-quiet"
              onClick={() => {
                void navigator.clipboard.writeText(ownKey).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? "Скопійовано" : "Копіювати"}
            </button>
          </p>
        ) : (
          <p className="orbit-note">Ключ не на цьому телефоні.</p>
        )}
        {local.length > 1 ? (
          <div>
            {local.map((account) => (
              <button
                key={account.id}
                type="button"
                className="orbit-line"
                data-on={account.id === user.id ? "1" : "0"}
                onClick={() => useOrbits.getState().enterId(account.id, held[account.id])}
              >
                <span>{account.name}</span>
                <span>{account.stability}</span>
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (pass.trim().length >= 8) useOrbits.getState().enterMail(other.trim(), pass.trim());
            setOther("");
            setPass("");
          }}
        >
          <label className="grid gap-1.5">
            <span className="orbit-kicker">Інша людина · пошта (можна без неї)</span>
            <input className="orbit-field" value={other} maxLength={80} inputMode="email" autoComplete="off" onChange={(event) => setOther(event.target.value)} />
          </label>
          <label className="grid gap-1.5">
            <span className="orbit-kicker">Ключ</span>
            <input className="orbit-field" value={pass} autoComplete="off" spellCheck={false} onChange={(event) => setPass(event.target.value)} />
          </label>
          <button className="orbit-go" type="submit" disabled={pass.trim().length < 8}>
            {t(lang, "enter")}
          </button>
        </form>
      </section>
      <section className="orbit-block">
        <div className="mo-card">
          <Row icon={<LayoutGrid size={18} strokeWidth={1.5} />} title="Ще" sub="Усі розділи" onClick={() => onOpen("more")} />
          <Row icon={<Wallet size={18} strokeWidth={1.5} />} title="Активи" sub="Баланс і мої орбіти" onClick={() => onOpen("assets")} />
          <Row icon={<HistoryIcon size={18} strokeWidth={1.5} />} title="Історія" sub="Усі мої операції" onClick={() => onOpen("history")} />
          <Row icon={<Shield size={18} strokeWidth={1.5} />} title="Безпека" sub="Ключ, пристрій, вихід" onClick={() => onOpen("security")} />
          <Row icon={<FileText size={18} strokeWidth={1.5} />} title="Документи" sub="Правила, умови, приватність" onClick={() => onOpen("docs")} />
        </div>
      </section>
      <section className="orbit-block">
        <p className="orbit-kicker">Налаштування</p>
        <LangRow lang={lang} />
        <SoundRow lang={lang} />
        <VibrateRow />
        <button
          type="button"
          className="orbit-quiet"
          onClick={() => {
            window.location.href = "mailto:orbits.network@gmail.com?subject=Відновити%20ключ";
          }}
        >
          Відновити ключ
        </button>
        <button type="button" className="orbit-quiet" onClick={leave.ask}>
          {t(lang, "leave")}
        </button>
        {leave.sheet}
      </section>
    </div>
  );
}

function Face({ userId, letter }: { userId: string; letter: string }) {
  const storeKey = `orbits-face-${userId}`;
  const [src, setSrc] = useState("");
  useEffect(() => {
    try {
      setSrc(localStorage.getItem(storeKey) || "");
    } catch {
      setSrc("");
    }
  }, [storeKey]);
  return (
    <label className="orbit-face">
      {src ? <img src={src} alt="" /> : <span>{letter}</span>}
      <input
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void shrink(file).then((data) => {
            if (!data) return;
            try {
              localStorage.setItem(storeKey, data);
            } catch {
              /* квота */
            }
            setSrc(data);
          });
        }}
      />
    </label>
  );
}

function shrink(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 128;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

function SelfCard() {
  const self = useOrbits((state) => state.self);
  if (!self) return null;
  return <SelfDetails self={self} />;
}

/** Особисті дані — приховані за замовчуванням (не світити телефон і дату народження при сторонніх). */
function SelfDetails({ self }: { self: { given: string; family: string; email: string; phone: string; birth: string } }) {
  const [open, setOpen] = useState(false);
  const mask = (value: string, keep: number) => (value.length <= keep ? "•••" : `${"•".repeat(Math.min(6, value.length - keep))}${value.slice(-keep)}`);
  const [at, domain] = self.email.split("@");
  const birth = /^\d{4}-\d{2}-\d{2}$/.test(self.birth) ? self.birth.split("-").reverse().join(".") : self.birth;
  const rows: Array<[string, string]> = [
    ["Ім’я", `${self.given} ${self.family}`],
    ["Пошта", open ? self.email : `${(at || "").slice(0, 2)}•••@${domain || ""}`],
    ["Телефон", open ? self.phone : mask(self.phone, 2)],
    ["Дата народження", open ? birth : "••.••.••••"],
  ];
  return (
    <div className="sd">
      <dl className="sd-list">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <button type="button" className="sd-toggle" onClick={() => setOpen((v) => !v)} aria-pressed={open}>
        {open ? "Приховати дані" : "Показати дані"}
      </button>
    </div>
  );
}

function VibrateRow() {
  const [on, setOn] = useState(true);
  const [can, setCan] = useState(false);
  useEffect(() => {
    setCan(typeof navigator.vibrate === "function");
    try {
      setOn(localStorage.getItem(VIBRATE) !== "0");
    } catch {
      setOn(true);
    }
  }, []);
  if (!can) return null;
  return (
    <div className="flex gap-3">
      <button
        type="button"
        className="orbit-quiet"
        aria-pressed={on}
        onClick={() => {
          const next = !on;
          try {
            localStorage.setItem(VIBRATE, next ? "1" : "0");
          } catch {
            /* приватний режим */
          }
          setOn(next);
          if (next) buzz(10);
        }}
      >
        Вібрація: {on ? "увімк" : "вимк"}
      </button>
    </div>
  );
}

function SoundRow({ lang }: { lang: Lang }) {
  const [sound, setSound] = useState(false);
  useEffect(() => {
    setSound(localStorage.getItem("orbits-sound") === "1");
  }, []);
  return (
    <div className="flex gap-3">
      <button
        type="button"
        className="orbit-quiet"
        onClick={() => {
          const next = !sound;
          localStorage.setItem("orbits-sound", next ? "1" : "0");
          setSound(next);
        }}
      >
        {t(lang, "sound")}: {sound ? "увімк" : "вимк"}
      </button>
    </div>
  );
}
