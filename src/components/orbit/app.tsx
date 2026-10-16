import { ArrowLeftRight, Bell, CircleHelp, FileText, GraduationCap, Shield, Telescope, Trophy, Hexagon, History as HistoryIcon, LayoutGrid, Orbit, UserRound, Wallet, Waves } from "lucide-react";
import { Exchange, Soon } from "@/components/orbit/exchange";
import { Row, type Route } from "@/components/orbit/more";
import { Pages } from "@/components/orbit/pages";
import { rememberTopup } from "@/lib/orbit/ledger";
import { MASK, useHidden } from "@/lib/orbit/prefs";
import { toastsOn, useInbox } from "@/lib/orbit/inbox";
import type { DocId } from "@/lib/orbit/docs";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readLang, sparks, sparkText, sparkWord, spk, t, writeLang, type Lang } from "@/lib/orbit/copy";
import {
  activeCreation,
  chanceOf,
  CHARGE_MS,
  CODES_PER_DAY,
  DAY_MS,
  FUND_PERIOD_MS,
  me,
  STABILITY_CONFIRM,
  STABILITY_FAIL,
  WITNESS_OD,
  previewShare,
  utcDay,
  type Account,
  type World,
} from "@/lib/orbit/engine";
import { bootOrbits, deviceKeys, pendingKeyScreen, useOrbits } from "@/lib/orbit/store";
import { KeyScreen, useLeave } from "@/components/orbit/key";
import { CodeShare } from "@/components/orbit/code-share";
import { ChargeResult, markSeen, unseenOutcome } from "@/components/orbit/charge-result";
import { Satellites } from "@/components/orbit/space/satellites";
import { Starfield } from "@/components/orbit/space/starfield";
import { OrbitRings } from "@/components/orbit/space/orbit-rings";
import { useCountUp } from "@/lib/orbit/count-up";
import { catchInvite, dropInvite, INVITE_EVENT, readInvite } from "@/lib/orbit/invite";
import { buzz, VIBRATE } from "@/lib/orbit/feel";

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
  const fresh = useOrbits((state) => state.fresh);
  const lang = useLang();
  const [tab, setTab] = useState<Tab>("home");
  const nav = useStack();
  const [hidden] = useHidden();
  const [, bumpSeen] = useState(0);

  useEffect(() => {
    // Короткий відгук на натискання основних кнопок (Android; iOS не вміє — пропускаємо).
    const onDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (target && !target.disabled && target.matches(".orbit-go, .ky-go, .cs-share, .orbit-nav button")) buzz(target.matches(".orbit-nav button") ? 6 : 8);
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  useEffect(() => {
    catchInvite();
    bootOrbits();
    const session = new URLSearchParams(window.location.search).get("topup");
    if (session?.startsWith("cs_")) {
      window.history.replaceState({}, "", "/");
      void useOrbits.getState().confirmTopup(session).then(() => {
        // Сервер не віддає список поповнень. Пам’ятаємо успішне на цьому телефоні для «Історії».
        const state = useOrbits.getState();
        const paid = /Зараховано (\d+)/.exec(state.flash);
        const who = me(state.world);
        if (!state.bad && paid && who) rememberTopup(who.id, Number(paid[1]));
      });
    }
    const timer = window.setInterval(() => void useOrbits.getState().refresh(), 2000);
    return () => window.clearInterval(timer);
  }, []);

  const user = me(world);
  const inbox = useInbox(world, user);
  const userId = user?.id;
  const { close } = nav;
  useEffect(() => {
    // Інша людина або вихід: закрити відкриті сторінки й почати з головної.
    close();
    setTab("home");
  }, [userId, close]);
  useEffect(() => {
    // Вкладку перезавантажили до «Ключ збережено» — показуємо екран ключа ще раз.
    if (!userId || useOrbits.getState().fresh) return;
    const again = pendingKeyScreen(userId);
    if (again) useOrbits.setState({ fresh: again });
  }, [userId]);
  const keyScreen = Boolean(fresh && user && fresh.id === user.id);
  useEffect(() => {
    // Прийшли за посиланням з кодом — відкриваємо «Запуск», де код уже в полі. Нічого не надсилаємо.
    if (!userId || keyScreen) return;
    const go = () => {
      if (readInvite()) {
        close();
        setTab("mine");
      }
    };
    go();
    window.addEventListener(INVITE_EVENT, go);
    return () => window.removeEventListener(INVITE_EVENT, go);
  }, [userId, keyScreen, close]);
  if (!user) {
    return <Gate world={world} flash={flash} bad={bad} ready={ready} lang={lang} onCreate={registerPerson} onMail={enterMail} onOld={enterId} />;
  }

  if (keyScreen && fresh) {
    return (
      <div className="orbit-app">
        <KeyScreen userId={user.id} name={user.name} secret={fresh.key} onDone={() => useOrbits.getState().dismissKey()} />
      </div>
    );
  }

  const outcome = unseenOutcome(world, user.id);
  const closeOutcome = () => {
    if (outcome) markSeen(outcome.creation.id);
    bumpSeen((n) => n + 1);
  };

  return (
    <div className="orbit-app">
      <Starfield />
      {outcome ? (
        <ChargeResult
          key={outcome.creation.id}
          outcome={outcome}
          onClose={closeOutcome}
          onView={() => {
            closeOutcome();
            nav.open("assets");
          }}
          onRestart={() => {
            closeOutcome();
            setTab("mine");
            void useOrbits.getState().start();
          }}
        />
      ) : null}
      <div className="orbit-shell">
        <header className="orbit-top">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" width={32} height={32} />
            <div>
              <div className="orbit-kicker">{t(lang, "brand")}</div>
              <div className="text-sm">{user.name}</div>
            </div>
          </div>
          <div className="mo-top-right">
            <TopBalance balance={user.balance} hidden={hidden} onOpen={() => nav.open("assets")} />
            <button type="button" className="mo-icon mo-bell" aria-label={inbox.unread ? `Сповіщення, нових ${inbox.unread}` : "Сповіщення"} aria-haspopup="dialog" onClick={() => nav.open("inbox")}>
              <Bell size={18} strokeWidth={1.5} />
              {inbox.unread ? <b aria-hidden>{inbox.unread > 9 ? "9+" : inbox.unread}</b> : null}
            </button>
            <button type="button" className="mo-icon" aria-label="Ще" aria-haspopup="dialog" onClick={() => nav.open("more")}>
              <LayoutGrid size={18} strokeWidth={1.5} />
            </button>
          </div>
        </header>
        <div key={tab} className="tab-in">
          {tab === "home" ? <Home world={world} user={user} onMine={() => setTab("mine")} onOpen={nav.open} /> : null}
          {tab === "market" ? <Exchange world={world} user={user} /> : null}
          {tab === "mine" ? <Mine world={world} user={user} /> : null}
          {tab === "flow" ? <Flow world={world} user={user} /> : null}
          {tab === "me" ? <Person world={world} user={user} onOpen={nav.open} /> : null}
        </div>
        <Pages stack={nav.stack} onPush={nav.push} onPop={nav.pop} onReplace={nav.replace} onClose={nav.close} world={world} user={user} onTab={setTab} unread={inbox.unread} />
      </div>
      <Toast text={flash} bad={bad} event={world.log[0]?.text ?? ""} />
      <nav className="orbit-nav" aria-label="Основна навігація" style={{ ["--i" as string]: TABS.findIndex((item) => item.id === tab) }}>
        <span className="orbit-nav-dot" aria-hidden />
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

/** Число, що «докручується» при зміні. */
function CountUp({ value }: { value: number }) {
  return <>{money.format(useCountUp(value))}</>;
}

/** Баланс у шапці: докручується і показує дельту «+40 ✦», коли змінюється. */
function TopBalance({ balance, hidden, onOpen }: { balance: number; hidden: boolean; onOpen: () => void }) {
  const shown = useCountUp(balance);
  const prev = useRef(balance);
  const [delta, setDelta] = useState<{ n: number; id: number } | null>(null);
  useEffect(() => {
    const d = balance - prev.current;
    prev.current = balance;
    if (!d) return;
    setDelta({ n: d, id: Date.now() });
    const id = window.setTimeout(() => setDelta(null), 1300);
    return () => window.clearTimeout(id);
  }, [balance]);
  return (
    <span className="orbit-od-wrap">
      <button type="button" className="orbit-od" aria-label={hidden ? "Баланс приховано. Відкрити активи" : `Баланс ${spk(balance)}. Відкрити активи`} onClick={onOpen}>
        {hidden ? `${MASK} ✦` : spk(shown)}
      </button>
      {delta && !hidden ? (
        <span key={delta.id} className="orbit-delta" data-up={delta.n > 0 ? "1" : "0"} aria-hidden>
          {delta.n > 0 ? "+" : "−"}
          {money.format(Math.abs(delta.n))} ✦
        </span>
      ) : null}
    </span>
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
  const nav = useStack();
  const [haveKey, setHaveKey] = useState(false);
  const old = world.accounts.find((account) => account.name.toLowerCase() === oldName.trim().toLowerCase());
  const mailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const enteringOld = Boolean(old && key.trim().length >= 8);
  const enteringMail = !enteringOld && key.trim().length >= 8 && mailOk;
  const [invited, setInvited] = useState(false);
  useEffect(() => {
    const read = () => setInvited(Boolean(readInvite()));
    read();
    window.addEventListener(INVITE_EVENT, read);
    return () => window.removeEventListener(INVITE_EVENT, read);
  }, []);
  const readyForm = mailOk && given.trim().length >= 2 && family.trim().length >= 2 && phone.trim().length >= 10 && birth.length >= 10;
  return (
    <div className="orbit-app">
      <Starfield />
      <main className="orbit-shell orbit-gate">
        <p className="orbit-kicker">{t(lang, "brand")}</p>
        <h1>{t(lang, "sub")}</h1>
        <p className="orbit-note">Пошта, телефон, ім’я. Ключ — лише для входу.</p>
        {invited ? (
          <p className="cs-invite" role="status">
            Тебе запросили підтвердити запуск орбіти. Увійди або створи акаунт — код уже чекатиме в «Запуску».
          </p>
        ) : null}
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
          {haveKey ? <Field label={t(lang, "key")} value={key} autoComplete="off" onChange={setKey} /> : null}
          {haveKey ? <Field label={t(lang, "old")} value={oldName} autoComplete="nickname" onChange={setOldName} /> : null}
          <button className="orbit-go" type="submit" disabled={!ready || !(enteringOld || enteringMail || (!haveKey && readyForm))}>
            {ready ? (haveKey ? t(lang, "enter") : t(lang, "create")) : "…"}
          </button>
          {flash ? <p className={bad ? "orbit-flash" : "orbit-ok"}>{flash}</p> : null}
          <button type="button" className="orbit-quiet" onClick={() => setHaveKey((value) => !value)}>
            {haveKey ? "Нова людина" : "Вже є ключ"}
          </button>
        </form>
        <DocsRow onOpen={nav.open} />
        <Pages stack={nav.stack} onPush={nav.push} onPop={nav.pop} onReplace={nav.replace} onClose={nav.close} />
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
      <p className="orbit-note">{self.mailCode ? `Код: ${self.mailCode}` : "Код на пошті."}</p>
      <label className="grid gap-1.5">
        <span className="orbit-kicker">Код з пошти</span>
        <input className="orbit-field" inputMode="numeric" maxLength={6} value={typed} onChange={(event) => setCode(event.target.value)} />
      </label>
      <button type="button" className="orbit-go" disabled={typed.length < 6} onClick={() => useOrbits.getState().confirmMail(typed)}>
        Підтвердити
      </button>
      <Notice inline />
    </>
  );
}

/** Стек повноекранних сторінок (Ще → Документи → документ). */
function useStack() {
  const [stack, setStack] = useState<Route[]>([]);
  const actions = useMemo(
    () => ({
      open: (route: Route) => setStack([route]),
      push: (route: Route) => setStack((rows) => [...rows, route]),
      pop: () => setStack((rows) => rows.slice(0, -1)),
      replace: (route: Route) => setStack((rows) => [...rows.slice(0, -1), route]),
      close: () => setStack((rows) => (rows.length ? [] : rows)),
    }),
    [],
  );
  return { stack, ...actions };
}

const QUICK_DOCS: { id: DocId; label: string }[] = [
  { id: "rules", label: "Правила" },
  { id: "terms", label: "Умови" },
  { id: "privacy", label: "Приватність" },
  { id: "risk", label: "Ризики" },
];

function DocsRow({ onOpen }: { onOpen: (route: Route) => void }) {
  return (
    <div className="orbit-docs">
      {QUICK_DOCS.map((item) => (
        <button key={item.id} type="button" className="orbit-quiet" onClick={() => onOpen(`doc:${item.id}`)}>
          {item.label}
        </button>
      ))}
      <button type="button" className="orbit-quiet" onClick={() => onOpen("docs")}>Усі документи</button>
      <button type="button" className="orbit-quiet" onClick={() => onOpen("help")}>Довідка</button>
    </div>
  );
}

function Toast({ text, bad, event }: { text: string; bad: boolean; event: string }) {
  const [shown, setShown] = useState<{ text: string; bad: boolean } | null>(null);
  const firstEvent = useRef(event);
  useEffect(() => {
    if (!text) return;
    setShown({ text, bad });
    const timer = window.setTimeout(() => setShown(null), 2600);
    return () => window.clearTimeout(timer);
  }, [text, bad]);
  useEffect(() => {
    if (!event || event === firstEvent.current) return;
    firstEvent.current = event;
    if (!toastsOn()) return;
    setShown({ text: event, bad: false });
    const timer = window.setTimeout(() => setShown(null), 2600);
    return () => window.clearTimeout(timer);
  }, [event]);
  if (!shown) return null;
  return (
    <div className="orbit-toast" data-bad={shown.bad ? "1" : "0"} role="status" onClick={() => setShown(null)}>
      {sparkText(shown.text)}
    </div>
  );
}

function Notice({ inline = false }: { inline?: boolean }) {
  const flash = useOrbits((state) => state.flash);
  const bad = useOrbits((state) => state.bad);
  if (!flash || !inline) return null;
  return (
    <p className={bad ? "orbit-flash" : "orbit-ok"} role="status">
      {sparkText(flash)}
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

function Home({ world, user, onMine, onOpen }: { world: World; user: Account; onMine: () => void; onOpen: (route: Route) => void }) {
  const lang = useLang();
  const wall = useWall(world.now);
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
  const online = world.accounts.filter((account) => wall - account.lastActiveAt <= DAY_MS).length;
  const lastTrade = world.trades[world.trades.length - 1];
  const seenKey = `orbits-seen-${user.id}`;
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    try {
      setFresh(localStorage.getItem(seenKey) !== "1");
    } catch {
      setFresh(false);
    }
  }, [seenKey]);
  return (
    <section className="orbit-block">
      <div className="hm-hero">
        <OrbitRings />
        <div className="hm-hero-num">
          <p className="orbit-kicker">Ціна орбіти · {when(world.now)}</p>
          <p className="orbit-price"><CountUp value={world.price} /></p>
          <p className="orbit-unit">✦ за орбіту</p>
        </div>
      </div>
      <div className="orbit-stats">
        <div><b>{online}</b><span>онлайн</span></div>
        <div><b>{world.queue.length}</b><span>черга</span></div>
        <div><b>{money.format(world.orbits.length)}</b><span>орбіт</span></div>
        <div><b>{chance}%</b><span>шанс</span></div>
      </div>
      <p className="orbit-note">Нова ціна через {left(nextMidnight(world.now) - world.now)}</p>
      {lastTrade ? <p className="orbit-note">Остання угода {spk(lastTrade.amount)} · {no(lastTrade.orbitId)}</p> : null}
      {fresh ? (
        <div className="orbit-tips">
          <p className="orbit-kicker">Перші кроки</p>
          <p className="orbit-note">Орбіта — рівна частка світу.</p>
          <p className="orbit-note">Іскри ✦ лишаються всередині. Це не гроші.</p>
          <p className="orbit-note">Купи з черги або відкрий заявку.</p>
          <button
            type="button"
            className="orbit-quiet"
            onClick={() => {
              try { localStorage.setItem(seenKey, "1"); } catch { /* приватний режим */ }
              setFresh(false);
            }}
          >
            Зрозуміло
          </button>
        </div>
      ) : null}
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
      <nav className="hm-quick" aria-label="Швидкий доступ">
        {QUICK.map((item) => (
          <button key={item.route} type="button" onClick={() => onOpen(item.route)}>
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </section>
  );
}

const QUICK: { route: Route; label: string; icon: ReactNode }[] = [
  { route: "explorer", label: "Оглядач", icon: <Telescope size={19} strokeWidth={1.5} /> },
  { route: "leaders", label: "Рейтинг", icon: <Trophy size={19} strokeWidth={1.5} /> },
  { route: "learn", label: "Навчання", icon: <GraduationCap size={19} strokeWidth={1.5} /> },
  { route: "help", label: "Довідка", icon: <CircleHelp size={19} strokeWidth={1.5} /> },
];

function Mine({ world, user }: { world: World; user: Account }) {
  const creation = activeCreation(world, user.id);
  const wall = useWall(world.now);
  if (creation?.status === "charging" && creation.chargeStartedAt) {
    const readyAt = creation.chargeStartedAt + CHARGE_MS;
    const chance = Math.round(chanceOf(world.orbits.length) * 100);
    const elapsed = Math.min(1, Math.max(0, (wall - creation.chargeStartedAt) / CHARGE_MS));
    const leftMs = readyAt - wall;
    return (
      <div className="orbit-stack">
        <section className="orbit-block ch-hero ch-live">
          <p className="orbit-kicker">Заряд</p>
          <Satellites trackId={creation.id} lit={8} charge={elapsed} state="charge" label={`Усі 8 супутників на місці. Заряджено ${Math.round(elapsed * 100)}%, залишилось ${left(leftMs)}.`}>
            <b className="ch-big">Шанс {chance}%</b>
            <small className="ch-small">{leftMs > 0 ? `Залишилось ${left(leftMs)}` : "Ось-ось буде результат"}</small>
          </Satellites>
          <p className="orbit-note ch-center">Орбіта набирає заряд. Результат з’явиться тут сам — застосунок можна закрити.</p>
          <Witnesses world={world} creation={creation} title="Тебе запускають" />
        </section>
        <ConfirmCard userId={user.id} ownCode={null} />
      </div>
    );
  }

  if (creation?.status === "collecting") {
    const day = utcDay(world.now);
    const used = creation.codeDay === day ? creation.codesToday : 0;
    const live = Boolean(creation.code && wall < creation.codeExpires);
    return (
      <div className="orbit-stack">
      <section className="orbit-block ch-hero">
        <p className="orbit-kicker">Запуск · підтвердження</p>
        <Satellites trackId={creation.id} lit={creation.confirms.length} state="collect" label={`${creation.confirms.length} з 8 супутників світяться`}>
          <b className="ch-big">{creation.confirms.length} з 8</b>
          <small className="ch-small">підтверджень</small>
        </Satellites>
        <Witnesses world={world} creation={creation} title="Підтвердили" />
        {live && creation.code ? (
          <CodeShare code={creation.code} expires={creation.codeExpires} now={wall} />
        ) : (
          <>
            {creation.code ? <p className="orbit-note ch-center">Код згас. Створи новий — він діятиме 10 хвилин.</p> : null}
            <button type="button" className="orbit-go" disabled={used >= CODES_PER_DAY} onClick={() => useOrbits.getState().issue()}>
              Створити код підтвердження
            </button>
            <Notice />
          </>
        )}
        <p className="orbit-note">
          Кодів сьогодні: {used} з {CODES_PER_DAY}{used >= CODES_PER_DAY ? ". Нові — після 00:00 UTC." : ""}
        </p>
        <Names world={world} userId={user.id} />
      </section>
      <ConfirmCard userId={user.id} ownCode={live ? creation.code : null} />
      </div>
    );
  }

  const chance = Math.round(chanceOf(world.orbits.length) * 100);
  return (
    <div className="orbit-stack">
      <section className="orbit-block">
        <p className="orbit-kicker">Запуск орбіти</p>
        <h1 className="orbit-h">Запусти свою орбіту</h1>
        <p className="orbit-note">Потрібно 8 підтверджень від інших учасників, а потім 24 години заряду. Шанс зараз — {chance}%.</p>
        <button type="button" className="orbit-go" onClick={() => void useOrbits.getState().start()}>
          Почати запуск
        </button>
        <Notice />
      </section>
      <ConfirmCard userId={user.id} ownCode={null} />
      <Names world={world} userId={user.id} />
    </div>
  );
}

/** «Підтверди запуск учасника». Код з посилання ?c= лише підставляється — надсилає людина. */
function ConfirmCard({ userId, ownCode }: { userId: string; ownCode: string | null }) {
  const [digits, setDigits] = useState("");
  const [fromLink, setFromLink] = useState(false);
  const [own, setOwn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    setDigits("");
    setSaid(null);
  }, [userId]);
  useEffect(() => {
    const take = () => {
      const invite = readInvite();
      if (!invite) return;
      if (ownCode && invite.code === ownCode) {
        // Своє посилання відкрили на своєму ж телефоні — не підставляємо.
        dropInvite();
        setOwn(true);
        return;
      }
      setDigits(invite.code);
      setFromLink(true);
      setOwn(false);
      window.requestAnimationFrame(() => {
        box.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        field.current?.focus({ preventScroll: true });
      });
    };
    take();
    window.addEventListener(INVITE_EVENT, take);
    return () => window.removeEventListener(INVITE_EVENT, take);
  }, [ownCode]);
  const typed = digits.replace(/\D/g, "").slice(0, 6);
  async function submit() {
    if (typed.length !== 6 || busy) return;
    setBusy(true);
    await useOrbits.getState().accept(typed);
    const state = useOrbits.getState();
    setBusy(false);
    setSaid({ text: sparkText(state.flash), bad: state.bad });
    if (!state.bad) {
      buzz([12, 60, 18]);
      setDigits("");
      setFromLink(false);
      dropInvite();
    } else buzz([30, 40, 30]);
  }
  return (
    <section className="orbit-block cs-confirm" ref={box} aria-labelledby="cs-confirm-title" data-link={fromLink ? "1" : "0"}>
      <p className="orbit-kicker">Підтвердження</p>
      <h2 className="orbit-h cs-h2" id="cs-confirm-title">Підтверди запуск учасника</h2>
      {fromLink ? (
        <p className="cs-from-link" role="status">
          Код із посилання вже в полі. Перевір цифри і натисни «Підтвердити».
        </p>
      ) : null}
      {own ? (
        <p className="cs-from-link" data-tone="warn" role="status">
          Це посилання з твоїм власним кодом. Надішли його іншому учаснику — свій запуск підтвердити не можна.
        </p>
      ) : null}
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="grid gap-1.5">
          <span className="orbit-kicker">Код від учасника</span>
          <input
            ref={field}
            className="orbit-field orbit-code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6 цифр"
            maxLength={7}
            value={typed.length > 3 ? `${typed.slice(0, 3)} ${typed.slice(3)}` : typed}
            aria-describedby="cs-confirm-note"
            onChange={(event) => {
              setDigits(event.target.value);
              setSaid(null);
              if (fromLink) setFromLink(false);
            }}
          />
        </label>
        <button type="submit" className="orbit-go" disabled={typed.length !== 6 || busy}>
          {busy ? "Підтверджуємо…" : "Підтвердити"}
        </button>
      </form>
      {said?.text ? (
        <p className={said.bad ? "orbit-flash" : "orbit-ok"} role="status">
          {said.text}
        </p>
      ) : null}
      <p className="orbit-note cs-note" id="cs-confirm-note">
        Якщо запуск пройде, ти отримаєш {WITNESS_OD} іскор ✦ і +{STABILITY_CONFIRM} до стабільності. Якщо ні — −{STABILITY_FAIL} стабільності.
      </p>
    </section>
  );
}

function Witnesses({ world, creation, title }: { world: World; creation: { confirms: { witnessId: string }[] }; title: string }) {
  if (!creation.confirms.length) return null;
  const names = creation.confirms.map((row) => world.accounts.find((account) => account.id === row.witnessId)?.name ?? "Учасник");
  return (
    <div className="ch-who">
      <span>{title}</span>
      <ul>
        {names.map((name, i) => (
          <li key={`${name}-${i}`}>{name}</li>
        ))}
      </ul>
    </div>
  );
}

function Names({ world, userId }: { world: World; userId: string }) {
  const names = world.accounts
    .filter((account) => account.id !== userId && world.now - account.lastActiveAt <= DAY_MS)
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
    .slice(0, 8);
  if (names.length === 0) return <p className="orbit-note">Зараз онлайн 0</p>;
  return <p className="orbit-note">Зараз: {names.map((account) => account.name).join(", ")}</p>;
}

function Flow({ world, user }: { world: World; user: Account }) {
  const wall = useWall(world.now);
  const due = world.lastDistributionAt + FUND_PERIOD_MS;
  const nowShare = previewShare(world, user.id);
  return (
    <section className="orbit-block">
      <p className="orbit-kicker">Фонд</p>
      <p className="orbit-price"><CountUp value={world.fund} /></p>
      <p className="orbit-unit">{sparkWord(world.fund)} ✦</p>
      <div className="orbit-stats">
        <div><b>{left(due - wall)}</b><span>поділ</span></div>
        <div><b>{money.format(nowShare)}</b><span>тобі</span></div>
        <div><b>{world.payouts.length}</b><span>виплат</span></div>
        <div><b>{money.format(world.trades.length)}</b><span>угод</span></div>
      </div>
      {world.payouts.length === 0 ? <p className="orbit-empty">Виплат 0 · перший поділ через {left(due - wall)}</p> : null}
      {world.payouts.length > 0 ? <p className="orbit-kicker">Світ</p> : null}
      {world.payouts.slice(0, 4).map((row, index) => {
        const name = world.accounts.find((account) => account.id === row.userId)?.name ?? "хтось";
        return (
          <div key={`${row.at}-${row.userId}-${index}`} className="orbit-row">
            <span>{name}</span>
            <span>{spk(row.amount)}</span>
          </div>
        );
      })}
    </section>
  );
}

function Person({ world, user, onOpen }: { world: World; user: Account; onOpen: (route: Route) => void }) {
  const lang = useLang();
  const [other, setOther] = useState("");
  const [pass, setPass] = useState("");
  const mine = world.orbits.filter((orbit) => orbit.ownerId === user.id);
  const known = world.accounts.find((account) => account.name.toLowerCase() === other.trim().toLowerCase());
  const held = deviceKeys();
  const [copied, setCopied] = useState(false);
  const ownKey = held[user.id];
  const local = world.accounts.filter((account) => held[account.id]);
  const [hidden] = useHidden();
  const leave = useLeave(user.id, user.name);
  return (
    <div className="orbit-stack">
      <section className="orbit-block">
        <p className="orbit-kicker">Профіль</p>
        <div className="orbit-profile">
          <Face userId={user.id} letter={user.name.slice(0, 1).toUpperCase()} />
          <div>
            <div className="orbit-h">{user.name}</div>
            <p className="orbit-note">Стабільність {user.stability} · орбіт {mine.length}</p>
          </div>
        </div>
        {mine.map((orbit) => (
          <div key={orbit.id} className="orbit-row">
            <span>{no(orbit.id)}</span>
            <span>твоя</span>
          </div>
        ))}
        {user.impulseUntil > world.now ? <p className="orbit-note">Імпульс ще {left(user.impulseUntil - world.now)}.</p> : null}
        <SelfCard />
      </section>
      <section className="orbit-block">
        <p className="orbit-kicker">Баланс</p>
        <p className="orbit-price">{hidden ? MASK : <CountUp value={user.balance} />}</p>
        <p className="orbit-unit">{hidden ? "приховано" : `${sparkWord(user.balance)} ✦`}</p>
        <TopupRow />
        <Soon />
      </section>
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

function TopupRow() {
  const [amount, setAmount] = useState(100);
  return (
    <div className="grid gap-3">
      <p className="orbit-kicker">Тест</p>
      <div className="orbit-chips">
        {[100, 500, 1000].map((value) => (
          <button key={value} type="button" className="orbit-chip" data-on={amount === value ? "1" : "0"} onClick={() => setAmount(value)}>
            {value}
          </button>
        ))}
      </div>
      <button type="button" className="orbit-go" onClick={() => useOrbits.getState().topup(amount)}>
        Тест · {sparks(amount)}
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
  if (!self) return null;
  return (
    <p className="orbit-note">
      {self.given} {self.family}. {self.email}. {self.phone}. {self.birth}.
    </p>
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
