import { ritualFrame } from "@/components/orbit/daily-charge";
import { Download } from "lucide-react";
import { LockedList } from "@/components/orbit/locked";
import { HUB_LOCKS } from "@/lib/orbit/locked";
import { Avatar } from "@/components/orbit/ui/kit";
import { useInstall } from "@/lib/orbit/pwa";
import { Boundary, LinkBanner } from "@/components/orbit/states";
import { Activity, Scale, Bell, GraduationCap, Trophy, CircleHelp, ChevronLeft, Percent, Shield, Telescope, ChevronRight, FileText, History as HistoryIcon, Mail, Search, Wallet, X, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DOC_GROUPS, DOCS, DRAFT_NOTE, EDITION, SUPPORT_MAIL, type DocId } from "@/lib/orbit/docs";

/** Маршрут повноекранної сторінки. Стек: назад = зняти верхню. */
export type Route = "more" | "docs" | "history" | "assets" | "inbox" | "fees" | "security" | "explorer" | "help" | "status" | "leaders" | "learn" | "transparency" | "live" | `doc:${DocId}`;

export function isDoc(route: Route): route is `doc:${DocId}` {
  return route.startsWith("doc:");
}

/** Іконка-плитка біля заголовка сторінки: один стиль для всіх розділів. */
const PAGE_ICON: Record<string, { icon: ReactNode; tone: string }> = {
  Історія: { icon: <HistoryIcon size={22} strokeWidth={1.8} />, tone: "ion" },
  Активи: { icon: <Wallet size={22} strokeWidth={1.8} />, tone: "sun" },
  Безпека: { icon: <Shield size={22} strokeWidth={1.8} />, tone: "aurora" },
  Довідка: { icon: <CircleHelp size={22} strokeWidth={1.8} />, tone: "aurora" },
  Документи: { icon: <FileText size={22} strokeWidth={1.8} />, tone: "nebula" },
  "Комісії і ліміти": { icon: <Percent size={22} strokeWidth={1.8} />, tone: "mars" },
  Навчання: { icon: <GraduationCap size={22} strokeWidth={1.8} />, tone: "ion" },
  "Оглядач орбіт": { icon: <Telescope size={22} strokeWidth={1.8} />, tone: "ion" },
  Рейтинг: { icon: <Trophy size={22} strokeWidth={1.8} />, tone: "sun" },
  Сповіщення: { icon: <Bell size={22} strokeWidth={1.8} />, tone: "nebula" },
  "Стан системи": { icon: <Activity size={22} strokeWidth={1.8} />, tone: "aurora" },
};

/** Повноекранна сторінка: шапка «Назад», заголовок, фокус на заголовку, Escape — назад. */
export function Page({
  title,
  kicker,
  onBack,
  onClose,
  children,
  footer,
}: {
  title: string;
  kicker?: string;
  onBack: () => void;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const head = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const back = useRef(onBack);
  back.current = onBack;
  const id = useMemo(() => `pg-${title.replace(/[^\p{L}\p{N}]+/gu, "-")}`, [title]);
  // Лише при зміні сторінки: фокус на заголовок і скрол угору. Оновлення світу кожні 2 с цього не чіпають.
  useEffect(() => {
    head.current?.focus({ preventScroll: true });
    body.current?.scrollTo({ top: 0 });
  }, [title]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") back.current();
    };
    window.addEventListener("keydown", onKey);
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      html.style.overflow = prev;
    };
  }, []);
  return (
    <div className="mo-page" role="dialog" aria-modal="true" aria-labelledby={id}>
      <header className="mo-bar">
        <button type="button" className="mo-icon" onClick={onBack} aria-label="Назад">
          <ChevronLeft size={20} strokeWidth={1.75} />
        </button>
        <span className="mo-bar-title" aria-hidden>{title}</span>
        {onClose ? (
          <button type="button" className="mo-icon" onClick={onClose} aria-label="Закрити все">
            <X size={18} strokeWidth={1.75} />
          </button>
        ) : (
          <span className="mo-icon-gap" />
        )}
      </header>
      <div className="mo-body" ref={body}>
        <div className="mo-inner">
          <div className="mo-head" data-tone={PAGE_ICON[title]?.tone ?? "none"}>
            {PAGE_ICON[title] ? <span className="mo-head-ico" aria-hidden>{PAGE_ICON[title].icon}</span> : null}
            <div>
              {kicker ? <p className="orbit-kicker">{kicker}</p> : null}
              <h1 className="orbit-h mo-title" id={id} ref={head} tabIndex={-1}>{title}</h1>
            </div>
          </div>
          <LinkBanner />
          <Boundary name={title}>{children}</Boundary>
        </div>
      </div>
      {footer ? <div className="mo-foot">{footer}</div> : null}
    </div>
  );
}

