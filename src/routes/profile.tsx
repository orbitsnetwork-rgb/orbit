import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { keyAcked, offerKey } from "@/components/key-once";
import { confirmCredential, keepPerson, openPerson, openRecovery } from "@/lib/account";
import { marketPulse, personBoard } from "@/lib/board";
import { deviceId } from "@/lib/device";
import { checkCity, checkName, checkRestore } from "@/lib/fields";
import { derivedStatus, norm } from "@/lib/model";
import { useAtlas } from "@/lib/store";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const profile = useAtlas((state) => state.profile);
  const setProfile = useAtlas((state) => state.setProfile);
  const hydrated = useAtlas((state) => state.hydrated);
  const eights = useAtlas((state) => state.eights);
  const [name, setName] = useState(profile.name ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [editing, setEditing] = useState(false);
  const [keyNote, setKeyNote] = useState("");
  const [issued, setIssued] = useState<number | null>(null);
  const [nameError, setNameError] = useState("");
  const [cityError, setCityError] = useState("");
  const [restore, setRestore] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [counts, setCounts] = useState<{ drew: number; confirmed: number; holds: number } | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    setName(profile.name ?? "");
    setCity(profile.city ?? "");
  }, [hydrated, profile.name, profile.city]);

  useEffect(() => {
    void marketPulse({ data: {} }).then((pulse) => setIssued(pulse.issued)).catch(() => setIssued(null));
  }, []);

  useEffect(() => {
    const who = (profile.name ?? "").trim();
    if (who.length < 2) return;
    void personBoard({ data: { name: who, personKey: profile.key } }).then((book) => {
      if (!book) return;
      setCounts({ drew: book.drew, confirmed: book.confirmed, holds: book.holds });
    }).catch(() => undefined);
  }, [profile.name, profile.key]);

  const who = norm(profile.name);
  const created = eights.filter((entry) => who && norm(entry.creator) === who);
  const confirmed = created.filter((entry) => entry.rewardOf).length;
  const held = eights.filter((entry) => who && norm(entry.holder) === who && derivedStatus(entry) !== "created");

  async function saveName(showKey = false) {
    const nameProblem = checkName(name);
    const cityProblem = checkCity(city);
    setNameError(nameProblem);
    setCityError(cityProblem);
    if (nameProblem || cityProblem) return;
    const nextName = name.trim();
    const nextCity = city.trim();
    setProfile({ name: nextName, city: nextCity });
    setEditing(false);
    try {
      const saved = await keepPerson({ data: { key: profile.key, name: nextName, city: nextCity } });
      if (!saved.ok) {
        setKeyNote(saved.error);
        return;
      }
      if (saved.key) {
        setProfile({ key: saved.key, recovery: saved.recovery });
        if (showKey && !keyAcked()) {
          offerKey(saved.key, saved.recovery);
          setKeyNote("Ключ готовий. Запиши його зараз.");
        }
      } else {
        setKeyNote(showKey ? "Ключ той самий. Код уже було показано." : "Ім’я оновлене.");
      }
    } catch {
      setKeyNote("Ім’я збережене на цьому телефоні. Ключ зараз не записався.");
    }
  }

  async function restoreName() {
    const problem = checkRestore(restore);
    setRestoreError(problem);
    if (problem) return;
    setKeyNote("");
    try {
      const code = restore.trim().toUpperCase().replace(/\s+/g, "");
      const found = code.startsWith("R-")
        ? await openRecovery({ data: { code, device: deviceId() } })
        : await openPerson({ data: { key: code, device: deviceId() } });
      if (!found.ok) {
        setRestoreError(found.error);
        return;
      }
      if ("recovery" in found) {
        setProfile({ name: found.name, city: found.city, key: found.key, recovery: found.recovery });
        offerKey(found.key, found.recovery);
        setKeyNote(`Це телефон ${found.name}. Новий ключ запиши зараз.`);
      } else if (found.next) {
        const confirmedKey = await confirmCredential({ data: { key: found.next, device: deviceId() } });
        if (!confirmedKey.ok) {
          setProfile({ name: found.name, city: found.city, key: code });
          setKeyNote(confirmedKey.error);
        } else {
          setProfile({ name: found.name, city: found.city, key: found.next });
          setKeyNote(`Це телефон ${found.name}.`);
        }
      } else {
        setProfile({ name: found.name, city: found.city, key: code });
        setKeyNote(`Це телефон ${found.name}.`);
      }
      setName(found.name);
      setCity(found.city);
      setRestore("");
    } catch {
      setKeyNote("Не вдалося прочитати ключ.");
    }
  }

  const era = issued == null ? "До 8 мільярдів фото" : `підтверджено ${new Intl.NumberFormat("uk-UA").format(issued)} з 8 000 000 000`;
  const drew = counts?.drew ?? created.filter((entry) => !entry.rewardOf).length;
  const saw = counts?.confirmed ?? confirmed;
  const holds = counts?.holds ?? held.length;

  return (
    <div className="sheet-page">
      <button type="button" className="sign-name" onClick={() => setEditing(true)}>
        {(profile.name ?? "").trim().length > 1 ? profile.name : "Як тебе звати"}
      </button>
      <p className="sheet-note">{profile.city || "Місто з’явиться разом зі стіною"}</p>
      {hydrated && drew + saw + holds === 0 ? (
        <p className="sheet-note">Ще немає стіни. Намалюй вісімку. Друга людина її замикає.</p>
      ) : (
        <p className="sign-nums">{drew} намалював · {saw} підтвердив · {holds} тримає</p>
      )}
      {editing ? (
        <div className="grid gap-3">
          <label className="sheet-field">
            Ім’я
            <input value={name} onChange={(event) => { setName(event.target.value); setNameError(""); }} autoComplete="nickname" />
          </label>
          <label className="sheet-field">
            Місто
            <input value={city} onChange={(event) => { setCity(event.target.value); setCityError(""); }} />
          </label>
          {nameError || cityError ? <p className="sheet-note">{nameError || cityError}</p> : null}
          <button type="button" className="chalk-pill" onClick={() => void saveName(false)}>Зберегти</button>
        </div>
      ) : null}
      <nav className="sign-list">
        <Link to="/stage">Етап малювання<span>{era}</span></Link>
        <Link to="/mine">Мої 8</Link>
        <div className="sign-key">
          <p>Ключ</p>
          <p>{profile.key ? "Код уже показано один раз. Повернути не можна." : "Коду немає, поки ключ не створено."}</p>
          {!profile.key && (profile.name ?? "").trim().length > 1 ? (
            <button type="button" className="chalk-pill" onClick={() => void saveName(true)}>Створити ключ</button>
          ) : null}
        </div>
        <label className="sheet-field is-line">
          <input value={restore} onChange={(event) => { setRestore(event.target.value.toUpperCase()); setRestoreError(""); }} placeholder="Ключ або код" autoCapitalize="characters" />
        </label>
        {restoreError ? <p className="sheet-note">{restoreError}</p> : null}
        <button type="button" className="one-quiet" onClick={() => void restoreName()}>Відновити на цьому телефоні</button>
        <button type="button" className="sign-line" onClick={() => { void navigator.clipboard.writeText(deviceId()).then(() => setKeyNote("Номер пристрою скопійовано.")).catch(() => setKeyNote("Скопіювати не вийшло.")); }}>
          Номер пристрою
        </button>
        <Link to="/help">Як це працює</Link>
        <Link to="/settings">Налаштування</Link>
      </nav>
      {keyNote ? <p className="sheet-note">{keyNote}</p> : null}
    </div>
  );
}
