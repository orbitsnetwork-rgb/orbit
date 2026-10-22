/** Картка «Відлуння» на головній: нові лінії в сузір'ї з минулого візиту. Перший візит лише запам'ятовує стан. */
import { useEffect, useMemo, useState } from "react";
import { Waves, X } from "lucide-react";
import { Avatar } from "@/components/orbit/ui/kit";
import { echoesSince } from "@/lib/orbit/echo";
import { shortName } from "@/lib/orbit/live-rules";
import type { Account, World } from "@/lib/orbit/engine";

const KEY = (id: string) => `orbits-echo-${id}`;

function readSeen(id: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(KEY(id));
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}
function writeSeen(id: string, all: string[]) {
  try {
    localStorage.setItem(KEY(id), JSON.stringify(all.slice(-2000)));
  } catch {
    /* квота */
  }
}

export function EchoCard({ world, user, onOpen }: { world: World; user: Account; onOpen: () => void }) {
  const [seen, setSeen] = useState<Set<string> | null | undefined>(undefined);
  useEffect(() => setSeen(readSeen(user.id)), [user.id]);
  const res = useMemo(() => (seen === undefined ? null : echoesSince(world, user.id, seen ?? new Set())), [world, user.id, seen]);
  useEffect(() => {
    // Перший запуск на пристрої: без «вибуху» старих подій — просто запам'ятати.
    if (res && seen === null) { writeSeen(user.id, res.all); setSeen(new Set(res.all)); }
  }, [res, seen, user.id]);
  if (!res || !seen || !res.fresh.length) return null;
  const done = () => { writeSeen(user.id, res.all); setSeen(new Set(res.all)); };
  const top = res.fresh.slice(0, 3);
  const line = (e: (typeof top)[number]) =>
    e.kind === "in" ? `${shortName(e.name)} підтвердив(ла) тебе` : e.via ? `${shortName(e.via)} → ${shortName(e.name)}` : `${shortName(e.name)} — у твоїй хвилі`;
  return (
    <section className="orbit-block ec" aria-labelledby="ec-title" role="status">
      <div className="ec-head">
        <span className="ec-ico" aria-hidden><Waves size={18} /></span>
        <h2 id="ec-title">{res.fresh.some((e) => e.kind === "wave") ? "Твоя хвиля пішла далі" : "Нова лінія в сузір'ї"}</h2>
        <button type="button" className="em-x" onClick={done} aria-label="Сховати"><X size={16} /></button>
      </div>
      <ul className="ec-list">
        {top.map((e) => (
          <li key={`${e.kind}:${e.id}`}><Avatar id={e.id} name={e.name} size={26} /><span>{line(e)}</span></li>
        ))}
      </ul>
      {res.fresh.length > 3 ? <p className="orbit-note">і ще {res.fresh.length - 3}</p> : null}
      <button type="button" className="k-ghost ec-go" onClick={() => { done(); onOpen(); }}>Дивитись сузір'я</button>
    </section>
  );
}
