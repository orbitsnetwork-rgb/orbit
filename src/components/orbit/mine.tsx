/** Вкладка «Заявка» — окремим чанком (головна не вантажить її код). */
import { orbitNo } from "@/lib/orbit/traits";
import { Avatar } from "@/components/orbit/ui/kit";
import { QrCode, Rocket, ShieldCheck } from "lucide-react";
import { CrewTasks, WitnessRules, LaunchIntro, LaunchStats, LaunchSteps, LiveLaunches, OnlineStrip, PastLaunches } from "@/components/orbit/mine-extras";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { NudgeButton } from "@/components/orbit/nudge";
import { sparkText } from "@/lib/orbit/copy";
import { activeCreation, chanceOf, crewNeed, CHARGE_MS, CODES_PER_DAY, STABILITY_CONFIRM, STABILITY_FAIL, WITNESS_OD, utcDay, type Account, type World } from "@/lib/orbit/engine";
import { useOrbits } from "@/lib/orbit/store";
import { Satellites } from "@/components/orbit/space/satellites";
import { OrbitRings } from "@/components/orbit/space/orbit-rings";
import { dropInvite, INVITE_EVENT, readInvite } from "@/lib/orbit/invite";
import { buzz } from "@/lib/orbit/feel";
import { Notice, left, useWall } from "@/components/orbit/app-bits";

const CodeShareLazy = lazy(() => import("@/components/orbit/code-share").then((m) => ({ default: m.CodeShare })));
function CodeShare(props: React.ComponentProps<typeof CodeShareLazy>) {
  return (
    <Suspense fallback={null}>
      <CodeShareLazy {...props} />
    </Suspense>
  );
}

