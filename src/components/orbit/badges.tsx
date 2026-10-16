/** «Дні на орбіті» і відзнаки в профілі. Лише косметика. */
import type { ReactNode } from "react";
import { Award, CalendarCheck, Flame, Snowflake, Heart, Orbit as OrbitIcon, ShieldCheck, Users } from "lucide-react";
import type { World } from "@/lib/orbit/engine";
import { badgesOf, type BadgeId } from "@/lib/orbit/badges";
import { useOrbits } from "@/lib/orbit/store";
import { FREEZE_EVERY, FREEZE_MAX } from "@/lib/orbit/social";

const dn = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "день" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "дні" : "днів");

const ICON: Record<BadgeId, ReactNode> = {
  firstConfirm: <ShieldCheck size={22} strokeWidth={1.8} />,
  firstOrbit: <OrbitIcon size={22} strokeWidth={1.8} />,
  week: <CalendarCheck size={22} strokeWidth={1.8} />,
  crew8: <Users size={22} strokeWidth={1.8} />,
  thanks10: <Heart size={22} strokeWidth={1.8} />,
};

export function OrbitDays({ world, userId }: { world: World; userId: string }) {
  const mine = useOrbits((state) => state.mine);
  const origins = useOrbits((state) => state.origins);
  const days = mine?.days;
  const badges = badgesOf(world, userId, mine, origins);
  const got = badges.filter((b) => b.got).length;
  return (
    <section className="orbit-block bd" aria-labelledby="bd-title">
      <div className="bd-days">
        <span className="bd-days-ico" aria-hidden><Flame size={22} strokeWidth={1.8} /></span>
        <div>
          <h2 id="bd-title">Дні на орбіті · <b>{days?.count ?? 0}</b></h2>
          <p>{days ? `Орбітальна серія ${days.streak} ${dn(days.streak)} поспіль · найдовша ${days.best}` : "Зроби першу дію сьогодні — і лічильник почнеться"}</p>
        </div>
      </div>
      {days ? (
        <div className="bd-freeze" aria-label={`Заморозки серії: ${days.freezes ?? 0} з ${FREEZE_MAX}`}>
          <span className="bd-freeze-ico" aria-hidden><Snowflake size={16} strokeWidth={2} /></span>
          <span className="bd-freeze-dots" aria-hidden>
            {Array.from({ length: FREEZE_MAX }, (_, i) => <i key={i} data-on={i < (days.freezes ?? 0) ? "1" : "0"} />)}
          </span>
          <small>
            {(days.freezes ?? 0) > 0
              ? `Пропустиш день — заморозка збереже серію.${days.frozen ? ` Уже врятовано ${days.frozen} ${dn(days.frozen)}.` : ""}`
              : `Заморозка — за кожні ${FREEZE_EVERY} днів поспіль (ще ${FREEZE_EVERY - (days.streak % FREEZE_EVERY)} ${dn(FREEZE_EVERY - (days.streak % FREEZE_EVERY))}).`}
          </small>
        </div>
      ) : null}
      <p className="bd-sub"><Award size={15} strokeWidth={2} aria-hidden /> Відзнаки · {got} з {badges.length} <small>лише для краси, без іскор</small></p>
      <ul className="bd-grid">
        {badges.map((b) => (
          <li key={b.id} data-got={b.got ? "1" : "0"} aria-label={`${b.title}: ${b.got ? "отримано" : `${b.progress[0]} з ${b.progress[1]}`}`}>
            <span className="bd-ico" aria-hidden>{ICON[b.id]}</span>
            <b>{b.title}</b>
            <small>{b.got ? "отримано" : b.progress[1] > 1 ? `${b.progress[0]} з ${b.progress[1]}` : b.hint}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
