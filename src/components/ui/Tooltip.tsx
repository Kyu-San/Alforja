import * as T from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <T.Provider delayDuration={500} skipDelayDuration={200}>
    {children}
  </T.Provider>
);

export function Tooltip({ label, children, side = "bottom" }: { label: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  if (!label) return <>{children}</>;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-50 max-w-80 rounded-md bg-surface-raised px-2 py-1 text-xs text-text shadow-pop whitespace-pre-line"
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
