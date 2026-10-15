import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { keepPerson } from "@/lib/account";
import { forgetBoard, publishBoard } from "@/lib/board";
import { deviceId } from "@/lib/device";
import { fitJpeg } from "@/lib/image";
import { nearestPlace } from "@/lib/places";
import { awaitFix } from "@/lib/geo";
import { archiveEvents, type ProofFile } from "@/lib/model";
import { useAtlas } from "@/lib/store";

export const Route = createFileRoute("/create")({
  validateSearch: (search: Record<string, unknown>) => {
    const out: { id?: string } = {};
    if (typeof search.id === "string" && search.id) out.id = search.id;
    return out;
  },
  component: CreatePage,
});

function thumbOf(dataUrl: string) {
  return fetch(dataUrl)
    .then((res) => res.blob())
    .then((blob) => fitJpeg(blob, 320, 70_000))
    .catch(() => "");
}

function wallStory(hint: string) {
  const text = hint.trim().slice(0, 120);
  if (text.length >= 8 && !text.startsWith("Намальована")) return text;
  if (!text) return "На стіні.";
  const joined = `${text}. На стіні.`.slice(0, 120);
  return joined.length >= 8 ? joined : "На стіні.";
}

async function jpegOf(dataUrl: string) {
  const blob = await (await fetch(dataUrl)).blob();
  return fitJpeg(blob, 1280, 450_000);
}

function burnId(id: string) {
  const at = new Date().toISOString();
  useAtlas.setState((state) => ({
    eights: state.eights.map((item) => (item.id === id ? archiveEvents(item, item.creator, at) : item)),
  }));
}

