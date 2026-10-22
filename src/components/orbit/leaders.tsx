import { useMemo, useState } from "react";
import { Page } from "@/components/orbit/more";
import { Avatar } from "@/components/orbit/ui/kit";
import { DAY_MS, type Account, type World } from "@/lib/orbit/engine";
import { degreesFrom, trustGraph } from "@/lib/orbit/trust-path";
import { DegreeChip } from "@/components/orbit/trust-path";

type Metric = "stability" | "orbits" | "hold";
const TABS: { id: Metric; label: string; unit: (n: number) => string; hint: string }[] = [
  { id: "stability", label: "Стабільність", unit: (n) => String(n), hint: "Росте за чесні підтвердження і заряди" },
  { id: "orbits", label: "Орбіти", unit: (n) => `${n} орб.`, hint: "Скільки орбіт у людини зараз" },
  { id: "hold", label: "Тримання", unit: (n) => `${n} д`, hint: "Найдовше тримає одну орбіту" },
];
const SHOW = 20;

function score(world: World, account: Account, metric: Metric) {
  if (metric === "stability") return account.stability;
  const mine = world.orbits.filter((orbit) => orbit.ownerId === account.id);
  if (metric === "orbits") return mine.length;
  return mine.reduce((best, orbit) => Math.max(best, Math.floor((world.now - orbit.createdAt) / DAY_MS)), 0);
}

export function Leaders({ world, user, onBack, onClose }: { world: World; user: Account; onBack: () => void; onClose?: () => void }) {
  const [metric, setMetric] = useState<Metric>("stability");
  const tab = TABS.find((row) => row.id === metric) ?? TABS[0];
  const rows = useMemo(() => {
    const scored = world.accounts
      .map((account) => ({ account, value: score(world, account, metric) }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value || a.account.createdAt - b.account.createdAt);
    // Однакове значення — однакове місце.
    let place = 0;
    return scored.map((row, index) => {
      if (index === 0 || row.value !== scored[index - 1].value) place = index + 1;
      return { ...row, place };
    });
  }, [world, metric]);
  const deg = useMemo(() => degreesFrom(trustGraph(world), user.id), [world, user.id]);
  const mine = rows.find((row) => row.account.id === user.id);
  const top = rows.slice(0, 3);
  const rest = rows.slice(3, SHOW);

  return (
    <Page title="Рейтинг" kicker="Без балансів" onBack={onBack} onClose={onClose}>
      <div className="hi-chips" role="tablist" aria-label="Показник">
        {TABS.map((row) => (
          <button key={row.id} type="button" role="tab" aria-selected={metric === row.id} className="orbit-chip" data-on={metric === row.id ? "1" : "0"} onClick={() => setMetric(row.id)}>
            {row.label}
          </button>
        ))}
      </div>
      <p className="orbit-note as-small">{tab.hint}. Учасників: {rows.length}.</p>

      {rows.length ? (
        <>
          <ol className="lb-podium" aria-label="Перші три">
            {[top[1], top[0], top[2]].map((row, index) =>
              row ? (
                <li key={row.account.id} data-place={row.place} data-me={row.account.id === user.id ? "1" : "0"} style={{ order: index }}>
                  <Avatar id={row.account.id} name={row.account.name} size={row.place === 1 ? 56 : 48} me={row.account.id === user.id} />
                  <b>{row.account.name}</b>
                  <small>{tab.unit(row.value)}</small>
                  <DegreeChip d={deg.get(row.account.id)} />
                  <span className="lb-step"><span className="visually-hidden">Місце </span>{row.place}</span>
                </li>
              ) : (
                <li key={`gap-${index}`} className="lb-gap" aria-hidden />
              ),
            )}
          </ol>
          {rest.length ? (
            <ol className="mo-card lb-list" start={4} aria-label="Інші місця">
              {rest.map((row) => (
                <li key={row.account.id} className="lb-row" data-me={row.account.id === user.id ? "1" : "0"}>
                  <span className="lb-place">{row.place}</span>
                  <Avatar id={row.account.id} name={row.account.name} size={34} me={row.account.id === user.id} />
                  <b>{row.account.name}{row.account.id === user.id ? " · ти" : ""}</b>
                  <DegreeChip d={deg.get(row.account.id)} />
                  <span className="lb-val">{tab.unit(row.value)}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      ) : (
        <p className="orbit-empty">Поки нікого. Перший, хто {metric === "stability" ? "підтвердить чужу заявку" : "отримає орбіту"}, з’явиться тут.</p>
      )}

      <div className="lb-me" role="status">
        <span>Моє місце</span>
        <b>{mine ? `${mine.place} з ${rows.length}` : "ще немає"}</b>
        <small>{mine ? tab.unit(mine.value) : metric === "stability" ? "Підтверди чужу заявку" : "Отримай першу орбіту"}</small>
      </div>
      <p className="orbit-note as-small">Видно лише ім’я в грі і показник. Баланси і пошти не показуємо. Можливість сховатися з рейтингу — у розробці.</p>
    </Page>
  );
}
