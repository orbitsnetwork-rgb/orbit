import { Check, Copy, Link2, QrCode, Send, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CODE_MS } from "@/lib/orbit/engine";
import { buzz, canShare, copyText, shareSheet } from "@/lib/orbit/feel";
import { groupCode, inviteLink } from "@/lib/orbit/invite";

function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function clock(ms: number) {
  return new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(ms);
}

/** Кругова шкала 10 хв навколо таймера. */
function Countdown({ leftMs }: { leftMs: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, Math.max(0, leftMs / CODE_MS));
  const low = leftMs < 60_000;
  const mins = Math.max(1, Math.ceil(leftMs / 60_000));
  return (
    <div className="cs-ring" data-low={low ? "1" : "0"} role="timer" aria-label={low ? "Код згасає менш ніж за хвилину" : `Код діє ще ${mins} хв`}>
      <svg viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r={r} className="cs-ring-track" />
        <circle cx="32" cy="32" r={r} className="cs-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <span aria-hidden>{mmss(leftMs)}</span>
    </div>
  );
}

type Said = { text: string; tone: "ok" | "warn" } | null;

/** Живий код: велико, таймер, «Поділитися», посилання, QR. */
export function CodeShare({ code, expires, now, cr }: { code: string; expires: number; now: number; cr?: string }) {
  const leftMs = Math.max(0, expires - now);
  const link = inviteLink(code);
  const [said, setSaid] = useState<Said>(null);
  const [done, setDone] = useState<"" | "link" | "code">("");
  const [qr, setQr] = useState(false);
  const [svg, setSvg] = useState("");
  const [native, setNative] = useState(false);
  const shown = useRef(code);
  useEffect(() => setNative(canShare({ title: "Орбіти", text: "код", url: "https://example.com" })), []);
  useEffect(() => {
    if (shown.current !== code) {
      shown.current = code;
      setSvg("");
      setSaid(null);
    }
  }, [code]);
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setDone(""), 1800);
    return () => window.clearTimeout(id);
  }, [done]);
  useEffect(() => {
    if (!qr || svg) return;
    let alive = true;
    void import("qrcode")
      .then((lib) => lib.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0a0c14", light: "#f2f1ec" } }))
      .then((out) => {
        if (alive) setSvg(out);
      })
      .catch(() => {
        if (alive) setSaid({ text: "QR не вийшов. Поділися посиланням або продиктуй код.", tone: "warn" });
      });
    return () => {
      alive = false;
    };
  }, [qr, svg, link]);

  const message = `Підтверди мій запуск в Орбітах. Код ${groupCode(code)} діє до ${clock(expires)}.`;

  async function copy(kind: "link" | "code") {
    const ok = await copyText(kind === "link" ? link : code);
    if (ok) {
      buzz(10);
      setDone(kind);
      setSaid({ text: kind === "link" ? "Посилання скопійовано. Воно відкриє «Запуск» з уже введеним кодом." : "Код скопійовано.", tone: "ok" });
    } else {
      setSaid({ text: "Не вдалося скопіювати. Продиктуй код або покажи QR.", tone: "warn" });
    }
  }

  const low = leftMs < 60_000;
  return (
    <div className="cs-live">
      <div className="cs-head">
        <div>
          <p className="cs-label">Код підтвердження</p>
          <p className="cs-code" aria-label={`Код ${code.split("").join(" ")}`}>
            {groupCode(code)}
          </p>
          <p className="cs-left" data-low={low ? "1" : "0"}>
            {low ? "Код ось-ось згасне" : `Діє до ${clock(expires)}`}
          </p>
        </div>
        <Countdown leftMs={leftMs} />
      </div>
      <p className="cs-how">Покажи код або надішли посилання: воно відкриє «Запуск» з уже введеним кодом — лишиться натиснути «Підтвердити».</p>
      {cr ? (
        <a
          className="cs-share cs-tg"
          href={`https://t.me/share/url?url=${encodeURIComponent(link.replace(/\/\?c=/, `/l/${cr}?c=`))}&text=${encodeURIComponent(`Підтверди мій запуск в Орбітах. Код діє до ${clock(expires)}.`)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Send size={18} strokeWidth={1.9} aria-hidden /> Надіслати в Telegram
        </a>
      ) : null}
      <button
        type="button"
        className="cs-share"
        onClick={async () => {
          const result = await shareSheet({ title: "Орбіти — підтверди запуск", text: message, url: link });
          if (result === true) buzz(10);
          if (result === null) await copy("link");
        }}
      >
        <Share2 size={18} strokeWidth={1.9} aria-hidden />
        {native ? "Поділитися посиланням" : "Скопіювати посилання"}
      </button>
      <div className="cs-row">
        <button type="button" className="cs-mini" data-done={done === "link" ? "1" : "0"} onClick={() => void copy("link")}>
          {done === "link" ? <Check size={16} strokeWidth={2.2} aria-hidden /> : <Link2 size={16} strokeWidth={1.8} aria-hidden />}
          {done === "link" ? "Готово" : "Посилання"}
        </button>
        <button type="button" className="cs-mini" data-done={done === "code" ? "1" : "0"} onClick={() => void copy("code")}>
          {done === "code" ? <Check size={16} strokeWidth={2.2} aria-hidden /> : <Copy size={16} strokeWidth={1.8} aria-hidden />}
          {done === "code" ? "Готово" : "Код"}
        </button>
        <button type="button" className="cs-mini" aria-expanded={qr} aria-controls="cs-qr" aria-label={qr ? "Сховати QR-код" : "Показати QR-код"} data-done={qr ? "1" : "0"} onClick={() => setQr((on) => !on)}>
          <QrCode size={16} strokeWidth={1.8} aria-hidden />
          QR
        </button>
      </div>
      {qr ? (
        <div className="cs-qr" id="cs-qr">
          {svg ? (
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={`QR-код: посилання на підтвердження з кодом ${groupCode(code)}`} width={208} height={208} />
          ) : (
            <span className="cs-qr-wait" aria-label="Готуємо QR" />
          )}
          <p>Наведи камеру телефона учасника на QR. Код підставиться сам, підтвердження — кнопкою.</p>
        </div>
      ) : null}
      <p className="cs-said" data-tone={said?.tone ?? "none"} role="status" aria-live="polite">
        {said?.text ?? ""}
      </p>
    </div>
  );
}
