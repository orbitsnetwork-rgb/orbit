import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Activity, ArrowRightLeft, MapPin, UserRound } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { EightMark } from "@/components/mark";
import { Welcome } from "@/components/join";
import { freshKey, KeyOnce, revealKeyOnce } from "@/components/key-once";
import { Toast } from "@/components/ui";
import { forgetBoard, loadBoard, listMarket, myWalks, publishBoard } from "@/lib/board";
import { warmApp } from "@/lib/prime";
import { onLive } from "@/lib/live";
import { cn } from "@/lib/cn";
import { deviceId } from "@/lib/device";
import { archiveEvents, norm } from "@/lib/model";
import { setSoundOn } from "@/lib/sound";
import { useAtlas } from "@/lib/store";
import { readVault, saveVault } from "@/lib/vault";

const Intro = lazy(() => import("@/components/intro").then((mod) => ({ default: mod.Intro })));

const NAV = [
  { to: "/activity", label: "Стрічка", icon: Activity },
  { to: "/map", label: "Поруч", icon: MapPin },
  { to: "/profile", label: "Профіль", icon: UserRound },
] as const;

function pingOnce(key: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const raw = localStorage.getItem("vosma-told");
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    if (!Array.isArray(seen) || seen.includes(key)) return;
    localStorage.setItem("vosma-told", JSON.stringify([...seen, key].slice(-40)));
    new Notification("8", { body, silent: true });
  } catch {
    /* браузер може заборонити сповіщення */
  }
}

function place(path: string) {
  if (path.startsWith("/open/") || path.startsWith("/e/")) return 9;
  if (path.startsWith("/talk")) return 7;
  const order = ["/activity", "/map", "/create", "/exchange", "/profile"];
  const index = order.indexOf(path);
  return index === -1 ? 6 : index;
}

type OpenPhase = "welcome" | "app";

function readOpen(): OpenPhase {
  if (typeof window === "undefined") return "welcome";
  try {
    if (sessionStorage.getItem("vosma-gap") === "1") return "app";
  } catch {
    /* приватний режим */
  }
  return "welcome";
}

