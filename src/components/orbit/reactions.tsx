/** Власні космічні значки реакцій (SVG, без емодзі й без файлів). Лише прикраса: жодних ✦ і жодного впливу на економіку. */
import type { ReactNode } from "react";
import type { ReactionId } from "@/lib/orbit/live-rules";

const GOLD = "#ffc45c";
const ICE = "#9fd8ff";
const ROSE = "#ff8fa8";
const MINT = "#3ddc97";
const VIOLET = "#b69cff";

const DRAW: Record<ReactionId, ReactNode> = {
  spark: (
    <>
      <path d="M12 2.5l2.1 7.4 7.4 2.1-7.4 2.1L12 21.5l-2.1-7.4L2.5 12l7.4-2.1z" fill={GOLD} />
      <circle cx="12" cy="12" r="1.6" fill="#fff4e4" />
    </>
  ),
  launch: (
    <>
      <path d="M12 2.8c3 2.3 4.4 5.6 4.1 9.6l-1.9 3.1H9.8l-1.9-3.1C7.6 8.4 9 5.1 12 2.8z" fill="#e9eef8" />
      <circle cx="12" cy="8.6" r="1.7" fill={ICE} />
      <path d="M7.9 12.4L5.4 15l2.8.4M16.1 12.4l2.5 2.6-2.8.4" stroke="#e9eef8" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
      <path d="M10.2 16.4c.3 2.2 1 3.6 1.8 4.8.8-1.2 1.5-2.6 1.8-4.8z" fill={GOLD} />
    </>
  ),
  galaxy: (
    <>
      <path d="M12 12c0-2 2.6-3.1 4.6-1.6 2.5 1.9 1.6 6.4-2.2 7.6-4.5 1.4-9-1.9-8.6-6.6.4-4.6 5.3-7.6 10-6.1" stroke={VIOLET} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.8" fill={GOLD} />
      <circle cx="19" cy="5" r=".9" fill="#fff" /><circle cx="4.5" cy="18.5" r=".7" fill="#fff" />
    </>
  ),
  thanks: (
    <>
      <path d="M12 20.3S3.8 15.4 3.8 9.6A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 8.2 2.2c0 5.8-8.2 10.7-8.2 10.7z" fill={ROSE} />
      <path d="M12 9.6l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z" fill="#fff4e4" />
    </>
  ),
  hold: (
    <>
      <ellipse cx="9" cy="12" rx="6" ry="3.6" transform="rotate(-30 9 12)" stroke={ICE} strokeWidth="1.8" fill="none" />
      <ellipse cx="15" cy="12" rx="6" ry="3.6" transform="rotate(30 15 12)" stroke={GOLD} strokeWidth="1.8" fill="none" />
      <circle cx="12" cy="12" r="1.5" fill="#fff" />
    </>
  ),
  star: (
    <>
      <path d="M12 4.2l2.3 4.7 5.2.7-3.8 3.6.9 5.1L12 15.9l-4.6 2.4.9-5.1-3.8-3.6 5.2-.7z" fill={GOLD} />
      <path d="M12 1.2v1.6M21.6 6.5l-1.3.8M2.4 6.5l1.3.8M18.8 21.2l-.9-1.3M5.2 21.2l.9-1.3" stroke={GOLD} strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  funny: (
    <>
      <circle cx="12" cy="12" r="7" fill={MINT} />
      <path d="M2.8 14.8c2.6 1.4 15.8-2.2 18.4-5" stroke="#e9eef8" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M9 10.3l1 .8-1 .8M15 10.3l-1 .8 1 .8" stroke="#10241b" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.4 13.6a2.9 2.9 0 0 0 5.2 0z" fill="#10241b" />
    </>
  ),
  sad: (
    <>
      <path d="M15.8 4.3A7.8 7.8 0 1 0 19.7 15 6.2 6.2 0 0 1 15.8 4.3z" fill="#cfd8ea" />
      <path d="M9.4 11.6l1.4-.6M13.1 12.2l1.2.5" stroke="#28324a" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10.2 16c.8-.7 2-.8 2.9-.2" stroke="#28324a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M9.6 13.2c.5.9.7 1.4.7 1.8a.7.7 0 0 1-1.4 0c0-.4.2-.9.7-1.8z" fill={ICE} />
    </>
  ),
  see: (
    <>
      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" stroke={ICE} strokeWidth="1.7" fill="none" strokeLinejoin="round" />
      <path d="M12 8.7l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" fill={GOLD} />
    </>
  ),
  planet: (
    <>
      <circle cx="12" cy="12" r="5.4" fill={VIOLET} />
      <path d="M8.6 10.2c1.2.4 2.4.2 3.4-.6M10 14.6c1.5.2 3-.3 4.1-1.3" stroke="#e7dcff" strokeWidth="1" fill="none" strokeLinecap="round" />
      <ellipse cx="12" cy="12" rx="10" ry="3.2" transform="rotate(-18 12 12)" stroke={GOLD} strokeWidth="1.5" fill="none" />
    </>
  ),
};

export function ReactionIcon({ id, size = 20 }: { id: ReactionId; size?: number }) {
  return (
    <svg className="orbit-rx-ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      {DRAW[id]}
    </svg>
  );
}