/** Рядок меню: іконка, назва, підпис, стрілка. */
export function Row({ icon, title, sub, onClick, badge, badgeOn }: { icon: ReactNode; title: string; sub?: string; onClick: () => void; badge?: string; badgeOn?: boolean }) {
  return (
    <button type="button" className="mo-row" onClick={onClick}>
      <span className="mo-row-ico" aria-hidden>{icon}</span>
      <span className="mo-row-text">
        <b>{title}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
      {badge ? <span className="mo-badge" data-on={badgeOn ? "1" : "0"}>{badge}</span> : null}
      <ChevronRight size={16} strokeWidth={1.75} className="mo-row-go" aria-hidden />
    </button>
  );
}


type Entry = { route: Route | "mail"; title: string; sub: string; icon: ReactNode; tone: "sun" | "ion" | "nebula" | "aurora" | "mars"; group: "mine" | "world" | "rules"; auth?: boolean; badge?: string };

function entries(docs: number, unread: number): Entry[] {
  return [
    { route: "assets", title: "Активи", sub: "Баланс, мої орбіти, статуси", icon: <Wallet size={18} strokeWidth={1.7} />, tone: "sun", group: "mine", auth: true },
    { route: "history", title: "Історія", sub: "Купівлі, продажі, заряди, фонд", icon: <HistoryIcon size={18} strokeWidth={1.7} />, tone: "ion", group: "mine", auth: true },
    { route: "inbox", title: "Сповіщення", sub: "Події світу і про мене", icon: <Bell size={18} strokeWidth={1.7} />, tone: "nebula", group: "mine", auth: true, badge: unread ? String(unread > 99 ? "99+" : unread) : undefined },
    { route: "security", title: "Безпека", sub: "Ключ, пристрій, вихід", icon: <Shield size={18} strokeWidth={1.7} />, tone: "aurora", group: "mine", auth: true },
    { route: "explorer", title: "Оглядач", sub: "Будь-яка орбіта за номером", icon: <Telescope size={18} strokeWidth={1.7} />, tone: "ion", group: "world", auth: true },
    { route: "live", title: "Живе", sub: "Чат світу, заявки на роль, питання", icon: <MessageCircle size={18} strokeWidth={1.7} />, tone: "aurora", group: "world", auth: true },
    { route: "leaders", title: "Рейтинг", sub: "Стабільність, орбіти, тримання", icon: <Trophy size={18} strokeWidth={1.7} />, tone: "sun", group: "world", auth: true },
    { route: "status", title: "Стан системи", sub: "Зв’язок, розклад ціни і фонду", icon: <Activity size={18} strokeWidth={1.7} />, tone: "aurora", group: "world", auth: true },
    { route: "transparency", title: "Прозорість", sub: "Усі іскри, випуск, фонд і звірка", icon: <Scale size={18} strokeWidth={1.7} />, tone: "sun", group: "world" },
    { route: "fees", title: "Комісії і ліміти", sub: "Скільки і за що, мої ліміти на сьогодні", icon: <Percent size={18} strokeWidth={1.7} />, tone: "mars", group: "rules", auth: true },
    { route: "docs", title: "Документи", sub: "Правила, умови, приватність, ризики", icon: <FileText size={18} strokeWidth={1.7} />, tone: "nebula", group: "rules", badge: String(docs) },
    { route: "learn", title: "Навчання", sub: "5 уроків по хвилині", icon: <GraduationCap size={18} strokeWidth={1.7} />, tone: "ion", group: "rules" },
    { route: "help", title: "Довідка", sub: "Відповіді на часті питання", icon: <CircleHelp size={18} strokeWidth={1.7} />, tone: "aurora", group: "rules" },
    { route: "mail", title: "Написати нам", sub: SUPPORT_MAIL, icon: <Mail size={18} strokeWidth={1.7} />, tone: "sun", group: "rules" },
  ];
}

