import { useCallback, useEffect, useState } from "react";
import { Coins, Download, Landmark, RefreshCw, TriangleAlert, Users } from "lucide-react";
import { Page } from "@/components/orbit/more";
import { Empty, SectionHead, Skeleton, Stat } from "@/components/orbit/ui/kit";
import { toCsv, type Transparency as Data } from "@/lib/orbit/emission";
import { FUND_SHARE, SELLER_SHARE } from "@/lib/orbit/engine";
import { orbitTransparency } from "@/lib/orbit/transparency-fn";

const fmt = new Intl.NumberFormat("uk-UA");
const MONTHS = ["січень", "лютий", "березень", "квітень", "травень", "червень", "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"];
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1] ?? m} ${m.slice(0, 4)}`;
const dayName = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/** 15 + 9: «Прозорість» — щоденний знімок усіх ✦, випуск, повернення, фонд, звірка і місячний звіт випуску. */
export function Transparency({ onBack, onClose }: { onBack: () => void; onClose?: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const load = useCallback(() => {
    setState("loading");
    orbitTransparency()
      .then((next) => {
        setData(next);
        setState(next ? "ok" : "error");
      })
      .catch(() => setState("error"));
  }, []);
  useEffect(load, [load]);

  const download = () => {
    if (!data) return;
    const blob = new Blob([toCsv(data.days)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orbit-transparency-${new Date(data.now).toISOString().slice(0, 10)}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Page title="Прозорість" kicker="Усі іскри світу на виду" onBack={onBack} onClose={onClose}>
      {state === "loading" && !data ? (
        <div className="orbit-stack" aria-busy="true" aria-label="Завантажуємо звіт">
          <div className="orbit-block sk-card"><Skeleton h={14} w={120} /><Skeleton h={28} w={200} r={12} /></div>
          <div className="orbit-block sk-card"><Skeleton h={12} /><Skeleton h={12} /><Skeleton h={12} w="70%" /></div>
        </div>
      ) : state === "error" ? (
        <Empty
          icon={<TriangleAlert size={20} strokeWidth={1.6} />}
          title="Звіт зараз недоступний"
          text="Сервер не відповів. Іскри від цього не губляться — спробуй ще раз за хвилину."
          action={<button type="button" className="orbit-go" onClick={load}><RefreshCw size={15} aria-hidden /> Спробувати ще</button>}
        />
      ) : data ? (
        <div className="orbit-stack tr">
          <section className="st-head" data-state={data.reconciliation === 0 ? "ok" : "down"} role="status" aria-live="polite">
            <i aria-hidden />
            <div>
              <b>{data.reconciliation === 0 ? "Звірка: розбіжність 0 ✦" : `Звірка: розбіжність ${fmt.format(data.reconciliation)} ✦`}</b>
              <small>
                {data.reconciliation === 0
                  ? "Усі іскри пояснені: стартові, нагороди за підтвердження і тестові поповнення."
                  : "Ми вже бачимо розбіжність і розбираємось. Твої іскри від цього не змінюються."}
              </small>
            </div>
          </section>

          <div className="k-grid2">
            <Stat icon={<Coins size={16} strokeWidth={2} />} tone="sun" value={`${fmt.format(data.mass)} ✦`} label="усього іскор у світі" />
            <Stat icon={<Landmark size={16} strokeWidth={2} />} tone="aurora" value={`${fmt.format(data.fund)} ✦`} label="у фонді зараз" />
            <Stat icon={<Landmark size={16} strokeWidth={2} />} tone="nebula" value={`${fmt.format(data.reserve)} ✦`} label={`у резерві · ${(Math.round((1 - SELLER_SHARE - FUND_SHARE) * 1000) / 10).toString().replace(".", ",")}% з кожної угоди`} />
            <Stat icon={<Users size={16} strokeWidth={2} />} tone="ion" value={fmt.format(data.accounts)} label="учасників" />
          </div>

          <section className="orbit-block" aria-labelledby="tr-days">
            <SectionHead id="tr-days" title="По днях" action="CSV" onAction={download} />
            {data.days.length ? (
              <div className="tr-table" role="table" aria-label="Щоденний знімок іскор">
                <div role="row" className="tr-row tr-head">
                  <span role="columnheader">День</span>
                  <span role="columnheader">Усього</span>
                  <span role="columnheader">Випущено</span>
                  <span role="columnheader">Повернуто</span>
                  <span role="columnheader">Фонд</span>
                </div>
                {[...data.days].reverse().slice(0, 30).map((d) => (
                  <div role="row" className="tr-row" key={d.day}>
                    <span role="cell">{dayName(d.day)}</span>
                    <span role="cell">{fmt.format(d.mass)}</span>
                    <span role="cell" className="fd-plus">{d.minted ? `+${fmt.format(d.minted)}` : "0"}</span>
                    <span role="cell">{fmt.format(d.returned)}</span>
                    <span role="cell">{fmt.format(d.fund)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty icon={<Coins size={20} strokeWidth={1.6} />} title="Облік щойно почався" text="Перший рядок з’явиться після першої дії у світі." />
            )}
            <button type="button" className="orbit-quiet tr-csv" onClick={download}><Download size={15} aria-hidden /> Завантажити CSV</button>
          </section>

          <section className="orbit-block" aria-labelledby="tr-months">
            <SectionHead id="tr-months" title="Звіт випуску по місяцях" />
            {data.months.length ? (
              <ul className="ex-trades">
                {data.months.map((m) => (
                  <li key={m.month}>
                    <span className="ex-who">
                      <b>{monthName(m.month)}</b>
                      <small>стартові {fmt.format(m.starter)} · підтвердження {fmt.format(m.witness)} · поповнення {fmt.format(m.topup)}</small>
                    </span>
                    <span className="ex-px fd-plus">+{fmt.format(m.minted)} ✦</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ex-hint">Поки немає жодного місяця з випуском.</p>
            )}
            <p className="ex-hint">Іскри — тестові одиниці, не гроші. Повернення стане можливим разом із виводом — зараз це «Скоро».</p>
          </section>
        </div>
      ) : null}
    </Page>
  );
}