function isOn(path: string, to: string) {
  if (to === "/map") return path === "/map" || path.startsWith("/e/") || path.startsWith("/open/");
  if (to === "/exchange") return path === "/exchange";
  if (to === "/") return path === "/";
  return path === to;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const router = useRouter();
  const profile = useAtlas((state) => state.profile);
  const toast = useAtlas((state) => state.toast);
  const dismiss = useAtlas((state) => state.dismissToast);
  const setHydrated = useAtlas((state) => state.setHydrated);
  const sound = useAtlas((state) => state.sound);
  const hydrated = useAtlas((state) => state.hydrated);
  const glow = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const scrollAt = useRef(new Map<string, number>());
  const prevPath = useRef(path);
  const [dir, setDir] = useState("screen-in");
  const [intro, setIntro] = useState(false);
  const [phase, setPhase] = useState<OpenPhase>("welcome");
  const phaseRef = useRef(phase);
  const [keyOnce, setKeyOnce] = useState<{ key: string; recovery: string } | null>(null);
  const [canSell, setCanSell] = useState(false);

  useEffect(() => {
    const cap = window.setTimeout(() => setHydrated(true), 1500);
    void Promise.resolve(useAtlas.persist.rehydrate()).finally(() => {
      window.clearTimeout(cap);
      setHydrated(true);
    });
    return () => window.clearTimeout(cap);
  }, [setHydrated]);

  useEffect(() => {
    setSoundOn(sound);
  }, [sound]);

  useEffect(() => {
    const routes = ["/map", "/activity", "/exchange", "/profile", "/create"] as const;
    for (const to of routes) void router.preloadRoute({ to });
  }, [router]);

  useEffect(() => {
    if (!hydrated) return;
    let stop = false;
    void (async () => {
      const name = useAtlas.getState().profile.name;
      try {
        const rows = await loadBoard(name, useAtlas.getState().profile.key ?? "");
        if (stop) return;
        const known = new Set(rows.map((row) => row.id));
        let published = false;
        for (const entry of useAtlas.getState().eights) {
          if (known.has(entry.id) || entry.example || entry.anchor || entry.rewardOf || entry.confirmedBy || entry.archivedAt) continue;
          if (norm(entry.creator) !== norm(name) || name.trim().length < 2) continue;
          const photo = entry.media?.find((file) => file.preview?.startsWith("data:image/"))?.preview;
          if (!photo) continue;
          const sent = await publishBoard({
            data: {
              id: entry.id,
              city: entry.city,
              country: entry.country,
              lat: entry.lat,
              lng: entry.lng,
              creator: entry.creator,
              story: entry.story,
              photo,
              device: deviceId(),
              personKey: useAtlas.getState().profile.key,
            },
          });
          if (sent.ok) published = true;
          if (!sent.ok && sent.error.includes("прибрано")) {
            useAtlas.setState((state) => ({
              eights: state.eights.map((item) => (item.id === entry.id ? archiveEvents(item, item.creator, new Date().toISOString()) : item)),
            }));
          }
        }
        const fresh = published ? await (forgetBoard(), loadBoard(name, useAtlas.getState().profile.key ?? "")) : rows;
        if (stop) return;
        for (const row of fresh) {
          const had = useAtlas.getState().eights.some((entry) => entry.id === row.id && entry.confirmedBy);
          useAtlas.getState().adoptBoard(row);
          if (row.status !== "confirmed") continue;
          useAtlas.getState().creditBoard(row);
          if (!had && row.confirmedBy && norm(row.creator) === norm(name) && norm(row.confirmedBy) !== norm(name)) {
            pingOnce(`yes:${row.id}`, `${row.confirmedBy} підтвердив твою 8 у ${row.city}.`);
            revealKeyOnce();
          }
        }
      } catch {
        /* спільний список може бути недоступний, локальні 8 лишаються */
      }
    })();
    return () => {
      stop = true;
    };
  }, [hydrated, profile.name]);

  useEffect(() => {
    const name = (profile.name ?? "").trim();
    if (!hydrated || name.length < 2) return;
    let stop = false;
    let primed = false;
    const known = new Set<string>();
    const tick = () => {
      void loadBoard(name, useAtlas.getState().profile.key ?? "").then((rows) => {
        if (stop) return;
        for (const row of rows) {
          if (row.status !== "confirmed" || !row.confirmedBy) continue;
          if (norm(row.creator) !== norm(name) || norm(row.confirmedBy) === norm(name)) continue;
          if (primed && !known.has(row.id)) {
            useAtlas.getState().adoptBoard(row);
            useAtlas.getState().creditBoard(row);
            useAtlas.setState({ toast: `${row.confirmedBy} підтвердив твою 8 у ${row.city}.` });
            pingOnce(`yes:${row.id}`, `${row.confirmedBy} підтвердив твою 8 у ${row.city}.`);
            revealKeyOnce();
          }
          known.add(row.id);
        }
        primed = true;
      }).catch(() => undefined);
    };
    tick();
    const stopLive = onLive(25_000, tick);
    return () => {
      stop = true;
      stopLive();
    };
  }, [hydrated, profile.name]);

  useEffect(() => {
    if (!hydrated || (profile.name ?? "").trim().length < 2) return;
    let stop = false;
    const tick = () => {
      void listMarket({ data: { name: profile.name, personKey: profile.key } }).then((book) => {
        if (!stop) setCanSell(book.mine.length > 0);
      }).catch(() => undefined);
    };
    tick();
    const stopLive = onLive(20_000, tick);
    return () => {
      stop = true;
      stopLive();
    };
  }, [hydrated, profile.name, profile.key]);

  useEffect(() => {
    const name = (profile.name ?? "").trim();
    if (!hydrated || name.length < 2) return;
    let stop = false;
    const seen = new Set<string>();
    let primed = false;
    const tick = () => {
      void myWalks({ data: name }).then((rows) => {
        if (stop) return;
        for (const row of rows) {
          const key = `${row.id}:${row.name}`;
          if (primed && !seen.has(key)) {
            useAtlas.setState({ toast: `${row.name} іде до твоєї стіни в ${row.city}.` });
            pingOnce(`walk:${key}`, `${row.name} іде до твоєї стіни в ${row.city}.`);
          }
          seen.add(key);
        }
        primed = true;
      }).catch(() => undefined);
    };
    tick();
    const stopWalks = onLive(20_000, tick);
    return () => {
      stop = true;
      stopWalks();
    };
  }, [hydrated, profile.name]);

  function go(next: OpenPhase) {
    const rank: Record<OpenPhase, number> = { welcome: 0, app: 1 };
    if (rank[next] < rank[phaseRef.current]) return;
    phaseRef.current = next;
    if (next === "app") {
      try {
        sessionStorage.setItem("vosma-open", "app");
        document.documentElement.dataset.open = "app";
      } catch {
        /* приватний режим */
      }
      window.dispatchEvent(new Event("vosma-open"));
    }
    setPhase(next);
  }

  useEffect(() => {
    let cancel = false;
    if (readOpen() === "app") go("app");
    void (async () => {
      try {
        const stored = await readVault();
        if (cancel) return;
        if (stored?.key) {
          useAtlas.getState().setProfile({ key: stored.key, ...(stored.recovery ? { recovery: stored.recovery } : {}) });
          go("app");
        } else {
          try {
            const raw = localStorage.getItem("vosma-registry-v1");
            const parsed = raw ? (JSON.parse(raw) as { state?: { profile?: { key?: string; recovery?: string } } }) : null;
            const legacy = parsed?.state?.profile;
            if (legacy?.key) {
              await saveVault(legacy.key, legacy.recovery ?? "");
              if (!cancel) {
                useAtlas.getState().setProfile({ key: legacy.key, ...(legacy.recovery ? { recovery: legacy.recovery } : {}) });
                go("app");
              }
            }
          } catch {
            /* старий запис не читається */
          }
        }
        const state = useAtlas.getState();
        // 12: Орбіти («/», «/l/…») не використовують старий «Поруч» — не тягнемо 640 КБ фото й зайві запити.
        const orbitPath = window.location.pathname === "/" || window.location.pathname.startsWith("/l/");
        if (!orbitPath) void warmApp(state.profile.key ?? "", state.profile.name ?? "");
      } catch {
        /* ключ прочитається пізніше, екран не відкочуємо */
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const show = () => setKeyOnce(freshKey());
    show();
    window.addEventListener("vosma-key", show);
    return () => window.removeEventListener("vosma-key", show);
  }, [hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismiss, 3200);
    return () => window.clearTimeout(timer);
  }, [toast, dismiss]);

  useEffect(() => {
    const node = slot.current;
    if (prevPath.current === path) return;
    const forward = place(path) >= place(prevPath.current);
    prevPath.current = path;
    setDir(forward ? "screen-forward" : "screen-back");
    if (node) node.scrollTop = scrollAt.current.get(path) ?? 0;
  }, [path]);

  useEffect(() => {
    const node = slot.current;
    return () => {
      if (node) scrollAt.current.set(path, node.scrollTop);
    };
  }, [path]);

  useEffect(() => {
    const node = glow.current;
    if (!node || !window.matchMedia("(hover: hover) and (min-width: 1024px)").matches) return;
    const move = (event: PointerEvent) => {
      node.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  const finishIntro = () => {
    sessionStorage.setItem("vosma-intro-7", "1");
    setIntro(false);
    if (!useAtlas.getState().profile.key) go("welcome");
  };

  function closeGap(id: string | null, draw?: boolean) {
    try {
      sessionStorage.setItem("vosma-gap", "1");
    } catch {
      /* приватний режим */
    }
    go("app");
    if (id) void router.navigate({ to: "/open/$id", params: { id } });
    else if (draw) void router.navigate({ to: "/create" });
    else void router.navigate({ to: "/map" });
  }

  function finishKey() {
    setKeyOnce(null);
    go("app");
    const to = sessionStorage.getItem("vosma-after-reg");
    sessionStorage.removeItem("vosma-after-reg");
    if (to === "/create" || to === "/map") void router.navigate({ to });
  }

  if (path === "/" || path.startsWith("/l/")) return <div className="min-h-dvh">{children}</div>;

  return (
    <div className="min-h-dvh bg-transparent text-fg lg:flex">
      <div className="grain" aria-hidden />
      <div ref={glow} className="cursor-glow" />
      <aside className="hidden h-dvh w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-bg px-3 py-5 lg:flex">
        <Link to="/activity" className="grid justify-items-start gap-2 px-3">
          <EightMark mode="hero" className="h-14 w-10" />
          <div className="text-sm tracking-brand text-silver">ВОСЬМА</div>
          <p className="text-xs leading-5 text-muted">Реальні дії. Реальні люди. Реальний світ.</p>
        </Link>
        <nav className="grid gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = isOn(path, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "btn-press flex h-11 items-center gap-3 rounded-xl px-3 text-sm",
                  on ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg",
                )}
              >
                <Icon size={18} strokeWidth={1.5} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          {canSell ? (
            <Link
              to="/exchange"
              search={{ sell: undefined }}
              className={cn(
                "btn-press flex h-11 items-center gap-3 rounded-xl px-3 text-sm",
                path === "/exchange" ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg",
              )}
            >
              <ArrowRightLeft size={18} strokeWidth={1.5} />
              <span>Ринок</span>
            </Link>
          ) : null}
        </nav>
        <Link to="/profile" className="glass mt-auto rounded-2xl px-3 py-3">
          <div className="text-xs text-muted">У протоколі</div>
          <div className="truncate text-sm">{profile.name || "Ім'я не задане"}</div>
        </Link>
      </aside>
      <div className="relative min-h-dvh min-w-0 flex-1">
        <div ref={slot} className="screen-slot h-dvh overflow-y-auto">
          <div key={path} className={`${dir} min-h-full`}>{children}</div>
        </div>
      </div>
      <nav className={phase !== "app" || keyOnce || path.startsWith("/create") ? "app-tabs hidden" : `app-tabs fixed inset-x-0 bottom-0 z-nav grid ${canSell ? "grid-cols-4" : "grid-cols-3"} border-t border-line bg-bg/95 pt-1 backdrop-blur lg:hidden`} style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <Tab to="/activity" label="Стрічка" icon={Activity} path={path} />
        <Tab to="/map" label="Поруч" icon={MapPin} path={path} />
        {canSell ? <Tab to="/exchange" label="Ринок" icon={ArrowRightLeft} path={path} /> : null}
        <Tab to="/profile" label="Профіль" icon={UserRound} path={path} />
      </nav>
      <AnimatePresence>
        {toast ? (
          <motion.div
            key="toast"
            className="fixed bottom-24 left-1/2 z-system -translate-x-1/2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <Toast>{toast}</Toast>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {intro ? (
        <Suspense fallback={null}>
          <Intro onDone={finishIntro} />
        </Suspense>
      ) : null}
      {keyOnce ? (
        <div className="key-lock">
          <KeyOnce secret={keyOnce.key} recovery={keyOnce.recovery} onDone={finishKey} />
        </div>
      ) : null}
      {phase === "welcome" && !keyOnce ? <Welcome onClose={closeGap} /> : null}
    </div>
  );
}

function Tab({
  to,
  label,
  icon: Icon,
  path,
  mark = 0,
}: {
  to: "/map" | "/activity" | "/profile" | "/exchange";
  label: string;
  icon: typeof MapPin;
  path: string;
  mark?: number;
}) {
  const on = isOn(path, to);
  return (
    <Link
      to={to}
      preload="intent"
      onClick={(event) => {
        if (on) event.preventDefault();
      }}
      className={cn("tab-hit relative grid min-w-0 place-items-center gap-0.5 px-1 py-2 text-[11px] leading-none", on ? "text-accent" : "text-muted")}
    >
      <Icon size={18} strokeWidth={1.5} />
      <span className="max-w-full truncate">{label}</span>
      {on ? <span className="tab-dot absolute bottom-1 h-1 w-1 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" /> : null}
      {mark > 0 ? <span className="absolute top-1 right-3 h-1.5 w-1.5 rounded-full bg-accent" /> : null}
    </Link>
  );
}
