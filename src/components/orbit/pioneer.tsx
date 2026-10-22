/**
 * Холодний старт: «Перші 100». Чесно показує, скільки людей ще треба, щоб перша орбіта взагалі була можлива,
 * номер піонера (порядок реєстрації), лічильник «Запущено N з 8 000 000», «Навіщо орбіта» і запрошення з готовим текстом.
 * Лише косметика: жодних ✦ і жодної плати за запрошення. Формули рушія не чіпає.
 */
import { useState } from "react";
import { Copy, Send, Sparkles, Users } from "lucide-react";
import { CONFIRM_NEED, ORBIT_CAP, type Account, type World } from "@/lib/orbit/engine";

const fmt = new Intl.NumberFormat("uk-UA");
export const PIONEERS = 100;

/** Номер піонера — місце за часом реєстрації (1 — найперший). */
export function pioneerNo(world: World, user: Account) {
  const sorted = [...world.accounts].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return sorted.findIndex((a) => a.id === user.id) + 1;
}

/** Скільки ще людей потрібно, щоб хоча б одна заявка могла зібрати 8 підтверджень (автор + 8 інших). */
export function peopleShort(world: World) {
  return Math.max(0, CONFIRM_NEED + 1 - world.accounts.length);
}

export function inviteText(no: number, origin: string) {
  return `Я піонер №${no} в «Орбітах» — тестовому застосунку, де орбіти запускають тільки разом: 8 людей підтверджують одне одному запуск. Зараз усе на тестових іскрах, без грошей. Долучайся до перших ${PIONEERS}: ${origin}`;
}

export function PioneerCard({ world, user }: { world: World; user: Account }) {
  const [why, setWhy] = useState(false);
  const [copied, setCopied] = useState(false);
  const no = pioneerNo(world, user);
  const people = world.accounts.length;
  const short = peopleShort(world);
  const launched = world.orbits.length;
  if (people > PIONEERS && no > PIONEERS) return null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const text = inviteText(no, origin);
  const tg = `https://t.me/share/url?url=${encodeURIComponent(origin)}&text=${encodeURIComponent(text.replace(`: ${origin}`, ""))}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* без буфера — текст видно нижче */
    }
  };
  const filled = Math.min(people, PIONEERS);
  return (
    <section className="orbit-block pn" aria-labelledby="pn-title" data-testid="pioneer">
      <div className="pn-head">
        <span className="pn-badge" aria-label={`Піонер номер ${no}`}><Sparkles size={14} strokeWidth={2} aria-hidden /> Піонер №{no}</span>
        <p className="orbit-kicker">Перші {PIONEERS}</p>
      </div>
      <h2 id="pn-title">{no <= PIONEERS ? `Ти серед перших ${PIONEERS}` : "Перші 100 вже тут"}</h2>
      <div className="pn-bar" role="progressbar" aria-valuemin={0} aria-valuemax={PIONEERS} aria-valuenow={filled} aria-label="Піонерів">
        <i style={{ width: `${(filled / PIONEERS) * 100}%` }} />
      </div>
      <p className="pn-sub"><Users size={14} strokeWidth={1.8} aria-hidden /> Піонерів: {fmt.format(filled)} з {PIONEERS} · Запущено {fmt.format(launched)} орбіт з {fmt.format(ORBIT_CAP)}</p>
      {short > 0 ? (
        <p className="pn-need" data-testid="pioneer-need">
          Для першої орбіти потрібно щонайменше {CONFIRM_NEED + 1} людей: ти і {CONFIRM_NEED}, хто підтвердить. Зараз нас {people}. Ще {short} — і запуски стануть можливими. Поки що ✦ ніхто не отримує: стартові 200 ✦ приходять після першої успішної орбіти, яку ти запустив або підтвердив.
        </p>
      ) : (
        <p className="pn-need">Людей достатньо для запуску. Кожна орбіта — це 8 підтверджень від різних людей і 24 години заряду.</p>
      )}
      <div className="pn-actions">
        <a className="pn-tg" href={tg} target="_blank" rel="noopener noreferrer"><Send size={16} strokeWidth={2} aria-hidden /> Запросити в Telegram</a>
        <button type="button" className="k-ghost" onClick={copy}><Copy size={16} strokeWidth={1.8} aria-hidden /> {copied ? "Скопійовано" : "Копіювати текст"}</button>
      </div>
      <p className="pn-fine">За запрошення ✦ не нараховуються. Це не дохід і не інвестиція — тестова версія.</p>
      <button type="button" className="pn-why-toggle" aria-expanded={why} onClick={() => setWhy(!why)}>Навіщо мені орбіта?</button>
      {why ? (
        <ul className="pn-why" data-testid="pioneer-why">
          <li><b>Їх обмаль.</b> Усього {fmt.format(ORBIT_CAP)}. Ранні мають малі номери — №{fmt.format(launched + 1)} буде наступним.</li>
          <li><b>Її не купиш першою.</b> Нова орбіта з’являється тільки коли 8 людей підтвердили запуск. Це довіра, а не клік.</li>
          <li><b>Фонд — власникам.</b> Частка з кожної угоди йде у фонд, який раз на 3 доби ділиться між власниками орбіт.</li>
          <li><b>Чесно:</b> зараз це тест на іскрах ✦. Виведення і гривня — після юридичного оформлення, без обіцянок доходу.</li>
        </ul>
      ) : null}
    </section>
  );
}

/** Піонерська дошка: перші за номером. Без ✦, без винагород — лише порядок і стабільність. */
export function PioneerBoard({ world, user }: { world: World; user: Account }) {
  const sorted = [...world.accounts].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)).slice(0, 10);
  if (sorted.length < 2) return null;
  return (
    <section className="orbit-block pn-board" aria-labelledby="pn-board-title">
      <h2 id="pn-board-title" className="pn-board-title">Перші піонери</h2>
      <ol>
        {sorted.map((a, i) => (
          <li key={a.id} className={a.id === user.id ? "is-me" : undefined}>
            <span className="pn-no">№{i + 1}</span>
            <span className="pn-name">{a.name}{a.id === user.id ? " · ти" : ""}</span>
            <span className="pn-orb">{world.orbits.filter((o) => o.ownerId === a.id).length} орб.</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