const TILES: Route[] = ["assets", "history", "inbox", "security", "explorer", "leaders", "learn", "help"];
const GROUPS: { id: Entry["group"]; title: string }[] = [
  { id: "mine", title: "Мої іскри" },
  { id: "world", title: "Світ" },
  { id: "rules", title: "Правила і підтримка" },
];

/** Хаб «Ще». Плитки найчастішого, пошук по розділах, групи, «Скоро». Нижнє меню не росте. */
export function MoreHub({ onOpen, onBack, signedIn, unread = 0, profile }: { onOpen: (route: Route) => void; onBack: () => void; signedIn: boolean; unread?: number; profile?: { name: string; id: string; line: string } }) {
  const [query, setQuery] = useState("");
  const all = entries(Object.keys(DOCS).length, unread).filter((row) => signedIn || !row.auth);
  const go = (row: Entry) => {
    if (row.route === "mail") window.location.href = `mailto:${SUPPORT_MAIL}?subject=${encodeURIComponent("Орбіти")}`;
    else onOpen(row.route);
  };
  const q = query.trim().toLowerCase();
  const hits = q ? all.filter((row) => `${row.title} ${row.sub}`.toLowerCase().includes(q)) : null;
  const tiles = signedIn ? TILES.map((id) => all.find((row) => row.route === id)).filter((row): row is Entry => Boolean(row)) : [];
  const install = useInstall();
  return (
    <Page title="Ще" kicker="Орбіти" onBack={onBack}>
      {profile ? (
        <button type="button" className="mh-me" onClick={() => onOpen("assets")}>
          <Avatar id={profile.id} name={profile.name} size={44} me frame={typeof window === "undefined" ? undefined : ritualFrame(profile.id)} />
          <span><b>{profile.name}</b><small>{profile.line}</small></span>
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
        </button>
      ) : null}
      {install.can ? (
        <button type="button" className="mh-install" onClick={() => void install.install()}>
          <span className="mh-install-ico" aria-hidden><Download size={18} strokeWidth={1.8} /></span>
          <span><b>Встановити «Орбіти»</b><small>Іконка на головному екрані, відкривається без браузера</small></span>
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
        </button>
      ) : null}
      <label className="mo-search">
        <Search size={16} strokeWidth={1.75} aria-hidden />
        <input type="search" value={query} placeholder="Пошук розділу" aria-label="Пошук розділу" maxLength={40} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {hits ? (
        <section className="mo-group" aria-live="polite">
          <p className="mo-group-title">Знайдено: {hits.length}</p>
          {hits.length ? (
            <div className="mo-card">
              {hits.map((row) => <Row key={row.route} icon={row.icon} title={row.title} sub={row.sub} badge={row.badge} badgeOn={row.route === "inbox" && Boolean(unread)} onClick={() => go(row)} />)}
            </div>
          ) : (
            <p className="orbit-empty">Нічого немає · спробуй інше слово</p>
          )}
        </section>
      ) : (
        <>
          {tiles.length ? (
            <nav className="mh-tiles" aria-label="Найчастіше">
              {tiles.map((row) => (
                <button key={row.route} type="button" data-tone={row.tone} onClick={() => go(row)} aria-label={row.badge && row.route === "inbox" ? `${row.title}, нових ${row.badge}` : row.title}>
                  <span aria-hidden>{row.icon}{row.badge && row.route === "inbox" ? <b>{row.badge}</b> : null}</span>
                  {row.title}
                </button>
              ))}
            </nav>
          ) : null}
          {GROUPS.map((group) => {
            const rows = all.filter((row) => row.group === group.id);
            if (!rows.length) return null;
            return (
              <section key={group.id} className="mo-group" aria-label={group.title}>
                <p className="mo-group-title">{group.title}</p>
                <div className="mo-card">
                  {rows.map((row) => (
                    <Row key={row.route} icon={row.icon} title={row.route === "explorer" ? "Оглядач орбіт" : row.title} sub={row.sub} badge={row.badge} badgeOn={row.route === "inbox" && Boolean(unread)} onClick={() => go(row)} />
                  ))}
                </div>
              </section>
            );
          })}
          <LockedList ids={HUB_LOCKS} title="Скоро" note="Без дат. Гроші ззовні — після юридичного оформлення." className="mh-locks" />
        </>
      )}
    </Page>
  );
}

