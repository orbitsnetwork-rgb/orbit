import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/motion-pref";

export function Intro({ onDone }: { onDone: () => void }) {
  const done = useRef(onDone);
  const finished = useRef(false);
  const reduced = usePrefersReducedMotion();
  done.current = onDone;

  function finish() {
    if (finished.current) return;
    finished.current = true;
    done.current();
  }

  useEffect(() => {
    const backup = window.setTimeout(finish, reduced ? 900 : 6500);
    return () => window.clearTimeout(backup);
  }, [reduced]);

  return (
    <div className="fixed inset-0 z-system bg-black">
      {reduced ? (
        <img src="/canon/chalk.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src="/brand/draw.mp4"
          poster="/canon/chalk.jpg"
          autoPlay
          muted
          playsInline
          onEnded={finish}
        />
      )}
      <button
        type="button"
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-content h-11 rounded-full bg-black/55 px-4 text-sm text-white"
        onClick={finish}
      >
        Увійти
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-8 z-content text-center">
        <p className="text-sm tracking-[0.22em] text-white">
          {"ВОСЬМА".split("").map((letter, index) => (
            <span key={`${letter}${index}`} className="intro-letter" style={reduced ? undefined : { animationDelay: `${4.05 + index * 0.07}s` }}>{letter}</span>
          ))}
        </p>
        <p className="intro-line mt-1 text-xs text-white/70" style={reduced ? undefined : { animationDelay: "4.55s" }}>Намалюй. Хтось прийде.</p>
      </div>
    </div>
  );
}
