import { ArrowDownLeft, ArrowUpRight, CircleDot, Gift, Hourglass, Plus, Sparkles, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Page } from "@/components/orbit/more";
import { spk } from "@/lib/orbit/copy";
import type { Account, World } from "@/lib/orbit/engine";
import { buildLedger, clock, no, readTopups, type Entry, type Kind } from "@/lib/orbit/ledger";
import { useOrbits } from "@/lib/orbit/store";

type Filter = "all" | Kind;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Усе" },
  { id: "topup", label: "Поповнення" },
  { id: "buy", label: "Купівлі" },
  { id: "sell", label: "Продажі" },
  { id: "charge", label: "Заряди" },
  { id: "fund", label: "Фонд" },
];

const EMPTY: Record<Filter, { text: string; go?: { label: string; tab: "market" | "mine" | "me" } }> = {
  all: { text: "Поки порожньо" },
  topup: { text: "Поповнень на цьому телефоні ще не було", go: { label: "Тестове поповнення", tab: "me" } },
  buy: { text: "Купівель ще не було", go: { label: "До обміну", tab: "market" } },
  sell: { text: "Продажів ще не було", go: { label: "До обміну", tab: "market" } },
  charge: { text: "Зарядів ще не було", go: { label: "Відкрити заявку", tab: "mine" } },
  fund: { text: "Фонд ділиться раз на 3 доби між активними" },
  bonus: { text: "Бонусів немає" },
};

const ICON: Record<Kind, typeof Plus> = {
  topup: Plus,
  buy: ArrowDownLeft,
  sell: ArrowUpRight,
  charge: CircleDot,
  fund: Sparkles,
  bonus: Gift,
};

const fmt = new Intl.NumberFormat("uk-UA");

function dayKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayTitle(key: string, now: number) {
  if (key === dayKey(now)) return "Сьогодні";
  if (key === dayKey(now - 86_400_000)) return "Вчора";
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", timeZone: "UTC" }).format(Date.parse(`${key}T00:00:00Z`));
}

function dir(row: Entry) {
  if (row.pending) return "wait";
  if (row.badge && row.amount === 0) return row.badge.startsWith("+") ? "gold" : "flat";
  return row.amount > 0 ? "up" : row.amount < 0 ? "down" : "flat";
}

function face(row: Entry) {
  if (row.pending) return "очікує";
  if (row.badge && row.amount === 0) return row.badge;
  return signed(row.amount);
}

function signed(amount: number) {
  if (amount === 0) return "0 ✦";
  return `${amount > 0 ? "+" : "−"}${fmt.format(Math.abs(amount))} ✦`;
}

