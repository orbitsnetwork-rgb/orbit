/** Спільні елементи інтерфейсу v8: спарклайни, чипи змін, сегменти, аватари, ряд дій, банери, стрічка, скелетони. */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from "lucide-react";
import { reducedMotion } from "@/lib/orbit/feel";

const fmt = new Intl.NumberFormat("uk-UA");

/** Маленька лінія з заливкою. Плоский ряд малюється рівною лінією посередині. */
export function Sparkline({ values, tone = "sun", width = 72, height = 28, label }: { values: number[]; tone?: "sun" | "up" | "down" | "ion" | "nebula"; width?: number; height?: number; label?: string }) {
  const gid = useId().replace(/:/g, "");
  const list = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
  const lo = Math.min(...list);
  const hi = Math.max(...list);
  const span = hi - lo;
  const step = width / (list.length - 1);
  const xy = list.map((v, i) => [i * step, span ? height - 3 - ((v - lo) / span) * (height - 6) : height / 2] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg className="k-spark" data-tone={tone} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <linearGradient id={`sp-${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".32" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${line} ${width},${height}`} fill={`url(#sp-${gid})`} />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xy[xy.length - 1][0] - 1} cy={xy[xy.length - 1][1]} r="2.2" fill="currentColor" />
    </svg>
  );
}

/** Чип зміни: зелений угору, червоний униз, сірий — без змін. */
export function Change({ pct, abs, suffix = "" }: { pct?: number; abs?: number; suffix?: string }) {
  const n = pct ?? abs ?? 0;
  const dir = n > 0.0001 ? "up" : n < -0.0001 ? "down" : "flat";
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  const text = pct !== undefined ? `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1).replace(".", ",")}%` : `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt.format(Math.abs(n))}`;
  const spoken = dir === "flat" ? "без змін" : `${dir === "up" ? "зросло на" : "впало на"} ${text.replace(/^[+−]/, "")}`;
  return (
    <span className="k-chg" data-dir={dir} aria-label={`${spoken}${suffix ? ` ${suffix}` : ""}`}>
      <Icon size={12} strokeWidth={2.4} aria-hidden />
      {text}
      {suffix ? <small aria-hidden>{suffix}</small> : null}
    </span>
  );
}

/** Сегменти з ковзною підкладкою; стрілки ←/→ перемикають. */
export function Segmented<T extends string>({ options, value, onChange, label, size = "md" }: { options: { id: T; label: ReactNode }[]; value: T; onChange: (id: T) => void; label: string; size?: "sm" | "md" }) {
  const index = Math.max(0, options.findIndex((row) => row.id === value));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : options.length - 1)) % options.length;
    onChange(options[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className="k-seg" data-size={size} role="tablist" aria-label={label} onKeyDown={onKey} style={{ ["--n" as string]: options.length, ["--i" as string]: index }}>
      <span className="k-seg-pill" aria-hidden />
      {options.map((row, i) => (
        <button key={row.id} ref={(node) => { refs.current[i] = node; }} type="button" role="tab" aria-selected={row.id === value} tabIndex={row.id === value ? 0 : -1} data-on={row.id === value ? "1" : "0"} onClick={() => onChange(row.id)}>
          {row.label}
        </button>
      ))}
    </div>
  );
}

