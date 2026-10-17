import { ArrowLeftRight, BellOff, CheckCheck, CircleDot, Info, Sparkles, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Page } from "@/components/orbit/more";
import type { Account, World } from "@/lib/orbit/engine";
import { ago, setToasts, toastsOn, useInbox, type Note, type Topic } from "@/lib/orbit/inbox";
import { clock } from "@/lib/orbit/ledger";
import { useOrbits } from "@/lib/orbit/store";
import { LockedRow, LockedSheet } from "@/components/orbit/locked";
import type { LockId } from "@/lib/orbit/locked";

type Filter = "all" | "me" | Exclude<Topic, "me">;
const TABS: { id: Filter; label: string }[] = [
  { id: "all", label: "Усі" },
  { id: "me", label: "Про мене" },
  { id: "market", label: "Ринок" },
  { id: "charge", label: "Заряди" },
  { id: "fund", label: "Фонд" },
  { id: "system", label: "Світ" },
];
const ICON: Record<Topic, typeof Info> = { me: UserRound, market: ArrowLeftRight, charge: CircleDot, fund: Sparkles, system: Info };

export function Inbox({ world, user, onBack, onClose }: { world: World; user: Account; onBack: () => void; onClose?: () => void }) {
  const ready = useOrbits((state) => state.ready);
  const inbox = useInbox(world, user);
  const [filter, setFilter] = useState<Filter>("all");
  const [pops, setPops] = useState(true);
  const [lock, setLock] = useState<LockId | null>(null);
  useEffect(() => setPops(toastsOn()), []);
  const rows = inbox.notes.filter((note) => (filter === "all" ? true : filter === "me" ? note.mine : note.topic === filter));
  const unreadHere = rows.filter(inbox.isUnread).length;

  return (
    <Page title="Сповіщення" kicker="Події світу" onBack={onBack} onClose={onClose}>
      <div className="nt-bar">
        <p className="orbit-note as-small" aria-live="polite">{inbox.unread > 0 ? `Нових: ${inbox.unread}` : "Усе прочитано"}</p>
        <button type="button" className="nt-all" disabled={inbox.unread === 0} onClick={inbox.markAll}>
          <CheckCheck size={15} strokeWidth={1.75} aria-hidden /> Прочитати все
        </button>
      </div>
      <div className="hi-chips" role="tablist" aria-label="Тема">
        {TABS.map((tab) => {
          const count = inbox.notes.filter((note) => inbox.isUnread(note) && (tab.id === "all" || (tab.id === "me" ? note.mine : note.topic === tab.id))).length;
          return (
            <button key={tab.id} type="button" role="tab" aria-selected={filter === tab.id} className="orbit-chip" data-on={filter === tab.id ? "1" : "0"} onClick={() => setFilter(tab.id)}>
              {tab.label}
              {count > 0 ? <span className="hi-count nt-new">{count}</span> : null}
            </button>
          );
        })}
      </div>
      {!ready ? (
        <div className="hi-list" aria-busy="true">
          {Array.from({ length: 5 }, (_, index) => <div key={index} className="hi-skel" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="hi-empty">
          <BellOff size={22} strokeWidth={1.4} aria-hidden />
          <p>{filter === "me" ? "Про тебе подій ще немає" : "Подій поки немає"}</p>
        </div>
      ) : (
        <div className="mo-card" role="tabpanel" aria-label={`${rows.length} подій, нових ${unreadHere}`}>
          {rows.map((note) => (
            <Item key={note.key} note={note} now={world.now} unread={inbox.isUnread(note)} onRead={() => inbox.mark(note)} />
          ))}
        </div>
      )}
      <section className="mo-group" aria-label="Налаштування сповіщень">
        <p className="mo-group-title">Налаштування</p>
        <div className="mo-card">
          <label className="nt-switch">
            <span>
              <b>Спливаючі підказки</b>
              <small>Коротко внизу екрана, коли у світі щось стається</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={pops}
              onChange={(event) => {
                setPops(event.target.checked);
                setToasts(event.target.checked);
              }}
            />
          </label>
          <LockedRow id="pushMail" onOpen={setLock} />
          {lock ? <LockedSheet id={lock} onClose={() => setLock(null)} /> : null}
        </div>
      </section>
      <p className="orbit-note as-small">Журнал світу тримає останні 40 подій. Позначки «прочитано» живуть на цьому телефоні.</p>
    </Page>
  );
}

function Item({ note, now, unread, onRead }: { note: Note; now: number; unread: boolean; onRead: () => void }) {
  const Icon = ICON[note.mine ? "me" : note.topic];
  return (
    <button type="button" className="nt-row" data-unread={unread ? "1" : "0"} data-topic={note.mine ? "me" : note.topic} onClick={onRead} aria-label={`${unread ? "Нове. " : ""}${note.text}`}>
      <span className="hi-ico" aria-hidden><Icon size={16} strokeWidth={1.6} /></span>
      <span className="nt-text">
        <span>{note.text}</span>
        <small title={clock(note.at)}>{ago(note.at, now)}</small>
      </span>
      {unread ? <i className="nt-dot" aria-hidden /> : null}
    </button>
  );
}
