import { OrbitCrew } from "@/components/orbit/crew";
import { ChevronRight, Hexagon, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Page } from "@/components/orbit/more";
import type { Tab } from "@/components/orbit/pages";
import { spk } from "@/lib/orbit/copy";
import { DAY_MS, holdBonus, ORBIT_CAP, type Account, type World } from "@/lib/orbit/engine";
import { clock, no } from "@/lib/orbit/ledger";

const fmt = new Intl.NumberFormat("uk-UA");

/** «#19», «0000019», «19» → 19. Порожньо або сміття → null. */
function parse(raw: string) {
  const digits = raw.replace(/[\s#№]/g, "");
  if (!digits) return null;
  if (!/^\d{1,7}$/.test(digits)) return NaN;
  return Number(digits);
}

function days(ms: number) {
  const d = Math.floor(ms / DAY_MS);
  if (d < 1) return "менше доби";
  return `${d} ${d % 10 === 1 && d % 100 !== 11 ? "день" : d % 10 >= 2 && d % 10 <= 4 && (d % 100 < 10 || d % 100 >= 20) ? "дні" : "днів"}`;
}

export function Explorer({ world, user, onBack, onClose, onGo, onDm }: { world: World; user: Account; onBack: () => void; onClose?: () => void; onGo: (tab: Tab) => void; onDm?: (uid: string) => void }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const parsed = parse(query);
  const target = picked ?? (typeof parsed === "number" && !Number.isNaN(parsed) ? parsed : null);
  const recent = useMemo(() => [...world.trades].sort((a, b) => b.at - a.at).slice(0, 8), [world.trades]);
  const dayTrades = world.trades.filter((trade) => trade.at > world.now - DAY_MS);
  const last = world.orbits.reduce((max, orbit) => Math.max(max, orbit.id), 0);

  return (
    <Page title="Оглядач орбіт" kicker="Публічні дані світу" onBack={onBack} onClose={onClose}>
      <form
        className="mo-search ox-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (typeof parsed === "number" && !Number.isNaN(parsed)) setPicked(parsed);
        }}
      >
        <Search size={16} strokeWidth={1.75} aria-hidden />
        <input
          type="search"
          inputMode="numeric"
          value={query}
          placeholder="Номер орбіти, напр. 19"
          aria-label="Номер орбіти"
          maxLength={9}
          onChange={(event) => {
            setQuery(event.target.value);
            setPicked(null);
          }}
        />
        {query ? (
          <button type="button" className="mo-icon ox-clear" aria-label="Очистити" onClick={() => { setQuery(""); setPicked(null); }}>
            <X size={14} strokeWidth={2} />
          </button>
        ) : null}
      </form>

      {Number.isNaN(parsed) ? (
        <p className="orbit-empty" role="status">Лише цифри: від 1 до 7 знаків.</p>
      ) : target !== null ? (
        <OrbitCard world={world} user={user} id={target} onGo={onGo} max={last} onDm={onDm} />
      ) : (
        <>
          <section className="ox-stats" aria-label="Світ зараз">
            <div><small>Орбіт</small><b>{fmt.format(world.orbits.length)}</b><em>з {fmt.format(ORBIT_CAP)}</em></div>
            <div><small>У черзі</small><b>{fmt.format(world.queue.length)}</b><em>на обміні</em></div>
            <div><small>Угод за 24 год</small><b>{fmt.format(dayTrades.length)}</b><em>{spk(dayTrades.reduce((sum, trade) => sum + trade.amount, 0))}</em></div>
            <div><small>Остання</small><b>{last ? no(last) : "—"}</b><em>найбільший номер</em></div>
          </section>
          <section className="mo-group" aria-label="Останні угоди">
            <p className="mo-group-title">Останні угоди</p>
            {recent.length ? (
              <div className="mo-card">
                {recent.map((trade, index) => (
                  <button key={`${trade.at}-${index}`} type="button" className="ox-trade" onClick={() => { setQuery(String(trade.orbitId)); setPicked(trade.orbitId); }} aria-label={`Орбіта ${no(trade.orbitId)}, ${spk(trade.amount)}`}>
                    <span className="mo-row-ico" aria-hidden><Hexagon size={17} strokeWidth={1.5} /></span>
                    <span className="mo-row-text">
                      <b>{no(trade.orbitId)}</b>
                      <small>{clock(trade.at)}</small>
                    </span>
                    <span className="ox-amt">{spk(trade.amount)}</span>
                    <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
                  </button>
                ))}
              </div>
            ) : (
              <p className="orbit-empty">Угод ще не було. Перша з’явиться тут.</p>
            )}
          </section>
          <p className="orbit-note as-small">Тут видно лише те, що й так бачить увесь світ: номер, власника за ім’ям, чергу й ціни угод. Баланси людей не показуємо.</p>
        </>
      )}
    </Page>
  );
}