function CreatePage() {
  const navigate = useNavigate();
  const profile = useAtlas((state) => state.profile);
  const setProfile = useAtlas((state) => state.setProfile);
  const save = useAtlas((state) => state.saveRecord);
  const named = (profile.name ?? "").trim().length >= 2;
  const [step, setStep] = useState<"sign" | "lens" | "check">(named ? "lens" : "sign");
  const [name, setName] = useState(profile.name ?? "");
  const [phone, setPhone] = useState("+380");
  const [hint, setHint] = useState("");
  const [city, setCity] = useState(profile.city ?? "");
  const [shot, setShot] = useState("");
  const [here, setHere] = useState<{ lat: number; lng: number; city: string; country: string } | null>(null);
  const [cam, setCam] = useState<"ask" | "ok" | "no">("ask");
  const [camTry, setCamTry] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if ((profile.name ?? "").trim().length >= 2 && step === "sign") setStep("lens");
  }, [profile.name, step]);

  useEffect(() => {
    void awaitFix()
      .then((pos) => {
        const near = nearestPlace(pos.lat, pos.lng);
        setHere({
          lat: pos.lat,
          lng: pos.lng,
          city: near?.place.city ?? (useAtlas.getState().profile.city ?? "").trim(),
          country: near?.place.country ?? "",
        });
        if (near?.place.city) setCity(near.place.city);
      })
      .catch(() => setHere(null));
  }, []);

  useEffect(() => {
    if (step !== "lens") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCam("no");
      return;
    }
    let stop = false;
    void navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (stop) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setCam("ok");
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          void video.play().catch(() => undefined);
        }
      })
      .catch(() => {
        if (!stop) setCam("no");
      });
    return () => {
      stop = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [step, camTry]);

  async function sign() {
    const who = name.trim();
    if (who.length < 2 || busy) return;
    setBusy(true);
    setError("");
    try {
      localStorage.setItem("vosma-phone", phone.trim());
    } catch {
      /* приватний режим */
    }
    try {
      const saved = await keepPerson({ data: { key: profile.key, name: who, city: city.trim() } });
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      if (saved.key) setProfile({ name: who, city: city.trim(), key: saved.key, recovery: saved.recovery });
      else setProfile({ name: who, city: city.trim() });
      setStep("lens");
    } catch {
      setError("Запис не дійшов. Спробуй ще.");
    } finally {
      setBusy(false);
    }
  }

  function snap() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setShot(canvas.toDataURL("image/jpeg", 0.86));
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setStep("check");
  }

  async function publish() {
    const who = (useAtlas.getState().profile.name ?? name).trim();
    const personKey = useAtlas.getState().profile.key;
    const place = (here?.city || city).trim();
    if (!personKey) {
      setError("Спочатку підпиши вісімку.");
      setStep("sign");
      return;
    }
    if (!here) {
      setError("Без місця стіну не лишити.");
      return;
    }
    if (place.length < 2) {
      setError("Напиши місто. Без нього стіна не потрапить у реєстр.");
      return;
    }
    if (!shot.startsWith("data:image/")) {
      setError("Потрібне фото цієї стіни.");
      return;
    }
    setBusy(true);
    setError("");
    let photo = shot;
    try {
      photo = await jpegOf(shot);
    } catch {
      setBusy(false);
      setError("Фото стіни не підійшло.");
      return;
    }
    const story = wallStory(hint);
    const media: ProofFile[] = [{ id: "shot", kind: "image", name: "стіна", caption: story, at: new Date().toISOString(), preview: photo }];
    let stuck = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = save({
        kind: "draw",
        city: place,
        country: here.country,
        lat: here.lat,
        lng: here.lng,
        story,
        proof: "Фото знака зроблено на місці. Підтвердження зараховує одну 8 автору і одну тому, хто прийшов.",
        when: new Date().toISOString().slice(0, 10),
        legal: true,
        submit: true,
        media,
      });
      if (!result.ok) {
        setBusy(false);
        setError(result.error);
        return;
      }
      let sent: { ok: true } | { ok: false; error: string };
      try {
        sent = await publishBoard({
          data: {
            id: result.id,
            city: place,
            country: here.country,
            lat: here.lat,
            lng: here.lng,
            creator: who,
            story,
            photo,
            thumb: await thumbOf(photo),
            device: deviceId(),
            personKey,
          },
        });
      } catch {
        sent = { ok: false, error: "Не вдалося показати 8 іншим. Спробуй ще раз." };
      }
      if (sent.ok) {
        setBusy(false);
        forgetBoard();
        try {
          sessionStorage.setItem("vosma-placed", result.id);
        } catch {
          /* приватний режим */
        }
        void navigate({ to: "/open/$id", params: { id: result.id } });
        return;
      }
      const taken = sent.error.includes("прибрано") || sent.error.includes("лише власник");
      burnId(result.id);
      if (!taken) {
        setBusy(false);
        setError(sent.error);
        return;
      }
      stuck = true;
    }
    setBusy(false);
    setError(stuck ? "Номер був зайнятий. Спробуй ще раз." : "Не вдалося лишити. Спробуй ще раз.");
  }

  if (step === "sign") {
    const live = name.trim().length >= 2;
    return (
      <div className="sheet-page">
        <h1 className="sheet-title">Ким підписати вісімку</h1>
        <p className="sheet-note">Так тебе побачать на стіні, коли її замкнуть.</p>
        <label className="sheet-field">
          Ім’я
          <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="nickname" maxLength={40} placeholder="як на стіні" />
        </label>
        <label className="sheet-field">
          Телефон
          <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" maxLength={16} />
        </label>
        <p className="sheet-note">Номер лише щоб друга людина могла підтвердити. Ім’я лишається на стіні.</p>
        {error ? <p className="sheet-note">{error}</p> : null}
        <button type="button" className="chalk-pill" disabled={!live || busy} onClick={() => void sign()}>
          {busy ? "Записую…" : "Підписати й замкнути"}
        </button>
      </div>
    );
  }

  if (step === "lens") {
    if (cam === "no") {
      return (
        <div className="sheet-page">
          <h1 className="sheet-title">Без камери стіну не лишити</h1>
          <p className="sheet-note">Потрібне фото цієї стіни з місця, не картинка з галереї.</p>
          <button type="button" className="chalk-pill" onClick={() => { setCam("ask"); setCamTry((value) => value + 1); }}>Дозволити камеру</button>
        </div>
      );
    }
    return (
      <div className="lens">
        <video ref={videoRef} className="lens-video" playsInline muted autoPlay />
        <p className="lens-hint">Зніми вісімку, яку намалював на стіні.</p>
        <svg className="lens-eight" viewBox="0 0 80 120" aria-hidden>
          <path d="M41 58 C 68 57 76 36 56 22 C 40 10 14 14 15 36 C 16 52 30 58 41 58" fill="none" stroke="#f3f0e8" strokeWidth="3" strokeLinecap="round" />
          <path d="M41 62 C 18 66 8 86 22 104" fill="none" stroke="#f3f0e8" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
        </svg>
        <button type="button" className="lens-shutter" aria-label="Зняти" onClick={snap} />
      </div>
    );
  }

  const place = (here?.city || city).trim();
  return (
    <div className="sheet-page">
      <img src={shot} alt="" className="sheet-shot" />
      <label className="sheet-field">
        Двір або вулиця
        <input value={hint} onChange={(event) => setHint(event.target.value)} maxLength={120} placeholder="можна лишити порожнім" />
      </label>
      {place.length < 2 ? (
        <label className="sheet-field">
          Місто
          <input value={city} onChange={(event) => setCity(event.target.value)} maxLength={40} />
        </label>
      ) : null}
      {error ? <p className="sheet-note">{error}</p> : null}
      <p className="sheet-note">Після цього вона чекає. Сама не замикається.</p>
      <button type="button" className="chalk-pill" disabled={busy} onClick={() => void publish()}>
        {busy ? "Лишаю…" : "Лишити на стіні"}
      </button>
    </div>
  );
}
