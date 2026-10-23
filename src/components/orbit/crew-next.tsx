/**
 * «Що далі» після підтвердження: замість порожнечі — живий екіпаж.
 * Показує запуски, де я автор або підтвердив (заряд іде чи щойно завершився), з прогресом, людьми
 * і трьома справжніми діями: написати екіпажу (кімната l:<id>), підтримати когось у «Шукаю орбіту», покликати людину.
 * Нічого не нараховує й не обіцяє: лише навігація по тому, що вже є.
 */
import { MessageCircle, Rocket, Share2, Sparkles, UserSearch } from "lucide-react";
import { Avatar } from "@/components/orbit/ui/kit";
import { CHARGE_MS, type Account, type World } from "@/lib/orbit/engine";
import { openRoomNext } from "@/components/orbit/live";
import { left } from "@/components/orbit/app-bits";
import { shareSheet, copyText } from "@/lib/orbit/feel";
import { useState } from "react";
import type { Route } from "@/components/orbit/more";

import { crewsFor, type Crew } from "@/lib/orbit/crews";

export function CrewNext({ world, user, now, onOpen }: { world: World; user: Account; now: number; onOpen?: (route: Route) => void }) {
  const crews = crewsFor(world, user.id, now);
  const [said, setSaid] = useState("");
  if (!crews.length) return null;
  const chat = (c: Crew) => {
    const title = c.status === "done" ? `Екіпаж №${c.no}` : c.mine ? "Мій запуск" : "Запуск, який я підтримав";
    openRoomNext(`l:${c.id}`, title);
    onOpen?.("live");
  };
  const invite = async () => {
    const url = typeof window === "undefined" ? "" : window.location.origin;
    const text = "Я в Орбітах — тут орбіту запускають разом, екіпажем. Приєднуйся:";
    const shared = await shareSheet({ title: "Орбіти", text, url });
    if (shared === null) { await copyText(`${text} ${url}`); setSaid("Посилання скопійовано."); }
  };
  return (
    <section className="orbit-block cn" aria-labelledby="cn-title">
      <p className="orbit-kicker"><Sparkles size={13} aria-hidden /> Що далі</p>
      <h2 className="orbit-h" id="cn-title">{crews.length === 1 ? "Твій екіпаж" : "Твої екіпажі"}</h2>
      <ul className="cn-list">
        {crews.map((c) => {
          const p = Math.min(1, Math.max(0, (now - c.start) / CHARGE_MS));
          const leftMs = c.start + CHARGE_MS - now;
          return (
            <li key={c.id} className="cn-crew" data-state={c.status}>
              <div className="cn-top">
                <span className="cn-ico" aria-hidden><Rocket size={18} /></span>
                <span className="cn-t">
                  <b>{c.status === "done" ? `Екіпаж №${c.no}` : c.mine ? "Твій запуск заряджається" : `Запуск ${c.author} заряджається`}</b>
                  <small>{c.status === "done" ? "Орбіта вийшла. Екіпаж лишається разом." : leftMs > 0 ? `Залишилось ${left(leftMs)} · ${Math.round(p * 100)}%` : "Ось-ось буде результат"}</small>
                </span>
              </div>
              {c.status === "charging" ? (
                <div className="cn-bar" role="progressbar" aria-label="Заряд" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}><i style={{ width: `${Math.round(p * 100)}%` }} /></div>
              ) : null}
              <div className="cn-people" aria-label="Екіпаж">
                {c.people.map((x) => <span key={x.id} title={x.name}><Avatar id={x.id} name={x.name} size={26} /></span>)}
                <small>{c.people.length} у екіпажі</small>
              </div>
              <button type="button" className="orbit-go cn-go" onClick={() => chat(c)}><MessageCircle size={17} aria-hidden /> Написати екіпажу</button>
            </li>
          );
        })}
      </ul>
      <div className="cn-more">
        <button type="button" className="cn-act" onClick={() => onOpen?.("seek")}>
          <UserSearch size={18} aria-hidden />
          <span><b>Підтримай когось</b><small>Люди в «Шукаю орбіту» чекають на підтвердження</small></span>
        </button>
        <button type="button" className="cn-act" onClick={() => void invite()}>
          <Share2 size={18} aria-hidden />
          <span><b>Поклич людину</b><small>Більше знайомих — легше наступний запуск</small></span>
        </button>
      </div>
      {said ? <p className="orbit-ok" role="status">{said}</p> : null}
    </section>
  );
}
