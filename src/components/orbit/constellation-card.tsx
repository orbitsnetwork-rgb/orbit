/** Картка-вхід у «Моє сузір'я» на вкладці «Я»: міні-мапа + головне число. */
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { ConstellationMap } from "@/components/orbit/constellation";
import { constellationOf } from "@/lib/orbit/constellation";
import type { Account, World } from "@/lib/orbit/engine";

export function ConstellationCard({ world, user, onOpen }: { world: World; user: Account; onOpen: () => void }) {
  const c = useMemo(() => constellationOf(world, user.id), [world, user.id]);
  return (
    <button type="button" className="orbit-block cs-card" onClick={onOpen} aria-label={`Моє сузір'я: ${c.total}. Відкрити`}>
      <span className="cs-card-map" aria-hidden><ConstellationMap c={c} user={user} size={112} /></span>
      <span className="cs-card-txt">
        <span className="orbit-kicker">Моє сузір'я</span>
        <b>{c.total ? `${c.total} ${c.total % 10 === 1 && c.total % 100 !== 11 ? "людина" : [2, 3, 4].includes(c.total % 10) && ![12, 13, 14].includes(c.total % 100) ? "людини" : "людей"}` : "Поки лише ти"}</b>
        <span className="orbit-note">{c.total ? `Тебе підтвердили: ${c.in.length} · ти підтвердив: ${c.out.length}` : "Підтверди перший запуск — з'явиться перша лінія"}</span>
      </span>
      <ChevronRight size={18} aria-hidden className="cs-card-go" />
    </button>
  );
}
