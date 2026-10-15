import { useEffect, useState, type ReactNode } from "react";
import { nearbyBoard } from "@/lib/board";
import { peekNear } from "@/lib/feed-cache";
import { useAtlas } from "@/lib/store";
import { EightMark } from "@/components/mark";

export function Gate({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0B0F14] text-white">
      <div className="mx-auto grid min-h-dvh max-w-md grid-rows-[minmax(10rem,1fr)_auto]">
        <div className="relative min-h-0 overflow-hidden">
          <img src="/canon/chalk.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-[center_42%]" />
        </div>
        <div className="grid content-start gap-3 px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

export function MarkOpen({ onDone }: { onDone: () => void }) {
  return (
    <button type="button" className="mark-open" onClick={onDone}>
      <EightMark mode="static" className="mark-open-eight" />
      <span className="mark-open-hint">Торкнись</span>
    </button>
  );
}

export function Welcome({ onClose }: { onClose: (id: string | null, draw?: boolean) => void }) {
  const [nearId, setNearId] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [meters, setMeters] = useState<number | null>(null);

  useEffect(() => {
    const apply = (rows: { id: string; status: string; own: boolean; distanceM: number }[]) => {
      const waiting = rows.filter((row) => row.status === "waiting" && !row.own).sort((a, b) => a.distanceM - b.distanceM);
      setCount(waiting.length);
      setNearId(waiting[0]?.id ?? null);
      setMeters(waiting[0] ? Math.max(1, Math.round(waiting[0].distanceM)) : null);
    };
    const cached = peekNear();
    if (cached) apply(cached);
    if (!navigator.geolocation) {
      if (!cached) setCount(0);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void nearbyBoard({
          data: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            radiusM: 25_000,
            accuracy: pos.coords.accuracy,
            personKey: useAtlas.getState().profile.key,
          },
        }).then((book) => {
          if (!book.ok) {
            if (!cached) setCount(0);
            return;
          }
          apply(book.rows);
        }).catch(() => {
          if (!cached) setCount(0);
        });
      },
      () => {
        if (!cached) setCount(0);
      },
      { enableHighAccuracy: true, maximumAge: 20000, timeout: 8000 },
    );
  }, []);

  const line = count == null
    ? "шукаю незамкнуту поруч"
    : count === 0
      ? "поруч незамкнутих немає"
      : `поруч одна · ${meters} м`;
  const idea = count == null
    ? "Вісімка на стіні живе, лише коли її замикає друга людина."
    : count === 0
      ? "Намалюй вісімку на стіні. Друга людина її замикає."
      : "Хтось уже намалював. Підійди і зніми ту саму стіну.";

  return (
    <div className="welcome">
      <img src="/canon/gap.jpg" alt="" className="welcome-photo" fetchPriority="high" decoding="async" />
      <div className="welcome-dock">
        <p className="welcome-idea">{idea}</p>
        <button type="button" className="welcome-close" onClick={() => onClose(count === 0 ? null : nearId, count === 0)}>
          {count === 0 ? "Поставити першу" : "Замкнути"}
        </button>
        <p className="welcome-live">{line}</p>
      </div>
    </div>
  );
}