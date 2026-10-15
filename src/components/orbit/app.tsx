import { ArrowLeftRight, Hexagon, Orbit, UserRound, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import { readLang, t, writeLang, type Lang } from "@/lib/orbit/copy";
import {
  activeCreation,
  chanceOf,
  CHARGE_MS,
  CODES_PER_DAY,
  DAY_MS,
  FUND_PERIOD_MS,
  me,
  previewShare,
  utcDay,
  type Account,
  type World,
} from "@/lib/orbit/engine";
import { bootOrbits, deviceKeys, useOrbits } from "@/lib/orbit/store";

type Tab = "home" | "market" | "mine" | "flow" | "me";
type Sheet = "rules" | "terms" | "refund" | "contact" | null;

const TABS: { id: Tab; key: "home" | "market" | "mine" | "flow" | "me"; icon: typeof Orbit }[] = [
  { id: "home", key: "home", icon: Orbit },
  { id: "market", key: "market", icon: ArrowLeftRight },
  { id: "mine", key: "mine", icon: Hexagon },
  { id: "flow", key: "flow", icon: Waves },
  { id: "me", key: "me", icon: UserRound },
];

const money = new Intl.NumberFormat("uk-UA");

function no(id: number) {
  return `#${String(id).padStart(7, "0")}`;
}

function left(ms: number) {
  if (ms <= 0) return "зараз";
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 48) return `${Math.floor(hours / 24)} д`;
  if (hours > 0) return `${hours} год ${mins} хв`;
  return `${Math.max(mins, 1)} хв`;
}

function dayStart(ms: number) {
  return Date.parse(`${utcDay(ms)}T00:00:00.000Z`);
}

function nextMidnight(ms: number) {
  return dayStart(ms) + DAY_MS;
}

function useWall(serverNow: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [serverNow]);
  return now;
}

function useLang() {
  const [lang, setLang] = useState<Lang>("uk");
  useEffect(() => {
    const read = () => setLang(readLang());
    read();
    window.addEventListener("orbit-lang", read);
    return () => window.removeEventListener("orbit-lang", read);
  }, []);
  return lang;
}

function when(ms: number) {
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", timeZone: "UTC" }).format(ms);
}

