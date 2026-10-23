/** «Моє сузір'я»: живий граф людей, з якими тебе зв'язало підтвердження, і картка, якою можна поділитися. */
import { useMemo, useState, type ReactNode } from "react";
import { Share2, Sparkles } from "lucide-react";
import { Page } from "@/components/orbit/more";
import { Avatar } from "@/components/orbit/ui/kit";
import { constellationOf, layout, type Constellation, type Star } from "@/lib/orbit/constellation";
import { shortName } from "@/lib/orbit/live-rules";
import type { Account, World } from "@/lib/orbit/engine";
import { useEmblem } from "@/lib/orbit/emblem-store";
import { glyphChar } from "@/lib/orbit/emblem";
import { TrustFinder } from "@/components/orbit/trust-path";
import { useWords, WordComposer, WordsReceived } from "@/components/orbit/vouch-words";

const W = 340;

export function ConstellationMap({ c, user, size = W, theme }: { c: Constellation; user: Account; size?: number; theme?: string }) {
  const sky = theme ?? user.wearTheme;
  const rings = [layout(c.in, 1, 0.3), layout(c.out.filter((s) => !c.in.some((x) => x.id === s.id)), 2, 0.9), layout(c.wave.slice(0, 24), 3, 0.1)];
  const both = new Set(c.in.filter((s) => c.out.some((x) => x.id === s.id)).map((s) => s.id));
  const node = (p: { star: Star; x: number; y: number }, ring: number, i: number) => (
    <g key={p.star.id} className="cs-node" data-ring={ring} style={{ ["--d" as string]: `${120 + ring * 160 + i * 40}ms` }}>
      <line x1={size / 2} y1={size / 2} x2={p.x * size} y2={p.y * size} className="cs-line" data-ring={ring} data-both={both.has(p.star.id) ? "1" : undefined} />
    </g>
  );
  return (
    <div className={sky ? `cs-map cs-theme-${sky}` : "cs-map"} data-theme={sky || undefined} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        {[0.24, 0.36, 0.46].map((r) => <circle key={r} cx={size / 2} cy={size / 2} r={r * size} className="cs-orbit" />)}
        {rings.map((ring, k) => ring.map((p, i) => node(p, k + 1, i)))}
      </svg>
      {rings.map((ring, k) =>
        ring.map((p, i) => (
          <span key={p.star.id} className="cs-dot" data-ring={k + 1} data-launched={p.star.launched ? "1" : undefined} style={{ left: p.x * size, top: p.y * size, ["--d" as string]: `${200 + k * 160 + i * 40}ms` }} title={shortName(p.star.name)}>
            {k < 2 && size >= 200 ? <Avatar id={p.star.id} name={p.star.name} size={k === 0 ? 34 : 30} /> : <i />}
          </span>
        )),
      )}
      <span className="cs-me" style={{ left: size / 2, top: size / 2 }}>
        <Avatar id={user.id} name={user.name} size={size >= 200 ? 52 : 26} me />
      </span>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
}

export function ConstellationPage({ world, user, onBack, onClose }: { world: World; user: Account; onBack: () => void; onClose?: () => void }) {
  const c = useMemo(() => constellationOf(world, user.id), [world, user.id]);
  const emblem = useEmblem(user.id);
  const words = useWords(user.id);
  const [msg, setMsg] = useState("");
  const empty = c.total === 0;
  const share = async () => {
    setMsg("");
    try {
      const blob = await drawCard(c, user, emblem ? { hue: emblem.hue, ch: glyphChar(emblem.glyph) } : null);
      const file = new File([blob], "orbit-constellation.png", { type: "image/png" });
      const text = `Моє сузір'я в Орбітах: ${c.total} ${plural(c.total, "людина", "людини", "людей")}. Тут орбіти запускають тільки разом.`;
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text, url: location.origin });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setMsg("Картку збережено — додай її в історію чи надішли друзям.");
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setMsg("Не вдалося підготувати картку.");
    }
  };
  return (
    <Page title="Моє сузір'я" kicker="Люди, з якими тебе зв'язало підтвердження" onBack={onBack} onClose={onClose}>
      <section className="orbit-block cs-hero" aria-label="Мапа сузір'я">
        <ConstellationMap c={c} user={user} />
        {empty ? (
          <p className="cs-empty">Тут з'являться люди, яких ти підтвердиш і які підтвердять тебе. Кожна пара — лише раз за життя, тому кожна лінія справжня.</p>
        ) : (
          <div className="cs-stats">
            <div><b>{c.in.length}</b><span>підтвердили тебе</span></div>
            <div><b>{c.out.length}</b><span>ти підтвердив</span></div>
            <div><b>{c.wave.length}</b><span>твоя хвиля</span></div>
          </div>
        )}
      </section>
      {!empty ? (
        <button type="button" className="orbit-go cs-share" onClick={() => void share()}>
          <Share2 size={18} aria-hidden /> Поділитися сузір'ям
        </button>
      ) : null}
      {msg ? <p className="orbit-note" role="status">{msg}</p> : null}
      <StarList title="Підтвердили тебе" hint="Ці люди поручилися за твої запуски" stars={c.in} />
      <WordsReceived world={world} words={words} />
      <StarList title="Ти підтвердив" hint={c.launchedOut ? `${c.launchedOut} з них уже мають свою орбіту` : "Твоє підтвердження — їхній перший крок. Лиши кілька слів — їх побачать ті, хто перевіряє цю людину."} stars={c.out} extra={words.ready ? (s) => (words.given.includes(s.id) ? <span className="cs-tag vw-done">слово є</span> : <WordComposer to={s.id} name={shortName(s.name)} onDone={() => void words.reload()} />) : undefined} />
      <StarList title="Твоя хвиля" hint="Кого вже підтвердили люди, яким допоміг ти" stars={c.wave} compact />
      <TrustFinder world={world} user={user} />
      <section className="orbit-block cs-how">
        <p className="orbit-kicker"><Sparkles size={14} aria-hidden /> Як росте сузір'я</p>
        <p className="orbit-note">Підтверди запуск знайомого кодом — і між вами з'явиться лінія. Коли ця людина підтвердить ще когось, твоя хвиля піде далі.</p>
      </section>
    </Page>
  );
}

