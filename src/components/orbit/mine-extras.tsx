import { orbitNo } from "@/lib/orbit/traits";
/** «Заявка» v8: етапи запуску, показники, хто запускає зараз, хто онлайн, мої минулі запуски. */
import type { ReactNode } from "react";
import { BatteryCharging, CheckCircle2, CircleDashed, Gauge, KeyRound, Rocket, ShieldCheck, Sparkles, XCircle, Zap } from "lucide-react";
import { CHARGE_MS, CODES_PER_DAY, CONFIRM_NEED, DAY_MS, STABILITY_CONFIRM, WITNESS_OD, chanceOf, utcDay, type Account, type Creation, type World } from "@/lib/orbit/engine";
import { Avatar, Empty, Progress, SectionHead, Stat } from "@/components/orbit/ui/kit";

const fmt = new Intl.NumberFormat("uk-UA");
function no(id: number) {
  return orbitNo(id);
}
function date(ms: number) {
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", timeZone: "Europe/Kyiv" }).format(ms);
}

/** Три етапи: підтвердження → заряд → орбіта. */
export function LaunchSteps({ creation, now }: { creation: Creation | null; now: number }) {
  const k = creation?.confirms.length ?? 0;
  const stage = !creation ? -1 : creation.status === "collecting" ? 0 : creation.status === "charging" ? 1 : 2;
  const charged = creation?.chargeStartedAt ? Math.min(1, Math.max(0, (now - creation.chargeStartedAt) / CHARGE_MS)) : 0;
  const steps: { title: string; sub: string; icon: ReactNode }[] = [
    { title: "Підтвердження", sub: stage > 0 ? `${CONFIRM_NEED} з ${CONFIRM_NEED}` : `${k} з ${CONFIRM_NEED}`, icon: <ShieldCheck size={16} strokeWidth={2} /> },
    { title: "Заряд", sub: stage === 1 ? `${Math.round(charged * 100)}%` : stage > 1 ? "готово" : "24 год", icon: <BatteryCharging size={16} strokeWidth={2} /> },
    { title: "Орбіта", sub: "твоя назавжди", icon: <Sparkles size={16} strokeWidth={2} /> },
  ];
  return (
    <ol className="mn-steps" aria-label="Етапи запуску">
      {steps.map((step, i) => {
        const state = stage > i ? "done" : stage === i ? "now" : "next";
        return (
          <li key={step.title} data-state={state} aria-current={state === "now" ? "step" : undefined}>
            <span className="mn-step-ico" aria-hidden>{state === "done" ? <CheckCircle2 size={16} strokeWidth={2.2} /> : step.icon}</span>
            <b>{step.title}</b>
            <small>{step.sub}</small>
            {i < steps.length - 1 ? <i className="mn-step-line" data-on={stage > i ? "1" : "0"} aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Показники запуску плитками. */
export function LaunchStats({ world, user, creation }: { world: World; user: Account; creation: Creation | null }) {
  const chance = Math.round(chanceOf(world.orbits.length) * 100);
  const day = utcDay(world.now);
  const used = creation && creation.codeDay === day ? creation.codesToday : 0;
  return (
    <div className="k-grid2">
      <Stat icon={<Gauge size={16} strokeWidth={2} />} value={`${chance}%`} label="шанс заряду зараз" tone="aurora" foot={<Progress value={chance} max={100} label="Шанс заряду" tone="aurora" />} />
      <Stat icon={<KeyRound size={16} strokeWidth={2} />} value={`${used} з ${CODES_PER_DAY}`} label="кодів випущено сьогодні" tone="ion" foot={<Progress value={used} max={CODES_PER_DAY} label="Кодів сьогодні" tone="ion" />} />
      <Stat icon={<Zap size={16} strokeWidth={2} />} value={fmt.format(user.stability)} label="твоя стабільність" tone="nebula" />
      <Stat icon={<Sparkles size={16} strokeWidth={2} />} value={`+${WITNESS_OD} ✦`} label={`за підтвердження · +${STABILITY_CONFIRM} стаб.`} />
    </div>
  );
}

/** Хто з учасників зараз збирає підтвердження чи заряджається. Коди інших сюди не приходять. */
export function LiveLaunches({ world, user }: { world: World; user: Account }) {
  const rows = world.creations
    .filter((row) => row.userId !== user.id && (row.status === "collecting" || row.status === "charging"))
    .map((row) => ({ row, who: world.accounts.find((account) => account.id === row.userId) }))
    .filter((item): item is { row: Creation; who: Account } => Boolean(item.who))
    .sort((a, b) => b.row.confirms.length - a.row.confirms.length)
    .slice(0, 6);
  return (
    <section className="orbit-block mn-live" aria-labelledby="mn-live-title">
      <SectionHead id="mn-live-title" title="Зараз запускають" />
      {rows.length === 0 ? (
        <Empty icon={<Rocket size={20} strokeWidth={1.6} />} title="Поки ніхто" text="Коли учасники почнуть запуск, вони з’являться тут. Код для підтвердження дає сама людина." />
      ) : (
        <>
          <ul className="mn-list">
            {rows.map(({ row, who }) => {
              const charging = row.status === "charging";
              const pct = charging && row.chargeStartedAt ? Math.min(1, (world.now - row.chargeStartedAt) / CHARGE_MS) : 0;
              const helped = row.confirms.some((c) => c.witnessId === user.id);
              return (
                <li key={row.id}>
                  <Avatar id={who.id} name={who.name} size={36} />
                  <div className="mn-list-mid">
                    <div className="mn-list-top">
                      <b>{who.name}</b>
                      <span className="mn-tag" data-tone={charging ? "ion" : "sun"}>{charging ? `заряд ${Math.round(pct * 100)}%` : `${row.confirms.length} з ${CONFIRM_NEED}`}</span>
                    </div>
                    <Progress value={charging ? Math.round(pct * 100) : row.confirms.length} max={charging ? 100 : CONFIRM_NEED} label={`${who.name}: ${charging ? "заряд" : "підтвердження"}`} tone={charging ? "ion" : "sun"} />
                    {helped ? <small className="mn-helped"><CheckCircle2 size={12} strokeWidth={2.4} aria-hidden /> є твоє підтвердження</small> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="ex-hint">Щоб підтвердити — попроси в людини 6-значний код або посилання.</p>
        </>
      )}
    </section>
  );
}

/** Хто онлайн за добу — аватарами. */
export function OnlineStrip({ world, userId }: { world: World; userId: string }) {
  const people = world.accounts
    .filter((account) => account.id !== userId && world.now - account.lastActiveAt <= DAY_MS)
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  return (
    <section className="orbit-block mn-online" aria-labelledby="mn-online-title">
      <SectionHead id="mn-online-title" title={`Онлайн за добу · ${people.length}`} />
      {people.length === 0 ? (
        <p className="ex-hint">Зараз онлайн 0. Поділись посиланням з друзями — підтвердження дають живі люди.</p>
      ) : (
        <ul className="mn-faces" tabIndex={0} aria-label="Хто підтвердив">
          {people.slice(0, 12).map((account) => (
            <li key={account.id}>
              <Avatar id={account.id} name={account.name} size={42} />
              <span>{account.name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Мої минулі запуски: успіх з номером орбіти або «не вийшло». */
export function PastLaunches({ world, user }: { world: World; user: Account }) {
  const past = world.creations.filter((row) => row.userId === user.id && (row.status === "done" || row.status === "failed")).slice(-5).reverse();
  if (!past.length) return null;
  return (
    <section className="orbit-block" aria-labelledby="mn-past-title">
      <SectionHead id="mn-past-title" title="Мої запуски" />
      <ul className="ex-trades">
        {past.map((row) => {
          const at = (row.chargeStartedAt ?? 0) + CHARGE_MS;
          const orbit = row.status === "done" ? world.orbits.find((o) => o.ownerId === user.id && o.createdAt >= at - 60_000) : undefined;
          return (
            <li key={row.id}>
              <span className="ex-trade-ico" data-on={row.status === "done" ? "1" : "0"} aria-hidden>
                {row.status === "done" ? <Sparkles size={14} strokeWidth={2} /> : <XCircle size={14} strokeWidth={2} />}
              </span>
              <span className="ex-who">
                <b>{row.status === "done" ? (orbit ? `Орбіта ${no(orbit.id)}` : "Орбіта запущена") : "Не вийшло"}</b>
                <small>{row.chargeStartedAt ? date(at) : "—"} · {row.confirms.length} підтверджень</small>
              </span>
              <span className="mn-tag" data-tone={row.status === "done" ? "aurora" : "mars"}>{row.status === "done" ? "успіх" : "заряд зірвався"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Ідея запуску на порожньому екрані: 3 кроки з іконками. */
export function LaunchIntro({ chance }: { chance: number }) {
  const rows = [
    { icon: <ShieldCheck size={18} strokeWidth={1.9} />, title: `${CONFIRM_NEED} підтверджень`, text: `Кожен учасник вводить твій 6-значний код. Один код — одне підтвердження, до ${CODES_PER_DAY} кодів на день.` },
    { icon: <BatteryCharging size={18} strokeWidth={1.9} />, title: "24 години заряду", text: `Шанс успіху зараз — ${chance}%. Чим більше орбіт у світі, тим складніше.` },
    { icon: <CircleDashed size={18} strokeWidth={1.9} />, title: "Нова орбіта", text: "Отримуєш наступний номер. А кожен, хто підтвердив, отримує нагороду в іскрах ✦." },
  ];
  return (
    <ul className="mn-intro">
      {rows.map((row, i) => (
        <li key={row.title}>
          <span className="mn-intro-ico" aria-hidden>{row.icon}<i>{i + 1}</i></span>
          <div>
            <b>{row.title}</b>
            <p>{row.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