function docText(id: DocId) {
  const doc = DOCS[id];
  return [doc.title, doc.short, ...doc.sections.flatMap((section) => [section.h, ...section.p])].join(" ").toLowerCase();
}

/** Список документів з пошуком. */
export function DocList({ onOpen, onBack, onClose }: { onOpen: (id: DocId) => void; onBack: () => void; onClose?: () => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const hits = useMemo(() => {
    if (q.length < 2) return null;
    return (Object.keys(DOCS) as DocId[]).filter((id) => docText(id).includes(q));
  }, [q]);
  return (
    <Page title="Документи" kicker={EDITION} onBack={onBack} onClose={onClose}>
      <p className="mo-draft">{DRAFT_NOTE}</p>
      <label className="mo-search">
        <Search size={16} strokeWidth={1.75} aria-hidden />
        <input
          type="search"
          value={query}
          placeholder="Пошук у документах"
          aria-label="Пошук у документах"
          maxLength={40}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {hits ? (
        <section className="mo-group" aria-live="polite">
          <p className="mo-group-title">{hits.length > 0 ? `Знайдено: ${hits.length}` : "Знайдено: 0"}</p>
          {hits.length === 0 ? (
            <p className="orbit-empty">Нічого немає · спробуй інше слово</p>
          ) : (
            <div className="mo-card">
              {hits.map((id) => (
                <Row key={id} icon={<FileText size={18} strokeWidth={1.5} />} title={DOCS[id].title} sub={DOCS[id].short} onClick={() => onOpen(id)} />
              ))}
            </div>
          )}
        </section>
      ) : (
        DOC_GROUPS.map((group) => (
          <section key={group.title} className="mo-group" aria-label={group.title}>
            <p className="mo-group-title">{group.title}</p>
            <div className="mo-card">
              {group.ids.map((id) => (
                <Row key={id} icon={<FileText size={18} strokeWidth={1.5} />} title={DOCS[id].title} sub={DOCS[id].short} onClick={() => onOpen(id)} />
              ))}
            </div>
          </section>
        ))
      )}
    </Page>
  );
}

/** Один документ: зміст, розділи, сусідні документи. */
export function DocView({ id, onBack, onClose, onOpen }: { id: DocId; onBack: () => void; onClose?: () => void; onOpen?: (id: DocId) => void }) {
  const doc = DOCS[id];
  const order = DOC_GROUPS.flatMap((group) => group.ids);
  const next = order[(order.indexOf(id) + 1) % order.length];
  return (
    <Page
      title={doc.title}
      kicker={EDITION}
      onBack={onBack}
      onClose={onClose}
      footer={
        <button type="button" className="orbit-go" onClick={onBack}>
          Зрозуміло
        </button>
      }
    >
      <p className="mo-draft">{DRAFT_NOTE}</p>
      {doc.sections.length > 3 ? (
        <nav className="mo-toc" aria-label="Зміст">
          {doc.sections.map((section, index) => (
            <button
              key={section.h}
              type="button"
              className="orbit-chip"
              onClick={() => document.getElementById(`${id}-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              {section.h.replace(/^\d+\.\s*/, "")}
            </button>
          ))}
        </nav>
      ) : null}
      <article className="mo-doc">
        {doc.sections.map((section, index) => (
          <section key={section.h} id={`${id}-${index}`} className="mo-sec">
            <h2>{section.h}</h2>
            {section.p.map((line) => (
              <p key={line}>
                {line.split(/(https:\/\/[^\s]+)/).map((part, i) =>
                  /^https:\/\//.test(part) ? (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer">
                      {part}
                    </a>
                  ) : (
                    part
                  ),
                )}
              </p>
            ))}
          </section>
        ))}
      </article>
      <p className="orbit-note">Питання — {SUPPORT_MAIL}</p>
      {onOpen ? (
        <button type="button" className="mo-next" onClick={() => onOpen(next)}>
          <span>
            <small>Далі</small>
            <b>{DOCS[next].title}</b>
          </span>
          <ChevronRight size={18} strokeWidth={1.75} aria-hidden />
        </button>
      ) : null}
    </Page>
  );
}
