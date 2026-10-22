/** Замочок для запланованого: показуємо, але не обіцяємо. Шторка з поясненням, без дат і без доходу. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, Bell, BellRing, CreditCard, Download, Fingerprint, KeyRound, Landmark, Languages, Lock, MailCheck, MonitorSmartphone, ShieldOff, Sparkles, UserX, Users, SmilePlus } from "lucide-react";
import { LEGAL_TAG, LOCKS, SOON_TAG, type LockId } from "@/lib/orbit/locked";

const ICONS: Record<LockId, ReactNode> = {
  buy: <Sparkles size={18} strokeWidth={1.8} />,
  deposit: <Landmark size={18} strokeWidth={1.8} />,
  withdraw: <CreditCard size={18} strokeWidth={1.8} />,
  p2p: <ArrowLeftRight size={18} strokeWidth={1.8} />,
  twofa: <KeyRound size={18} strokeWidth={1.8} />,
  logoutAll: <MonitorSmartphone size={18} strokeWidth={1.8} />,
  closeAccount: <UserX size={18} strokeWidth={1.8} />,
  pricePush: <BellRing size={18} strokeWidth={1.8} />,
  exportHistory: <Download size={18} strokeWidth={1.8} />,
  languages: <Languages size={18} strokeWidth={1.8} />,
  pinLock: <Fingerprint size={18} strokeWidth={1.8} />,
  blockAccount: <ShieldOff size={18} strokeWidth={1.8} />,
  antiPhishing: <MailCheck size={18} strokeWidth={1.8} />,
  pushMail: <Bell size={18} strokeWidth={1.8} />,
  chatRooms: <Users size={18} strokeWidth={1.8} />,
  chatReact: <SmilePlus size={18} strokeWidth={1.8} />,
};

export function lockTag(id: LockId) {
  return LOCKS[id].kind === "legal" ? LEGAL_TAG : SOON_TAG;
}

/** Маленька позначка «🔒 Скоро» / «🔒 Після юридичного оформлення». */
export function LockBadge({ id, compact = false }: { id: LockId; compact?: boolean }) {
  const legal = LOCKS[id].kind === "legal";
  return (
    <span className="lk-badge" data-kind={legal ? "legal" : "soon"}>
      <Lock size={11} strokeWidth={2.4} aria-hidden />
      {compact && legal ? "Після юриста" : lockTag(id)}
    </span>
  );
}

/** Шторка з поясненням. */
export function LockedSheet({ id, onClose }: { id: LockId; onClose: () => void }) {
  const lock = LOCKS[id];
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="ky-scrim" onClick={onClose}>
      <div className="ky-sheet lk-sheet" role="dialog" aria-modal="true" aria-labelledby="lk-title" onClick={(event) => event.stopPropagation()}>
        <span className="ky-handle" aria-hidden />
        <span className="lk-glyph" aria-hidden>
          <Lock size={22} strokeWidth={1.9} />
        </span>
        <p className="lk-kicker"><LockBadge id={id} /></p>
        <h2 id="lk-title" ref={title} tabIndex={-1} className="ky-title">{lock.title}</h2>
        {lock.body.map((line) => (
          <p key={line} className="ky-body">{line}</p>
        ))}
        <button type="button" className="orbit-go k-go" onClick={onClose}>Зрозуміло</button>
      </div>
    </div>,
    document.body,
  );
}

/** Рядок-кнопка із замочком (блок «Гроші», хаб «Ще»). */
export function LockedRow({ id, onOpen }: { id: LockId; onOpen: (id: LockId) => void }) {
  const lock = LOCKS[id];
  return (
    <button type="button" className="lk-row" onClick={() => onOpen(id)} aria-haspopup="dialog" aria-label={`${lock.title}: ${lockTag(id)}. Докладніше`}>
      <span className="lk-row-ico" aria-hidden>{ICONS[id]}</span>
      <span className="lk-row-text">
        <b>{lock.title}</b>
        <small>{lock.short}</small>
      </span>
      <LockBadge id={id} compact />
    </button>
  );
}

/** Список рядків із замочком + власна шторка. */
export function LockedList({ ids, title, note, className = "" }: { ids: LockId[]; title: string; note?: string; className?: string }) {
  const [open, setOpen] = useState<LockId | null>(null);
  return (
    <section className={`orbit-block lk-list ${className}`} aria-labelledby={`lk-${title.replace(/\s+/g, "-")}`}>
      <div className="lk-head">
        <h2 id={`lk-${title.replace(/\s+/g, "-")}`} className="ex-h">{title}</h2>
        <Lock size={14} strokeWidth={2} aria-hidden />
      </div>
      {note ? <p className="orbit-note lk-note">{note}</p> : null}
      <div className="lk-rows">
        {ids.map((id) => <LockedRow key={id} id={id} onOpen={setOpen} />)}
      </div>
      {open ? <LockedSheet id={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}
