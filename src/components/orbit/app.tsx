import { EchoCard } from "@/components/orbit/echo-card";
import { AuthMethods } from "@/components/orbit/auth-methods";
import { InstallButton } from "@/components/orbit/install";
import { useRouterState } from "@tanstack/react-router";
import { humanize } from "@/components/orbit/ui/feed";
import { AppSkeleton } from "@/components/orbit/ui/skeleton";
import { PioneerBoard, PioneerCard } from "@/components/orbit/pioneer";
import { DailyCharge } from "@/components/orbit/daily-charge";
import { Activity, Banners, FirstStep, MarketsCard, PriceMini, isNewcomer, Wallet as WalletCard } from "@/components/orbit/home";
import { AlertCircle, CheckCircle2, Clock3, ListOrdered, Rocket, ShoppingCart, Tag } from "lucide-react";
import { ArrowLeftRight, Bell, CircleHelp, Telescope, Trophy, Hexagon, LayoutGrid, Orbit, UserRound, Wallet, Waves } from "lucide-react";
import type { Confirm } from "@/components/orbit/exchange";
import { type Route } from "@/components/orbit/more";
import { LockedSheet } from "@/components/orbit/locked";
import type { LockId } from "@/lib/orbit/locked";
import { rememberTopup } from "@/lib/orbit/ledger";
import { MASK, useHidden } from "@/lib/orbit/prefs";
import { toastsOn, useInbox } from "@/lib/orbit/inbox";
import type { DocId } from "@/lib/orbit/docs";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
// 14: важкі екрани — окремими чанками, вантажаться при першому відкритті.
const ExchangeLazy = lazy(() => import("@/components/orbit/exchange").then((m) => ({ default: m.Exchange })));
const ConfirmSheetLazy = lazy(() => import("@/components/orbit/exchange").then((m) => ({ default: m.ConfirmSheet })));
const ChecklistLazy = lazy(() => import("@/components/orbit/checklist").then((m) => ({ default: m.Checklist })));
function quiet<P extends object>(C: React.ComponentType<P>) {
  return function Quiet(props: P) {
    return (
      <Suspense fallback={null}>
        <C {...props} />
      </Suspense>
    );
  };
}
const ConfirmSheet = quiet(ConfirmSheetLazy as React.ComponentType<React.ComponentProps<typeof ConfirmSheetLazy>>);
const Checklist = quiet(ChecklistLazy as React.ComponentType<React.ComponentProps<typeof ChecklistLazy>>);
const ChargeResult = quiet(lazy(() => import("@/components/orbit/charge-result").then((m) => ({ default: m.ChargeResult }))) as React.ComponentType<React.ComponentProps<typeof import("@/components/orbit/charge-result").ChargeResult>>);
const OnboardingLazy = lazy(() => import("@/components/orbit/onboarding").then((m) => ({ default: m.Onboarding })));
/** Поки чанк знайомства вантажиться, головну вже накриває такий самий темний екран — нічого не «вискакує» поверх. */
function Onboarding(props: React.ComponentProps<typeof OnboardingLazy>) {
  return (
    <Suspense fallback={<div className="ob-screen" role="status" aria-busy="true" data-ob-wait=""><span className="visually-hidden">Завантажуємо…</span></div>}>
      <OnboardingLazy {...props} />
    </Suspense>
  );
}
const MineLazy = lazy(() => import("@/components/orbit/mine").then((m) => ({ default: m.Mine })));
const PersonLazy = lazy(() => import("@/components/orbit/person").then((m) => ({ default: m.Person })));
const Fund = lazy(() => import("@/components/orbit/fund").then((m) => ({ default: m.Fund })));
const PagesLazy = lazy(() => import("@/components/orbit/pages").then((m) => ({ default: m.Pages })));
/** Сторінки поверх вкладок вантажаться лише після першого відкриття (а потім лишаються — для анімації закриття). */
function Pages(props: React.ComponentProps<typeof PagesLazy>) {
  const [wanted, setWanted] = useState(props.stack.length > 0);
  useEffect(() => {
    if (props.stack.length > 0) setWanted(true);
  }, [props.stack.length]);
  if (!wanted) return null;
  return (
    <Suspense fallback={null}>
      <PagesLazy {...props} />
    </Suspense>
  );
}
import { LangRow, Notice, money, no, left, nextMidnight, useWall, useLang, when, CountUp } from "@/components/orbit/app-bits";
import { registerShell } from "@/lib/orbit/pwa";
import { Boundary, LinkBanner } from "@/components/orbit/states";
import { sparkText, spk, t, type Lang } from "@/lib/orbit/copy";
import { activeCreation, chanceOf, DAY_MS, me, type Account, type World } from "@/lib/orbit/engine";
import { bootOrbits, pendingKeyScreen, startPolling, useOrbits } from "@/lib/orbit/store";
import { KeyScreen } from "@/components/orbit/key";
import { markSeen, unseenOutcome } from "@/components/orbit/charge-outcome";
import { Starfield } from "@/components/orbit/space/starfield";
import { onboardingDue } from "@/components/orbit/onboarding-due";
import { OrbitRings } from "@/components/orbit/space/orbit-rings";
import { useCountUp } from "@/lib/orbit/count-up";
import { launchPreview } from "@/lib/orbit/share";
import { catchInvite, INVITE_EVENT, readInvite } from "@/lib/orbit/invite";
import { buzz } from "@/lib/orbit/feel";

