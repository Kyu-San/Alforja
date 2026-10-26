import * as C from "@radix-ui/react-checkbox";
import * as S from "@radix-ui/react-select";
import * as Sw from "@radix-ui/react-switch";
import { Check, ChevronDown, Minus, Search, X } from "lucide-react";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";
import { Button } from "./Button";
import { middleEllipsis } from "../../lib/format";

export function Label({ htmlFor, children, id }: { htmlFor?: string; children: ReactNode; id?: string }) {
  return (
    <label id={id} htmlFor={htmlFor} className="mb-1 block text-xs text-muted">
      {children}
    </label>
  );
}

const fieldBase =
  "h-8 w-full rounded-md border border-border-input bg-surface px-2.5 text-base text-text outline-none " +
  "transition-[border-color] duration-[var(--duration-fast)] hover:border-muted focus-visible:border-accent " +
  "disabled:opacity-45 aria-[invalid=true]:border-danger placeholder:text-muted";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
  hint?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ label, error, hint, id, className, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      {label ? <Label htmlFor={fid}>{label}</Label> : null}
      <input
        ref={ref}
        id={fid}
        className={fieldBase}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
        spellCheck={false}
        autoComplete="off"
        {...rest}
      />
      {error ? (
        <p id={`${fid}-err`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fid}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export const SearchField = forwardRef<HTMLInputElement, { value: string; onChange: (v: string) => void; placeholder: string; className?: string; label: string }>(
  function SearchField({ value, onChange, placeholder, className, label }, ref) {
    return (
      <div className={cn("relative", className)}>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          ref={ref}
          type="search"
          aria-label={label}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && value) {
              e.stopPropagation();
              onChange("");
            }
          }}
          className={cn(fieldBase, "pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden")}
          spellCheck={false}
        />
        {value ? (
          <button type="button" aria-label="Limpiar búsqueda" onClick={() => onChange("")} className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-sm text-muted hover:text-text">
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
    );
  },
);

export interface Option {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function Select({ label, value, onChange, options, disabled, placeholder, className }: { label: string; value: string; onChange: (v: string) => void; options: Option[]; disabled?: boolean; placeholder?: string; className?: string }) {
  const id = useId();
  return (
    <div className={cn("min-w-0", className)}>
      <Label id={id}>{label}</Label>
      <S.Root value={value} onValueChange={onChange} disabled={disabled}>
        <S.Trigger aria-labelledby={id} className={cn(fieldBase, "flex items-center justify-between gap-2 text-left data-[state=open]:border-accent")}>
          <span className="truncate">
            <S.Value placeholder={placeholder} />
          </span>
          <S.Icon>
            <ChevronDown className="size-4 text-muted" />
          </S.Icon>
        </S.Trigger>
        <S.Portal>
          <S.Content position="popper" sideOffset={4} className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md bg-surface-raised p-1 shadow-pop">
            <S.Viewport>
              {options.map((o) => (
                <S.Item
                  key={o.value}
                  value={o.value}
                  disabled={o.disabled}
                  className="relative flex h-8 items-center gap-2 rounded-sm pl-7 pr-2 text-base outline-none data-[highlighted]:bg-surface-hover data-[disabled]:text-muted"
                >
                  <S.ItemIndicator className="absolute left-2">
                    <Check className="size-4 text-accent" />
                  </S.ItemIndicator>
                  <S.ItemText>{o.label}</S.ItemText>
                  {o.hint ? <span className="ml-auto pl-3 text-xs text-muted">{o.hint}</span> : null}
                </S.Item>
              ))}
            </S.Viewport>
          </S.Content>
        </S.Portal>
      </S.Root>
    </div>
  );
}

export function Checkbox({ checked, onChange, children, disabled, className, ariaLabel }: { checked: boolean | "indeterminate"; onChange: (v: boolean) => void; children?: ReactNode; disabled?: boolean; className?: string; ariaLabel?: string }) {
  const id = useId();
  return (
    <div className={cn("flex items-center gap-2", disabled && "opacity-45", className)}>
      <C.Root
        id={id}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onCheckedChange={(v) => onChange(v === true)}
        className="grid size-4 shrink-0 place-items-center rounded-sm border border-border-input bg-surface data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent"
      >
        <C.Indicator className="text-on-accent">{checked === "indeterminate" ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}</C.Indicator>
      </C.Root>
      {children ? (
        <label htmlFor={id} className="text-sm">
          {children}
        </label>
      ) : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <Sw.Root
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className="relative h-5 w-9 shrink-0 rounded-pill bg-progress-track transition-colors duration-[var(--duration-fast)] data-[state=checked]:bg-accent"
    >
      <Sw.Thumb className="block size-3.5 translate-x-0.75 rounded-pill bg-muted transition-transform duration-[var(--duration-fast)] data-[state=checked]:translate-x-4.75 data-[state=checked]:bg-on-accent" />
    </Sw.Root>
  );
}

export function FolderPicker({ label, value, onPick, error }: { label: string; value: string; onPick: () => void; error?: string | null }) {
  const id = useId();
  return (
    <div>
      <Label id={id}>{label}</Label>
      <div className="flex gap-2">
        <div
          role="textbox"
          aria-readonly="true"
          aria-labelledby={id}
          aria-invalid={!!error || undefined}
          title={value}
          className={cn(fieldBase, "selectable flex min-w-0 flex-1 items-center text-sm")}
        >
          <span className="truncate">{middleEllipsis(value, 56)}</span>
        </div>
        <Button onClick={onPick}>Cambiar…</Button>
      </div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
