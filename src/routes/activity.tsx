import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { marketPulse, nearbyBoard, NEXT_PHOTOS } from "@/lib/board";
import { peekFeed, sameFeed, savedPoint, warmFeed } from "@/lib/feed-cache";
import { useAtlas } from "@/lib/store";

export const Route = createFileRoute("/activity")({
  component: ActivityPage,
});

const HERE = "vosma-here";

function ActivityPage() {
  const key = useAtlas((state) => state.profile.key);
  const [, setDenied] = useState(false);
  const [placeNote, setPlaceNote] = useState("");
  const [settled, setSettled] = useState(false);
  const [tick, setTick] = useState(0);
  const [issued, setIssued] = useState<number | null>(null);
  const [feed, setFeed] = useState(peekFeed);
  useEffect(() => {
    let stop = false;
    let newer = false;
    let blocked = false;
    void warmFeed(key ?? "").then((next) => {
      if (stop || newer) return;
      const view = blocked ? { ...next, geo: "no" as const, need: [], stale: false } : next;
      setFeed((prev) => (sameFeed(prev, view) ? prev : view));
    });
    if (!navigator.geolocation) {
      setDenied(true);
      setSettled(true);
      return () => {
        stop = true;
      };
    }
    let asked = false;
    const locate = () => {
      navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: Date.now() };
        try {
          sessionStorage.setItem(HERE, JSON.stringify(point));
        } catch {
          /* приватний режим */
        }
        setDenied(false);
        setPlaceNote("");
        void nearbyBoard({
          data: { lat: point.lat, lng: point.lng, radiusM: 25_000, accuracy: point.accuracy, personKey: key ?? "" },
        }).then((book) => {
          if (stop) return;
          setSettled(true);
          if (!book.ok) return;
          newer = true;
          const need = book.rows.filter((row) => row.status === "waiting").sort((a, b) => Number(b.own) - Number(a.own) || a.distanceM - b.distanceM).slice(0, 6);
          setFeed((prev) => {
            const next = { ...prev, need, geo: "ok" as const, stale: false };
            return sameFeed(prev, next) ? prev : next;
          });
        }).catch(() => {
          if (!stop) setSettled(true);
        });
      },
      (error) => {
        const hard = error.code === 1 || error.code === 2;
        const kept = savedPoint();
        const fresh = Boolean(kept?.at && Date.now() - kept.at < 5 * 60 * 1000);
        if (!fresh) {
          if (hard) {
            blocked = true;
            try {
              sessionStorage.removeItem(HERE);
            } catch {
              /* приватний режим */
            }
          }
          setDenied(true);
          setPlaceNote("");
          setSettled(true);
          setFeed((prev) => {
            const next = { ...prev, geo: "no" as const, need: hard ? [] : prev.need, stale: false };
            return sameFeed(prev, next) ? prev : next;
          });
          return;
        }
        setPlaceNote("Свіже місце не взялось. Показую попереднє.");
        setSettled(true);
        setFeed((prev) => {
          const next = { ...prev, stale: true };
          return sameFeed(prev, next) ? prev : next;
        });
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8000 },
      );
    };
    const arm = () => {
      try {
        if (sessionStorage.getItem("vosma-open") !== "app") return;
      } catch {
        return;
      }
      if (asked) return;
      asked = true;
      locate();
    };
    arm();
    window.addEventListener("vosma-open", arm);
    return () => {
      stop = true;
      window.removeEventListener("vosma-open", arm);
    };
  }, [key, tick]);

  useEffect(() => {
    void marketPulse({ data: {} }).then((pulse) => setIssued(pulse.issued)).catch(() => undefined);
  }, [tick]);

  const wall = feed.need[0];
  const mine = Boolean(wall?.own);
  const count = issued == null ? 0 : issued;

  return (
    <div className="one-wall">
      {wall && mine ? (
        <Link to="/open/$id" params={{ id: wall.id }} className="one-card">
          <img src={wall.photo || "/canon/yard-night.jpg"} alt="" />
          <p>Чекає другу людину</p>
          <p>Вісімка вже на стіні. Жива, поки хтось не підійде ближче ніж 200 м.</p>
        </Link>
      ) : null}
      {wall && !mine ? (
        <div className="one-card">
          <img src={(wall.open && wall.photo) || "/canon/yard-night.jpg"} alt="" />
          <p>{wall.creator} намалював</p>
          <p>{Math.max(1, Math.round(wall.distanceM))} м · підійди і замкни</p>
          <Link to="/open/$id" params={{ id: wall.id }} className="chalk-pill">Замкнути</Link>
        </div>
      ) : null}
      {!wall ? (
        <div className="one-card">
          <img src="/canon/yard-night.jpg" alt="" />
          <p>{!settled ? "Шукаю, чи є незамкнена поруч." : feed.geo === "no" ? "Без місця не побачити, чи є стіна поруч." : "Поруч нікого. Намалюй першу."}</p>
          <p className="one-quiet">Друга людина її замикає. Тоді у кожного своя.</p>
          {!settled ? null : <Link to="/create" className="chalk-pill">Поставити першу</Link>}
          {settled && feed.geo === "no" ? (
            <button type="button" className="one-quiet" onClick={() => setTick((value) => value + 1)}>дозволити місце</button>
          ) : null}
        </div>
      ) : null}
      {placeNote ? <p className="one-quiet">{placeNote}</p> : null}
      <p className="one-count">{count === 0 ? "Ще жодна не замкнена. Перша відкриє місто." : `підтверджено ${new Intl.NumberFormat("uk-UA").format(count)} з ${new Intl.NumberFormat("uk-UA").format(NEXT_PHOTOS)}`}</p>
    </div>
  );
}
