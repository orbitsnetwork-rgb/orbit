import { useEffect, useRef } from "react";

type Star = { x: number; y: number; r: number; base: number; w: number; p: number; layer: number };

/** Шари глибини (ORBIT_REDESIGN 5.5.1): кількість, радіус, дрейф px/кадр, паралакс. */
const LAYERS = [
  { n: 40, r: 0.4, drift: 0.006, par: 0.05 },
  { n: 25, r: 0.7, drift: 0.012, par: 0.1 },
  { n: 12, r: 1.1, drift: 0.02, par: 0.2 },
];
const FRAME_MS = 1000 / 30; // 30 кадрів досить для повільних зірок і береже батарею

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Зоряне тло: canvas під усім. Пауза, коли вкладку сховано;
 * при prefers-reduced-motion — один статичний кадр.
 */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const rand = seeded(20261016);
    const stars: Star[] = [];
    LAYERS.forEach((layer, li) => {
      for (let i = 0; i < layer.n; i += 1) {
        stars.push({ x: rand(), y: rand(), r: layer.r * (0.8 + rand() * 0.5), base: 0.35 + rand() * 0.4, w: 0.4 + rand() * 0.8, p: rand() * Math.PI * 2, layer: li });
      }
    });
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let last = 0;
    let drift = 0;
    let scroll = window.scrollY;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (t: number, still: boolean) => {
      ctx.clearRect(0, 0, w, h);
      for (const star of stars) {
        const layer = LAYERS[star.layer];
        const y = (((star.y * h - drift * layer.drift * 60 - scroll * layer.par) % h) + h) % h;
        const x = star.x * w;
        const a = still ? star.base : Math.max(0.08, Math.min(1, star.base + 0.25 * Math.sin((t / 1000) * star.w + star.p)));
        ctx.globalAlpha = a;
        ctx.fillStyle = star.layer === 2 ? "#fbe7be" : "#e9ecf7";
        ctx.beginPath();
        ctx.arc(x, y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    const tick = (t: number) => {
      raf = window.requestAnimationFrame(tick);
      if (t - last < FRAME_MS) return;
      drift += (t - last) / 1000;
      last = t;
      draw(t, false);
    };
    const stop = () => {
      window.cancelAnimationFrame(raf);
      raf = 0;
    };
    const start = () => {
      stop();
      if (media.matches) {
        draw(0, true);
        return;
      }
      last = performance.now();
      raf = window.requestAnimationFrame(tick);
    };
    const onVisible = () => (document.hidden ? stop() : start());
    const onScroll = () => {
      scroll = window.scrollY;
      if (media.matches) draw(0, true);
    };
    const onResize = () => {
      resize();
      draw(performance.now(), media.matches);
    };
    resize();
    start();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    media.addEventListener("change", start);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      media.removeEventListener("change", start);
    };
  }, []);
  return <canvas ref={ref} className="sf-canvas" aria-hidden />;
}