type Tab = "home" | "market" | "mine" | "flow" | "me";

const TABS: { id: Tab; key: "home" | "market" | "mine" | "flow" | "me"; icon: typeof Orbit }[] = [
  { id: "home", key: "home", icon: Orbit },
  { id: "market", key: "market", icon: ArrowLeftRight },
  { id: "mine", key: "mine", icon: Hexagon },
  { id: "flow", key: "flow", icon: Waves },
  { id: "me", key: "me", icon: UserRound },
];









export function OrbitApp() {
  useEffect(() => registerShell(), []);
  const world = useOrbits((state) => state.world);
  const flash = useOrbits((state) => state.flash);
  const bad = useOrbits((state) => state.bad);
  const registerPerson = useOrbits((state) => state.registerPerson);
  const enterMail = useOrbits((state) => state.enterMail);
  const ready = useOrbits((state) => state.ready);
  const fresh = useOrbits((state) => state.fresh);
  const lang = useLang();
  const [tab, setTab] = useState<Tab>("home");
  const nav = useStack();
  const [hidden] = useHidden();
  const [, bumpSeen] = useState(0);
  const [intro, setIntro] = useState(false);
  // null — ще не знаємо (сервер і перший кадр однакові), true — на телефоні є збережений вхід.
  const [returning, setReturning] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setReturning(Boolean(localStorage.getItem("orbits-who")));
    } catch {
      setReturning(false);
    }
  }, []);

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
    return startPolling();
  }, []);

  const user = me(world);
  const inbox = useInbox(world, user);
  const userId = user?.id;
  // Сигнал «схоже на автоклікер» — лише позначка для перевірки людиною, нічого не забирає.
  useEffect(() => {
    if (!userId) return;
    let off: (() => void) | null = null;
    let gone = false;
    void import("@/components/orbit/live").then((m) => {
      if (!gone) off = m.watchBot();
    });
    return () => {
      gone = true;
      off?.();
    };
  }, [userId]);
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
  // Рішення про знайомство приймаємо один раз, коли акаунт уже є у світі (раніше світ міг прийти пізніше за userId —
  // тоді знайомство або губилось, або з’являлось поверх головної через кілька секунд).
  const hasAccount = useOrbits((state) => Boolean(userId && state.world.accounts.some((row) => row.id === userId)));
  const decided = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || !hasAccount || keyScreen) return;
    if (decided.current === userId) return;
    decided.current = userId;
    // Знайомство — після екрана ключа, один раз для акаунта на цьому пристрої.
    const w = useOrbits.getState().world;
    const account = userId ? w.accounts.find((row) => row.id === userId) : undefined;
    // Хто вже має орбіту чи запуск, знайомства не потребує.
    const veteran = Boolean(userId && (w.orbits.some((o) => o.ownerId === userId) || w.creations.some((c) => c.userId === userId)));
    setIntro(Boolean(account && !veteran && onboardingDue(account.id, account.createdAt, Date.now())));
  }, [userId, hasAccount, keyScreen]);
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
  if (!user && !ready && returning !== false) {
    // Перше завантаження: людина з цього телефону вже входила — показуємо каркас застосунку, а не форму входу.
    return (
      <div className="orbit-app">
        <Starfield />
        {returning ? <AppSkeleton /> : <div className="sk-splash" role="status" aria-busy="true"><img src="/favicon.svg" alt="" width={56} height={56} /><span className="visually-hidden">Завантажуємо…</span></div>}
      </div>
    );
  }
  if (!user) {
    return <Gate flash={flash} bad={bad} ready={ready} lang={lang} onCreate={registerPerson} onMail={enterMail} />;
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
      {intro && !outcome ? <Onboarding userId={user.id} onDone={() => setIntro(false)} /> : null}
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
      <main className="orbit-shell">
        <h1 className="visually-hidden">Орбіти</h1>
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
        <LinkBanner />
        <div key={tab} className="tab-in">
          <Boundary name={tab}>
          {tab === "home" ? <Home world={world} user={user} onTab={setTab} onOpen={nav.open} /> : null}
          {tab === "market" ? <Suspense fallback={<div className="orbit-empty" role="status"><span className="st-spin" aria-hidden /> Відкриваємо обмін…</div>}><ExchangeLazy world={world} user={user} /></Suspense> : null}
          {tab === "mine" ? <Suspense fallback={<div className="orbit-empty" role="status"><span className="st-spin" aria-hidden /> Відкриваємо заявку…</div>}><MineLazy world={world} user={user} onOpen={nav.open} /></Suspense> : null}
          {tab === "flow" ? <Suspense fallback={<div className="orbit-empty" role="status"><span className="st-spin" aria-hidden /> Відкриваємо фонд…</div>}><Fund world={world} user={user} /></Suspense> : null}
          {tab === "me" ? <Suspense fallback={<div className="orbit-empty" role="status"><span className="st-spin" aria-hidden /> Відкриваємо профіль…</div>}><PersonLazy world={world} user={user} onOpen={nav.open} /></Suspense> : null}
          </Boundary>
        </div>
        <Pages stack={nav.stack} onPush={nav.push} onPop={nav.pop} onReplace={nav.replace} onClose={nav.close} world={world} user={user} onTab={setTab} unread={inbox.unread} />
      </main>
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


/** Баланс у шапці: докручується і показує дельту «+20 ✦», коли змінюється. */
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
  flash,
  bad,
  ready,
  lang,
  onCreate,
  onMail,
}: {
  flash: string;
  bad: boolean;
  ready: boolean;
  lang: Lang;
  onCreate: (input: { name: string; family: string; birth: string; email: string; phone: string }) => void;
  onMail: (email: string, key: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [given, setGiven] = useState("");
  const [family, setFamily] = useState("");
  const [birth, setBirth] = useState("");
  const [key, setKey] = useState("");
  const nav = useStack();
  const [haveKey, setHaveKey] = useState(false);
  const mailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  // Вхід: ключ + пошта (або сам ключ). Імена не унікальні, тож за ім’ям не шукаємо.
  const enteringMail = key.trim().length >= 8 && (mailOk || email.trim() === "");
  const [invited, setInvited] = useState(false);
  // 14c: хто запрошує — з прев’ю посилання (той самий сервер, що й для Telegram-картки).
  const live = useRouterState({ select: (state) => state.matches.find((m) => m.routeId === "/")?.loaderData as { who: string | null; n: number } | undefined });
  // Адресу з ?c= чистимо після старту, і лоадер перечитується без коду — тримаємо перше відоме ім’я.
  const [host, setHost] = useState(live?.who ? live : undefined);
  useEffect(() => {
    if (live?.who) setHost(live);
  }, [live]);
  useEffect(() => {
    // Гостьовий банер: якщо лоадер уже перечитався без ?c= (або форма відкрилась пізніше), питаємо прев’ю за кодом із сесії.
    if (!invited || host?.who) return;
    const code = readInvite()?.code;
    if (!code) return;
    let alive = true;
    void launchPreview({ data: { c: code } })
      .then((p) => {
        if (alive && p.who) setHost(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [invited, host?.who]);
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
        <section className="gt-hero" aria-labelledby="gt-title">
          <div className="gt-emblem" aria-hidden>
            <span className="gt-ring gt-ring-a" />
            <span className="gt-ring gt-ring-b" />
            <span className="gt-planet" />
            <span className="gt-moon" />
          </div>
          <p className="orbit-kicker">{t(lang, "brand")}</p>
          <h1 id="gt-title">{t(lang, "sub")}</h1>
          <ol className="gt-steps" aria-label="Як це працює">
            <li><b>1</b><span>Акаунт за хвилину — без пароля</span></li>
            <li><b>2</b><span>Друг підтверджує твій запуск</span></li>
            <li><b>3</b><span>24 години заряду — і орбіта твоя</span></li>
          </ol>
          <details className="gt-about">
            <summary>Що таке Орбіти?</summary>
            <ul>
              <li><b>Світ з обмеженим числом орбіт.</b> Усього їх 8 000 000, більше не з’явиться. У кожної — свій номер і власник.</li>
              <li><b>Орбіта народжується з довіри.</b> Ти подаєш заявку, одна жива людина підтверджує її кодом — і за 24 години заряду орбіта твоя.</li>
              <li><b>✦ — іскри гри.</b> Ними купують і продають орбіти всередині світу. Це не гроші: курсу немає, вивести не можна.</li>
              <li><b>Без обіцянок доходу.</b> Ми не обіцяємо прибутку. Оплата — «Скоро», лише після юридичного оформлення.</li>
            </ul>
          </details>
        </section>
        <GuestStats />
        <InstallButton variant="hero" />
        {invited ? (
          <p className="cs-invite" role="status">
            {host?.who ? `${host.who} запрошує тебе підтвердити запуск орбіти · підтверджень уже: ${host.n}.` : "Тебе запросили підтвердити запуск орбіти."} Увійди або створи акаунт — код уже чекатиме у вкладці «Заявка».
          </p>
        ) : null}
        <AuthMethods
          onPrefill={(p) => {
            setHaveKey(false);
            if (p.email) setEmail(p.email);
            if (p.phone) setPhone(p.phone);
          }}
        />
        <form
          className="orbit-block gt-form"
          aria-labelledby="gt-form-title"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            if (haveKey && enteringMail) onMail(email.trim(), key.trim());
            else onCreate({ name: given.trim(), family: family.trim(), birth, email: email.trim(), phone: phone.trim() });
          }}
        >
          <h2 id="gt-form-title" className="gt-form-title">{haveKey ? "Увійти ключем" : "Створити акаунт"}</h2>
          <Field label={t(lang, "email")} value={email} autoComplete="email" inputMode="email" onChange={setEmail} />
          {haveKey ? (
            <>
              <Field label={t(lang, "key")} value={key} autoComplete="off" onChange={setKey} />
              <p className="orbit-note">Пошту можна не вводити: ключ сам знаходить акаунт.</p>
            </>
          ) : (
            <>
              <Field label={t(lang, "phone")} value={phone} autoComplete="tel" inputMode="tel" onChange={setPhone} />
              <div className="gt-pair">
                <Field label={t(lang, "given")} value={given} autoComplete="given-name" onChange={setGiven} />
                <Field label={t(lang, "family")} value={family} autoComplete="family-name" onChange={setFamily} />
              </div>
              <label className="grid gap-1.5">
                <span className="orbit-kicker">{t(lang, "birth")}</span>
                <input className="orbit-field" type="date" value={birth} onChange={(event) => setBirth(event.target.value)} />
              </label>
              <p className="orbit-note">Іншим учасникам показуємо лише ім’я та першу літеру прізвища.</p>
            </>
          )}
          <button className="orbit-go" type="submit" disabled={!ready || !(haveKey ? enteringMail : readyForm)}>
            {ready ? (haveKey ? t(lang, "enter") : t(lang, "create")) : "…"}
          </button>
          {flash ? <p className={bad ? "orbit-flash" : "orbit-ok"}>{flash}</p> : null}
          <button type="button" className="orbit-quiet" onClick={() => setHaveKey((value) => !value)}>
            {haveKey ? "Нова людина" : "Вже є ключ"}
          </button>
        </form>
        <LangRow lang={lang} />
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
      <p className="orbit-note">{self.mailCode ? `Код: ${self.mailCode}` : `Ми надіслали 6 цифр на ${self.email}. Немає листа — глянь у «Спам».`}</p>
      <label className="grid gap-1.5">
        <span className="orbit-kicker">Підтвердь пошту: 6 цифр з листа</span>
        <input className="orbit-field" inputMode="numeric" maxLength={6} value={typed} onChange={(event) => setCode(event.target.value)} />
      </label>
      <button type="button" className="orbit-go" disabled={typed.length < 6} onClick={() => useOrbits.getState().confirmMail(typed)}>
        Підтвердити пошту
      </button>
      <button type="button" className="orbit-quiet" onClick={() => useOrbits.getState().resendMail()}>
        Надіслати код ще раз
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
  // Ярлики додатка (manifest shortcuts): /?open=live|inbox|assets відкриває розділ одразу.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const want = u.searchParams.get("open");
      if (want === "live" || want === "inbox" || want === "assets") {
        setStack(["more", want]);
        u.searchParams.delete("open");
        window.history.replaceState(window.history.state, "", u.pathname + (u.search === "?" ? "" : u.search) + u.hash);
      }
    } catch { /* старий браузер */ }
  }, []);
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

/** Повноекранні моменти (ключ, знайомство, результат заряду): сповіщення чекає, поки вони закриються. */
const HOLD_TOAST = ".ky-screen, .ob-screen, .cr-screen";

function Toast({ text, bad, event }: { text: string; bad: boolean; event: string }) {
  const [shown, setShown] = useState<{ text: string; bad: boolean; id: number } | null>(null);
  const [held, setHeld] = useState(false);
  const firstEvent = useRef(event);
  useEffect(() => {
    if (!text) return;
    setShown({ text, bad, id: Date.now() });
  }, [text, bad]);
  useEffect(() => {
    if (!event || event === firstEvent.current) return;
    firstEvent.current = event;
    if (!toastsOn()) return;
    setShown({ text: humanize(sparkText(event)), bad: false, id: Date.now() });
  }, [event]);
  useEffect(() => {
    const check = () => setHeld(Boolean(document.querySelector(HOLD_TOAST)));
    check();
    const watch = new MutationObserver(check);
    watch.observe(document.body, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, []);
  useEffect(() => {
    if (!shown || held) return;
    const timer = window.setTimeout(() => setShown(null), 2600);
    return () => window.clearTimeout(timer);
  }, [shown, held]);
  if (!shown || held) return null;
  return (
    <div className="orbit-toast" data-bad={shown.bad ? "1" : "0"} role="status" onClick={() => setShown(null)}>
      <span className="orbit-toast-ico" aria-hidden>{shown.bad ? <AlertCircle size={18} strokeWidth={2} /> : <CheckCircle2 size={18} strokeWidth={2} />}</span>
      <span>{sparkText(shown.text)}</span>
    </div>
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

/** До входу: лише загальні цифри світу, без імен і без того, хто кого підтвердив. */
function GuestStats() {
  const pub = useOrbits((state) => state.pub);
  // Місце тримаємо одразу (з «—»), щоб форма не стрибала, коли прийдуть цифри (CLS).
  const show = (n: number | undefined) => (pub && n !== undefined ? money.format(n) : "—");
  return (
    <div className="orbit-stats gs-stats" aria-label="Світ Орбіт зараз" aria-busy={!pub}>
      <div><b>{show(pub?.people)}</b><span>учасників</span></div>
      <div><b>{show(pub?.orbits)}</b><span>орбіт</span></div>
      <div><b>{show(pub?.price)}</b><span>✦ ціна дня</span></div>
      <div><b>{show(pub?.queue)}</b><span>у черзі</span></div>
    </div>
  );
}

function Home({ world, user, onTab, onOpen }: { world: World; user: Account; onTab: (tab: Tab) => void; onOpen: (route: Route) => void }) {
  const lang = useLang();
  const wall = useWall(world.now);
  const pendingMail = useOrbits((state) => state.self)?.confirmed === false;
  const [lock, setLock] = useState<LockId | null>(null);
  const [sheet, setSheet] = useState<Confirm>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const runSheet = async (job: () => Promise<void>) => {
    setSheetBusy(true);
    try {
      await job();
    } finally {
      setSheetBusy(false);
      setSheet(null);
    }
  };
  const oldest = world.queue[0];
  const loose = world.orbits.find((orbit) => orbit.ownerId === user.id && !world.queue.some((row) => row.orbitId === orbit.id));
  const canBuy = Boolean(oldest && oldest.userId !== user.id);
  const creation = activeCreation(world, user.id);
  const onMine = () => onTab("mine");
  let label = "Почати запуск";
  let icon: ReactNode = <Rocket size={18} strokeWidth={2} aria-hidden />;
  let act = () => {
    if (!creation) useOrbits.getState().start();
    onMine();
  };
  let disabled = false;
  if (canBuy) {
    label = t(lang, "buy");
    icon = <ShoppingCart size={18} strokeWidth={2} aria-hidden />;
    act = () => setSheet({ kind: "buy" });
  } else if (loose) {
    label = t(lang, "sell");
    icon = <Tag size={18} strokeWidth={2} aria-hidden />;
    act = () => setSheet({ kind: "sell", orbitId: loose.id });
  } else if (oldest?.userId === user.id) {
    label = "Перша в черзі твоя";
    icon = <ListOrdered size={18} strokeWidth={2} aria-hidden />;
    disabled = true;
    act = () => undefined;
  } else if (creation) {
    label = "До мого запуску";
    act = onMine;
  }
  const chance = Math.round(chanceOf(world.orbits.length) * 100);
  const online = world.accounts.filter((account) => wall - account.lastActiveAt <= DAY_MS).length;
  const lastTrade = world.trades[world.trades.length - 1];
  return (
    <div className="orbit-stack hm">
      {isNewcomer(world, user) && !pendingMail ? <FirstStep onTab={onTab} /> : null}
      <WalletCard world={world} user={user} onTab={onTab} onLocked={() => setLock("buy")} />
      {!pendingMail ? <Checklist world={world} user={user} onTab={onTab} /> : null}
      <EchoCard world={world} user={user} onOpen={() => onOpen("constellation")} />
      <DailyCharge world={world} user={user} />
      {!pendingMail ? <PioneerCard world={world} user={user} /> : null}
      <section className="orbit-block hm-price" aria-labelledby="hm-price-title">
        <div className="hm-hero">
          <OrbitRings />
          <div className="hm-hero-num">
            <p className="orbit-kicker" id="hm-price-title">Ціна орбіти · {when(world.now)}</p>
            <p className="orbit-price"><CountUp value={world.price} /></p>
            <p className="orbit-unit">✦ за орбіту · одна для всіх</p>
          </div>
        </div>
        <PriceMini world={world} />
        <div className="orbit-stats">
          <div><b>{online}</b><span>онлайн</span></div>
          <div><b>{world.queue.length}</b><span>черга</span></div>
          <div><b>{money.format(world.orbits.length)}</b><span>орбіт</span></div>
          <div><b>{chance}%</b><span>шанс</span></div>
        </div>
        <div className="hm-notes">
          <span><Clock3 size={14} strokeWidth={1.8} aria-hidden /> Нова ціна через {left(nextMidnight(world.now) - world.now)}</span>
          {lastTrade ? <span><ArrowLeftRight size={14} strokeWidth={1.8} aria-hidden /> Остання угода {spk(lastTrade.amount)} · {no(lastTrade.orbitId)}</span> : null}
        </div>
        {pendingMail ? (
          <MailGate />
        ) : (
          <>
            <button type="button" className="orbit-go k-go" disabled={disabled} onClick={act}>
              {icon}
              {label}
            </button>
            <Notice />
          </>
        )}
      </section>
      <Banners world={world} user={user} onTab={onTab} onOpen={onOpen} onLocked={() => setLock("deposit")} />
      <MarketsCard world={world} onTab={onTab} />
      <Activity world={world} user={user} onOpen={onOpen} />
      <PioneerBoard world={world} user={user} />
      <nav className="hm-quick orbit-block" aria-label="Швидкий доступ">
        {QUICK.map((item) => (
          <button key={item.route} type="button" onClick={() => onOpen(item.route)}>
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      {lock ? <LockedSheet id={lock} onClose={() => setLock(null)} /> : null}
      {sheet ? (
        <ConfirmSheet
          world={world}
          user={user}
          confirm={sheet}
          busy={sheetBusy}
          onClose={() => setSheet(null)}
          onBuy={(price) => runSheet(() => useOrbits.getState().buy(price))}
          onSell={(orbitId) => runSheet(() => useOrbits.getState().list(orbitId))}
        />
      ) : null}
    </div>
  );
}

const QUICK: { route: Route; label: string; icon: ReactNode }[] = [
  { route: "explorer", label: "Оглядач", icon: <Telescope size={19} strokeWidth={1.5} /> },
  { route: "leaders", label: "Рейтинг", icon: <Trophy size={19} strokeWidth={1.5} /> },
  { route: "help", label: "Довідка", icon: <CircleHelp size={19} strokeWidth={1.5} /> },
];