export function History({ world, user, onBack, onClose, onGo }: { world: World; user: Account; onBack: () => void; onClose?: () => void; onGo: (tab: "market" | "mine" | "me") => void }) {
  const ready = useOrbits((state) => state.ready);
  const offline = useOrbits((state) => state.bad && state.flash === "Спільний світ не відповідає.");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Entry | null>(null);
  const [topups, setTopups] = useState(() => readTopups(user.id));
  useEffect(() => {
    setTopups(readTopups(user.id));
  }, [user.id, user.balance]);
  const all = useMemo(() => buildLedger(world, user, topups), [world, user, topups]);
  const rows = filter === "all" ? all : all.filter((row) => row.kind === filter);
  const counts = useMemo(() => {
    const map = new Map<Filter, number>([["all", all.length]]);
    for (const row of all) map.set(row.kind, (map.get(row.kind) ?? 0) + 1);
    return map;
  }, [all]);
  const income = rows.reduce((sum, row) => sum + (row.amount > 0 ? row.amount : 0), 0);
  const spent = rows.reduce((sum, row) => sum + (row.amount < 0 ? -row.amount : 0), 0);
  const groups: { key: string; rows: Entry[] }[] = [];
  for (const row of rows) {
    const key = dayKey(row.at);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.rows.push(row);
    else groups.push({ key, rows: [row] });
  }

  return (
    <Page title="Історія" kicker="Мої операції · UTC" onBack={onBack} onClose={onClose}>
      {offline ? (
        <p className="hi-offline" role="status">
          <WifiOff size={15} strokeWidth={1.75} aria-hidden /> Немає зв’язку. Показуємо останні дані.
        </p>
      ) : null}
      <div className="hi-sum" aria-label="Підсумок">
        <div>
          <span>Прийшло</span>
          <b data-dir="up">{signed(income)}</b>
        </div>
        <div>
          <span>Пішло</span>
          <b data-dir={spent > 0 ? "down" : "flat"}>{spent > 0 ? signed(-spent) : "0 ✦"}</b>
        </div>
        <div>
          <span>Баланс</span>
          <b>{spk(user.balance)}</b>
        </div>
      </div>
      <div className="hi-chips" role="tablist" aria-label="Тип операцій">
        {FILTERS.map((item) => {
          const count = counts.get(item.id) ?? 0;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className="orbit-chip"
              data-on={filter === item.id ? "1" : "0"}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              {count > 0 ? <span className="hi-count">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {!ready ? (
        <div className="hi-list" aria-busy="true" aria-label="Завантаження">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="hi-skel" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="hi-empty">
          <Hourglass size={22} strokeWidth={1.4} aria-hidden />
          <p>{EMPTY[filter].text}</p>
          {EMPTY[filter].go ? (
            <button type="button" className="orbit-chip" onClick={() => onGo(EMPTY[filter].go!.tab)}>
              {EMPTY[filter].go!.label}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="hi-list" role="tabpanel">
          {groups.map((group) => (
            <section key={group.key} className="hi-day" aria-label={dayTitle(group.key, world.now)}>
              <p className="mo-group-title">{dayTitle(group.key, world.now)}</p>
              <div className="mo-card">
                {group.rows.map((row) => {
                  const Icon = ICON[row.kind];
                  return (
                    <button key={row.id} type="button" className="hi-row" data-kind={row.kind} onClick={() => setOpen(row)}>
                      <span className="hi-ico" aria-hidden>
                        <Icon size={17} strokeWidth={1.6} />
                      </span>
                      <span className="hi-text">
                        <b>{row.title}</b>
                        <small>
                          {clock(row.at).split(", ").pop()}
                          {row.status ? ` · ${row.status}` : ""}
                        </small>
                      </span>
                      <span className="hi-amt" data-dir={dir(row)}>
                        {face(row)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      <p className="orbit-note hi-foot">
        Журнал світу тримає останні 40 подій, тож давні продажі можуть не показуватися. Поповнення видно на телефоні, де ти платив. Повна історія і файл CSV — у розробці.
      </p>
      {open ? <Detail entry={open} onClose={() => setOpen(null)} /> : null}
    </Page>
  );
}

const KIND_LABEL: Record<Kind, string> = {
  topup: "Поповнення",
  buy: "Купівля",
  sell: "Продаж",
  charge: "Заряд",
  fund: "Фонд",
  bonus: "Бонус",
};

const SOURCE: Record<Entry["source"], string> = {
  world: "Записи світу",
  log: "Журнал світу",
  phone: "Цей телефон",
};

function Detail({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div className="ex-overlay" onClick={onClose}>
      <div className="ex-sheet" role="dialog" aria-modal="true" aria-label={entry.title} onClick={(event) => event.stopPropagation()}>
        <p className="orbit-kicker">{KIND_LABEL[entry.kind]}</p>
        <h2 className="orbit-h hi-big" data-dir={dir(entry)}>
          {entry.pending ? "Очікує" : face(entry)}
        </h2>
        <div className="ex-lines">
          <div><span>Що</span><b>{entry.title}</b></div>
          {entry.orbitId ? <div><span>Орбіта</span><b>{no(entry.orbitId)}</b></div> : entry.status ? <div><span>Деталі</span><b>{entry.status}</b></div> : null}
          <div><span>Час</span><b>{clock(entry.at)}</b></div>
          {entry.lines.map(([label, value]) => (
            <div key={label}><span>{label}</span><b>{value}</b></div>
          ))}
          <div><span>Джерело</span><b>{SOURCE[entry.source]}</b></div>
        </div>
        <button type="button" className="orbit-go" onClick={onClose} autoFocus>
          Закрити
        </button>
      </div>
    </div>
  );
}
