import { Bell, CircleHelp, ChevronLeft, Percent, Shield, Telescope, ChevronRight, FileText, History as HistoryIcon, Mail, Search, Wallet, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DOC_GROUPS, DOCS, DRAFT_NOTE, EDITION, SUPPORT_MAIL, type DocId } from "@/lib/orbit/docs";

/** Маршрут повноекранної сторінки. Стек: назад = зняти верхню. */
export type Route = "more" | "docs" | "history" | "assets" | "inbox" | "fees" | "security" | "explorer" | "help" | `doc:${DocId}`;

export function isDoc(route: Route): route is `doc:${DocId}` {
  return route.startsWith("doc:");
}

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
          {kicker ? <p className="orbit-kicker">{kicker}</p> : null}
          <h1 className="orbit-h mo-title" id={id} ref={head} tabIndex={-1}>{title}</h1>
          {children}
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

const SOON_HUB = [
  { title: "Вхід з кодом (2FA)", text: "Другий крок при вході." },
  { title: "Вийти на всіх пристроях", text: "Потрібна дія на сервері." },
  { title: "Закрити акаунт кнопкою", text: "Зараз — листом." },
  { title: "Ввід гривні", text: "Після юридичної перевірки." },
  { title: "Вивід на картку", text: "Після юридичної перевірки." },
  { title: "Обмін P2P", text: "Угоди між людьми." },
  { title: "Сповіщення про ціну", text: "Push на телефон." },
  { title: "Експорт історії", text: "Файл CSV." },
];

/** Хаб «Ще». Нові розділи додаються сюди, нижнє меню не росте. */
export function MoreHub({ onOpen, onBack, signedIn, unread = 0 }: { onOpen: (route: Route) => void; onBack: () => void; signedIn: boolean; unread?: number }) {
  return (
    <Page title="Ще" kicker="Орбіти" onBack={onBack}>
      {signedIn ? (
        <section className="mo-group" aria-label="Мої іскри">
          <p className="mo-group-title">Мої іскри</p>
          <div className="mo-card">
            <Row icon={<Wallet size={18} strokeWidth={1.5} />} title="Активи" sub="Баланс, мої орбіти, статуси" onClick={() => onOpen("assets")} />
            <Row icon={<HistoryIcon size={18} strokeWidth={1.5} />} title="Історія" sub="Поповнення, купівлі, продажі, заряди, фонд" onClick={() => onOpen("history")} />
            <Row icon={<Telescope size={18} strokeWidth={1.5} />} title="Оглядач орбіт" sub="Будь-яка орбіта за номером" onClick={() => onOpen("explorer")} />
            <Row icon={<Shield size={18} strokeWidth={1.5} />} title="Безпека" sub="Ключ, пристрій, вихід" onClick={() => onOpen("security")} />
            <Row icon={<Bell size={18} strokeWidth={1.5} />} title="Сповіщення" sub="Події світу і про мене" badge={unread ? String(unread) : undefined} badgeOn={Boolean(unread)} onClick={() => onOpen("inbox")} />
          </div>
        </section>
      ) : null}
      <section className="mo-group" aria-label="Документи і підтримка">
        <p className="mo-group-title">Правила</p>
        <div className="mo-card">
          {signedIn ? <Row icon={<Percent size={18} strokeWidth={1.5} />} title="Комісії і ліміти" sub="Скільки і за що, мої ліміти на сьогодні" onClick={() => onOpen("fees")} /> : null}
          <Row icon={<FileText size={18} strokeWidth={1.5} />} title="Документи" sub="Правила, умови, приватність, ризики" badge={String(Object.keys(DOCS).length)} onClick={() => onOpen("docs")} />
          <Row icon={<CircleHelp size={18} strokeWidth={1.5} />} title="Довідка" sub="Відповіді на часті питання" onClick={() => onOpen("help")} />
          <Row
            icon={<Mail size={18} strokeWidth={1.5} />}
            title="Написати нам"
            sub={SUPPORT_MAIL}
            onClick={() => {
              window.location.href = `mailto:${SUPPORT_MAIL}?subject=${encodeURIComponent("Орбіти")}`;
            }}
          />
        </div>
      </section>
      <section className="ex-soon" aria-label="Скоро">
        <p className="orbit-kicker">Скоро · без дат</p>
        {SOON_HUB.map((item) => (
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
              <p key={line}>{line}</p>
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
