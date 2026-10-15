import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { confirmBoard, confirmQuota, dropBoard, flagBoard, goBoard, readBoard, setPresence, walksBoard, type BoardEight, type BoardEvent } from "@/lib/board";
import { deviceId } from "@/lib/device";
import { archiveEvents, confirmDistanceError, eightNo, haversine, lifeLabel, lifeOf, norm, placeFixError, refusalLine, type Eight } from "@/lib/model";
import { watchFix } from "@/lib/geo";
import { onLive } from "@/lib/live";
import { useAtlas } from "@/lib/store";
import { fitJpeg } from "@/lib/image";
import { CreditBeat, PlaceBeat } from "@/components/credit-beat";
import { revealKeyOnce } from "@/components/key-once";
import { playCue } from "@/lib/sound";

export const Route = createFileRoute("/open/$id")({
  component: OpenEight,
});

async function compress(file: File) {
  return fitJpeg(file);
}

function OpenEight() {
  const { id } = Route.useParams();
  const profile = useAtlas((state) => state.profile);
  const creditBoard = useAtlas((state) => state.creditBoard);
  const local = useAtlas((state) => state.eights.find((entry) => entry.id === id));
  const [row, setRow] = useState<BoardEight | null>(null);
  const [missing, setMissing] = useState(false);
  const [here, setHere] = useState<{ lat: number; lng: number; accuracy: number; at: number } | null>(null);
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState("");
  const [creditError, setCreditError] = useState("");
  const [note, setNote] = useState("");
  const [reward, setReward] = useState("");
  const [openedCity, setOpenedCity] = useState(false);
  const [beat, setBeat] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [watchKey, setWatchKey] = useState(0);
  const [slow, setSlow] = useState(false);
  const [walks, setWalks] = useState<{ name: string; at: string }[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 4000);
    return () => window.clearTimeout(timer);
  }, [id]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("vosma-placed") !== id) return;
      sessionStorage.removeItem("vosma-placed");
      setPlaced(true);
      playCue("create");
    } catch {
      /* приватний режим */
    }
  }, [id]);

  const hereRef = useRef(here);
  hereRef.current = here;

  useEffect(() => {
    let stop = false;
    void readBoard({
      data: {
        id,
        name: useAtlas.getState().profile.name,
        personKey: useAtlas.getState().profile.key,
      },
    }).then((found) => {
      if (stop) return;
      if (!found) setMissing(true);
      else {
        useAtlas.getState().adoptBoard(found);
        setRow(found);
        if (found.status === "confirmed") creditBoard(found);
      }
    }).catch(() => {
      if (!stop) setSlow(true);
    });
    return () => {
      stop = true;
    };
  }, [id, creditBoard]);

  const opened = useRef(false);
  useEffect(() => {
    if (!row || row.photo || row.status !== "waiting" || opened.current) return;
    if (!here || placeFixError(here.accuracy)) return;
    if (haversine(here, row) * 1000 > 200) return;
    opened.current = true;
    void readBoard({
      data: {
        id,
        name: useAtlas.getState().profile.name,
        personKey: useAtlas.getState().profile.key,
        lat: here.lat,
        lng: here.lng,
        accuracy: here.accuracy,
      },
    }).then((found) => {
      if (found) setRow(found);
    }).catch(() => undefined);
  }, [row, here, id]);

  useEffect(() => {
    let good = false;
    return watchFix(
      (fix) => {
        setHere(fix);
        good = !placeFixError(fix.accuracy);
        if (good) setError("");
      },
      (text) => {
        if (!good) setError(text);
      },
    );
  }, [watchKey]);

  useEffect(() => {
    if (!row || row.status !== "waiting") return;
    let stop = false;
    const load = () => {
      void walksBoard({ data: row.id }).then((list) => {
        if (!stop) setWalks(list);
      }).catch(() => undefined);
    };
    load();
    const stopLive = onLive(15_000, load);
    return () => {
      stop = true;
      stopLive();
    };
  }, [row]);

  if (missing && !local) {
    return (
      <div className="mx-auto grid max-w-lg gap-3 px-3 pt-6 pb-[calc(11rem+env(safe-area-inset-bottom))]">
        <p className="text-sm">Цієї 8 немає в реєстрі.</p>
        <Link to="/map" className="grid h-11 place-items-center rounded-full bg-accent text-sm text-bg">До «Поруч»</Link>
      </div>
    );
  }
  if (!row && !local) {
    return (
      <div className="mx-auto grid max-w-lg gap-3 px-3 pt-3 pb-[calc(11rem+env(safe-area-inset-bottom))]">
        <div className="stage">
          <img src="/canon/street.jpg" alt="" />
          <div className="stage-copy">
            <p className="text-sm text-white">{slow ? "Стіна не відкрилась." : "Відкриваю фото стіни…"}</p>
          </div>
        </div>
        {slow ? <Link to="/map" className="grid h-11 place-items-center rounded-full bg-accent text-sm text-bg">До «Поруч»</Link> : null}
      </div>
    );
  }
  if (!row && local) {
    const closed = Boolean(local.confirmedBy || local.rewardOf);
    const photo = shotOf(local, "");
    return (
      <div className="sheet-page">
        {photo ? <img src={photo} alt="" className="sheet-shot" /> : null}
        <p className="sheet-title">{closed ? "Замкнена" : "Чекає другу людину"}</p>
        <p className="sheet-note">{closed ? `${local.creator} намалював. ${local.confirmedBy || "друга людина"} замкнув. Тепер у кожного своя.` : "Вісімка вже на стіні. Жива, поки хтось не підійде ближче ніж 200 м."}</p>
      </div>
    );
  }
  if (!row) return null;
  const mine = Boolean(row.own);
  const metersAway = here ? Math.max(1, Math.round(haversine(here, row) * 1000)) : null;
  if (mine && row.status === "waiting") {
    return (
      <div className="sheet-page">
        {row.photo ? <img src={row.photo} alt="" className="sheet-shot" /> : null}
        <p className="sheet-title">Чекає другу людину</p>
        <p className="sheet-note">Вісімка на стіні. Хтось має підійти ближче ніж 200 м і зняти її зі свого телефона.</p>
        {error ? <p className="sheet-note">{error}</p> : null}
        <button
          type="button"
          className="one-quiet"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void dropBoard({ data: { id: row.id, name: profile.name, personKey: profile.key, device: deviceId() } }).then((result) => {
              setBusy(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setRow({ ...row, status: "gone" });
            });
          }}
        >
          Скасувати мітку
        </button>
      </div>
    );
  }
  if (row.status === "confirmed") {
    const sellId = reward || (row.holds ? row.id : "");
    return (
      <div className="sheet-page">
        {row.photo ? <img src={row.photo} alt="" className="sheet-shot" /> : null}
        <p className="sheet-title">Замкнена</p>
        <p className="sheet-note">{row.creator} намалював. {row.confirmedBy || "друга людина"} замкнув. Тепер у кожного своя.</p>
        {sellId ? <Link to="/exchange" search={{ sell: sellId }} className="chalk-pill">Передати</Link> : null}
      </div>
    );
  }
  if (!mine && row.status === "waiting") {
    const close = metersAway != null && metersAway <= 200 && Boolean(here && !placeFixError(here.accuracy));
    return (
      <div className="sheet-page">
        <img src={row.photo || "/canon/yard-night.jpg"} alt="" className="sheet-shot" />
        <p className="sheet-title">{row.creator} намалював</p>
        <p className="sheet-note">{metersAway != null ? `${metersAway} м · чекає, поки її замкнуть` : "чекає, поки її замкнуть"}</p>
        {!here ? <p className="sheet-note">Без місця підтвердити не можна.</p> : null}
        {here && !close ? <p className="sheet-note">підійти ближче ніж 200 м</p> : null}
        {close ? (
          <ConfirmSteps
            here={here}
            row={row}
            photo={photo}
            busy={busy}
            named={(profile.name ?? "").trim().length >= 2}
            personKey={profile.key}
            onLocate={() => setWatchKey((value) => value + 1)}
            onPhoto={(file) => {
              void compress(file).then((shot) => {
                setPhoto(shot);
                setError("");
              }).catch(() => setError(refusalLine("NO_PHOTO")));
            }}
            onRefuse={(line) => setError(line)}
            onConfirm={() => {
              if (!photo) {
                setError(refusalLine("NO_PHOTO"));
                return;
              }
              if (!navigator.geolocation) {
                setError("Без місця підтвердити не можна.");
                return;
              }
              setBusy(true);
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  const fresh = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
                  if (placeFixError(fresh.accuracy) || confirmDistanceError(haversine(fresh, row) * 1000)) {
                    setBusy(false);
                    setError(fresh.accuracy > 65 ? "Місце ще неточне." : "підійти ближче ніж 200 м");
                    return;
                  }
                  void confirmBoard({
                    data: {
                      id: row.id,
                      name: profile.name,
                      lat: fresh.lat,
                      lng: fresh.lng,
                      accuracy: fresh.accuracy,
                      photo,
                      device: deviceId(),
                      personKey: profile.key,
                    },
                  }).then((result) => {
                    setBusy(false);
                    if (!result.ok) {
                      setError(result.error === "NO_GPS" ? "Без місця підтвердити не можна." : refusalLine(result.error));
                      return;
                    }
                    const credited = creditBoard(result.row, result.rewardId);
                    if (!credited.ok) {
                      setError(credited.error);
                      return;
                    }
                    revealKeyOnce();
                    setRow({ ...result.row, events: row.events, own: false, confirmedBy: result.row.confirmedBy || profile.name });
                    setReward(result.rewardId);
                  }).catch(() => {
                    setBusy(false);
                    setError("Не зарахувалось. Спробуй ще раз з цього місця.");
                  });
                },
                () => {
                  setBusy(false);
                  setError("Без місця підтвердити не можна.");
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
              );
            }}
          />
        ) : null}
        {error ? <p className="sheet-note">{error}</p> : null}
      </div>
    );
  }
  return (
    <div className="sheet-page">
      {row.photo ? <img src={row.photo} alt="" className="sheet-shot" /> : null}
      <p className="sheet-title">{row.status === "gone" ? "Прибрана" : eightNo(row.id)}</p>
      <p className="sheet-note">{row.status === "gone" ? "З «Поруч» її вже немає." : row.city}</p>
    </div>
  );
}

