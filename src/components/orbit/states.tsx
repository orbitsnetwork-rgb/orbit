/** 13: спільні стани — немає зв’язку, екран зламався. Один вигляд на всіх екранах. */
import { Component, useEffect, useState, type ReactNode } from "react";
import { RefreshCw, TriangleAlert, WifiOff } from "lucide-react";
import { OFFLINE, useOrbits } from "@/lib/orbit/store";

/** Смужка «Немає зв’язку» з кнопкою повтору. Показуємо, коли телефон офлайн або сервер не відповідає. */
export function LinkBanner() {
  const down = useOrbits((state) => state.bad && state.flash === OFFLINE);
  const [online, setOnline] = useState(true);
  const [trying, setTrying] = useState(false);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  if (online && !down) return null;
  return (
    <div className="st-link" role="status" aria-live="polite">
      <WifiOff size={16} strokeWidth={1.9} aria-hidden />
      <span>
        <b>{online ? "Сервер не відповідає" : "Телефон без інтернету"}</b>
        <small>Показуємо останні збережені дані. Іскри не губляться.</small>
      </span>
      <button
        type="button"
        className="st-link-go"
        disabled={trying || !online}
        onClick={async () => {
          setTrying(true);
          try {
            await useOrbits.getState().refresh();
          } finally {
            setTrying(false);
          }
        }}
      >
        <RefreshCw size={14} strokeWidth={2} aria-hidden className={trying ? "st-spin" : undefined} /> {trying ? "Пробуємо…" : "Ще раз"}
      </button>
    </div>
  );
}

export function Broken({ onRetry, title = "Цей екран не відкрився" }: { onRetry: () => void; title?: string }) {
  return (
    <div className="k-empty st-broken" role="alert">
      <span aria-hidden><TriangleAlert size={20} strokeWidth={1.6} /></span>
      <b>{title}</b>
      <p>Щось пішло не так у самому застосунку. Твої іскри й орбіти в безпеці — спробуй відкрити екран ще раз.</p>
      <button type="button" className="orbit-go k-go" onClick={onRetry}><RefreshCw size={16} aria-hidden /> Відкрити ще раз</button>
    </div>
  );
}

/** Ловить помилку одного екрана, щоб решта застосунку працювала. */
export class Boundary extends Component<{ children: ReactNode; name?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("screen failed", this.props.name ?? "", error instanceof Error ? error.message : "");
  }
  render() {
    if (this.state.failed) return <Broken onRetry={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}
