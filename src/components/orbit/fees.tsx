import { useState } from "react";
import { Page } from "@/components/orbit/more";
import { NAMES_PER_DEVICE } from "@/lib/orbit/access";
import {
  activeCreation,
  CHARGE_MS,
  CODE_MS,
  CODES_PER_DAY,
  CONFIRM_NEED,
  FUND_PERIOD_MS,
  FUND_SHARE,
  MIN_PRICE,
  NOVICE_CODES_PER_DAY,
  SELLER_SHARE,
  STABILITY_GATE,
  STARTER_OD,
  utcDay,
  WITNESS_OD,
  type Account,
  type World,
} from "@/lib/orbit/engine";

const fmt = new Intl.NumberFormat("uk-UA");
const pct = (value: number) => `${String(Math.round(value * 1000) / 10).replace(".", ",")}%`;

type Tab = "fees" | "limits";

/** Комісії і ліміти: лише показ констант рушія. Нічого не змінює. */
export function Fees({ world, user, onBack, onClose }: { world: World; user: Account; onBack: () => void; onClose?: () => void }) {
  const [tab, setTab] = useState<Tab>("fees");
  const [count, setCount] = useState(1);
  const day = utcDay(world.now);
  const pro = user.stability >= STABILITY_GATE;
  const confirmCap = pro ? CODES_PER_DAY : NOVICE_CODES_PER_DAY;
  const confirmsUsed = user.confirmDay === day ? user.confirmsToday : 0;
  const creation = activeCreation(world, user.id);
  const codesUsed = creation && creation.codeDay === day ? creation.codesToday : 0;
  const gross = world.price * count;
  // Фактичний поділ, як у рушії (floor), а не номінальні константи (аудит K8).
  const cut = { seller: Math.floor(world.price * SELLER_SHARE), fund: Math.floor(world.price * FUND_SHARE), reserve: 0 };
  cut.reserve = world.price - cut.seller - cut.fund;
  const pctOf = (v: number) => pct(world.price ? v / world.price : 0);
  const seller = Math.floor(world.price * SELLER_SHARE) * count;
  const fund = Math.floor(world.price * FUND_SHARE) * count;
  const reserve = gross - seller - fund;

  return (
    <Page title="Комісії і ліміти" kicker="Фінансові правила" onBack={onBack} onClose={onClose}>
      <section className="fe-tier" aria-label="Мій рівень">
        <div className="fe-tier-top">
          <span>
            <small>Мій рівень</small>
            <b>{pro ? "Стабільний" : "Новачок"}</b>
          </span>
          <span className="fe-stab">
            <small>Стабільність</small>
            <b>{fmt.format(user.stability)}</b>
          </span>
        </div>
        <div className="ex-bar" role="progressbar" aria-label="До рівня «Стабільний»" aria-valuemin={0} aria-valuemax={STABILITY_GATE} aria-valuenow={Math.min(user.stability, STABILITY_GATE)}>
          <i style={{ width: `${Math.max(2, Math.min(100, (user.stability / STABILITY_GATE) * 100))}%` }} />
        </div>
        <p className="orbit-note as-small">
          {pro ? `Відкрито ${CODES_PER_DAY} підтвердження на добу.` : `Ще ${STABILITY_GATE - user.stability} до рівня «Стабільний»: тоді ${CODES_PER_DAY} підтвердження на добу замість ${NOVICE_CODES_PER_DAY}.`}
        </p>
      </section>

      <div className="hi-chips" role="tablist" aria-label="Розділ">
        <button type="button" role="tab" aria-selected={tab === "fees"} className="orbit-chip" data-on={tab === "fees" ? "1" : "0"} onClick={() => setTab("fees")}>Комісії</button>
        <button type="button" role="tab" aria-selected={tab === "limits"} className="orbit-chip" data-on={tab === "limits" ? "1" : "0"} onClick={() => setTab("limits")}>Ліміти</button>
      </div>

      {tab === "fees" ? (
        <div className="fe-stack" role="tabpanel">
          <section className="mo-group" aria-label="Комісії">
            <p className="mo-group-title">Операції</p>
            <div className="fe-table" role="table">
              <div className="fe-tr fe-th" role="row"><span role="columnheader">Що</span><span role="columnheader">Комісія</span></div>
              <Tr name="Купівля орбіти" value="0%" note="Платиш рівно ціну дня" />
              <Tr name="Продаж орбіти" value={`${cut.fund + cut.reserve} ✦`} note={`За ціни ${world.price} ✦: ${cut.seller} продавцю · ${cut.fund} у фонд · ${cut.reserve} у резерв (${pctOf(cut.seller)} / ${pctOf(cut.fund)} / ${pctOf(cut.reserve)})`} />
              <Tr name="Заявка, коди, заряд" value="0%" note="Безкоштовно" />
              <Tr name="Купівля іскор ✦" value="—" note="Після юридичного оформлення" soon />
              <Tr name="Зберігання, вхід" value="0%" note="Без плати за бездіяльність" />
              <Tr name="Ввід гривні · вивід на картку" value="—" note="Після юридичного оформлення" soon />
            </div>
          </section>

          <section className="fe-calc" aria-label="Приклад продажу">
            <div className="ex-supply-row">
              <p className="orbit-kicker">Приклад продажу</p>
              <div className="orbit-chips" role="group" aria-label="Кількість орбіт">
                {[1, 5, 10].map((value) => (
                  <button key={value} type="button" className="orbit-chip fe-mini" data-on={count === value ? "1" : "0"} aria-pressed={count === value} onClick={() => setCount(value)}>
                    ×{value}
                  </button>
                ))}
              </div>
            </div>
            <div className="fe-split" aria-hidden>
              <i style={{ flex: seller }} data-k="seller" />
              <i style={{ flex: Math.max(fund, 0.0001) }} data-k="fund" />
              <i style={{ flex: Math.max(reserve, 0.0001) }} data-k="reserve" />
            </div>
            <div className="ex-lines">
              <div><span>Ціна дня × {count}</span><b>{fmt.format(gross)} ✦</b></div>
              <div><span><i className="fe-key" data-k="seller" />Тобі</span><b>{fmt.format(seller)} ✦</b></div>
              <div><span><i className="fe-key" data-k="fund" />У фонд</span><b>{fmt.format(fund)} ✦</b></div>
              <div><span><i className="fe-key" data-k="reserve" />У резерв</span><b>{fmt.format(reserve)} ✦</b></div>
            </div>
            <p className="orbit-note as-small">Ціна дня зараз {fmt.format(world.price)} ✦, щонайменше {MIN_PRICE} ✦. Округлення — вниз, до цілої іскри. Продаж стається, лише коли орбіту куплять.</p>
          </section>

          <section className="mo-group" aria-label="Нарахування">
            <p className="mo-group-title">Нарахування</p>
            <div className="fe-table" role="table">
              <Tr name="Старт" value={`до +${STARTER_OD} ✦`} note="Один раз, після першого внеску, з фонду переробки" />
              <Tr name="Свідок заряду" value={`до +${WITNESS_OD} ✦`} note="Коли заряд пройшов, з фонду переробки" />
              <Tr name="Частка фонду" value="70% / 30%" note={`Раз на ${Math.round(FUND_PERIOD_MS / 86_400_000)} доби, лише власникам орбіт: порівну / за стабільністю`} />
            </div>
          </section>
        </div>
      ) : (
        <div className="fe-stack" role="tabpanel">
          <section className="mo-group" aria-label="Ліміти на сьогодні">
            <p className="mo-group-title">Сьогодні · UTC</p>
            <div className="mo-card">
              <Meter name="Підтвердження чужих заявок" used={confirmsUsed} cap={confirmCap} />
              <Meter name="Коди для своєї заявки" used={codesUsed} cap={CODES_PER_DAY} idle={!creation || creation.status !== "collecting" ? "Немає заявки, що збирає підтвердження" : undefined} />
            </div>
          </section>
          <section className="mo-group" aria-label="Правила лімітів">
            <p className="mo-group-title">Правила</p>
            <div className="fe-table" role="table">
              <Tr name="Активних заявок" value="1" note="На людину" />
              <Tr name="Підтверджень для орбіти" value={String(CONFIRM_NEED)} note="Від 4 людей у світі; поки людей 2–3 — менше. Кожен підтверджує тебе лише раз" />
              <Tr name="Код живе" value={`${Math.round(CODE_MS / 60_000)} хв`} note="Потім — новий" />
              <Tr name="Заряд" value={`${Math.round(CHARGE_MS / 3_600_000)} год`} note="Після останнього потрібного підтвердження" />
              <Tr name="Нових імен з пристрою" value={String(NAMES_PER_DEVICE)} note="На добу" />
              <Tr name="Купівля і продаж" value="пошта" note="Лише з підтвердженою поштою" />
              <Tr name="Ліміти за рівнями перевірки" value="—" note="Після юридичного оформлення" soon />
            </div>
          </section>
        </div>
      )}
      <p className="orbit-note as-small">Числа беруться з правил світу напряму. Повний текст — у документі «Фінансові правила і комісії».</p>
    </Page>
  );
}

function Tr({ name, value, note, soon }: { name: string; value: string; note?: string; soon?: boolean }) {
  return (
    <div className="fe-tr" role="row" data-soon={soon ? "1" : "0"}>
      <span role="cell">
        <b>{name}</b>
        {note ? <small>{note}</small> : null}
      </span>
      <span role="cell" className="fe-val">{value}</span>
    </div>
  );
}

function Meter({ name, used, cap, idle }: { name: string; used: number; cap: number; idle?: string }) {
  const left = Math.max(0, cap - used);
  return (
    <div className="fe-meter">
      <div className="ex-supply-row">
        <b>{name}</b>
        <span className="fe-val">{idle ? "—" : `${used} / ${cap}`}</span>
      </div>
      <div className="ex-bar" role="progressbar" aria-label={name} aria-valuemin={0} aria-valuemax={cap} aria-valuenow={idle ? 0 : used}>
        <i style={{ width: idle ? "0%" : `${Math.max(used > 0 ? 4 : 0, (used / cap) * 100)}%` }} data-full={left === 0 ? "1" : "0"} />
      </div>
      <small>{idle ?? (left === 0 ? "На сьогодні все. Нові — о 00:00 UTC." : `Лишилось ${left}`)}</small>
    </div>
  );
}
