import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { EightMark } from "@/components/mark";
import { eightNo } from "@/lib/model";

export function CreditBeat({
  wallId,
  rewardId,
  city,
  opened,
  onStay,
}: {
  wallId: string;
  rewardId: string;
  city?: string;
  opened?: boolean;
  onStay: () => void;
}) {
  const [sent, setSent] = useState("");
  const place = (city ?? "").trim();

  function send() {
    const lines = [
      opened && place ? `Перша 8 у ${place}.` : "Зараховано.",
      `Стіна лишилась ${eightNo(wallId)}. Моя 8 — ${eightNo(rewardId)}. Номер стіни не змінюється.`,
    ];
    const text = lines.join(" ");
    const url = `${location.origin}/open/${wallId}`;
    if (navigator.share) {
      void navigator.share({ title: eightNo(wallId), text, url }).then(() => setSent("Надіслано.")).catch(() => undefined);
      return;
    }
    void navigator.clipboard.writeText(`${text}\n${url}`).then(() => setSent("Номери скопійовано.")).catch(() => setSent("Не вдалося скопіювати."));
  }

  return (
    <div className="fixed inset-0 z-[90] grid grid-rows-[minmax(12rem,1fr)_auto] bg-[#0B0F14] text-white">
      <div className="relative min-h-0 overflow-hidden">
        <img src="/canon/chalk.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-[center_40%]" />
        <div className="absolute inset-0 grid place-items-center bg-black/40">
          <EightMark mode="loading" className="h-28 w-16 text-white" />
        </div>
      </div>
      <div className="grid gap-3 px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <h1 className="text-h2">Зараховано</h1>
        {opened && place ? <p className="text-sm text-accent">Перша 8 у {place}.</p> : null}
        <p className="text-sm leading-6 text-white/80">
          Стіна лишилась {eightNo(wallId)}. Твоя окрема 8 — {eightNo(rewardId)}. Номер стіни не змінюється.
        </p>
        <button type="button" className="h-11 rounded-full border border-white/20 text-sm" onClick={send}>
          {sent || "Надіслати номери"}
        </button>
        <Link to="/open/$id" params={{ id: rewardId }} className="grid h-11 place-items-center rounded-full bg-accent text-sm font-medium text-bg">
          Відкрити свою 8
        </Link>
        <button type="button" className="h-11 rounded-full text-sm text-white/75" onClick={onStay}>
          Лишитись біля цієї стіни
        </button>
      </div>
    </div>
  );
}

export function PlaceBeat({
  wallId,
  city,
  opened,
  onCall,
  onStay,
}: {
  wallId: string;
  city: string;
  opened?: boolean;
  onCall: () => void;
  onStay: () => void;
}) {
  const place = city.trim();
  return (
    <div className="fixed inset-0 z-[90] grid grid-rows-[minmax(12rem,1fr)_auto] bg-[#0B0F14] text-white">
      <div className="relative min-h-0 overflow-hidden">
        <img src="/canon/chalk.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-[center_40%]" />
        <div className="absolute inset-0 grid place-items-center bg-black/45">
          <EightMark mode="static" className="h-28 w-16 text-white" />
        </div>
      </div>
      <div className="grid gap-3 px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <h1 className="text-h2">Стіна стоїть</h1>
        {opened && place ? <p className="text-sm text-accent">Перша 8 у {place}.</p> : null}
        <p className="text-sm leading-6 text-white/80">
          {eightNo(wallId)}. Номер більше не змінюється. Поклич іншу людину. Точку не надсилай.
        </p>
        <button type="button" className="h-11 rounded-full bg-accent text-sm font-medium text-bg" onClick={onCall}>
          Покликати
        </button>
        <button type="button" className="h-11 rounded-full text-sm text-white/75" onClick={onStay}>
          Лишитись біля стіни
        </button>
      </div>
    </div>
  );
}

export function HandBeat({
  eightId,
  who,
  onStay,
}: {
  eightId: string;
  who: string;
  onStay: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] grid grid-rows-[minmax(12rem,1fr)_auto] bg-[#0B0F14] text-white">
      <div className="relative min-h-0 overflow-hidden">
        <img src="/canon/chalk.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-[center_40%]" />
        <div className="absolute inset-0 grid place-items-center bg-black/45">
          <EightMark mode="static" className="h-28 w-16 text-white" />
        </div>
      </div>
      <div className="grid gap-3 px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <h1 className="text-h2">Номер перейшов</h1>
        <p className="text-sm leading-6 text-white/80">
          {eightNo(eightId)} тепер у {who}. Гроші лишились поза додатком. Номер той самий.
        </p>
        <button type="button" className="h-11 rounded-full bg-accent text-sm font-medium text-bg" onClick={onStay}>
          До ринку
        </button>
      </div>
    </div>
  );
}