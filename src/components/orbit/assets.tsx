import { Eye, EyeOff, Hexagon } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/orbit/more";
import type { Tab } from "@/components/orbit/pages";
import { sparkWord, spk } from "@/lib/orbit/copy";
import { activeCreation, CONFIRM_NEED, DAY_MS, holdBonus, ORBIT_CAP, type Account, type World } from "@/lib/orbit/engine";
import { no } from "@/lib/orbit/ledger";
import { MASK, useHidden } from "@/lib/orbit/prefs";
import { useOrbits } from "@/lib/orbit/store";

const fmt = new Intl.NumberFormat("uk-UA");
const TIERS = [
  { days: 7, bonus: 10 },
  { days: 14, bonus: 25 },
  { days: 30, bonus: 50 },
];

function held(ms: number) {
  const days = Math.floor(ms / DAY_MS);
  if (days >= 1) return `${days} д`;
  const hours = Math.floor(ms / 3_600_000);
  return hours >= 1 ? `${hours} год` : "щойно";
}

export function Assets({ world, user, onBack, onClose, onGo }: { world: World; user: Account; onBack: () => void; onClose?: () => void; onGo: (tab: Tab) => void }) {
  const [hidden, toggle] = useHidden();
  const [busy, setBusy] = useState<number | null>(null);
  const pendingMail = useOrbits((state) => state.self)?.confirmed === false;
  const mine = world.orbits.filter((orbit) => orbit.ownerId === user.id).sort((a, b) => a.createdAt - b.createdAt);
  const creation = activeCreation(world, user.id);
  const queued = new Map(world.queue.map((row, index) => [row.orbitId, index]));
  const listed = mine.filter((orbit) => queued.has(orbit.id)).length;
  const value = mine.length * world.price;
  const show = (text: string) => (hidden ? MASK : text);

  return (
    <Page title="Активи" kicker="Мій гаманець" onBack={onBack} onClose={onClose}>
      <section className="as-hero" aria-label="Баланс">
        <div className="as-hero-top">
          <p className="orbit-kicker">Баланс</p>
          <button type="button" className="mo-icon as-eye" onClick={toggle} aria-pressed={hidden} aria-label={hidden ? "Показати баланс" : "Приховати баланс"}>
            {hidden ? <EyeOff size={17} strokeWidth={1.6} /> : <Eye size={17} strokeWidth={1.6} />}
          </button>
        </div>
        <button type="button" className="as-tap" onClick={toggle} aria-label={hidden ? "Показати баланс" : "Приховати баланс"}>
          <span className="orbit-price">{show(fmt.format(user.balance))}</span>
        </button>
        <p className="orbit-unit">{hidden ? "приховано" : `${sparkWord(user.balance)} ✦`}</p>
        <div className="as-split">
          <div><span>Орбіт</span><b>{mine.length}</b></div>
          <div><span>У черзі</span><b>{listed}</b></div>
          <div><span>За ціною дня</span><b>{show(spk(value))}</b></div>
        </div>
        <p className="orbit-note as-small">Оцінка — кількість орбіт × ціна дня. Це не гроші і не обіцянка продажу.</p>
      </section>

      {creation ? (
        <button type="button" className="as-creation" onClick={() => onGo("mine")}>
          <span>
            <small>{creation.status === "charging" ? "Заряд іде" : "Заявка"}</small>
            <b>{creation.status === "charging" ? "Чекаємо результат" : `${creation.confirms.length} з ${CONFIRM_NEED} підтверджень`}</b>
          </span>
          <span className="as-dots" aria-hidden>
            {Array.from({ length: CONFIRM_NEED }, (_, index) => (
              <i key={index} data-on={index < creation.confirms.length ? "1" : "0"} />
            ))}
          </span>
        </button>
      ) : null}

      <section className="mo-group" aria-label="Мої орбіти">
        <div className="as-head">
          <p className="mo-group-title">Мої орбіти</p>
          <span className="orbit-note as-small">{fmt.format(mine.length)} з {fmt.format(ORBIT_CAP)}</span>
        </div>
        {mine.length === 0 ? (
          <div className="hi-empty">
            <Hexagon size={22} strokeWidth={1.4} aria-hidden />
            <p>Орбіт поки немає</p>
            <div className="orbit-chips">
              <button type="button" className="orbit-chip" onClick={() => onGo("mine")}>Відкрити заявку</button>
              <button type="button" className="orbit-chip" onClick={() => onGo("market")}>Купити</button>
            </div>
          </div>
        ) : (
          <div className="mo-card">
            {mine.map((orbit) => {
              const place = queued.get(orbit.id);
              const age = world.now - orbit.createdAt;
              const bonus = Math.round(holdBonus(age) * 100);
              const next = TIERS.find((tier) => age < tier.days * DAY_MS);
              const from = next ? (TIERS[TIERS.indexOf(next) - 1]?.days ?? 0) : 30;
              const progress = next ? Math.min(1, (age / DAY_MS - from) / (next.days - from)) : 1;
              const status = place === undefined ? "free" : place === 0 ? "first" : "queued";
              return (
                <div key={orbit.id} className="as-orbit" data-status={status}>
                  <div className="as-orbit-top">
                    <span className="as-no">{no(orbit.id)}</span>
                    <span className="as-tag" data-status={status}>
                      {status === "free" ? "вільна" : status === "first" ? "перша в черзі" : `у черзі · ${place! + 1}`}
                    </span>
                  </div>
                  <div className="as-hold">
                    <div className="ex-bar" role="progressbar" aria-label="Утримання" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                      <i style={{ width: `${Math.max(progress * 100, 2)}%` }} />
                    </div>
                    <span className="orbit-note as-small">
                      У тебе {held(age)} · бонус до частки фонду {bonus}%{next ? ` · ${next.bonus}% з ${next.days} д` : " · максимум"}
                    </span>
                  </div>
                  {pendingMail ? null : status === "free" ? (
                    <button type="button" className="orbit-quiet as-act" onClick={() => onGo("market")}>Продати на обміні</button>
                  ) : status === "queued" ? (
                    <button
                      type="button"
                      className="orbit-quiet as-act"
                      disabled={busy === orbit.id}
                      onClick={() => {
                        setBusy(orbit.id);
                        void useOrbits.getState().cancel(orbit.id).finally(() => setBusy(null));
                      }}
                    >
                      {busy === orbit.id ? "…" : "Зняти з черги"}
                    </button>
                  ) : (
                    <span className="orbit-note as-small">Першу вже не зняти: її можуть купити будь-якої миті.</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      <p className="orbit-note as-small">Бонус утримання рахується від часу, коли орбіта стала твоєю. Після продажу і нової купівлі відлік іде з нуля.</p>
    </Page>
  );
}
