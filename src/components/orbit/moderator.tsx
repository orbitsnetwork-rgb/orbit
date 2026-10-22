import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Page } from "@/components/orbit/more";
import { MOD_EXP_MAX, MOD_WHY_MIN, modApply, modStatus } from "@/lib/orbit/live";
import { WHY_MAX } from "@/lib/orbit/live-rules";
import { sessionCreds } from "@/lib/orbit/store";

type St = Awaited<ReturnType<typeof modStatus>>;

const RULES = [
  "Видаляю лише те, що порушує правила: образи, погрози, спам, шахрайство, чужі особисті дані.",
  "Пауза в чаті — від 1 до 24 годин, тільки з причиною.",
  "Не модерую суперечки, у яких беру участь сам.",
  "Кожна моя дія записується в журнал, і власник світу його бачить.",
];

/** «Ще» → «Стати модератором»: заявка і її стан. */
export function ModeratorPage({ onBack, onClose }: { onBack: () => void; onClose?: () => void }) {
  const [st, setSt] = useState<St | null>(null);
  const [why, setWhy] = useState("");
  const [exp, setExp] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = () => modStatus({ data: sessionCreds() }).then(setSt).catch(() => setErr("Немає зв’язку. Спробуй ще раз."));
  useEffect(() => { void load(); }, []);
  const send = async () => {
    setBusy(true); setErr("");
    try {
      const out = await modApply({ data: { ...sessionCreds(), why, exp, agree } });
      if (!out.ok) setErr(out.error ?? "Не вдалося подати заявку.");
      else await load();
    } catch { setErr("Немає зв’язку. Спробуй ще раз."); }
    setBusy(false);
  };
  const state = st?.isMod ? "mod" : st?.state ?? "loading";
  return (
    <Page title="Стати модератором" kicker="Спільнота" onBack={onBack} onClose={onClose}>
      <div className="orbit-stack" id="mod-page">
        <section className="orbit-block mod-status" aria-live="polite">
          <ShieldCheck size={20} strokeWidth={1.7} aria-hidden />
          <div>
            <strong id="mod-state">
              {state === "loading" ? "Перевіряю…" : state === "mod" ? "Ти модератор" : state === "pending" ? "Заявка на розгляді" : state === "approved" ? "Заявку схвалено" : state === "rejected" ? "Заявку відхилено" : "Заявки ще немає"}
            </strong>
            <p className="orbit-note">
              {state === "mod" ? "У чаті в меню повідомлення є «Видалити» і «Пауза». Діяй спокійно і за правилами." :
               state === "pending" ? "Власник світу переглядає кожну заявку вручну. Відповідь прийде в сповіщення." :
               state === "rejected" ? (st?.note ? `Причина: ${st.note}. ` : "") + "Подати знову можна через 7 днів." :
               "Модератори допомагають тримати чат чистим. Це добровільна роль, без оплати."}
            </p>
          </div>
        </section>
        <section className="orbit-block">
          <h3 className="orbit-h">Правила модератора</h3>
          <ul className="mod-rules">{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>
        {state === "none" ? (
          <form className="orbit-block orbit-stack" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <label className="mod-label" htmlFor="mod-why">Чому хочеш модерувати?</label>
            <textarea id="mod-why" className="orbit-field" rows={4} maxLength={WHY_MAX} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Кілька речень про себе і про те, як бачиш цю роль" />
            <small className="orbit-note">{why.trim().length < MOD_WHY_MIN ? `Ще ${MOD_WHY_MIN - why.trim().length} знаків` : "Достатньо"}</small>
            <label className="mod-label" htmlFor="mod-exp">Досвід модерації (необов’язково)</label>
            <textarea id="mod-exp" className="orbit-field" rows={3} maxLength={MOD_EXP_MAX} value={exp} onChange={(e) => setExp(e.target.value)} placeholder="Спільноти, форуми, чати" />
            <label className="mod-agree"><input type="checkbox" id="mod-agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Я прочитав правила модератора і згоден з ними</label>
            {err ? <p className="orbit-note mod-err" role="alert">{err}</p> : null}
            <button className="orbit-go" type="submit" disabled={busy || why.trim().length < MOD_WHY_MIN || !agree}>{busy ? "Надсилаю…" : "Подати заявку"}</button>
          </form>
        ) : err ? <p className="orbit-note mod-err" role="alert">{err}</p> : null}
      </div>
    </Page>
  );
}
