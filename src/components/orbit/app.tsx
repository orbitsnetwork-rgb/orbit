import { ArrowLeftRight, Hexagon, Orbit, UserRound, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import { readLang, t, writeLang, type Lang } from "@/lib/orbit/copy";
import {
  activeCreation,
  chanceOf,
  CHARGE_MS,
  CODE_MS,
  CODES_PER_DAY,
  DAY_MS,
  FUND_PERIOD_MS,
  holdBonus,
  me,
  NOVICE_CODES_PER_DAY,
  ORBIT_CAP,
  previewShare,
  STABILITY_GATE,
  turnoverPrev,
  utcDay,
  type Account,
  type World,
} from "@/lib/orbit/engine";
import { bootOrbits, deviceKeys, useOrbits } from "@/lib/orbit/store";

type Tab = "home" | "market" | "mine" | "flow" | "me";

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
        {tab === "me" ? <Person world={world} user={user} /> : null}
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
        <p className="orbit-note">Усі поля одразу. Ключ заповнюй лише якщо це ім’я вже є.</p>
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
      <p className="orbit-note">Лист не надіслано. Код прев’ю {self.mailCode}. Купівля і черга закриті, доки не введеш його.</p>
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
  const today = world.trades.filter((trade) => trade.at >= dayStart(world.now)).reduce((sum, trade) => sum + trade.amount, 0);
  const day = utcDay(world.now);
  const used = user.confirmDay === day ? user.confirmsToday : 0;
  const cap = user.stability >= STABILITY_GATE ? CODES_PER_DAY : NOVICE_CODES_PER_DAY;
  const leftCodes = Math.max(0, cap - used);
  const witnessing = world.creations.some((item) => item.status === "charging" && item.confirms.some((confirm) => confirm.witnessId === user.id));
  return (
    <section className="orbit-block">
      <p className="orbit-kicker">Поточна ціна · {when(world.now)}</p>
      <p className="orbit-price">{money.format(world.price)}</p>
      <p className="orbit-note">
        ОД · у черзі {world.queue.length} · орбіт {money.format(world.orbits.length)} з {money.format(ORBIT_CAP)}
      </p>
      <p className="orbit-note">
        Оборот сьогодні {money.format(today)} ОД. Минулої доби {money.format(turnoverPrev(world))} ОД. Шанс нового заряду {chance}%.
      </p>
      <p className="orbit-note">Нова ціна о 00:00 UTC, через {left(nextMidnight(world.now) - world.now)}.</p>
      <p className="orbit-note">
        {leftCodes > 0 ? `Сьогодні можна підтвердити ще ${leftCodes}.` : "Сьогодні коди закінчились."}
        {witnessing ? " Якщо заряд, який ти підтвердив, пройде — стабільність +3." : ""}
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
      {pendingMail ? <p className="orbit-note">Купівля і черга закриті, доки не введено код з пошти. Він на Ціні.</p> : null}
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
        <p className="orbit-note">Вісім підтверджень зібрано. Результат через {left(readyAt - wall)}.</p>
        <p className="orbit-note">Шанс не змінюється, поки йдуть ці 24 години.</p>
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
            <p className="orbit-note">Для іншої людини. Згорає за {left(creation.codeExpires - wall)} і після одного введення.</p>
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
          Сьогодні {used} з {CODES_PER_DAY}. Код живе {Math.round(CODE_MS / 60_000)} хвилин.
        </p>
        <Names world={world} userId={user.id} />
      </section>
    );
  }

  const typed = digits.replace(/\D/g, "").slice(0, 6);
  return (
    <section className="orbit-block">
      <p className="orbit-kicker">Підтвердження</p>
      <h1 className="orbit-h">Ввести чужий код</h1>
      <p className="orbit-note">Або введи код, який тобі передали. Свій код ця людина не прийме.</p>
      {user.stability < STABILITY_GATE ? <p className="orbit-note">До стабільності 20 — один код на добу.</p> : null}
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
  return <p className="orbit-note">Зараз у світі: {names.map((account) => account.name).join(", ")}. Ключів тут немає.</p>;
}

function Flow({ world, user }: { world: World; user: Account }) {
  const wall = useWall(world.now);
  const due = world.lastDistributionAt + FUND_PERIOD_MS;
  const last = world.payouts.find((row) => row.userId === user.id);
  const nowShare = previewShare(world, user.id);
  const laterShare = previewShare(world, user.id, 7 * DAY_MS);
  const holds = world.orbits.some((orbit) => orbit.ownerId === user.id);
  return (
    <section className="orbit-block">
      <p className="orbit-kicker">Фонд</p>
      <p className="orbit-price">{money.format(world.fund)}</p>
      {world.fund === 0 ? <p className="orbit-note">Поки немає угод.</p> : null}
      <p className="orbit-note">ОД · резерв {money.format(world.reserve)} · поділ через {left(due - wall)}</p>
      <p className="orbit-note">70% порівну тим, хто був активний 3 доби. 30% за стабільністю. Остання доба подвоює вагу.</p>
      <p className="orbit-note">Утримання 7, 14 і 30 діб додає 10%, 25% і 50% до виплати. Поділ сам, раз на три доби.</p>
      <p className="orbit-note">{last ? `Минулий поділ приніс тобі ${money.format(last.amount)} ОД.` : "Минулого поділу тебе не було."}</p>
      <p className="orbit-note">
        З поточного фонду тобі близько {money.format(nowShare)} ОД.
        {holds ? ` Якщо потримати найдовшу ще 7 днів — близько ${money.format(laterShare)}.` : " Орбіти ще немає, тож утримання не додається."} Це прикидка, не виплата.
      </p>
      <p className="orbit-kicker">Світ</p>
      <p className="orbit-note">
        Орбіт {money.format(world.orbits.length)}. Імен {money.format(world.accounts.length)}. Активні за добу{" "}
        {money.format(world.accounts.filter((account) => wall - account.lastActiveAt <= DAY_MS).length)}. Оборот сьогодні{" "}
        {money.format(world.trades.filter((trade) => trade.at >= dayStart(wall)).reduce((sum, trade) => sum + trade.amount, 0))} ОД. Заявок{" "}
        {world.creations.filter((item) => item.status === "collecting" || item.status === "charging").length}.
      </p>
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

function Person({ world, user }: { world: World; user: Account }) {
  const lang = useLang();
  const [other, setOther] = useState("");
  const [pass, setPass] = useState("");
  const mine = world.orbits.filter((orbit) => orbit.ownerId === user.id);
  const bonus = mine.reduce((best, orbit) => Math.max(best, holdBonus(world.now - orbit.createdAt)), 0);
  const known = world.accounts.find((account) => account.name.toLowerCase() === other.trim().toLowerCase());
  const held = deviceKeys();
  const ownKey = held[user.id];
  const local = world.accounts.filter((account) => held[account.id]);
  return (
    <section className="orbit-block">
      <p className="orbit-kicker">Стабільність</p>
      <p className="orbit-price">{user.stability}</p>
      <p className="orbit-note">
        Баланс {money.format(user.balance)} ОД. Орбіт {mine.length}. Поріг чужих кодів — {STABILITY_GATE}.
        {bonus > 0 ? ` Утримання +${Math.round(bonus * 100)}%.` : ""}
      </p>
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
      <p className="orbit-note">Ключ зберігається на цьому пристрої.</p>
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
      <p className="orbit-note">{t(lang, "card")}</p>
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
      <p className="orbit-note">Тестовий режим. 1 ОД = 1 цент. Картка в базу не пишеться.</p>
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
