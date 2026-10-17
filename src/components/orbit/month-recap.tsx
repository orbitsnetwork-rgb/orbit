/** v15: «Твій місяць на орбіті» — підсумок власних дій за місяць і картинка, щоб поділитися. Без жодних балансів. */
import { useState } from "react";
import { Share2 } from "lucide-react";
import type { Account, World } from "@/lib/orbit/engine";
import { useOrbits } from "@/lib/orbit/store";
import { monthRecap, type MonthRecap } from "@/lib/orbit/pulse";

const fmt = new Intl.NumberFormat("uk-UA");

function rows(r: MonthRecap): [string, number][] {
  return [
    ["підтверджень", r.confirms],
    ["запусків", r.launches],
    ["нових орбіт", r.orbits],
    ["подяк отримано", r.thanks],
    ["днів активності", r.activeDays],
    ["екіпажів", r.crews],
  ];
}

/** Малюємо картку 1080×1350 у canvas на телефоні — нічого не йде на сервер. */
export async function drawRecap(r: MonthRecap, name: string): Promise<Blob | null> {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  if (!g) return null;
  try { await document.fonts?.ready; } catch { /* без шрифтів — системні */ }
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#141033"); bg.addColorStop(0.55, "#05060a"); bg.addColorStop(1, "#2a1c08");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // кільця орбіти
  g.strokeStyle = "rgba(242,196,109,.55)"; g.lineWidth = 4;
  for (const [rad, a] of [[300, 0.55], [220, 0.35], [140, 0.2]] as const) { g.globalAlpha = a / 0.55; g.beginPath(); g.ellipse(W - 230, 260, rad, rad * 0.42, -0.35, 0, Math.PI * 2); g.stroke(); }
  g.globalAlpha = 1;
  g.fillStyle = "#f2c46d"; g.beginPath(); g.arc(W - 230, 260, 46, 0, Math.PI * 2); g.fill();
  const sans = '"Manrope Variable", Manrope, system-ui, sans-serif';
  g.fillStyle = "#f2c46d"; g.font = `700 40px ${sans}`; g.fillText(r.month.charAt(0).toUpperCase() + r.month.slice(1), 90, 150);
  g.fillStyle = "#ffffff"; g.font = `800 84px ${sans}`;
  g.fillText("Твій місяць", 90, 470); g.fillText("на орбіті", 90, 565);
  g.fillStyle = "#a7abba"; g.font = `600 40px ${sans}`; g.fillText(name, 90, 640);
  rows(r).forEach(([label, n], i) => {
    const x = 90 + (i % 2) * 460, y = 730 + Math.floor(i / 2) * 170;
    g.fillStyle = "rgba(255,255,255,.06)"; g.beginPath(); g.roundRect(x, y, 430, 140, 28); g.fill();
    g.fillStyle = "#ffffff"; g.font = `800 64px ${sans}`; g.fillText(fmt.format(n), x + 32, y + 78);
    g.fillStyle = "#8b90a5"; g.font = `600 30px ${sans}`; g.fillText(label, x + 32, y + 118);
  });
  g.fillStyle = "#f2c46d"; g.font = `700 34px ${sans}`; g.fillText("Орбіти · 8 000 000 рівних орбіт", 90, H - 80);
  return new Promise((ok) => c.toBlob((b) => ok(b), "image/png"));
}

export function MonthRecapCard({ world, user }: { world: World; user: Account }) {
  const events = useOrbits((state) => state.mine?.events) ?? [];
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const r = monthRecap(world, user.id, world.now, events);
  async function share() {
    setBusy(true);
    setSaid("");
    try {
      const blob = await drawRecap(r, user.name);
      if (!blob) { setSaid("Не вдалося намалювати картку."); return; }
      const file = new File([blob], "orbit-month.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: "Мій місяць на орбіті" }).catch(() => undefined);
        setSaid("Готово ✦");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "orbit-month.png";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        setSaid("Картинку збережено.");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="orbit-block mr-card" aria-labelledby="mr-title">
      <p className="mr-month">{r.month}</p>
      <h2 id="mr-title">Твій місяць на орбіті</h2>
      <dl className="mr-grid">
        {rows(r).map(([label, n]) => <div key={label}><dt>{label}</dt><dd>{fmt.format(n)}</dd></div>)}
      </dl>
      <button type="button" className="mr-share" disabled={busy} onClick={() => void share()}>
        <Share2 size={17} strokeWidth={2} aria-hidden /> {busy ? "Малюємо…" : "Поділитися картинкою"}
      </button>
      <p className="orbit-note" role="status">{said || "Лише твої дії. Без балансів — ні твоїх, ні чужих."}</p>
    </section>
  );
}