function OrbitCard({ world, user, id, onGo, max, onDm }: { world: World; user: Account; id: number; onGo: (tab: Tab) => void; max: number; onDm?: (uid: string) => void }) {
  const orbit = world.orbits.find((row) => row.id === id);
  if (!orbit) {
    return (
      <div className="orbit-empty ox-none" role="status">
        <b>{no(id)} немає</b>
        <span>{max ? `Зараз орбіти мають номери до ${no(max)}.` : "Орбіт у світі ще немає."}</span>
      </div>
    );
  }
  const owner = world.accounts.find((account) => account.id === orbit.ownerId);
  const mine = orbit.ownerId === user.id;
  const place = world.queue.findIndex((listing) => listing.orbitId === id);
  const trades = world.trades.filter((trade) => trade.orbitId === id).sort((a, b) => b.at - a.at);
  const held = world.now - orbit.createdAt;
  const bonus = Math.round(holdBonus(held) * 100);
  const status = place === 0 ? "first" : place > 0 ? "queued" : "free";
  const label = place === 0 ? "перша в черзі" : place > 0 ? `у черзі · ${place + 1}` : "не продається";

  return (
    <article className="ox-card" aria-label={`Орбіта ${no(id)}`}>
      <header className="ox-head">
        <span className="ox-glyph" aria-hidden><Hexagon size={26} strokeWidth={1.3} /></span>
        <div>
          <h3>{no(id)}</h3>
          <span className="as-tag" data-status={status}>{label}</span>
          {mine ? <span className="as-tag ox-mine">твоя</span> : null}
        </div>
      </header>
      <dl className="ox-kv">
        <div><dt>Власник</dt><dd>{owner ? owner.name : "—"}{mine ? " (ти)" : ""}{owner && !mine && onDm ? <> · <button type="button" className="ox-dm" onClick={() => onDm(owner.id)}>Написати</button></> : null}</dd></div>
        <div><dt>У власника з</dt><dd>{clock(orbit.createdAt)}</dd></div>
        <div><dt>Тримає</dt><dd>{days(held)}{bonus ? ` · +${bonus}% до частки` : ""}</dd></div>
        <div><dt>Угод</dt><dd>{trades.length}</dd></div>
        <div><dt>Остання ціна</dt><dd>{trades[0] ? spk(trades[0].amount) : "ще не продавалась"}</dd></div>
      </dl>
      <OrbitCrew world={world} orbitId={id} me={user.id} />
      <section className="mo-group" aria-label="Події орбіти">
        <p className="mo-group-title">Події</p>
        <ol className="ox-time">
          {place >= 0 ? <li data-kind="queue"><b>Стоїть у черзі</b><small>{place === 0 ? "Наступна купівля — її" : `Перед нею ${place}`}</small></li> : null}
          <li data-kind="hold"><b>{owner ? `Власник тепер — ${owner.name}` : "Власник змінився"}</b><small>{clock(orbit.createdAt)}</small></li>
          {trades.map((trade, index) => (
            <li key={`${trade.at}-${index}`} data-kind="trade"><b>Продана за {spk(trade.amount)}</b><small>{clock(trade.at)}</small></li>
          ))}
          {!trades.length ? <li data-kind="born"><b>Народилась після заряду</b><small>Угод ще не було</small></li> : null}
        </ol>
      </section>
      {mine && place < 0 ? (
        <button type="button" className="orbit-quiet as-act" onClick={() => onGo("market")}>Поставити в чергу на продаж</button>
      ) : !mine ? (
        <p className="orbit-note as-small">Купити саме цю орбіту не можна: обмін віддає першу в черзі за ціною дня.</p>
      ) : null}
    </article>
  );
}
