import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { nearbyBoard, loadDone, type NearbyCard } from "@/lib/board";
import { peekNear, savedPoint } from "@/lib/feed-cache";
import { useAtlas } from "@/lib/store";

export const Route = createFileRoute("/map")({
  validateSearch: (search: Record<string, unknown>) => {
    const out: { q?: string; e?: string } = {};
    if (typeof search.q === "string" && search.q) out.q = search.q;
    if (typeof search.e === "string" && search.e) out.e = search.e;
    return out;
  },
  component: Places,
});

function Places() {
  const navigate = useNavigate();
  const point = savedPoint();
  const [geo, setGeo] = useState<"wait" | "ok" | "no">(point ? "ok" : "wait");
  const [near, setNear] = useState<NearbyCard[] | null>(() => peekNear());
  const [opened, setOpened] = useState<boolean | null>(null);
  const [listError, setListError] = useState(false);

  useEffect(() => {
    const id = sessionStorage.getItem("vosma-born");
    if (!id) return;
    sessionStorage.removeItem("vosma-born");
    void navigate({ to: "/open/$id", params: { id } });
  }, [navigate]);

  function pull(point: { lat: number; lng: number; accuracy: number }) {
    void nearbyBoard({
      data: {
        lat: point.lat,
        lng: point.lng,
        radiusM: 25_000,
        accuracy: point.accuracy,
        personKey: useAtlas.getState().profile.key,
      },
    })
      .then((book) => {
        if (!book.ok) {
          setNear([]);
          setListError(true);
          return;
        }
        setListError(false);
        setNear(book.rows);
      })
      .catch(() => {
        setListError(true);
      });
  }

  function locate(fresh: boolean) {
    if (!navigator.geolocation) {
      setGeo("no");
      setNear([]);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: Date.now() };
        setGeo("ok");
        try {
          sessionStorage.setItem("vosma-here", JSON.stringify(point));
        } catch {
          /* приватний режим */
        }
        pull(point);
      },
      () => {
        const kept = savedPoint();
        if (kept && (!kept.at || Date.now() - kept.at < 5 * 60 * 1000)) {
          setGeo("ok");
          pull({ lat: kept.lat, lng: kept.lng, accuracy: typeof kept.accuracy === "number" ? kept.accuracy : 80 });
          return;
        }
        setGeo("no");
        setNear([]);
      },
      { enableHighAccuracy: true, maximumAge: fresh ? 0 : 20_000, timeout: 12_000 },
    );
  }

  useEffect(() => {
    let stop = false;
    void loadDone(1)
      .then((rows) => {
        if (!stop) setOpened(rows.length > 0);
      })
      .catch(() => {
        if (!stop) setOpened(false);
      });
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    locate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const waiting = (near ?? []).filter((row) => row.status === "waiting");
  const showYard = opened === false && !listError && near !== null && waiting.length === 0;
  useEffect(() => {
    if (!showYard) return;
    document.documentElement.dataset.yard = "1";
    return () => {
      delete document.documentElement.dataset.yard;
    };
  }, [showYard]);
  if (showYard) {
    return <EmptyCity geo={geo} onAllow={() => locate(true)} />;
  }

  return (
    <div className="mx-auto grid max-w-lg gap-3 px-3 pt-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
      {geo === "wait" && near == null ? <p className="text-sm text-muted">шукаю незамкнуту поруч</p> : null}
      {listError ? <p className="one-quiet">Список не відкрився.</p> : null}
      {geo === "no" && waiting.length === 0 ? <p className="text-sm text-muted">Без місця стіну поруч не побачити. Дозволь його, коли будеш біля двору.</p> : null}
      <ul className="grid gap-3">
        {waiting.map((entry) => {
          const far = entry.distanceM > 200;
          const photo = entry.open && entry.photo ? entry.photo : "/canon/yard-night.jpg";
          return (
            <li key={entry.id} className="one-card">
              <img src={photo} alt="" />
              <p>{entry.creator} намалював</p>
              <p>{meters(entry.distanceM)} · {entry.own ? "твоя, чекає другу людину" : far ? "підійти ближче ніж 200 м" : "можна замкнути"}</p>
              {entry.own ? null : far ? null : (
                <Link to="/open/$id" params={{ id: entry.id }} className="chalk-pill">Підтвердити</Link>
              )}
            </li>
          );
        })}
      </ul>
      {opened && geo === "ok" && near && waiting.length === 0 ? (
        <div className="one-card">
          <img src="/canon/yard-night.jpg" alt="" />
          <p>Поруч нікого.</p>
          <p className="one-quiet">Намалюй вісімку. Друга людина її замикає.</p>
          <Link to="/create" className="chalk-pill">Поставити першу</Link>
        </div>
      ) : null}
    </div>
  );
}

function meters(distanceM: number) {
  if (distanceM < 1000) return `${Math.max(1, Math.round(distanceM))} м`;
  return `${(distanceM / 1000).toFixed(1)} км`;
}

function EmptyCity({ geo, onAllow }: { geo: "wait" | "ok" | "no"; onAllow: () => void }) {
  return (
    <div className="yard">
      <img src="/canon/yard-night.jpg" alt="" className="yard-photo" />
      <div className="yard-sheet">
        <p className="yard-title">Місто ще не відкрите.</p>
        <p className="yard-sub">Перша вісімка стає стіною. Друга її замикає.</p>
        <Link to="/create" className="yard-pill">Поставити першу</Link>
        <p className="yard-meta">
          {geo === "ok" ? (
            "ти перший у цьому дворі"
          ) : (
            <>
              місце ще не відоме · <button type="button" className="yard-allow" onClick={onAllow}>дозволити</button>
            </>
          )}
        </p>
      </div>
      <nav className="yard-tabs" aria-label="Розділи">
        <Link to="/activity">Стрічка</Link>
        <Link to="/map" className="on" onClick={(event) => event.preventDefault()}>Поруч</Link>
        <Link to="/profile">Профіль</Link>
      </nav>
    </div>
  );
}