export function Mine({ world, user }: { world: World; user: Account }) {
  const links = useOrbits((state) => state.mine?.links);
  const qrNow = useOrbits((state) => state.mine?.qr);
  const creation = activeCreation(world, user.id);
  const wall = useWall(world.now);
  const tail = (
    <>
      <LaunchStats world={world} user={user} creation={creation ?? null} />
      <LiveLaunches world={world} user={user} />
      <OnlineStrip world={world} userId={user.id} />
      <PastLaunches world={world} user={user} />
    </>
  );
  if (creation?.status === "charging" && creation.chargeStartedAt) {
    const readyAt = creation.chargeStartedAt + CHARGE_MS;
    const chance = Math.round(chanceOf(world.orbits.length) * 100);
    const elapsed = Math.min(1, Math.max(0, (wall - creation.chargeStartedAt) / CHARGE_MS));
    const leftMs = readyAt - wall;
    return (
      <div className="orbit-stack">
        <section className="orbit-block ch-hero ch-live">
          <LaunchSteps creation={creation} now={wall} need={crewNeed(world)} />
          <Satellites trackId={creation.id} lit={creation.confirms.length} count={Math.max(1, creation.confirms.length)} charge={elapsed} state="charge" label={`Усі ${creation.confirms.length} супутники на місці. Заряджено ${Math.round(elapsed * 100)}%, залишилось ${left(leftMs)}.`}>
            <b className="ch-big">Шанс {chance}%</b>
            <small className="ch-small">{leftMs > 0 ? `Залишилось ${left(leftMs)}` : "Ось-ось буде результат"}</small>
          </Satellites>
          <p className="orbit-note ch-center">Орбіта набирає заряд. Результат з’явиться тут сам — застосунок можна закрити.</p>
          <Witnesses world={world} creation={creation} title="Тебе запускають" />
        </section>
        <ConfirmCard userId={user.id} ownCode={null} />
        {tail}
      </div>
    );
  }

  if (creation?.status === "collecting") {
    const day = utcDay(world.now);
    const used = creation.codeDay === day ? creation.codesToday : 0;
    const live = Boolean(creation.code && wall < creation.codeExpires);
    return (
      <div className="orbit-stack">
      <section className="orbit-block ch-hero">
        <LaunchSteps creation={creation} now={wall} need={crewNeed(world)} />
        <Satellites trackId={creation.id} lit={creation.confirms.length} count={crewNeed(world)} state="collect" label={`${creation.confirms.length} з ${crewNeed(world)} супутників світяться`}>
          <b className="ch-big">{creation.confirms.length} з {crewNeed(world)}</b>
          <small className="ch-small">підтверджень</small>
        </Satellites>
        <Witnesses world={world} creation={creation} title="Підтвердили" />
        {live && creation.code ? (
          <CodeShare code={creation.code} expires={creation.codeExpires} now={wall} cr={links?.[creation.id]} qrToken={qrNow?.cr === creation.id ? qrNow.t : undefined} />
        ) : (
          <>
            {creation.code ? <p className="orbit-note ch-center">Код згас. Створи новий — він діятиме 10 хвилин.</p> : null}
            <button type="button" className="orbit-go k-go" disabled={used >= CODES_PER_DAY} onClick={() => useOrbits.getState().issue()}>
              <QrCode size={18} strokeWidth={2} aria-hidden />
              Створити код підтвердження
            </button>
            <Notice />
          </>
        )}
        <p className="orbit-note ch-center">
          Кодів сьогодні: {used} з {CODES_PER_DAY}{used >= CODES_PER_DAY ? `. Нові коди — о ${new Date(Date.UTC(2026, 0, 1)).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })} за твоїм часом.` : ""}
        </p>
      </section>
      <NudgeButton world={world} creation={creation} userId={user.id} now={wall} />
      <ConfirmCard userId={user.id} ownCode={live ? creation.code : null} />
      {tail}
      </div>
    );
  }

  const chance = Math.round(chanceOf(world.orbits.length) * 100);
  return (
    <div className="orbit-stack">
      <section className="orbit-block mn-idle" aria-labelledby="mn-idle-title">
        <div className="mn-idle-art" aria-hidden>
          <OrbitRings />
          <span><Rocket size={30} strokeWidth={1.6} /></span>
        </div>
        <p className="orbit-kicker">Наступна орбіта у світі — {orbitNo(world.nextNo)}</p>
        <h1 className="orbit-h mn-h1" id="mn-idle-title">Запусти свою орбіту</h1>
        <LaunchIntro chance={chance} />
        <CrewTasks world={world} user={user} />
        <WitnessRules need={crewNeed(world)} />
        <button type="button" className="orbit-go k-go" onClick={() => void useOrbits.getState().start()}>
          <Rocket size={18} strokeWidth={2} aria-hidden />
          Почати запуск
        </button>
        <p className="ex-hint mn-center">Перша орбіта — приблизно за 2 дні. Безкоштовно.</p>
        <Notice />
      </section>
      <ConfirmCard userId={user.id} ownCode={null} />
      {tail}
    </div>
  );
}