function StarList({ title, hint, stars, compact = false, extra }: { title: string; hint: string; stars: Star[]; compact?: boolean; extra?: (s: Star) => ReactNode }) {
  if (!stars.length) return null;
  return (
    <section className="orbit-block cs-list">
      <div className="cs-list-head"><h2>{title}</h2><span>{stars.length}</span></div>
      <p className="orbit-note">{hint}</p>
      <ul className={compact ? "cs-chips" : "cs-rows"}>
        {stars.slice(0, compact ? 40 : 100).map((s) => (
          <li key={s.id}>
            <Avatar id={s.id} name={s.name} size={compact ? 22 : 32} />
            <span className="cs-name">{shortName(s.name)}</span>
            {!compact && s.launched && !extra ? <span className="cs-tag">має орбіту</span> : null}
            {extra ? <span className="cs-extra">{extra(s)}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Картка 1080×1350 для історій/месенджерів. Лише імена у форматі «Ім'я П.», без чисел ✦. */
async function drawCard(c: Constellation, user: Account, emblem: { hue: number; ch: string } | null): Promise<Blob> {
  const S = 1080, H = 1350;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = H;
  const g = cv.getContext("2d");
  if (!g) throw new Error("no canvas");
  const bg = g.createRadialGradient(S / 2, 560, 40, S / 2, 560, 900);
  bg.addColorStop(0, "#2a2350");
  bg.addColorStop(0.55, "#0f1022");
  bg.addColorStop(1, "#07080d");
  g.fillStyle = bg;
  g.fillRect(0, 0, S, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.5})`;
    g.beginPath();
    g.arc(rnd() * S, rnd() * H, rnd() * 1.8 + 0.3, 0, 7);
    g.fill();
  }
  const cx = S / 2, cy = 600, R = 860;
  g.strokeStyle = "rgba(255,255,255,0.07)";
  g.lineWidth = 2;
  for (const r of [0.24, 0.36, 0.46]) { g.beginPath(); g.arc(cx, cy, r * R, 0, 7); g.stroke(); }
  const rings = [layout(c.in, 1, 0.3), layout(c.out.filter((s) => !c.in.some((x) => x.id === s.id)), 2, 0.9), layout(c.wave.slice(0, 40), 3, 0.1)];
  const colors = ["#f2c46d", "#8b7bff", "#6fd6ec"];
  rings.forEach((ring, k) => ring.forEach((p) => {
    const x = cx + (p.x - 0.5) * R, y = cy + (p.y - 0.5) * R;
    g.strokeStyle = colors[k] + "55";
    g.lineWidth = k === 2 ? 1.5 : 3;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke();
    g.shadowColor = colors[k]; g.shadowBlur = 24;
    g.fillStyle = colors[k];
    g.beginPath(); g.arc(x, y, k === 2 ? 7 : 14, 0, 7); g.fill();
    g.shadowBlur = 0;
  }));
  const hue = emblem?.hue ?? 38;
  const core = g.createRadialGradient(cx - 20, cy - 20, 4, cx, cy, 70);
  core.addColorStop(0, `hsl(${hue} 60% 55%)`);
  core.addColorStop(1, `hsl(${hue + 40} 50% 20%)`);
  g.shadowColor = `hsl(${hue} 80% 60%)`; g.shadowBlur = 50;
  g.fillStyle = core; g.beginPath(); g.arc(cx, cy, 66, 0, 7); g.fill(); g.shadowBlur = 0;
  g.fillStyle = `hsl(${hue} 80% 90%)`;
  g.font = "800 60px system-ui, -apple-system, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(emblem?.ch || user.name.slice(0, 1).toUpperCase(), cx, cy + 3);
  g.textBaseline = "alphabetic";
  g.fillStyle = "#ebe6dc";
  g.font = "800 64px system-ui, -apple-system, sans-serif";
  g.fillText(shortName(user.name), cx, 1100);
  g.fillStyle = "rgba(235,230,220,0.72)";
  g.font = "500 38px system-ui, -apple-system, sans-serif";
  g.fillText(`${c.total} ${plural(c.total, "людина", "людини", "людей")} у моєму сузір'ї`, cx, 1162);
  g.fillStyle = "#f2c46d";
  g.font = "700 34px system-ui, -apple-system, sans-serif";
  g.fillText("ОРБІТИ · запускаємо разом", cx, 1270);
  return await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), "image/png"));
}
