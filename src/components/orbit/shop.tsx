/** «Крамниця ✦»: лише вигляд і помітність. Примірка безкоштовна. Купівля за справжні гроші — «Скоро». */
import { useEffect, useMemo, useState } from "react";
import { sessionCreds } from "@/lib/orbit/store";
import { Check, Crown, Gift, Lock, Rocket, Sparkles } from "lucide-react";
import { Page } from "@/components/orbit/more";
import { Avatar } from "@/components/orbit/ui/kit";
import { ConstellationMap } from "@/components/orbit/constellation";
import { constellationOf } from "@/lib/orbit/constellation";
import { useOrbits } from "@/lib/orbit/store";
import { BOOST_PRICE, PACKS, PLUS, STARTER, STYLES, THEMES, boosted, owns, packGrant } from "@/lib/orbit/shop";
import { CHECKOUT_SOON } from "@/lib/orbit/checkout";
import type { Account, World } from "@/lib/orbit/engine";

const usd = (n: number) => `$${n.toFixed(2)}`;

export function ShopPage({ world, user, onBack, onClose }: { world: World; user: Account; onBack: () => void; onClose?: () => void }) {
  const shop = useOrbits((s) => s.shop);
  const wear = useOrbits((s) => s.wear);
  const [tryStyle, setTryStyle] = useState<string>(user.wearStyle ?? "");
  const [tryTheme, setTryTheme] = useState<string>(user.wearTheme ?? "");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const c = useMemo(() => constellationOf(world, user.id), [world, user.id]);
  const isBoosted = boosted(user, world.now);
  const [pay, setPay] = useState<{ enabled: boolean; first: boolean; starter: boolean }>({ enabled: false, first: true, starter: false });
  useEffect(() => {
    let live = true;
    void import("@/lib/orbit/checkout-server").then((m) => m.checkoutState({ data: sessionCreds() })).then((s) => { if (live && s) setPay(s); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const firstDone = !pay.first;
  const checkout = (product: string) => go(product, async () => {
    const { checkoutStart } = await import("@/lib/orbit/checkout-server");
    const out = await checkoutStart({ data: { ...sessionCreds(), product } }).catch(() => null);
    if (!out) return null;
    if (out.ok) { window.location.href = out.url; return { notice: "Відкриваю сторінку оплати…" }; }
    return { error: out.error };
  });
  const payBtn = (product: string, label: string, testid?: string) =>
    pay.enabled ? (
      <button type="button" className="orbit-go sh-pay" data-testid={testid} disabled={Boolean(busy)} onClick={() => void checkout(product)}>{label}</button>
    ) : (
      <button type="button" className="orbit-chip sh-soon" disabled aria-disabled="true" title={CHECKOUT_SOON}><Lock size={12} aria-hidden /> {label} · Скоро</button>
    );

  const go = async (key: string, job: () => Promise<{ error?: string; notice?: string } | null>) => {
    if (busy) return;
    setBusy(key);
    setMsg(null);
    const out = await job();
    setBusy("");
    if (!out) setMsg({ text: "Немає зв'язку. Спробуй ще раз.", bad: true });
    else if (out.error) setMsg({ text: out.error, bad: true });
    else setMsg({ text: out.notice ?? "Готово ✦" });
  };

  const styleBtn = (id: string, price: number) => {
    const mine = owns(user, `style:${id}`);
    if (!mine) return <button type="button" className="orbit-go sh-buy" data-testid={`sh-buy-style-${id}`} disabled={Boolean(busy) || user.balance < price} onClick={() => void go(id, () => shop(`style:${id}`))}>{user.balance < price ? `Потрібно ${price} ✦` : `Купити за ${price} ✦`}</button>;
    if (user.wearStyle === id) return <button type="button" className="orbit-chip" data-testid={`sh-off-style-${id}`} disabled={Boolean(busy)} onClick={() => void go(id, () => wear("style", ""))}>Зняти</button>;
    return <button type="button" className="orbit-chip" data-testid={`sh-wear-style-${id}`} disabled={Boolean(busy)} onClick={() => void go(id, () => wear("style", id))}>Вдягнути</button>;
  };
  const themeBtn = (id: string, price: number) => {
    const mine = owns(user, `theme:${id}`);
    if (!mine) return <button type="button" className="orbit-go sh-buy" data-testid={`sh-buy-theme-${id}`} disabled={Boolean(busy) || user.balance < price} onClick={() => void go(id, () => shop(`theme:${id}`))}>{user.balance < price ? `Потрібно ${price} ✦` : `Купити за ${price} ✦`}</button>;
    if (user.wearTheme === id) return <button type="button" className="orbit-chip" data-testid={`sh-off-theme-${id}`} disabled={Boolean(busy)} onClick={() => void go(id, () => wear("theme", ""))}>Зняти</button>;
    return <button type="button" className="orbit-chip" data-testid={`sh-wear-theme-${id}`} disabled={Boolean(busy)} onClick={() => void go(id, () => wear("theme", id))}>Вдягнути</button>;
  };

  return (
    <Page title="Крамниця ✦" kicker="Лише вигляд і помітність" onBack={onBack} onClose={onClose}>
      <section className="sh-wallet" aria-label="Баланс">
        <span className="sh-bal" data-testid="sh-balance">{user.balance} ✦</span>
        <p className="orbit-note">Довіру, поручительства і місце в рейтингу купити не можна. Витрачені ✦ ідуть у спільний фонд ORBIT. ✦ живуть лише в застосунку і назад у гроші не обмінюються.</p>
      </section>
      {msg ? <p className={msg.bad ? "sh-msg is-bad" : "sh-msg"} role="status" data-testid="sh-msg">{msg.text}</p> : null}

      <section className="orbit-block" aria-labelledby="sh-style-h">
        <h2 className="orbit-h" id="sh-style-h">Стиль емблеми</h2>
        <p className="orbit-note">Приміряй безкоштовно — так тебе бачитимуть усі: у рейтингу, сузір'ї, чатах.</p>
        <div className="sh-try" aria-hidden><Avatar id={user.id} name={user.name} size={88} look={tryStyle} /></div>
        <ul className="sh-grid">
          {STYLES.map((s) => (
            <li key={s.id} className="sh-item" data-on={tryStyle === s.id ? "1" : undefined}>
              <button type="button" className="sh-pick" data-testid={`sh-try-style-${s.id}`} aria-pressed={tryStyle === s.id} onClick={() => setTryStyle(tryStyle === s.id ? "" : s.id)}>
                <Avatar id={user.id} name={user.name} size={40} look={s.id} />
                <span><b>{s.title}</b><small>{s.sub}</small></span>
                {owns(user, `style:${s.id}`) ? <span className="sh-own"><Check size={12} aria-hidden /> {user.wearStyle === s.id ? "Вдягнуто" : "Твоє"}</span> : <span className="sh-price">{s.price} ✦</span>}
              </button>
              {styleBtn(s.id, s.price)}
            </li>
          ))}
        </ul>
      </section>

      <section className="orbit-block" aria-labelledby="sh-theme-h">
        <h2 className="orbit-h" id="sh-theme-h">Тема сузір'я</h2>
        <p className="orbit-note">Небо твого сузір'я і картки, якою ділишся.</p>
        <div className="sh-sky" aria-hidden><ConstellationMap c={c} user={user} size={200} theme={tryTheme} /></div>
        <ul className="sh-grid">
          {THEMES.map((t) => (
            <li key={t.id} className="sh-item" data-on={tryTheme === t.id ? "1" : undefined}>
              <button type="button" className="sh-pick" data-testid={`sh-try-theme-${t.id}`} aria-pressed={tryTheme === t.id} onClick={() => setTryTheme(tryTheme === t.id ? "" : t.id)}>
                <span className={`sh-swatch cs-theme-${t.id}`} aria-hidden />
                <span><b>{t.title}</b><small>{t.sub}</small></span>
                {owns(user, `theme:${t.id}`) ? <span className="sh-own"><Check size={12} aria-hidden /> {user.wearTheme === t.id ? "Вдягнуто" : "Твоє"}</span> : <span className="sh-price">{t.price} ✦</span>}
              </button>
              {themeBtn(t.id, t.price)}
            </li>
          ))}
        </ul>
      </section>

      <section className="orbit-block" aria-labelledby="sh-boost-h">
        <h2 className="orbit-h" id="sh-boost-h"><Rocket size={18} aria-hidden /> Просування на 24 години</h2>
        <p className="orbit-note">Твоя картка «Шукаю орбіту» стоїть вгорі списку. Інші бачать чесну позначку «Просувається». Довіри це не додає.</p>
        {isBoosted ? (
          <p className="sh-own" data-testid="sh-boost-on">Діє ще {Math.max(1, Math.ceil(((user.boostUntil ?? 0) - world.now) / 3_600_000))} год</p>
        ) : (
          <button type="button" className="orbit-go" data-testid="sh-buy-boost" disabled={Boolean(busy) || user.balance < BOOST_PRICE} onClick={() => void go("boost", () => shop("boost"))}>{user.balance < BOOST_PRICE ? `Потрібно ${BOOST_PRICE} ✦` : `Просувати за ${BOOST_PRICE} ✦`}</button>
        )}
      </section>

      <section className="orbit-block" aria-labelledby="sh-packs-h">
        <h2 className="orbit-h" id="sh-packs-h">Поповнити ✦</h2>
        <p className="orbit-note">Фіксований курс: 100 ✦ ≈ $0.99. Перша покупка будь-якого пакета — подвійна, без строків.</p>
        <ul className="sh-packs">
          {PACKS.map((p) => {
            const g = packGrant(p, firstDone);
            return (
              <li key={p.id} className="sh-pack" data-testid={`sh-pack-${p.id}`}>
                <b>{p.spark} ✦{p.extra ? <em> {p.extra}</em> : null}</b>
                {g.bonus ? <span className="sh-bonus"><Gift size={12} aria-hidden /> +{g.bonus} на першу</span> : null}
                <small>{p.title}</small>
                {payBtn(p.id, usd(p.usd), `sh-pay-${p.id}`)}
              </li>
            );
          })}
        </ul>
        <div className="sh-offer" data-testid="sh-starter">
          <Sparkles size={20} aria-hidden />
          <div><b>Стартовий набір · {usd(STARTER.usd)}</b><small>{STARTER.spark} ✦ + стиль «Неон» + тема «Туманність». Один раз на людину.</small></div>
          {pay.starter ? <span className="sh-own"><Check size={12} aria-hidden /> Твоє</span> : payBtn("starter", usd(STARTER.usd))}
        </div>
        <div className="sh-offer sh-plus" data-testid="sh-plus">
          <Crown size={20} aria-hidden />
          <div><b>Орбіта+ · {usd(PLUS.usdMonth)}/міс</b><small>{PLUS.sparkMonth} ✦ щомісяця, анімовані стилі, ексклюзивні теми, більше місць у «Шукаю орбіту». Скасувати можна будь-коли.</small></div>
          <button type="button" className="orbit-chip sh-soon" disabled aria-disabled="true"><Lock size={12} aria-hidden /> Скоро</button>
        </div>
        <p className="orbit-note">{pay.enabled ? "Оплата на захищеній сторінці Xsolla." : CHECKOUT_SOON} Дані картки ORBIT ніколи не бачить і не зберігає.</p>
      </section>
    </Page>
  );
}