/** «Підтверди запуск учасника». Код з посилання ?c= лише підставляється — надсилає людина. */
function ConfirmCard({ userId, ownCode }: { userId: string; ownCode: string | null }) {
  const [digits, setDigits] = useState("");
  const [fromLink, setFromLink] = useState(false);
  const [inviteQ, setInviteQ] = useState<{ code: string; q: string } | null>(null);
  const [own, setOwn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    setDigits("");
    setSaid(null);
  }, [userId]);
  useEffect(() => {
    const take = () => {
      const invite = readInvite();
      if (!invite) return;
      if (ownCode && invite.code === ownCode) {
        // Своє посилання відкрили на своєму ж телефоні — не підставляємо.
        dropInvite();
        setOwn(true);
        return;
      }
      setDigits(invite.code);
      setFromLink(true);
      setInviteQ(invite.q ? { code: invite.code, q: invite.q } : null);
      setOwn(false);
      window.requestAnimationFrame(() => {
        box.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        field.current?.focus({ preventScroll: true });
      });
    };
    take();
    window.addEventListener(INVITE_EVENT, take);
    return () => window.removeEventListener(INVITE_EVENT, take);
  }, [ownCode]);
  const typed = digits.replace(/\D/g, "").slice(0, 6);
  async function submit() {
    if (typed.length !== 6 || busy) return;
    setBusy(true);
    await useOrbits.getState().accept(typed, inviteQ && inviteQ.code === typed ? inviteQ.q : undefined);
    const state = useOrbits.getState();
    setBusy(false);
    setSaid({ text: sparkText(state.flash), bad: state.bad });
    if (!state.bad) {
      buzz([12, 60, 18]);
      setDigits("");
      setFromLink(false);
      setInviteQ(null);
      dropInvite();
    } else buzz([30, 40, 30]);
  }
  return (
    <section className="orbit-block cs-confirm" ref={box} aria-labelledby="cs-confirm-title" data-link={fromLink ? "1" : "0"}>
      <div className="mn-cf-head">
        <span className="mn-cf-ico" aria-hidden><ShieldCheck size={20} strokeWidth={1.9} /></span>
        <div>
          <p className="orbit-kicker">Підтвердження</p>
          <h2 className="orbit-h cs-h2" id="cs-confirm-title">Підтверди запуск учасника</h2>
        </div>
      </div>
      {fromLink ? (
        <p className="cs-from-link" role="status">
          Код із посилання вже в полі. Перевір цифри і натисни «Підтвердити».
        </p>
      ) : null}
      {own ? (
        <p className="cs-from-link" data-tone="warn" role="status">
          Це посилання з твоїм власним кодом. Надішли його іншому учаснику — свій запуск підтвердити не можна.
        </p>
      ) : null}
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="grid gap-1.5">
          <span className="orbit-kicker">Код від учасника</span>
          <input
            ref={field}
            className="orbit-field orbit-code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6 цифр"
            maxLength={7}
            value={typed.length > 3 ? `${typed.slice(0, 3)} ${typed.slice(3)}` : typed}
            aria-describedby="cs-confirm-note"
            onChange={(event) => {
              setDigits(event.target.value);
              setSaid(null);
              if (fromLink) setFromLink(false);
            }}
          />
        </label>
        <button type="submit" className="orbit-go k-go" disabled={typed.length !== 6 || busy}>
          {busy ? <span className="k-spin" aria-hidden /> : <ShieldCheck size={18} strokeWidth={2} aria-hidden />}
          {busy ? "Підтверджуємо…" : "Підтвердити"}
        </button>
      </form>
      {said?.text ? (
        <p className={said.bad ? "orbit-flash" : "orbit-ok"} role="status">
          {said.text}
        </p>
      ) : null}
      <p className="orbit-note cs-note" id="cs-confirm-note" hidden={Boolean(said?.text && !said.bad)}>
        Якщо запуск пройде, ти отримаєш {WITNESS_OD} ✦ і +{STABILITY_CONFIRM} до стабільності. Якщо ні — −{STABILITY_FAIL} стабільності.
      </p>
    </section>
  );
}

function Witnesses({ world, creation, title }: { world: World; creation: { id: string; confirms: { witnessId: string }[] }; title: string }) {
  const inPerson = useOrbits((state) => state.mine?.inPerson?.[creation.id]);
  if (!creation.confirms.length) return null;
  const people = creation.confirms.map((row) => ({ id: row.witnessId, name: world.accounts.find((account) => account.id === row.witnessId)?.name ?? "Учасник" }));
  return (
    <div className="ch-who">
      <span>{title}</span>
      <ul>
        {people.map((row, i) => (
          <li key={`${row.id}-${i}`} data-inperson={inPerson?.includes(row.id) ? "1" : "0"}>
            <Avatar id={row.id} name={row.name} size={20} />{row.name}
            {inPerson?.includes(row.id) ? <span className="ch-ip" title="Підтвердив особисто: сканував QR з екрана автора">особисто</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
