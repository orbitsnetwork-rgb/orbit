import { ChevronDown, ChevronRight, Mail, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Page, type Route } from "@/components/orbit/more";
import { SUPPORT_MAIL } from "@/lib/orbit/docs";
import { HELP_COUNT, TOPICS, type Faq } from "@/lib/orbit/help";

const POPULAR: [string, number][] = [
  ["start", 2],
  ["sparks", 1],
  ["orbits", 0],
  ["market", 1],
  ["account", 0],
];

type Hit = Faq & { key: string; topic: string };

function norm(text: string) {
  return text.toLowerCase().replace(/[’'ʼ]/g, "'");
}

export function Help({ onBack, onClose, onOpen, signedIn }: { onBack: () => void; onClose?: () => void; onOpen: (route: Route) => void; signedIn: boolean }) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("popular");
  const [open, setOpen] = useState<string | null>(null);
  const all = useMemo<Hit[]>(() => TOPICS.flatMap((row) => row.items.map((item, index) => ({ ...item, key: `${row.id}-${index}`, topic: row.title }))), []);
  const needle = norm(query.trim());
  const list: Hit[] = needle
    ? all.filter((item) => norm(`${item.q} ${item.a.join(" ")}`).includes(needle))
    : topic === "popular"
      ? POPULAR.map(([id, index]) => all.find((item) => item.key === `${id}-${index}`)).filter((item): item is Hit => Boolean(item))
      : all.filter((item) => item.key.startsWith(`${topic}-`));
  const linkOk = (item: Faq) => item.link && (item.link.doc || signedIn);

  return (
    <Page title="Довідка" kicker={`${HELP_COUNT} відповідей`} onBack={onBack} onClose={onClose}>
      <label className="mo-search">
        <Search size={16} strokeWidth={1.75} aria-hidden />
        <input
          type="search"
          value={query}
          placeholder="Пошук: ключ, фонд, ціна…"
          aria-label="Пошук у довідці"
          maxLength={40}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(null);
          }}
        />
      </label>
      {needle ? (
        <p className="orbit-note as-small" aria-live="polite">{list.length ? `Знайдено: ${list.length}` : "Нічого не знайшли"}</p>
      ) : (
        <div className="hi-chips" role="tablist" aria-label="Теми">
          {[{ id: "popular", title: "Популярне" }, ...TOPICS].map((row) => (
            <button
              key={row.id}
              type="button"
              role="tab"
              aria-selected={topic === row.id}
              className="orbit-chip"
              data-on={topic === row.id ? "1" : "0"}
              onClick={() => {
                setTopic(row.id);
                setOpen(null);
              }}
            >
              {row.title}
            </button>
          ))}
        </div>
      )}

      {list.length ? (
        <div className="mo-card hp-list">
          {list.map((item) => (
            <Item
              key={item.key}
              item={item}
              tag={needle || topic === "popular" ? item.topic : undefined}
              open={open === item.key}
              onToggle={() => setOpen((now) => (now === item.key ? null : item.key))}
              onLink={linkOk(item) ? () => item.link && onOpen(item.link.doc ? `doc:${item.link.doc}` : (item.link.route as Route)) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="orbit-empty hp-none">
          <b>Нічого про «{query.trim()}»</b>
          <span>Спробуй інше слово або напиши нам — додамо відповідь.</span>
          <button type="button" className="orbit-chip" onClick={() => setQuery("")}>Очистити пошук</button>
        </div>
      )}

      {!needle && topic === "popular" ? (
        <section className="mo-group" aria-label="Усі теми">
          <p className="mo-group-title">Теми</p>
          <div className="hp-topics">
            {TOPICS.map((row) => (
              <button key={row.id} type="button" className="hp-topic" onClick={() => setTopic(row.id)}>
                <b>{row.title}</b>
                <small>{row.sub}</small>
                <em>{row.items.length}</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="hp-contact" aria-label="Зв’язок">
        <Mail size={20} strokeWidth={1.5} aria-hidden />
        <div>
          <b>Не знайшов відповідь?</b>
          <small>Пиши на {SUPPORT_MAIL}. Додай ім’я в грі і час події. Ключ не надсилай.</small>
        </div>
        <button
          type="button"
          className="orbit-chip"
          onClick={() => {
            window.location.href = `mailto:${SUPPORT_MAIL}?subject=${encodeURIComponent("Довідка")}`;
          }}
        >
          Написати
        </button>
      </section>
    </Page>
  );
}

function Item({ item, tag, open, onToggle, onLink }: { item: Faq; tag?: string; open: boolean; onToggle: () => void; onLink?: () => void }) {
  const id = useId();
  return (
    <div className="hp-item" data-open={open ? "1" : "0"}>
      <button type="button" className="hp-q" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span>
          {tag ? <small>{tag}</small> : null}
          <b>{item.q}</b>
        </span>
        <ChevronDown size={17} strokeWidth={1.6} aria-hidden />
      </button>
      <div id={id} className="hp-a" role="region" hidden={!open}>
        {item.a.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {item.link && onLink ? (
          <button type="button" className="orbit-quiet hp-link" onClick={onLink}>
            {item.link.label} <ChevronRight size={14} strokeWidth={1.8} aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
