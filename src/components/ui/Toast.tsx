import * as T from "@radix-ui/react-toast";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "./cn";

type Kind = "info" | "success" | "warning" | "error";
interface ToastData {
  id: number;
  kind: Kind;
  title: string;
  body?: string;
  action?: { label: string; run: () => void };
}

const Ctx = createContext<(t: Omit<ToastData, "id">) => void>(() => {});
export const useToast = () => useContext(Ctx);

const border: Record<Kind, string> = { info: "border-l-accent", success: "border-l-success", warning: "border-l-warning", error: "border-l-danger" };
const icon: Record<Kind, ReactNode> = {
  info: <Info className="size-4 text-accent" />,
  success: <CircleCheck className="size-4 text-success" />,
  warning: <TriangleAlert className="size-4 text-warning" />,
  error: <CircleAlert className="size-4 text-danger" />,
};

let next = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastData[]>([]);
  const push = useCallback((t: Omit<ToastData, "id">) => setItems((xs) => [...xs.slice(-2), { ...t, id: ++next }]), []);
  return (
    <Ctx.Provider value={push}>
      <T.Provider swipeDirection="right" label="Avisos">
        {children}
        {items.map((t) => (
          <T.Root
            key={t.id}
            type={t.kind === "error" ? "foreground" : "background"}
            duration={t.kind === "error" ? Infinity : 5000}
            onOpenChange={(o) => !o && setItems((xs) => xs.filter((x) => x.id !== t.id))}
            className={cn("flex gap-2.5 rounded-md border-l-3 bg-surface-raised p-3 pr-2 shadow-pop", border[t.kind])}
          >
            <span className="mt-0.5">{icon[t.kind]}</span>
            <div className="min-w-0 flex-1 text-sm">
              <T.Title className="font-semibold">{t.title}</T.Title>
              {t.body ? <T.Description className="mt-0.5 text-muted whitespace-pre-line">{t.body}</T.Description> : null}
              {t.action ? (
                <T.Action altText={t.action.label} asChild>
                  <button type="button" onClick={t.action.run} className="mt-2 inline-flex h-7 items-center rounded-md border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-hover">
                    {t.action.label}
                  </button>
                </T.Action>
              ) : null}
            </div>
            <T.Close aria-label="Cerrar aviso" className="grid size-6 place-items-center rounded-sm text-muted hover:text-text">
              <X className="size-3.5" />
            </T.Close>
          </T.Root>
        ))}
        <T.Viewport className="fixed bottom-4 right-4 z-[60] flex w-90 max-w-[calc(100vw-32px)] flex-col gap-2 outline-none" />
      </T.Provider>
    </Ctx.Provider>
  );
}
