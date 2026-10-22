import { createFileRoute, Link, notFound, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, QrCode, Send, Share2 } from "lucide-react";
import { launchLive, type LaunchLive } from "@/lib/orbit/launch";
import { useOrbits } from "@/lib/orbit/store";

/** 18: жива сторінка запуску для посилань: відкривається в браузері, без встановлення. Коду на сторінці немає. */
export const Route = createFileRoute("/l/$cr")({
  validateSearch: (search: Record<string, unknown>) => search as { c?: string | number },
  loaderDeps: ({ search }) => ({ c: search.c === undefined || search.c === null ? "" : String(search.c) }),
  // L1: невідомий slug або старе /l/<id заявки> → 404 (сторінка «не знайдено»).
  loader: async ({ params, deps }) => {
    const d = await launchLive({ data: { cr: params.cr, c: deps.c } });
    if (!d.found) throw notFound();
    return d;
  },
  notFoundComponent: LaunchMissing,
  head: ({ loaderData }) => {
    const d = loaderData;
    const title = d?.found && d.who ? `Запуск ${d.who} · ${d.n} з ${d.need}` : "Орбіти — запускаємо разом";
    const description = d?.found ? "Живий запуск орбіти: потрібне одне підтвердження від іншої людини і 24 години заряду. Відкрий — і підтверди." : "Вісім мільйонів рівних орбіт. Запускаємо разом.";
    return {
      meta: [
        { title: `${title} — Орбіти` },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: `${d?.origin ?? ""}/og-launch.png` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "robots", content: "noindex" },
        { name: "theme-color", content: "#05060a" },
      ],
    };
  },
  component: LaunchPage,
});

/**
 * L1: старі посилання /l/<id заявки> більше не відкриваються для всіх. Якщо це запуск самої людини
 * (сервер дав їй slug у mine.links лише для власних заявок), перенаправляємо її на нове посилання.
 */
function LaunchMissing() {
  const params = useParams({ strict: false }) as { cr?: string };
  const cr = params.cr ?? "";
  const slug = useOrbits((state) => (cr.startsWith("c-") ? state.mine?.links?.[cr] : undefined));
  const navigate = useNavigate();
  const [looked, setLooked] = useState(false);
  useEffect(() => {
    if (!cr.startsWith("c-") || looked) return;
    setLooked(true);
    void useOrbits.getState().refresh().catch(() => undefined);
  }, [cr, looked]);
  useEffect(() => {
    if (!slug) return;
    const c = new URLSearchParams(window.location.search).get("c");
    void navigate({ to: "/l/$cr", params: { cr: slug }, search: c ? { c } : {}, replace: true });
  }, [slug, navigate]);
  return (
    <main className="lp" aria-labelledby="lp-title">
      <div className="lp-card">
        <h1 id="lp-title" className="lp-title">Запуск не знайдено</h1>
        <p className="lp-sub">Можливо, посилання неповне або запуск уже давно завершився.</p>
        <Link to="/" className="lp-go">Відкрити Орбіти</Link>
      </div>
    </main>
  );
}

const STATUS: Record<string, string> = { collecting: "Збираємо екіпаж", charging: "Заряджається", done: "Орбіта народилась", failed: "Цього разу не вийшло" };

