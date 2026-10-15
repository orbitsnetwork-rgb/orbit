import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { enablePush } from "@/lib/push-client";
import { fmtWhen } from "@/lib/model";
import { useAtlas } from "@/lib/store";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const showCoords = useAtlas((state) => state.showCoords);
  const setShowCoords = useAtlas((state) => state.setShowCoords);
  const sound = useAtlas((state) => state.sound);
  const setSound = useAtlas((state) => state.setSound);
  const journal = useAtlas((state) => state.journal);
  const profile = useAtlas((state) => state.profile);
  const [note, setNote] = useState("");

  return (
    <div className="sheet-page">
      <h1 className="sheet-title">Налаштування</h1>
      <p className="sheet-note">Радіус і точність місця тут не змінюються. Правило з’являється, коли дія не проходить.</p>
      <label className="sign-check">
        <input type="checkbox" checked={showCoords} onChange={(event) => setShowCoords(event.target.checked)} />
        <span>Показувати приблизні координати. Інакше видно лише місто.</span>
      </label>
      <label className="sign-check">
        <input type="checkbox" checked={sound} onChange={(event) => setSound(event.target.checked)} />
        <span>Тихий звук дій на цьому телефоні.</span>
      </label>
      <p className="sheet-note">На iPhone сповіщення приходять, лише якщо 8 стоїть на екрані «Додому».</p>
      <button
        type="button"
        className="chalk-pill"
        onClick={() => {
          void enablePush(profile.key ?? "").then((result) => {
            setNote(result.ok ? "Сповіщення увімкнені." : result.error);
          });
        }}
      >
        Сповіщати, коли підтвердили
      </button>
      {note ? <p className="sheet-note">{note}</p> : null}
      <section className="sign-list">
        <p className="sign-help"><b>Журнал</b>{journal.length === 0 ? "Поки порожньо. Лише на цьому телефоні." : "Лише на цьому телефоні."}</p>
        {journal.map((entry) => (
          <p key={entry.id} className="sign-help">
            <b>{fmtWhen(entry.at)}</b>
            {entry.eightId ? <Link to="/open/$id" params={{ id: entry.eightId }}>{entry.text}</Link> : entry.text}
          </p>
        ))}
      </section>
    </div>
  );
}
