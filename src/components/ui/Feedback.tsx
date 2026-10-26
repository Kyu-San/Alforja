import type { ReactNode } from "react";
import { cn } from "./cn";

export function ProgressBar({ value, tone = "accent", label, className, thick }: { value: number | null; tone?: "accent" | "muted" | "success"; label: string; className?: string; thick?: boolean }) {
  const fill = { accent: "bg-accent", muted: "bg-muted", success: "bg-success" }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value == null ? label : undefined}
      className={cn("overflow-hidden rounded-pill bg-progress-track", thick ? "h-1.5" : "h-1", className)}
    >
      {value == null ? (
        <div className={cn("indeterminate-bar h-full w-[30%] rounded-pill animate-[indeterminate_1.2s_var(--ease-app)_infinite]", fill)} />
      ) : (
        <div className={cn("h-full rounded-pill transition-[width] duration-[var(--duration-base)] ease-app", fill)} style={{ width: `${value}%` }} />
      )}
    </div>
  );
}

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "text-muted",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn("inline-flex h-5 shrink-0 items-center rounded-pill bg-surface-hover px-2 text-xs", tones[tone])}>{children}</span>;
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-12 text-center">
      <div className="text-muted [&_svg]:size-10" aria-hidden>
        {icon}
      </div>
      <h2 className="mt-3 text-md">{title}</h2>
      {children ? <p className="mt-1 text-base text-muted">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-sm bg-surface-hover animate-[pulse-soft_1.4s_ease-in-out_infinite]", className)} aria-hidden />;
}
