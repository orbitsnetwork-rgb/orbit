import { orbitNo } from "@/lib/orbit/traits";
/** «Я» v8: показники профілю і картки моїх орбіт. */
import { ThankList } from "@/components/orbit/crew";
import { useOrbits } from "@/lib/orbit/store";
import { CalendarDays, CheckCircle2, Flame, Heart, ListOrdered, Orbit as OrbitIcon, ShieldCheck, Zap } from "lucide-react";
import { DAY_MS, holdBonus, type Account, type World } from "@/lib/orbit/engine";
import { Empty, SectionHead, Stat } from "@/components/orbit/ui/kit";

const fmt = new Intl.NumberFormat("uk-UA");
function no(id: number) {
  return orbitNo(id);
}

export function daysWith(user: Account, now: number) {
  return Math.max(0, Math.floor((now - user.createdAt) / DAY_MS));
}

export function ProfileStats({ world, user }: { world: World; user: Account }) {
  const thanks = useOrbits((state) => state.mine?.thanksGot ?? 0);
  const active = useOrbits((state) => state.mine?.days?.count ?? 0);
  const orbits = world.orbits.filter((orbit) => orbit.ownerId === user.id).length;
  const given = world.creations.reduce((sum, row) => sum + row.confirms.filter((c) => c.witnessId === user.id).length, 0);
  return (
    <div className="k-grid2 pr-stats">
      <Stat icon={<OrbitIcon size={16} strokeWidth={2} />} value={fmt.format(orbits)} label="орбіт у тебе" />
      <Stat icon={<Zap size={16} strokeWidth={2} />} tone="nebula" value={fmt.format(user.stability)} label="стабільність" />
      <Stat icon={<ShieldCheck size={16} strokeWidth={2} />} tone="aurora" value={fmt.format(given)} label="ти підтвердив людей" />
      <Stat icon={<CalendarDays size={16} strokeWidth={2} />} tone="ion" value={fmt.format(daysWith(user, world.now))} label="днів в Орбітах" />
      <Stat icon={<Heart size={16} strokeWidth={2} />} tone="sun" value={fmt.format(thanks)} label="подяки" />
      <Stat icon={<Flame size={16} strokeWidth={2} />} tone="sun" value={fmt.format(active)} label="днів на орбіті" />
    </div>
  );
}

/** Успішні власні запуски, де ще є кому подякувати. */
export function ThanksDue({ world, user }: { world: World; user: Account }) {
  const thanked = useOrbits((state) => state.mine?.thanked) ?? {};
  const due = world.creations.filter((row) => row.userId === user.id && row.status === "done" && row.confirms.some((c) => !(thanked[row.id] ?? []).includes(c.witnessId)));
  if (!due.length) return null;
  return (
    <section className="orbit-block" aria-labelledby="pr-thanks-title">
      <SectionHead id="pr-thanks-title" title="Подякуй екіпажу" />
      {due.map((row) => <ThankList key={row.id} world={world} creation={row} compact />)}
    </section>
  );
}

export function OrbitCards({ world, user, onAll }: { world: World; user: Account; onAll: () => void }) {
  const mine = world.orbits.filter((orbit) => orbit.ownerId === user.id).sort((a, b) => a.createdAt - b.createdAt);
  const queued = new Map(world.queue.map((row, index) => [row.orbitId, index + 1]));
  return (
    <section className="orbit-block" aria-labelledby="pr-orbits-title">
      <SectionHead id="pr-orbits-title" title={`Мої орбіти · ${mine.length}`} action={mine.length ? "Активи" : undefined} onAction={onAll} />
      {mine.length === 0 ? (
        <Empty icon={<OrbitIcon size={20} strokeWidth={1.6} />} title="Поки жодної" text="Купи першу на «Обміні» або запусти свою на вкладці «Заявка»." />
      ) : (
        <ul className="pr-orbits">
          {mine.map((orbit) => {
            const held = world.now - orbit.createdAt;
            const days = Math.floor(held / DAY_MS);
            const bonus = holdBonus(held);
            const place = queued.get(orbit.id);
            return (
              <li key={orbit.id} data-queued={place ? "1" : "0"}>
                <span className="pr-orbit-art" aria-hidden><i /><i /><b /></span>
                <b className="pr-orbit-no">{no(orbit.id)}</b>
                <small>{days ? `тримаєш ${days} д` : "сьогодні"}{bonus ? ` · +${Math.round(bonus * 100)}%` : ""}</small>
                <span className="mn-tag" data-tone={place ? "sun" : "aurora"}>
                  {place ? <><ListOrdered size={11} strokeWidth={2.4} aria-hidden /> у черзі · {place}</> : <><CheckCircle2 size={11} strokeWidth={2.4} aria-hidden /> вільна</>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
