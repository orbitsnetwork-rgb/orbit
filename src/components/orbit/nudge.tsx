/** 19: «Нагадати» — сповіщення в застосунку тим, хто тебе знає, але ще не підтвердив. Раз на 12 год. */
import { useState } from "react";
import { BellRing } from "lucide-react";
import type { Creation, World } from "@/lib/orbit/engine";
import { NUDGE_EVERY_MS, nudgeTargets } from "@/lib/orbit/social";
import { useOrbits } from "@/lib/orbit/store";

export function NudgeButton({ world, creation, userId, now }: { world: World; creation: Creation; userId: string; now: number }) {
  const events = useOrbits((state) => state.mine?.events);
  const [busy, setBusy] = useState(false);
  if (creation.status !== "collecting") return null;
  const lastAt = events?.find((ev) => ev.t === "nudgeSent")?.at ?? 0;
  const wait = Math.max(0, lastAt + NUDGE_EVERY_MS - now);
  const targets = nudgeTargets(world, userId, creation.id).length;
  const hours = Math.ceil(wait / 3_600_000);
  return (
    <section className="orbit-block nd" aria-labelledby="nd-title">
      <div className="nd-row">
        <span className="nd-ico" aria-hidden><BellRing size={18} strokeWidth={1.9} /></span>
        <div>
          <h2 id="nd-title">Нагадати екіпажу</h2>
          <small>
            {wait > 0
              ? `Уже нагадали. Наступне — через ${hours} год.`
              : targets
                ? `${targets} ${targets === 1 ? "людина знає" : "людей знають"} тебе з минулих запусків, але ще не підтвердили.`
                : "Нагадування отримають ті, з ким ви вже підтверджували одне одного."}
          </small>
        </div>
      </div>
      <button
        type="button"
        className="orbit-quiet nd-go"
        disabled={busy || wait > 0 || targets === 0}
        aria-describedby="nd-title"
        onClick={async () => {
          setBusy(true);
          try {
            await useOrbits.getState().nudge(creation.id);
          } finally {
            setBusy(false);
          }
        }}
      >
        Нагадати
      </button>
    </section>
  );
}