function hue(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Аватар-літера з кольором від id: однаковий для людини всюди. */
export function Avatar({ id, name, size = 36, badge, me = false }: { id: string; name: string; size?: number; badge?: ReactNode; me?: boolean }) {
  const h = hue(id || name);
  return (
    <span className="k-ava" data-me={me ? "1" : "0"} style={{ width: size, height: size, fontSize: Math.round(size * 0.42), ["--h" as string]: h }} aria-hidden>
      {(name || "?").slice(0, 1).toUpperCase()}
      {badge ? <i className="k-ava-badge">{badge}</i> : null}
    </span>
  );
}

/** Ряд швидких дій як у біржових застосунках: кругла іконка + підпис. */
export function ActionRow({ items, label }: { items: { id: string; label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; tone?: "sun" | "ion" | "nebula" | "aurora"; hint?: string }[]; label: string }) {
  return (
    <nav className="k-actions" aria-label={label}>
      {items.map((item) => (
        <button key={item.id} type="button" className="k-action" data-tone={item.tone ?? "sun"} disabled={item.disabled} onClick={item.onClick} aria-describedby={item.hint ? `${item.id}-hint` : undefined}>
          <span className="k-action-ico" aria-hidden>{item.icon}</span>
          <span className="k-action-label">{item.label}</span>
          {item.hint ? <span id={`${item.id}-hint`} className="visually-hidden">{item.hint}</span> : null}
        </button>
      ))}
    </nav>
  );
}

export type Banner = { id: string; kicker: string; title: string; text: string; cta: string; icon: ReactNode; tone: "sun" | "ion" | "nebula" | "aurora"; onClick?: () => void; soon?: boolean };

/** Банери-оголошення: свайп, крапки, автопрокрутка 6 с (лише без reduced-motion, пауза при дотику/фокусі/у фоні). */
export function Carousel({ items, label }: { items: Banner[]; label: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const held = useRef(false);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const card = el.firstElementChild as HTMLElement | null;
        const w = card ? card.offsetWidth + 10 : el.clientWidth;
        setIndex(Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / w))));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [items.length]);
  const go = (i: number) => {
    const el = track.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    el.scrollTo({ left: card.offsetLeft - el.offsetLeft - 0, behavior: reducedMotion() ? "auto" : "smooth" });
  };
  useEffect(() => {
    if (reducedMotion() || items.length < 2) return;
    const id = window.setInterval(() => {
      if (held.current || document.hidden) return;
      const el = track.current;
      if (!el || el.matches(":hover") || el.contains(document.activeElement)) return;
      go((index + 1) % items.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, [index, items.length]);
  return (
    <section className="k-carousel" aria-roledescription="карусель" aria-label={label}>
      <div className="k-car-track" ref={track} onPointerDown={() => { held.current = true; }}>
        {items.map((item, i) => (
          <article key={item.id} className="k-banner" data-tone={item.tone} aria-roledescription="банер" aria-label={`${i + 1} з ${items.length}: ${item.title}`}>
            <div className="k-banner-text">
              <p className="k-banner-kicker">{item.kicker}{item.soon ? <span className="k-soon">Скоро</span> : null}</p>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              {item.onClick ? (
                <button type="button" className="k-banner-cta" onClick={item.onClick}>
                  {item.cta}
                  <ChevronRight size={15} strokeWidth={2.2} aria-hidden />
                </button>
              ) : (
                <span className="k-banner-cta" data-off="1">{item.cta}</span>
              )}
            </div>
            <span className="k-banner-art" aria-hidden>{item.icon}</span>
          </article>
        ))}
      </div>
      {items.length > 1 ? (
        <div className="k-dots">
          {items.map((item, i) => (
            <button key={item.id} type="button" data-on={i === index ? "1" : "0"} aria-label={`Банер ${i + 1}: ${item.title}`} aria-current={i === index ? "true" : undefined} onClick={() => { held.current = true; go(i); }} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Заголовок секції з дією праворуч («Усі»). */
export function SectionHead({ title, action, onAction, id }: { title: string; action?: string; onAction?: () => void; id?: string }) {
  return (
    <div className="k-head">
      <h2 id={id}>{title}</h2>
      {action && onAction ? (
        <button type="button" onClick={onAction}>
          {action}
          <ChevronRight size={14} strokeWidth={2.2} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** Плитка показника: іконка, значення, підпис, опційно спарклайн чи чип. */
export function Stat({ icon, value, label, foot, tone = "sun" }: { icon: ReactNode; value: ReactNode; label: string; foot?: ReactNode; tone?: "sun" | "ion" | "nebula" | "aurora" | "mars" }) {
  return (
    <div className="k-stat" data-tone={tone}>
      <span className="k-stat-ico" aria-hidden>{icon}</span>
      <b>{value}</b>
      <span>{label}</span>
      {foot ? <div className="k-stat-foot">{foot}</div> : null}
    </div>
  );
}

/** Смужка прогресу з підписом. */
export function Progress({ value, max, label, tone = "sun" }: { value: number; max: number; label: string; tone?: "sun" | "ion" | "nebula" | "aurora" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="k-prog" data-tone={tone} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <i style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%` }} />
    </div>
  );
}

/** Скелетон-заглушка, поки світ ще вантажиться. */
export function Skeleton({ h = 16, w = "100%", r = 10 }: { h?: number; w?: number | string; r?: number }) {
  return <span className="k-skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}

/** Порожній стан: іконка, заголовок, пояснення. */
export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="k-empty">
      <span aria-hidden>{icon}</span>
      <b>{title}</b>
      <p>{text}</p>
      {action}
    </div>
  );
}
