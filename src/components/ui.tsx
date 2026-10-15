import type { ButtonHTMLAttributes, ReactNode } from "react";
import { motion } from "motion/react";
import { EightLoader, EightMark } from "@/components/mark";
import { cn } from "@/lib/cn";
import { motionDuration, motionEase } from "@/lib/motion";
import { usePrefersReducedMotion } from "@/lib/motion-pref";
import { STATUS_LABEL, type Derived } from "@/lib/model";

type BtnKind = "primary" | "secondary" | "quiet" | "ghost" | "glass" | "icon" | "destructive" | "danger";

function visualKind(kind: BtnKind) {
  if (kind === "quiet") return "secondary";
  if (kind === "danger") return "destructive";
  return kind;
}

export function btnClass(kind: BtnKind = "quiet") {
  const visual = visualKind(kind);
  return cn(
    "btn-press btn-tap inline-flex h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-80",
    visual === "primary" && "btn-primary bg-accent text-bg",
    visual === "secondary" && "btn-secondary border border-border bg-surface/80 text-fg",
    visual === "ghost" && "text-muted hover:bg-surface hover:text-fg",
    visual === "glass" && "btn-glass glass-1 text-fg",
    visual === "icon" && "icon-btn btn-glass glass-2 px-0 text-fg",
    visual === "destructive" && "btn-destructive border border-danger/40 text-danger",
  );
}

export function Btn({
  kind = "quiet",
  busy,
  className,
  children,
  disabled,
  type = "button",
  onClick,
}: {
  kind?: BtnKind;
  busy?: boolean;
  className?: string;
  children?: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
}) {
  const locked = Boolean(disabled || busy);
  return (
    <button
      type={type}
      className={cn(btnClass(kind), className)}
      disabled={locked}
      onClick={onClick}
    >
      {busy ? <EightLoader /> : null}
      {children}
    </button>
  );
}

export const fieldClass = "field";
export const fieldErrorClass = "field field-error";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-body">
      <span className="text-meta text-muted">{label}</span>
      {children}
      {error ? <span className="text-meta text-danger">{error}</span> : null}
      {!error && hint ? <span className="text-meta text-muted">{hint}</span> : null}
    </label>
  );
}

export function StatusPill({
  status,
  anchor,
  tone,
}: {
  status: Derived;
  anchor?: boolean;
  tone?: "active" | "transferred";
}) {
  const label = tone === "active" ? "Активна" : tone === "transferred" ? "Передана" : anchor ? "Якір" : STATUS_LABEL[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-meta",
        (anchor || tone === "transferred") && "border-violet/35 text-violet",
        !anchor && !tone && status === "verified" && "border-accent/35 text-accent",
        !anchor && !tone && status === "submitted" && "border-border text-silver",
        !anchor && !tone && status === "created" && "border-border text-muted",
        !anchor && !tone && status === "disputed" && "border-warning/50 text-warning",
        tone === "active" && "border-success/40 text-success",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", status === "verified" && !anchor && "mark-pulse")} />
      {label}
    </span>
  );
}

export function GlassCard({
  level = 2,
  interactive,
  selected,
  className,
  children,
  id,
}: {
  level?: 1 | 2 | 3 | 4;
  interactive?: boolean;
  selected?: boolean;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-panel",
        level === 1 && "glass-1",
        level === 2 && "glass-2",
        level === 3 && "glass-3",
        level === 4 && "glass-4",
        interactive && "card-lift",
        selected && "card-selected",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Panel({
  children,
  className,
  id,
  level = 2,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  level?: 1 | 2 | 3 | 4;
}) {
  return (
    <GlassCard id={id} level={level} className={className}>
      {children}
    </GlassCard>
  );
}

export function Page({
  title,
  lede,
  action,
  children,
}: {
  title: string;
  lede?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="relative z-content mx-auto grid max-w-3xl gap-3 px-3 pt-3 pb-[calc(9.25rem+env(safe-area-inset-bottom))] lg:px-6 lg:pt-5 lg:pb-12">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-h1 truncate">{title}</h1>
          {lede ? <p className="mt-1 text-sm text-muted">{lede}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </main>
  );
}

export function Overlay({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <div className="fixed inset-0 z-modal grid items-end p-0 sm:place-items-center sm:p-4" role="dialog" aria-label={label}>
      <button className="absolute inset-0 bg-bg/70" aria-label="Закрити" onClick={onClose} />
      <motion.div
        className="glass-3 relative z-content w-full rounded-t-panel p-5 sm:max-w-sm sm:rounded-panel"
        initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduced ? { duration: 0 } : { duration: motionDuration.normal, ease: motionEase }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="glass-3 flex items-center gap-3 rounded-panel px-4 py-3 text-body text-fg">
      <EightMark mode="glow" className="h-6 w-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-control bg-surface-2/80", className)} aria-hidden />;
}
