import { ChevronRight, Download, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { iosHint, standalone, useInstall } from "@/lib/orbit/pwa";

/**
 * «Завантажити додаток»: Android/комп’ютер — системне вікно (beforeinstallprompt);
 * iPhone — коротка ілюстрована підказка; інші браузери — підказка про меню браузера.
 * У встановленому додатку кнопки немає.
 */
export function InstallButton({ variant = "row" }: { variant?: "row" | "hero" }) {
  const { can, install } = useInstall();
  const [mounted, setMounted] = useState(false);
  const [guide, setGuide] = useState<null | "ios" | "other">(null);
  useEffect(() => setMounted(true), []);
  if (!mounted || standalone()) return null;
  const go = async () => {
    if (can) { await install(); return; }
    setGuide(iosHint() ? "ios" : "other");
  };
  return (
    <>
      <button type="button" className={variant === "hero" ? "ins-hero" : "mh-install"} onClick={() => void go()} data-testid="install-app">
        <span className="mh-install-ico" aria-hidden><Download size={18} strokeWidth={1.8} /></span>
        <span><b>Завантажити додаток</b><small>Іконка ORBIT на головному екрані · без магазину, безкоштовно</small></span>
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
      </button>
      {guide ? <InstallGuide kind={guide} onClose={() => setGuide(null)} /> : null}
    </>
  );
}

function InstallGuide({ kind, onClose }: { kind: "ios" | "other"; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const steps = kind === "ios"
    ? [
        { pic: <ShareArt />, t: "Натисни «Поділитися»", s: "Квадрат зі стрілкою внизу екрана Safari" },
        { pic: <AddArt />, t: "«На початковий екран»", s: "Прогорни список дій трохи нижче" },
        { pic: <DoneArt />, t: "Натисни «Додати»", s: "ORBIT з’явиться серед твоїх програм" },
      ]
    : [
        { pic: <MenuArt />, t: "Відкрий меню браузера", s: "⋮ або ··· у куті вікна" },
        { pic: <AddArt />, t: "«Встановити додаток»", s: "Або «Додати на головний екран»" },
        { pic: <DoneArt />, t: "Підтверди", s: "ORBIT відкриватиметься окремим вікном" },
      ];
  return (
    <div className="ins-back" role="presentation" onClick={onClose}>
      <div ref={box} tabIndex={-1} className="ins-sheet" role="dialog" aria-modal="true" aria-labelledby="ins-title" onClick={(e) => e.stopPropagation()}>
        <header className="ins-head">
          <img src="/favicon.svg" alt="" width={44} height={44} decoding="sync" />
          <div><h2 id="ins-title">Додати ORBIT на екран</h2><small>{kind === "ios" ? "iPhone і iPad · Safari" : "Твій браузер не показав вікно встановлення"}</small></div>
          <button type="button" className="mo-icon" aria-label="Закрити" onClick={onClose}><X size={18} aria-hidden /></button>
        </header>
        <ol className="ins-steps">
          {steps.map((st, i) => (
            <li key={st.t}><span className="ins-pic" aria-hidden>{st.pic}<b>{i + 1}</b></span><span><strong>{st.t}</strong><small>{st.s}</small></span></li>
          ))}
        </ol>
        {kind === "ios" ? <p className="orbit-note">Працює лише в Safari. Якщо ти в іншому браузері — відкрий цю сторінку в Safari.</p> : null}
        <button type="button" className="orbit-go" onClick={onClose}>Зрозуміло</button>
      </div>
    </div>
  );
}

const ART = { width: 56, height: 56, viewBox: "0 0 56 56", fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function ShareArt() {
  return <svg {...ART}><rect x="8" y="8" width="40" height="40" rx="10" stroke="none" fill="rgba(111,214,236,.12)" /><path d="M20 26v12h16V26" /><path d="M28 14v18" /><path d="M22 20l6-6 6 6" /></svg>;
}
function AddArt() {
  return <svg {...ART}><rect x="8" y="8" width="40" height="40" rx="10" stroke="none" fill="rgba(139,123,255,.14)" /><rect x="17" y="17" width="22" height="22" rx="5" /><path d="M28 23v10M23 28h10" /></svg>;
}
function DoneArt() {
  return <svg width={56} height={56} viewBox="0 0 56 56"><rect x="8" y="8" width="40" height="40" rx="10" fill="rgba(94,211,160,.14)" /><image href="/favicon.svg" x="16" y="16" width="24" height="24" /></svg>;
}
function MenuArt() {
  return <svg {...ART}><rect x="8" y="8" width="40" height="40" rx="10" stroke="none" fill="rgba(111,214,236,.12)" /><circle cx="28" cy="19" r="1.6" fill="currentColor" /><circle cx="28" cy="28" r="1.6" fill="currentColor" /><circle cx="28" cy="37" r="1.6" fill="currentColor" /></svg>;
}
