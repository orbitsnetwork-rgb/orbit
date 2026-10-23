import { Flag, Quote, Rocket, Send, Shield, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Page } from "@/components/orbit/more";
import { Avatar } from "@/components/orbit/ui/kit";
import { startDm } from "@/components/orbit/live";
import { SEEK_DAYS, SEEK_MAX, chatSend, seekHide, seekList, seekReport, seekSet, type SeekCard } from "@/lib/orbit/live";
import { sessionCreds } from "@/lib/orbit/store";
import { DegreeChip } from "@/components/orbit/trust-path";
import { shortName } from "@/lib/orbit/live-rules";
import { trustGraph } from "@/lib/orbit/trust-path";
import { cardTrust, seekLeft, trustLine, vouchersLine } from "@/lib/orbit/seek-trust";
import type { Account, World } from "@/lib/orbit/engine";

type List = Awaited<ReturnType<typeof seekList>>;
const INVITE = "Привіт! Побачив твою картку «Шукаю орбіту». Хочеш у мій екіпаж? Можу підтвердити твій запуск або дати код для свого — напиши, коли зручно.";
const day = (ms: number) => new Date(ms).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });

/** «Ще» → «Шукаю орбіту»: моя картка (≤140 знаків, 7 днів) і список людей, які шукають екіпаж. */
/** Сигнали довіри на картці: ступінь від мене, через кого, скільки поручителів і до 2 їхніх слів. */
function SeekTrust({ c, world, user, g }: { c: SeekCard; world: World; user: Account; g: ReturnType<typeof trustGraph> }) {
  const t = cardTrust(g, world, user.id, c.uid);
  const nameOf = (id: string) => shortName(world.accounts.find((a) => a.id === id)?.name ?? "Учасник");
  return (
    <div className="sk-trust" data-testid="sk-trust">
      <p className="sk-trust-line" data-d={t.d ?? 0}>
        {t.d ? <DegreeChip d={t.d} /> : <span className="tp-deg sk-deg-none" aria-hidden>—</span>}
        <span>{trustLine(t, nameOf)}</span>
        <span className={t.vouchers ? "sk-trust-v" : "sk-trust-v sk-trust-warn"}>{vouchersLine(t.vouchers)}</span>
      </p>
      {c.words?.length ? (
        <ul className="sk-words" aria-label={`Слова поручителів про ${c.name}`}>
          {c.words.map((w) => (
            <li key={w.from} className="sk-word">
              <Quote size={13} aria-hidden className="sk-word-q" />
              <p><span className="sk-word-text">{w.text}</span> <span className="sk-word-from">— <Avatar id={w.from} name={nameOf(w.from)} size={18} /> {nameOf(w.from)}</span></p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SeekPage({ onBack, onClose, onRoom, world, user }: { onBack: () => void; onClose?: () => void; onRoom: () => void; world: World; user: Account }) {
  const g = useMemo(() => trustGraph(world), [world]);
  const [st, setSt] = useState<List | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const load = async () => {
    try { const out = await seekList({ data: sessionCreds() }); setSt(out); if (out.mine && !text) setText(out.mine.text); } catch { setMsg("Немає зв’язку. Спробуй ще раз."); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);
  const run = async (key: string, fn: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(key); setMsg("");
    try { const e = await fn(); if (e) setMsg(e); } catch { setMsg("Немає зв’язку. Спробуй ще раз."); }
    setBusy("");
  };
  const publish = (on: boolean) => run(on ? "pub" : "off", async () => {
    const out = await seekSet({ data: { ...sessionCreds(), text, on } });
    if (!out.ok) return out.error ?? "Не вдалося зберегти.";
    if (!on) setText("");
    await load();
    return on ? "Картку опубліковано на 7 днів." : "Картку знято.";
  });
  const write = (c: SeekCard, invite: boolean) => run(`${invite ? "inv" : "dm"}:${c.uid}`, async () => {
    const out = await startDm(c.uid);
    if (typeof out === "string") return out;
    if (invite) {
      const sent = await chatSend({ data: { ...sessionCreds(), room: out.room, text: INVITE, replyTo: 0 } });
      if (!sent.ok && sent.error !== "Це вже було щойно.") return sent.error ?? "Не вдалося надіслати запрошення.";
    }
    onRoom();
    return null;
  });
  const report = (c: SeekCard) => run(`rep:${c.uid}`, async () => { await seekReport({ data: { ...sessionCreds(), uid: c.uid } }); await load(); return "Дякуємо, скаргу отримано."; });
  const hide = (c: SeekCard) => run(`hide:${c.uid}`, async () => { const out = await seekHide({ data: { ...sessionCreds(), uid: c.uid } }); await load(); return out.ok ? "Картку сховано." : (out.error ?? "Не вдалося."); });
  const mine = st?.mine;
  // Залишок рахуємо від часу сервера (момент завантаження списку), а не від годинника телефону.
  const left = (expires: number) => seekLeft(expires, st?.now ?? Date.now());
  return (
    <Page title="Шукаю орбіту" kicker="Спільнота" onBack={onBack} onClose={onClose}>
      <div className="orbit-stack" id="seek-page">
        <section className="orbit-block sk-mine" aria-labelledby="sk-mine-h">
          <h2 className="orbit-h" id="sk-mine-h">Моя картка</h2>
          <p className="orbit-note">Коротко про себе: хто ти і кого шукаєш. Картку бачать усі, хто увійшов; вона зникне сама через {SEEK_DAYS} днів. Не пиши телефон, пошту чи коди.</p>
          <label className="sk-field">
            <span className="sr-only">Текст картки</span>
            <textarea id="sk-text" rows={3} maxLength={SEEK_MAX} value={text} placeholder="Напр.: Новий у Орбітах, шукаю людей для першого запуску. Відповідаю ввечері." onChange={(e) => setText(e.target.value)} />
            <small className="sk-count" aria-live="polite">{text.length}/{SEEK_MAX}</small>
          </label>
          <div className="sk-row">
            <button type="button" className="orbit-go" disabled={Boolean(busy) || text.trim().length < 3} onClick={() => void publish(true)}>{mine ? "Оновити картку" : "Опублікувати"}</button>
            {mine ? <button type="button" className="orbit-chip" disabled={Boolean(busy)} onClick={() => void publish(false)}><X size={14} aria-hidden /> Зняти</button> : null}
          </div>
          {mine ? <p className="orbit-note sk-live" role="status"><span className="sk-live-dot" aria-hidden />Опубліковано {day(mine.at)} · {left(mine.expires)}</p> : null}
        </section>
        {msg ? <p className="sk-msg" role="status" key={msg}>{msg}</p> : null}
        <section className="orbit-block" aria-labelledby="sk-list-h">
          <h2 className="orbit-h" id="sk-list-h">Шукають орбіту{st ? ` · ${st.cards.length}` : ""}</h2>
          {!st ? <div className="cv-skel cv-skel-list" aria-label="Завантажую"><span /><span /></div> : null}
          {st?.cards.length ? <p className="orbit-note sk-trust-hint">1°–3° — як ви пов'язані підтвердженнями. Перш ніж довіряти, глянь, хто поручився.</p> : null}
          {st && !st.cards.length ? <p className="orbit-note">Поки нікого. Опублікуй свою картку — і тебе знайдуть першим.</p> : null}
          <ul className="sk-list">
            {st?.cards.map((c) => (
              <li key={c.uid} className="sk-card">
                <div className="sk-top">
                  <Avatar id={c.uid} name={c.name} size={40} />
                  <div className="sk-who"><b>{c.name}</b><small>{day(c.at)} · {left(c.expires)}</small></div>
                  <button type="button" className="mo-icon" aria-expanded={open === c.uid} aria-label={`Профіль: ${c.name}`} onClick={() => setOpen(open === c.uid ? null : c.uid)}><UserRound size={18} aria-hidden /></button>
                </div>
                <p className="sk-text">{c.text}</p>
                <SeekTrust c={c} world={world} user={user} g={g} />
                {open === c.uid ? (
                  <dl className="sk-profile">
                    <div><dt>Орбіт</dt><dd>{c.orbits}</dd></div>
                    <div><dt>Стабільність</dt><dd>{c.stability}</dd></div>
                    <div><dt>У світі з</dt><dd>{day(c.since)}</dd></div>
                  </dl>
                ) : null}
                <div className="sk-row">
                  <button type="button" className="orbit-chip" disabled={Boolean(busy)} onClick={() => void write(c, false)}><Send size={14} aria-hidden /> Написати</button>
                  <button type="button" className="orbit-chip" disabled={Boolean(busy)} onClick={() => void write(c, true)}><Rocket size={14} aria-hidden /> Запросити в екіпаж</button>
                  <button type="button" className="orbit-chip sk-quiet" disabled={Boolean(busy) || c.reported} onClick={() => void report(c)}><Flag size={14} aria-hidden /> {c.reported ? "Скаргу надіслано" : "Поскаржитись"}</button>
                  {st.mod ? <button type="button" className="orbit-chip is-danger" disabled={Boolean(busy)} onClick={() => void hide(c)}><Shield size={14} aria-hidden /> Сховати</button> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Page>
  );
}
