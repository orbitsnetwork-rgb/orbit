import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { buzz, chime } from "@/lib/orbit/feel";

const COUNT = 8;
const R = 42; // % від розміру: радіус кільця, на якому стоять супутники
/** Скільки супутників людина вже бачила засвіченими (на вкладці, між станами збору і заряду). */
const SEEN = new Map<string, number>();

/**
 * Кільце з 8 супутників (ORBIT_REDESIGN 5.5.4). Новий засвічений — «спалах» і хвиля.
 * Під час заряду між супутниками малюється дуга 24 год (іон → сонце).
 */
export function Satellites({
  lit,
  charge,
  state,
  label,
  children,
  trackId,
}: {
  trackId?: string;
  lit: number;
  /** 0..1 — частка 24 год, що минула. Лише під час заряду. */
  charge?: number;
  state: "collect" | "charge";
  label: string;
  children?: ReactNode;
}) {
  const grad = useId().replace(/:/g, "");
  const prev = useRef<number | null>(trackId && SEEN.has(trackId) ? (SEEN.get(trackId) ?? null) : null);
  const [fresh, setFresh] = useState<number[]>([]);
  useEffect(() => {
    const was = prev.current;
    prev.current = lit;
    if (trackId) SEEN.set(trackId, lit);
    if (was === null || lit <= was) return;
    const born = Array.from({ length: lit - was }, (_, i) => was + i);
    setFresh(born);
    if (lit >= COUNT) {
      buzz([20, 80, 20]);
      chime([523, 784], 0.12);
    } else {
      buzz(15);
      chime([788]);
    }
    const id = window.setTimeout(() => setFresh([]), 1000);
    return () => window.clearTimeout(id);
  }, [lit, trackId]);
  const c = 2 * Math.PI * R;
  const arc = charge == null ? null : Math.min(1, Math.max(0, charge));
  return (
    <div className="sat" data-state={state} role="img" aria-label={label}>
      <svg className="sat-svg" viewBox="0 0 100 100" aria-hidden>
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--ion)" />
            <stop offset="1" stopColor="var(--sun)" />
          </linearGradient>
        </defs>
        <circle className="sat-orbit" cx="50" cy="50" r={R} />
        {arc != null ? (
          <circle
            className="sat-arc"
            cx="50"
            cy="50"
            r={R}
            stroke={`url(#${grad})`}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - arc)}
            transform="rotate(-90 50 50)"
          />
        ) : null}
      </svg>
      {Array.from({ length: COUNT }, (_, i) => {
        const theta = ((-90 + i * 45) * Math.PI) / 180;
        return (
          <span
            key={i}
            className="sat-dot"
            data-on={i < lit ? "1" : "0"}
            data-next={i === lit && state === "collect" ? "1" : "0"}
            data-fresh={fresh.includes(i) ? "1" : "0"}
            style={{ left: `${50 + R * Math.cos(theta)}%`, top: `${50 + R * Math.sin(theta)}%` }}
          />
        );
      })}
      <div className="sat-core">{children}</div>
    </div>
  );
}
