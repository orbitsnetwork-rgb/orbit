/** 21: картки номерних орбіт у профілі. Лише косметика: риси — з номера, без передачі й без ✦. */
import { Orbit as OrbitIcon } from "lucide-react";
import type { World } from "@/lib/orbit/engine";
import { orbitOf, traitsOf } from "@/lib/orbit/traits";
import { Empty } from "@/components/orbit/ui/kit";

export function OrbitGlyph({ id, size = 64 }: { id: number; size?: number }) {
  const t = traitsOf(id);
  const c = `hsl(${t.hue} 80% 66%)`;
  return (
    <svg className="oc-glyph" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <radialGradient id={`oc-g-${id}`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor={`hsl(${t.hue} 90% 78%)`} />
          <stop offset="100%" stopColor={`hsl(${t.hue} 60% 22%)`} />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="13" fill={`url(#oc-g-${id})`} />
      {Array.from({ length: t.rings }, (_, i) => (
        <ellipse key={i} cx="32" cy="32" rx={20 + i * 5} ry={6 + i * 2} fill="none" stroke={c} strokeOpacity={0.75 - i * 0.18} strokeWidth="1.4" transform={`rotate(${-28 + i * 9} 32 32)`} />
      ))}
      {Array.from({ length: t.moons }, (_, i) => {
        const a = (i / Math.max(1, t.moons)) * Math.PI * 2 + t.hue / 57;
        return <circle key={i} cx={32 + Math.cos(a) * 27} cy={32 + Math.sin(a) * 27} r="2" fill="#ebe6dc" />;
      })}
    </svg>
  );
}

export function NumberedOrbits({ world, userId }: { world: World; userId: string }) {
  const mine = world.orbits.filter((orbit) => orbit.ownerId === userId).sort((a, b) => a.id - b.id);
  return (
    <section className="orbit-block oc" aria-labelledby="oc-title">
      <h2 id="oc-title" className="oc-title">Мої номерні орбіти <small>{mine.length}</small></h2>
      {mine.length === 0 ? (
        <Empty icon={<OrbitIcon size={20} strokeWidth={1.6} />} title="Поки жодної орбіти" text="Кожна орбіта отримує свій номер з 8 000 000 і власний вигляд — назавжди." />
      ) : (
        <ul className="oc-list">
          {mine.slice(0, 12).map((orbit) => {
            const t = traitsOf(orbit.id);
            return (
              <li key={orbit.id} className="oc-card" style={{ ["--oc-hue" as string]: String(t.hue) }} aria-label={`Орбіта ${orbitOf(orbit.id)}: ${t.tint.toLowerCase()}, сузір’я ${t.sky}, кілець ${t.rings}, супутників ${t.moons}, ${t.tier.toLowerCase()}`}>
                <OrbitGlyph id={orbit.id} />
                <div className="oc-body">
                  <b className="oc-no">{orbitOf(orbit.id)}</b>
                  <span className="oc-tier" data-tier={t.tier === "Звичайна" ? "0" : "1"}>{t.tier}</span>
                  <small>{t.tint} · {t.sky} · кілець {t.rings} · супутників {t.moons} · {t.dust}</small>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="ex-hint">Вигляд залежить лише від номера — він однаковий на будь-якому телефоні. Це прикраса: на ціну й частку фонду не впливає.</p>
    </section>
  );
}
