/** Графік ціни з діапазонами 1Д/7Д/30Д/Все. Дотик чи стрілки показують точку; порожній стан — коли угод у періоді не було. */
import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { LineChart } from "lucide-react";
import type { Trade } from "@/lib/orbit/engine";
import { buzz } from "@/lib/orbit/feel";
import { RANGES, priceSeries, type Range } from "@/lib/orbit/series";
import { Change, Segmented } from "@/components/orbit/ui/kit";

const fmt = new Intl.NumberFormat("uk-UA");
const W = 340;
const H = 150;
const PAD = 12;

function stamp(ms: number, range: Range) {
  const opts: Intl.DateTimeFormatOptions = range === "1d" ? { hour: "2-digit", minute: "2-digit" } : range === "7d" ? { weekday: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" };
  return new Intl.DateTimeFormat("uk-UA", { ...opts, timeZone: "Europe/Kyiv" }).format(ms);
}

export function PriceChart({ trades, price, now, initial = "7d" }: { trades: Trade[]; price: number; now: number; initial?: Range }) {
  const gid = useId().replace(/:/g, "");
  const [range, setRange] = useState<Range>(initial);
  const [pick, setPick] = useState<number | null>(null);
  const series = useMemo(() => priceSeries(trades, price, now, range), [trades, price, now, range]);
  const { points, lo, hi, inRange } = series;
  const empty = inRange.length === 0;
  const span = hi - lo;
  const flat = span === 0;
  const pad = flat ? Math.max(1, hi * 0.05) : span * 0.15;
  const top = hi + pad;
  const bottom = lo - pad;
  const xAt = (i: number) => (points.length < 2 ? W : (i / (points.length - 1)) * W);
  const yAt = (v: number) => PAD + (1 - (v - bottom) / (top - bottom)) * (H - PAD * 2);
  const line = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.v).toFixed(1)}`).join(" ");
  const shown = pick !== null ? points[pick] : points[points.length - 1];
  const long = RANGES.find((row) => row.id === range)?.long ?? "";
  const volume = inRange.reduce((sum, row) => sum + row.amount, 0);
  const from = points.length > 1 ? points[0].t : series.from;

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (points.length < 2) return;
    const box = event.currentTarget.getBoundingClientRect();
    const i = Math.round(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * (points.length - 1));
    if (i !== pick) {
      setPick(i);
      if (event.pointerType === "touch") buzz(4);
    }
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const cur = pick ?? points.length - 1;
    setPick(Math.max(0, Math.min(points.length - 1, cur + (event.key === "ArrowRight" ? 1 : -1))));
  };

  return (
    <div className="pc">
      <div className="pc-read" aria-live="polite">
        <span className="pc-val">{fmt.format(shown?.v ?? price)} ✦</span>
        <span className="pc-when">{pick !== null && shown ? stamp(shown.t, range) : `зараз · ${long}`}</span>
        {pick === null ? <Change pct={series.change} /> : null}
      </div>
      <div
        className="pc-plot"
        data-empty={empty ? "1" : "0"}
        tabIndex={0}
        role="img"
        aria-label={empty ? `Угод ${long} не було. Поточна ціна ${fmt.format(price)} іскор.` : `Ціна ${long}: від ${fmt.format(lo)} до ${fmt.format(hi)} іскор, угод ${inRange.length}. Стрілки — переглянути точки.`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setPick(null)}
        onPointerCancel={() => setPick(null)}
        onBlur={() => setPick(null)}
        onKeyDown={onKey}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={`pc-${gid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--sun)" stopOpacity=".34" />
              <stop offset="1" stopColor="var(--sun)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="pc-grid" />
          ))}
          {points.length > 1 && !empty ? (
            <>
              <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#pc-${gid})`} className="pc-area" />
              <polyline points={line} className="pc-line" vectorEffect="non-scaling-stroke" />
            </>
          ) : (
            <line x1="0" x2={W} y1={yAt(price)} y2={yAt(price)} className="pc-flat" vectorEffect="non-scaling-stroke" />
          )}
          {pick !== null && shown ? <line x1={xAt(pick)} x2={xAt(pick)} y1="0" y2={H} className="pc-cross" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {shown && !empty ? (
          <span className="pc-dot" style={{ left: `${(xAt(pick ?? points.length - 1) / W) * 100}%`, top: `${(yAt(shown.v) / H) * 100}%` }} aria-hidden />
        ) : null}
        {empty ? (
          <div className="pc-empty">
            <LineChart size={18} strokeWidth={1.6} aria-hidden />
            <span>Угод {long} не було</span>
            <small>Ціна дня тримається: {fmt.format(price)} ✦</small>
          </div>
        ) : null}
        <span className="pc-hi" aria-hidden>{fmt.format(Math.round(top))}</span>
        <span className="pc-lo" aria-hidden>{fmt.format(Math.max(0, Math.round(bottom)))}</span>
      </div>
      <div className="pc-axis" aria-hidden>
        <span>{stamp(from, range)}</span>
        <span>{stamp(now, range)}</span>
      </div>
      <Segmented label="Період графіка" options={RANGES.map((row) => ({ id: row.id, label: row.label }))} value={range} onChange={(id) => { setRange(id); setPick(null); }} size="sm" />
      <dl className="pc-facts">
        <div><dt>Мін</dt><dd>{fmt.format(lo)} ✦</dd></div>
        <div><dt>Макс</dt><dd>{fmt.format(hi)} ✦</dd></div>
        <div><dt>Угод</dt><dd>{fmt.format(inRange.length)}</dd></div>
        <div><dt>Обсяг</dt><dd>{fmt.format(volume)} ✦</dd></div>
      </dl>
    </div>
  );
}
