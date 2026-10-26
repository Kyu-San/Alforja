import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { IconButton } from "./Button";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  wide,
  footer,
  children,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-scrim animate-[fade-in_var(--duration-base)_var(--ease-app)]" />
        <D.Content
          aria-busy={busy || undefined}
          aria-describedby={description ? undefined : undefined}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-48px)] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col",
            "rounded-lg bg-surface-raised shadow-pop outline-none animate-[dialog-in_var(--duration-base)_var(--ease-app)]",
            wide ? "w-dialog-wide" : "w-dialog",
          )}
        >
          <div className="flex items-start gap-3 px-5 pt-4">
            <div className="min-w-0 flex-1">
              <D.Title className="m-0 text-lg">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : ""}</D.Description>}
            </div>
            <D.Close asChild>
              <IconButton label="Cerrar" shortcut="Esc" size="sm" icon={<X className="size-4" />} />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export const DialogClose = D.Close;
