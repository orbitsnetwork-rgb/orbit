/** «Шлях довіри»: хто кого знає через ланцюжок підтверджень. Пошук людини → ланцюжок аватарів. */
import { useMemo, useState } from "react";
import { Route as RouteIcon } from "lucide-react";
import { Avatar } from "@/components/orbit/ui/kit";
import { shortName } from "@/lib/orbit/live-rules";
import { trustGraph, trustPath } from "@/lib/orbit/trust-path";
import type { Account, World } from "@/lib/orbit/engine";
import { WordsOf } from "@/components/orbit/vouch-words";

export function DegreeChip({ d }: { d: number | undefined }) {
  if (!d) return null;
  const label = d === 1 ? "Пряме підтвердження" : `Через ${d - 1} ${d === 2 ? "людину" : "людей"}`;
  return <span className="tp-deg" data-d={d} title={label} aria-label={label}>{d}°</span>;
}

export function TrustFinder({ world, user }: { world: World; user: Account }) {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const g = useMemo(() => trustGraph(world), [world]);
  const names = useMemo(() => new Map(world.accounts.map((a) => [a.id, a.name] as const)), [world]);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return world.accounts.filter((a) => a.id !== user.id && a.name.toLowerCase().includes(s)).slice(0, 6);
  }, [q, world, user.id]);
  const path = pick ? trustPath(g, user.id, pick, 5) : null;
  return (
    <section className="orbit-block tp" aria-labelledby="tp-title">
      <p className="orbit-kicker" id="tp-title"><RouteIcon size={14} aria-hidden /> Шлях довіри</p>
      <p className="orbit-note">Знайди будь-кого — і побачиш, через кого ви пов'язані підтвердженнями. Перш ніж довіряти незнайомцю, глянь, хто за нього поручився.</p>
      <label className="tp-field">
        <span className="visually-hidden">Ім'я людини</span>
        <input className="orbit-field" value={q} placeholder="Ім'я людини" autoComplete="off" onChange={(e) => { setQ(e.target.value); setPick(null); }} />
      </label>
      {!pick && hits.length ? (
        <ul className="tp-hits">
          {hits.map((a) => (
            <li key={a.id}><button type="button" onClick={() => setPick(a.id)}><Avatar id={a.id} name={a.name} size={26} /> {shortName(a.name)}</button></li>
          ))}
        </ul>
      ) : null}
      {!pick && q.trim().length >= 2 && !hits.length ? <p className="orbit-note">Нікого з таким ім'ям.</p> : null}
      {pick ? (
        path ? (
          <ol className="tp-chain" aria-label={`Шлях: ${path.map((id) => (id === user.id ? "ти" : shortName(names.get(id) ?? ""))).join(" → ")}`}>
            {path.map((id, i) => (
              <li key={id} style={{ ["--i" as string]: i }}>
                <Avatar id={id} name={names.get(id) ?? "?"} size={i === 0 || i === path.length - 1 ? 40 : 32} me={id === user.id} />
                <span>{id === user.id ? "Ти" : shortName(names.get(id) ?? "")}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="tp-none" role="status">Між вами поки немає ланцюжка підтверджень (до 5 кроків). Будь обережним із незнайомцями.</p>
        )
      ) : null}
      {pick && path ? <p className="orbit-note" role="status">{path.length === 2 ? "Ви підтвердили одне одного напряму." : `${path.length - 2} ${path.length - 2 === 1 ? "людина" : "людини"} між вами.`}</p> : null}
      {pick ? <WordsOf world={world} who={pick} /> : null}
    </section>
  );
}
