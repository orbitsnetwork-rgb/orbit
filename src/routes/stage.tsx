import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { marketPulse, NEXT_PHOTOS, type MarketPulse } from "@/lib/board";
import { peekPrime } from "@/lib/prime";

export const Route = createFileRoute("/stage")({
  component: StagePage,
});

function grouped(value: number) {
  return new Intl.NumberFormat("uk-UA").format(value);
}

function StagePage() {
  const primed = peekPrime();
  const [pulse, setPulse] = useState<MarketPulse | null>(primed.pulse);
  useEffect(() => {
    void marketPulse({ data: {} }).then(setPulse).catch(() => setPulse(null));
  }, []);
  const issued = pulse?.issued ?? 0;
  const left = pulse?.left ?? NEXT_PHOTOS;
  const need = pulse?.need ?? NEXT_PHOTOS;
  const closed = pulse != null && left === 0;

  return (
    <div className="sheet-page">
      <h1 className="sheet-title">Етап</h1>
      <p className="sheet-note">Зараз малюють на справжніх стінах. Наступний етап сам не вмикається.</p>
      <p className="one-count">підтверджено {grouped(issued)} з {grouped(need)}</p>
      {closed ? <Link to="/map" className="chalk-pill">Поруч</Link> : <Link to="/create" className="chalk-pill">Намалювати 8</Link>}
    </div>
  );
}
