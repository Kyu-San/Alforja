import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "./cn";
import { Tooltip } from "./Tooltip";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-surface-raised text-text border border-border hover:bg-surface-hover",
  ghost: "bg-transparent text-text hover:bg-surface-hover",
  danger: "bg-danger text-on-danger hover:brightness-110",
};
const sizes: Record<Size, string> = {
  sm: "h-7 px-3 text-sm gap-1.5",
  md: "h-8 px-4 text-base gap-2",
  lg: "h-10 px-5 text-md gap-2",
};
const iconSizes: Record<Size, string> = { sm: "size-7", md: "size-8", lg: "size-9" };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

const base =
  "inline-flex shrink-0 items-center justify-center rounded-md font-semibold whitespace-nowrap select-none " +
  "transition-[background-color,filter] duration-[var(--duration-fast)] ease-app active:translate-y-px " +
  "disabled:opacity-45 disabled:pointer-events-none";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-[spin_1s_linear_infinite]" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  /** Atajo que se muestra en el tooltip, p. ej. "Ctrl+," */
  shortcut?: string;
  icon: ReactNode;
  size?: Size;
  variant?: Variant;
  pressed?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, icon, size = "md", variant = "ghost", pressed, className, ...rest },
  ref,
) {
  return (
    <Tooltip label={shortcut ? `${label}  ·  ${shortcut}` : label}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        className={cn(base, variants[variant], iconSizes[size], "p-0", className)}
        {...rest}
      >
        {icon}
      </button>
    </Tooltip>
  );
});
