import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "../components/ui/Button";
import { navigate } from "../lib/router";

/** Cabecera de las pantallas secundarias, con vuelta a la lista (Esc). */
export function Screen({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div
      className="flex h-full flex-col"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !document.querySelector("[role=dialog],[role=menu],[role=listbox][data-state=open]")) navigate("/");
      }}
    >
      <header className="flex h-toolbar shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
        <IconButton label="Volver a las descargas" shortcut="Esc" icon={<ArrowLeft className="size-5" />} onClick={() => navigate("/")} autoFocus />
        <h1 className="m-0 text-md">{title}</h1>
        <div className="flex-1" />
        {actions}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
