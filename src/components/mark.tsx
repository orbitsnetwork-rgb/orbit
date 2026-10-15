import { cn } from "@/lib/cn";

export type MarkMode = "static" | "glow" | "active" | "verified" | "loading" | "success" | "hero" | "icon" | "marker";

const MODE_CLASS: Record<MarkMode, string> = {
  static: "",
  glow: "mark-glow",
  active: "mark-active",
  verified: "mark-verified",
  loading: "eight-mark-loading mark-glow",
  success: "mark-success",
  hero: "mark-glow",
  icon: "",
  marker: "mark-glow",
};

const CHALK =
  "M41 63 C 68 62 76 40 56 26 C 40 14 14 18 15 40 C 16 56 30 63 41 63 C 14 65 4 86 20 102 C 36 118 70 112 69 88 C 68 70 54 64 41 63";

export function EightMark({ className, mode = "static" }: { className?: string; mode?: MarkMode }) {
  const stroke = mode === "marker" || mode === "icon" ? 4.2 : mode === "hero" ? 5.6 : 5;
  return (
    <svg viewBox="0 0 80 120" className={cn("text-fg", MODE_CLASS[mode], className)} aria-hidden="true">
      <path d={CHALK} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EightLoader({ className, label = "Завантаження" }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-meta text-muted", className)} role="status">
      <EightMark mode="loading" className="h-5 w-3.5" />
      <span className="sr-only">{label}</span>
    </span>
  );
}