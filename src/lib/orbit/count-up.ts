import { useEffect, useRef, useState } from "react";
import { reducedMotion } from "@/lib/orbit/feel";

/**
 * Число «докручується» до нового значення за 700 мс (easeOutCubic).
 * Перше значення показуємо одразу; при prefers-reduced-motion — без анімації.
 */
export function useCountUp(value: number, ms = 700) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current;
    if (a === value) return;
    if (reducedMotion() || typeof window.requestAnimationFrame !== "function") {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const d = value - a;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const next = Math.round(a + d * e);
      from.current = next;
      setShown(next);
      if (p < 1) raf = window.requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}