function LaunchPage() {
  const first = Route.useLoaderData();
  const { cr } = Route.useParams();
  const search = Route.useSearch();
  const code = String(search.c ?? "").replace(/\D/g, "").slice(0, 6);
  const [d, setD] = useState<LaunchLive>(first);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(first.now);
  // Публічне посилання — без коду. Код іде лише в те посилання, яке автор надіслав сам.
  const pageUrl = `${d.origin}/l/${cr}`;
  const shareText = d.who ? `Підтверди запуск орбіти ${d.who}: уже ${d.n} з ${d.need}!` : "Орбіти — запускаємо разом";

  useEffect(() => {
    if (!first.found || first.status === "done" || first.status === "failed") return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void launchLive({ data: { cr, c: code } }).then((next) => next.found && setD(next)).catch(() => undefined);
    }, 5000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(id);
      window.clearInterval(tick);
    };
  }, [cr, code, first.found, first.status]);

  const ring = useMemo(() => Array.from({ length: d.need }, (_, i) => i < d.n), [d.n, d.need]);

  if (!d.found) {
    return (
      <main className="lp" aria-labelledby="lp-title">
        <div className="lp-card">
          <h1 id="lp-title" className="lp-title">Запуск не знайдено</h1>
          <p className="lp-sub">Можливо, посилання неповне або запуск уже давно завершився.</p>
          <Link to="/" className="lp-go">Відкрити Орбіти</Link>
        </div>
      </main>
    );
  }
  const left = d.chargeEndsAt ? Math.max(0, d.chargeEndsAt - now) : 0;
  return (
    <main className="lp" aria-labelledby="lp-title">
      <div className="lp-card">
        <p className="lp-kicker">{STATUS[d.status ?? "collecting"]}</p>
        <h1 id="lp-title" className="lp-title">Запуск {d.who}</h1>
        <div className="lp-ring" role="img" aria-label={`${d.n} з ${d.need} підтверджень`}>
          {ring.map((on, i) => <i key={i} data-on={on ? "1" : "0"} style={{ transform: `rotate(${i * (360 / d.need)}deg) translateY(-78px)` }} />)}
          <div className="lp-count" aria-live="polite"><b>{d.n}</b><span>з {d.need}</span></div>
        </div>
        {d.status === "charging" ? <p className="lp-sub">Екіпаж зібрано. Заряд ще {Math.floor(left / 3_600_000)} год {Math.floor((left % 3_600_000) / 60_000)} хв.</p> : null}
        {d.status === "done" && d.orbit ? <p className="lp-sub">Орбіта № {String(d.orbit).padStart(6, "0").replace(/(\d{3})(?=\d)/g, "$1 ")} з 8 000 000.</p> : null}

        {d.names.length ? (
          <section aria-labelledby="lp-crew" className="lp-crew">
            <h2 id="lp-crew">Екіпаж</h2>
            <ul>{d.names.map((name, i) => <li key={i}><span aria-hidden>{name.slice(0, 1)}</span>{name}</li>)}</ul>
          </section>
        ) : (
          <p className="lp-sub">Ще ніхто не підтвердив — стань першим.</p>
        )}

        {d.status === "collecting" ? (
          d.codeLive ? (
            <a className="lp-go" href={`/?c=${code}`}><Check size={18} aria-hidden /> Підтвердити запуск</a>
          ) : (
            <p className="lp-note">Щоб підтвердити, попроси в {d.who} свіжий код з 6 цифр — він діє 10 хвилин.{code ? " Код у цьому посиланні вже згас." : ""}</p>
          )
        ) : null}

        <div className="lp-share">
          <a className="lp-tg" href={`https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer"><Send size={17} aria-hidden /> Поділитися в Telegram</a>
          <button
            type="button"
            className="lp-mini"
            onClick={async () => {
              if (navigator.share) {
                await navigator.share({ title: "Орбіти", text: shareText, url: pageUrl }).catch(() => undefined);
                return;
              }
              await navigator.clipboard?.writeText(pageUrl).then(() => setCopied(true)).catch(() => undefined);
            }}
          >
            {copied ? <Copy size={16} aria-hidden /> : <Share2 size={16} aria-hidden />} {copied ? "Скопійовано" : "Інше"}
          </button>
          <button
            type="button"
            className="lp-mini"
            aria-expanded={Boolean(qr)}
            onClick={async () => {
              if (qr) return setQr("");
              const mod = await import("qrcode");
              setQr(await mod.toString(pageUrl, { type: "svg", margin: 1, color: { dark: "#05060a", light: "#ebe6dc" } }));
            }}
          >
            <QrCode size={16} aria-hidden /> QR
          </button>
        </div>
        {qr ? <img className="lp-qr" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} alt="QR-код сторінки запуску" width={200} height={200} /> : null}
        <p className="lp-foot">Без встановлення. <Link to="/">Що таке Орбіти?</Link> Іскри ✦ — внутрішні одиниці, не гроші.</p>
      </div>
    </main>
  );
}