const LIFE_EVENT: Record<string, string> = {
  created: "Чернетка",
  placed: "Поставлена на стіну",
  submitted: "Поставлена на стіну",
  verification_requested: "Запит на підтвердження",
  verified: "Підтверджена",
  activated: "Активна",
  transfer: "Передана",
  archived: "Прибрана",
  observation: "Нотатка",
};

function Folio({ src, alt, title, sub }: { src: string; alt: string; title: string; sub: string }) {
  return (
    <figure className="folio">
      <img src={src} alt={alt} />
      <figcaption className="folio-cap">
        <p className="text-h2 text-white">{title}</p>
        <p className="text-sm text-white/80">{sub}</p>
      </figcaption>
    </figure>
  );
}

function ServerRail({ events }: { events: BoardEvent[] }) {
  return (
    <section className="grid gap-3">
      <p className="text-meta text-muted">Що сталося</p>
      {events.length === 0 ? (
        <p className="text-sm text-muted">Подій ще немає.</p>
      ) : (
        <ol className="rail">
          {events.map((event) => (
            <li key={event.id}>
              <p className="text-sm">{LIFE_EVENT[event.kind] ?? event.kind}</p>
              <p className="text-meta text-muted">
                {event.at.slice(0, 16).replace("T", " ")}
                {event.by ? ` · ${event.by}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
function Rail({ entry, distance }: { entry: Eight; distance: number | null }) {
  const events = entry.history.filter((event) => LIFE_EVENT[event.kind]);
  return (
    <section className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-meta text-muted">{lifeLabel(lifeOf(entry))}</p>
        {distance != null ? <p className="text-meta text-muted">{distance} м</p> : null}
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-muted">Подій ще немає.</p>
      ) : (
        <ol className="rail">
          {events.map((event) => (
            <li key={event.id}>
              <p className="text-sm">{LIFE_EVENT[event.kind]}</p>
              <p className="text-meta text-muted">
                {event.at.slice(0, 16).replace("T", " ")}
                {event.by ? ` · ${event.by}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
function shotOf(entry: Eight, fallback: string) {
  const file = entry.media?.find((item) => item.kind === "image" && item.preview);
  return file?.preview || entry.shot || fallback || "";
}

function Passport({ entry, photo, distance }: { entry: Eight; photo: string; distance: number | null }) {
  return (
    <section className="grid gap-4">
      {photo ? <Folio src={photo} alt="Знак на стіні" title={eightNo(entry.id)} sub={`${entry.city}, ${entry.country}`} /> : (
        <div>
          <h2 className="text-h2">{eightNo(entry.id)}</h2>
          <p className="text-sm text-muted">{entry.city}, {entry.country}</p>
        </div>
      )}
      <p className="text-sm">{entry.confirmedBy ? `Підтвердив ${entry.confirmedBy}.` : "Ще ніхто не підтвердив."}</p>
      <Rail entry={entry} distance={distance} />
    </section>
  );
}

function tell(row: BoardEight, done?: (text: string) => void) {
  const hint = row.story.startsWith("Намальована") ? "" : row.story;
  const text = hint
    ? `${eightNo(row.id)} у ${row.city}. Шукай так: ${hint}. Номер не змінюється. Підтвердити можна лише біля стіни.`
    : `${eightNo(row.id)} у ${row.city}. Номер не змінюється. Підтвердити можна лише біля стіни.`;
  const url = `${location.origin}/open/${row.id}`;
  if (navigator.share) {
    void navigator.share({ title: eightNo(row.id), text, url }).catch(() => undefined);
    return;
  }
  void navigator.clipboard.writeText(`${text}\n${url}`).then(() => done?.("Номер скопійовано. Надішли його тому, хто прийде.")).catch(() => done?.("Не вдалося скопіювати."));
}

function Dock({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(4.15rem+env(safe-area-inset-bottom))] z-nav mx-auto grid max-w-lg grid-cols-2 gap-2 border-t border-line bg-bg/95 px-3 py-2 backdrop-blur">
      {children}
    </div>
  );
}

function PresenceBox({ id, personKey, initial }: { id: string; personKey?: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [note, setNote] = useState(initial ? "Видно 8 годин." : "");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-2 rounded-control border border-line p-3"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void setPresence({ data: { id, personKey, text } }).then((result) => {
          setBusy(false);
          setNote(result.ok ? (text.trim() ? "Видно 8 годин." : "Прибрано.") : result.error);
        }).catch(() => {
          setBusy(false);
          setNote("Не записалось. Спробуй ще.");
        });
      }}
    >
      <label className="grid gap-1 text-sm">
        <span className="text-meta text-muted">Буду біля стіни</span>
        <input value={text} maxLength={80} onChange={(event) => setText(event.target.value)} placeholder="сьогодні після 19:00" className="h-11 rounded-control border border-line bg-transparent px-3" />
      </label>
      <button type="submit" disabled={busy} className="h-11 rounded-full bg-accent text-sm text-bg">{text.trim() ? "Сказати" : "Прибрати"}</button>
      {note ? <p className="text-meta text-muted">{note}</p> : null}
    </form>
  );
}

function minutesAgo(iso: string) {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} хв`;
  return `${Math.max(1, Math.round(min / 60))} год`;
}

function ConfirmSteps({
  here,
  row,
  photo,
  busy,
  named,
  personKey,
  onLocate,
  onPhoto,
  onRefuse,
  onConfirm,
}: {
  here: { lat: number; lng: number; accuracy: number } | null;
  row: BoardEight;
  photo: string;
  busy: boolean;
  named: boolean;
  personKey?: string;
  onLocate: () => void;
  onPhoto: (file: File) => void;
  onRefuse: (line: string) => void;
  onConfirm: () => void;
}) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    let stop = false;
    void confirmQuota({ data: { personKey } }).then((quota) => {
      if (!stop) setLeft(quota.left);
    }).catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [personKey]);
  const meters = here ? Math.max(1, Math.round(haversine(here, row) * 1000)) : null;
  const tooFar = meters != null && Boolean(confirmDistanceError(meters));
  const rough = here ? placeFixError(here.accuracy) : "";
  const spent = left === 0;
  const block = !named
    ? "NO_NAME"
    : spent
      ? "DAY_LIMIT"
      : meters == null
        ? "NO_GPS"
        : tooFar
          ? "TOO_FAR"
          : rough
            ? "GPS_COARSE"
            : photo
              ? ""
              : "NO_PHOTO";
  if (block && block !== "NO_PHOTO") return <p className="sheet-note">{refusalLine(block)}</p>;
  if (!photo) {
    return (
      <label className="chalk-pill">
        Підтвердити
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPhoto(file);
          }}
        />
      </label>
    );
  }
  return (
    <button type="button" className="chalk-pill" disabled={busy} onClick={onConfirm}>
      {busy ? "Зараховую…" : "Підтвердити"}
    </button>
  );
}