export function OrbitApp() {
  const world = useOrbits((state) => state.world);
  const flash = useOrbits((state) => state.flash);
  const bad = useOrbits((state) => state.bad);
  const registerPerson = useOrbits((state) => state.registerPerson);
  const enterMail = useOrbits((state) => state.enterMail);
  const enterId = useOrbits((state) => state.enterId);
  const ready = useOrbits((state) => state.ready);
  const lang = useLang();
  const [tab, setTab] = useState<Tab>("home");
  const [sheet, setSheet] = useState<Sheet>(null);

  useEffect(() => {
    bootOrbits();
    const session = new URLSearchParams(window.location.search).get("topup");
    if (session?.startsWith("cs_")) {
      window.history.replaceState({}, "", "/");
      void useOrbits.getState().confirmTopup(session);
    }
    const timer = window.setInterval(() => void useOrbits.getState().refresh(), 2000);
    return () => window.clearInterval(timer);
  }, []);

  const user = me(world);
  if (!user) {
    return <Gate world={world} flash={flash} bad={bad} ready={ready} lang={lang} onCreate={registerPerson} onMail={enterMail} onOld={enterId} />;
  }

  return (
    <div className="orbit-app">
      <div className="orbit-shell">
        <header className="orbit-top">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" width={32} height={32} />
            <div>
              <div className="orbit-kicker">{t(lang, "brand")}</div>
              <div className="text-sm">{user.name}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="orbit-od">{money.format(user.balance)} ОД</div>
          </div>
        </header>
        {tab === "home" ? <Home world={world} user={user} onMine={() => setTab("mine")} /> : null}
        {tab === "market" ? <Market world={world} user={user} /> : null}
        {tab === "mine" ? <Mine world={world} user={user} /> : null}
        {tab === "flow" ? <Flow world={world} user={user} /> : null}
        {tab === "me" ? <Person world={world} user={user} onSheet={setSheet} /> : null}
        {sheet ? <Docs sheet={sheet} onClose={() => setSheet(null)} /> : null}
        {world.log[0] && tab !== "me" && !flash ? <p className="orbit-log">Сталося. {world.log[0].text}</p> : null}
      </div>
      <nav className="orbit-nav" aria-label="Розділи">
        {TABS.map((item) => {
          const Icon = item.icon;
          const on = tab === item.id;
          return (
            <button key={item.id} type="button" data-on={on ? "1" : "0"} onClick={() => setTab(item.id)} aria-current={on ? "page" : undefined}>
              <Icon size={18} strokeWidth={1.5} />
              <span>{t(lang, item.key)}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function Gate({
  world,
  flash,
  bad,
  ready,
  lang,
  onCreate,
  onMail,
  onOld,
}: {
  world: World;
  flash: string;
  bad: boolean;
  ready: boolean;
  lang: Lang;
  onCreate: (input: { name: string; family: string; birth: string; email: string; phone: string }) => void;
  onMail: (email: string, key: string) => void;
  onOld: (id: string, key: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [given, setGiven] = useState("");
  const [family, setFamily] = useState("");
  const [birth, setBirth] = useState("");
  const [key, setKey] = useState("");
  const [oldName, setOldName] = useState("");
  const [sheet, setSheet] = useState<Sheet>(null);
  const old = world.accounts.find((account) => account.name.toLowerCase() === oldName.trim().toLowerCase());
  const mailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const enteringOld = Boolean(old && key.trim().length >= 8);
  const enteringMail = !enteringOld && key.trim().length >= 8 && mailOk;
  const readyForm = mailOk && given.trim().length >= 2 && family.trim().length >= 2 && phone.trim().length >= 10 && birth.length >= 10;
  return (
    <div className="orbit-app">
      <main className="orbit-shell orbit-gate">
        <p className="orbit-kicker">{t(lang, "brand")}</p>
        <h1>{t(lang, "sub")}</h1>
        <p className="orbit-note">Пошта, телефон, ім’я. Ключ — лише для входу.</p>
        <LangRow lang={lang} />
        <form
          className="orbit-block"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            if (enteringOld && old) onOld(old.id, key.trim());
            else if (enteringMail) onMail(email.trim(), key.trim());
            else onCreate({ name: given.trim(), family: family.trim(), birth, email: email.trim(), phone: phone.trim() });
          }}
        >
          <Field label={t(lang, "email")} value={email} autoComplete="email" inputMode="email" onChange={setEmail} />
          <Field label={t(lang, "phone")} value={phone} autoComplete="tel" inputMode="tel" onChange={setPhone} />
          <Field label={t(lang, "given")} value={given} autoComplete="given-name" onChange={setGiven} />
          <Field label={t(lang, "family")} value={family} autoComplete="family-name" onChange={setFamily} />
          <label className="grid gap-1.5">
            <span className="orbit-kicker">{t(lang, "birth")}</span>
            <input className="orbit-field" type="date" value={birth} onChange={(event) => setBirth(event.target.value)} />
          </label>
          <Field label={t(lang, "key")} value={key} autoComplete="off" onChange={setKey} />
          <Field label={t(lang, "old")} value={oldName} autoComplete="nickname" onChange={setOldName} />
          <button className="orbit-go" type="submit" disabled={!ready || !(enteringOld || enteringMail || readyForm)}>
            {ready ? (key.trim().length >= 8 ? t(lang, "enter") : t(lang, "create")) : "…"}
          </button>
          {flash ? <p className={bad ? "orbit-flash" : "orbit-ok"}>{flash}</p> : null}
        </form>
        <DocsRow onSheet={setSheet} />
        {sheet ? <Docs sheet={sheet} onClose={() => setSheet(null)} /> : null}
      </main>
    </div>
  );
}

function MailGate() {
  const self = useOrbits((state) => state.self);
  const [code, setCode] = useState("");
  if (!self || self.confirmed !== false) return null;
  const typed = code.replace(/\D/g, "").slice(0, 6);
  return (
    <>
      <p className="orbit-note">Код {self.mailCode}</p>
      <label className="grid gap-1.5">
        <span className="orbit-kicker">Код з пошти</span>
        <input className="orbit-field" inputMode="numeric" maxLength={6} value={typed} onChange={(event) => setCode(event.target.value)} />
      </label>
      <button type="button" className="orbit-go" disabled={typed.length < 6} onClick={() => useOrbits.getState().confirmMail(typed)}>
        Підтвердити
      </button>
      <Notice />
    </>
  );
}

function DocsRow({ onSheet }: { onSheet: (sheet: Sheet) => void }) {
  return (
    <div className="orbit-docs">
      <button type="button" className="orbit-quiet" onClick={() => onSheet("rules")}>Правила</button>
      <button type="button" className="orbit-quiet" onClick={() => onSheet("terms")}>Умови</button>
      <button type="button" className="orbit-quiet" onClick={() => onSheet("refund")}>Повернення</button>
      <button type="button" className="orbit-quiet" onClick={() => onSheet("contact")}>Контакт</button>
    </div>
  );
}

function Docs({ sheet, onClose }: { sheet: Exclude<Sheet, null>; onClose: () => void }) {
  const pages = {
    rules: {
      title: "Правила",
      lines: [
        "8 000 000 орбіт. Усі рівні. Ціна одна.",
        "Нова ціна о 00:00 UTC.",
        "Фонд ділиться раз на 3 доби.",
        "70% активним за 3 доби. 30% за стабільністю.",
        "Утримання 7 / 14 / 30 діб додає 10% / 25% / 50%.",
        "ОД — внутрішня одиниця. Не гроші.",
      ],
    },
    terms: {
      title: "Умови",
      lines: [
        "Орбіти — закритий світ. ОД не виводяться і не переказуються як гроші.",
        "Поповнення купує ОД у цього світу. 1 ОД = 1 цент США.",
        "Ключ лишається на телефоні. Втрачений ключ не відновлюється.",
        "Торгівля орбітами йде лише всередині додатка.",
        "Зараз тестовий режим. Бойові платежі не підключені.",
      ],
    },
    refund: {
      title: "Повернення",
      lines: [
        "Невитрачені ОД можна повернути протягом 14 днів.",
        "Вже витрачені на орбіту ОД не повертаються.",
        "Напиши на orbits.network@gmail.com з поштою акаунта.",
        "Повернення йде на ту саму картку.",
      ],
    },
    contact: {
      title: "Контакт",
      lines: ["orbits.network@gmail.com", "Сайт: orbits-yw58.netlify.app", "Відповідь протягом 2 діб."],
    },
  } as const;
  const page = pages[sheet];
  return (
    <section className="orbit-block orbit-sheet">
      <p className="orbit-kicker">{page.title}</p>
      {page.lines.map((line) => (
        <p key={line} className="orbit-note">{line}</p>
      ))}
      <button type="button" className="orbit-go" onClick={onClose}>Закрити</button>
    </section>
  );
}

function Notice() {
  const flash = useOrbits((state) => state.flash);
  const bad = useOrbits((state) => state.bad);
  if (!flash) return null;
  return (
    <p className={bad ? "orbit-flash" : "orbit-ok"} role="status">
      {flash}
    </p>
  );
}

function Field({
  label,
  value,
  onChange,
  autoComplete,
  inputMode,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  inputMode?: "email" | "tel" | "text";
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="orbit-kicker">{label}</span>
      <input
        className="orbit-field"
        value={value}
        maxLength={80}
        autoComplete={autoComplete}
        inputMode={inputMode}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function LangRow({ lang }: { lang: Lang }) {
  return (
    <div className="flex gap-3">
      {(["uk", "en", "ru", "pl", "de"] as const).map((item) => (
        <button key={item} type="button" className="orbit-quiet" onClick={() => writeLang(item)}>
          {item === lang ? item.toUpperCase() : item}
        </button>
      ))}
    </div>
  );
}

function Home({ world, user, onMine }: { world: World; user: Account; onMine: () => void }) {
  const lang = useLang();
  const pendingMail = useOrbits((state) => state.self)?.confirmed === false;
  const oldest = world.queue[0];
  const loose = world.orbits.find((orbit) => orbit.ownerId === user.id && !world.queue.some((row) => row.orbitId === orbit.id));
  const canBuy = Boolean(oldest && oldest.userId !== user.id);
  const creation = activeCreation(world, user.id);
  let label = "Відкрити заявку";
  let act = () => {
    if (!creation) useOrbits.getState().start();
    onMine();
  };
  let disabled = false;
  if (canBuy) {
    label = t(lang, "buy");
    act = () => useOrbits.getState().buy();
  } else if (loose) {
    label = t(lang, "sell");
    act = () => useOrbits.getState().list(loose.id);
  } else if (oldest?.userId === user.id) {
    label = "Перша в черзі твоя";
    disabled = true;
    act = () => undefined;
  } else if (creation) {
    label = "До заявки";
    act = onMine;
  }
  const chance = Math.round(chanceOf(world.orbits.length) * 100);
  return (
    <section className="orbit-block">
      <p className="orbit-kicker">Ціна · {when(world.now)}</p>
      <p className="orbit-price">{money.format(world.price)}</p>
      <p className="orbit-note">
        Черга {world.queue.length} · орбіт {money.format(world.orbits.length)} · шанс {chance}% · нова ціна через {left(nextMidnight(world.now) - world.now)}
      </p>
      {pendingMail ? (
        <MailGate />
      ) : (
        <>
          <button type="button" className="orbit-go" disabled={disabled} onClick={act}>
            {label}
          </button>
          <Notice />
        </>
      )}
    </section>
  );
}

function Market({ world, user }: { world: World; user: Account }) {
  const lang = useLang();
  const pendingMail = useOrbits((state) => state.self)?.confirmed === false;
  const oldest = world.queue[0];
  const canBuy = Boolean(oldest && oldest.userId !== user.id);
  const loose = world.orbits.filter((orbit) => orbit.ownerId === user.id && !world.queue.some((row) => row.orbitId === orbit.id));
  return (
    <section className="orbit-block">
      <p className="orbit-kicker">Черга</p>
      {world.queue.length === 0 ? <p className="orbit-note">Порожньо.</p> : null}
      {world.queue.map((row, index) => {
        const owner = world.accounts.find((account) => account.id === row.userId)?.name ?? "хтось";
        return (
          <div key={row.id} className="orbit-row">
            <span>
              {index === 0 ? "Перший. " : `${index + 1}. `}
              {no(row.orbitId)} · {owner}
            </span>
            {row.userId === user.id && index > 0 ? (
              <button type="button" className="orbit-quiet" onClick={() => useOrbits.getState().cancel(row.orbitId)}>
                Зняти
              </button>
            ) : null}
          </div>
        );
      })}
      {pendingMail ? <p className="orbit-note">Спочатку код на Ціні.</p> : null}
      {pendingMail
        ? null
        : loose.map((orbit) => (
            <button key={orbit.id} type="button" className="orbit-quiet" onClick={() => useOrbits.getState().list(orbit.id)}>
              {t(lang, "sell")} {no(orbit.id)}
            </button>
          ))}
      {pendingMail ? null : (
        <button type="button" className="orbit-go" disabled={!canBuy} onClick={() => useOrbits.getState().buy()}>
          {canBuy ? t(lang, "buy") : "Немає чужої"}
        </button>
      )}
      {pendingMail ? null : <Notice />}
    </section>
  );
}

function Mine({ world, user }: { world: World; user: Account }) {
  const creation = activeCreation(world, user.id);
  const [digits, setDigits] = useState("");
  const wall = useWall(world.now);
  useEffect(() => {
    setDigits("");
  }, [user.id]);

  if (creation?.status === "charging" && creation.chargeStartedAt) {
    const readyAt = creation.chargeStartedAt + CHARGE_MS;
    const chance = Math.round(chanceOf(world.orbits.length) * 100);
    return (
      <section className="orbit-block">
        <p className="orbit-kicker">Заряд</p>
        <h1 className="orbit-h">{chance}%</h1>
        <p className="orbit-note">Результат через {left(readyAt - wall)}.</p>
      </section>
    );
  }

  if (creation?.status === "collecting") {
    const day = utcDay(world.now);
    const used = creation.codeDay === day ? creation.codesToday : 0;
    const live = Boolean(creation.code && world.now < creation.codeExpires);
    return (
      <section className="orbit-block">
        <p className="orbit-kicker">Підтвердження</p>
        <h1 className="orbit-h">{creation.confirms.length} / 8</h1>
        <div className="orbit-dots" aria-hidden>
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} data-on={index < creation.confirms.length ? "1" : "0"} />
          ))}
        </div>
        {live ? (
          <>
            <p className="orbit-code">{creation.code}</p>
            <p className="orbit-note">Згорає за {left(creation.codeExpires - wall)}.</p>
          </>
        ) : (
          <>
            <button type="button" className="orbit-go" onClick={() => useOrbits.getState().issue()}>
              Випустити код
            </button>
            <Notice />
          </>
        )}
        <p className="orbit-note">
          Сьогодні {used} з {CODES_PER_DAY}.
        </p>
        <Names world={world} userId={user.id} />
      </section>
    );
  }

  const typed = digits.replace(/\D/g, "").slice(0, 6);
  return (
    <section className="orbit-block">
      <p className="orbit-kicker">Підтвердження</p>
      <h1 className="orbit-h">Чужий код</h1>
      <label className="grid gap-1.5">
        <span className="orbit-kicker">Ввести чужий код</span>
        <input
          className="orbit-field orbit-code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={typed}
          onChange={(event) => setDigits(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="orbit-go"
        disabled={typed.length > 0 && typed.length < 6}
        onClick={() => {
          if (typed.length === 6) {
            useOrbits.getState().accept(typed).then(() => {
              if (!useOrbits.getState().bad) setDigits("");
            });
          } else useOrbits.getState().start();
        }}
      >
        {typed.length > 0 ? "Підтвердити" : "Відкрити заявку"}
      </button>
      <Notice />
      <Names world={world} userId={user.id} />
    </section>
  );
}

function Names({ world, userId }: { world: World; userId: string }) {
  const names = world.accounts
    .filter((account) => account.id !== userId && world.now - account.lastActiveAt <= DAY_MS)
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
    .slice(0, 8);
  if (names.length === 0) return null;
  return <p className="orbit-note">Зараз: {names.map((account) => account.name).join(", ")}</p>;
}

function Flow({ world, user }: { world: World; user: Account }) {
  const wall = useWall(world.now);
  const due = world.lastDistributionAt + FUND_PERIOD_MS;
  const nowShare = previewShare(world, user.id);
  return (
    <section className="orbit-block">
      <p className="orbit-kicker">Фонд</p>
      <p className="orbit-price">{money.format(world.fund)}</p>
      {world.fund === 0 ? <p className="orbit-note">Поки немає угод.</p> : null}
      <p className="orbit-note">Поділ через {left(due - wall)} · тобі близько {money.format(nowShare)} ОД</p>
      <p className="orbit-kicker">Світ</p>
      {world.payouts.slice(0, 4).map((row, index) => {
        const name = world.accounts.find((account) => account.id === row.userId)?.name ?? "хтось";
        return (
          <div key={`${row.at}-${row.userId}-${index}`} className="orbit-row">
            <span>{name}</span>
            <span>{money.format(row.amount)} ОД</span>
          </div>
        );
      })}
    </section>
  );
}

function Person({ world, user, onSheet }: { world: World; user: Account; onSheet: (sheet: Sheet) => void }) {
  const lang = useLang();
  const [other, setOther] = useState("");
  const [pass, setPass] = useState("");
  const mine = world.orbits.filter((orbit) => orbit.ownerId === user.id);
  const known = world.accounts.find((account) => account.name.toLowerCase() === other.trim().toLowerCase());
  const held = deviceKeys();
  const ownKey = held[user.id];
  const local = world.accounts.filter((account) => held[account.id]);
  return (
    <section className="orbit-block">
      <p className="orbit-kicker">Стабільність</p>
      <p className="orbit-price">{user.stability}</p>
      <p className="orbit-note">Баланс {money.format(user.balance)} ОД · орбіт {mine.length}</p>
      <Face userId={user.id} letter={user.name.slice(0, 1).toUpperCase()} />
      {mine.map((orbit) => (
        <div key={orbit.id} className="orbit-row">
          <span>{no(orbit.id)}</span>
          <span>твоя</span>
        </div>
      ))}
      {user.impulseUntil > world.now ? <p className="orbit-note">Імпульс ще {left(user.impulseUntil - world.now)}. На ціну не впливає.</p> : null}
      <SelfCard />
      <TopupRow />
      {ownKey ? (
        <p className="orbit-key">
          <span>{ownKey}</span>
          <button
            type="button"
            className="orbit-quiet"
            onClick={() => {
              void navigator.clipboard.writeText(ownKey);
            }}
          >
            Копіювати
          </button>
        </p>
      ) : (
        <p className="orbit-note">У цього імені немає ключа на цьому телефоні.</p>
      )}
      <p className="orbit-note">Ключ лишається на цьому телефоні.</p>
      <DocsRow onSheet={onSheet} />
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
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (known) useOrbits.getState().enterId(known.id, held[known.id] || pass.trim());
          setOther("");
          setPass("");
        }}
      >
        <label className="grid gap-1.5">
          <span className="orbit-kicker">Інша людина</span>
          <input className="orbit-field" value={other} maxLength={32} onChange={(event) => setOther(event.target.value)} />
        </label>
        {known && !held[known.id] ? (
          <label className="grid gap-1.5">
            <span className="orbit-kicker">Ключ</span>
            <input className="orbit-field" value={pass} autoComplete="off" spellCheck={false} onChange={(event) => setPass(event.target.value)} />
          </label>
        ) : null}
        <button className="orbit-go" type="submit" disabled={!known || Boolean(!held[known.id] && pass.trim().length < 8)}>
          {t(lang, "enter")}
        </button>
        <Notice />
      </form>
      <p className="orbit-kicker">Налаштування</p>
      <LangRow lang={lang} />
      <SoundRow lang={lang} />
      <button type="button" className="orbit-quiet" onClick={() => useOrbits.getState().leave()}>
        {t(lang, "leave")}
      </button>
    </section>
  );
}

function TopupRow() {
  const [amount, setAmount] = useState(100);
  return (
    <div className="grid gap-3">
      <p className="orbit-kicker">Поповнити</p>
      <p className="orbit-note">Тест. 1 ОД = 1 цент. Картка не зберігається.</p>
      <div className="orbit-chips">
        {[100, 500, 1000].map((value) => (
          <button key={value} type="button" className="orbit-chip" data-on={amount === value ? "1" : "0"} onClick={() => setAmount(value)}>
            {value}
          </button>
        ))}
      </div>
      <button type="button" className="orbit-go" onClick={() => useOrbits.getState().topup(amount)}>
        Поповнити {amount}
      </button>
      <Notice />
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
  if (!self) return <p className="orbit-note">Старе ім’я без пошти. Нові люди заходять через пошту.</p>;
  return (
    <p className="orbit-note">
      {self.given} {self.family}. {self.email}. {self.phone}. {self.birth}.
    </p>
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
        {t(lang, "sound")}: {sound ? "1" : "0"}
      </button>
      <span className="orbit-note">{t(lang, "music")}</span>
    </div>
  );
}
