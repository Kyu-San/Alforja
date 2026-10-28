import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "../components/ui/Button";
import { navigate } from "../lib/router";

/** Cabecera de las pantallas secundarias, con vuelta a la lista (Esc). */
export function Screen({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  // En la ventana, no en el contenedor: el foco puede estar en <body> (tras
  // pulsar un botón que desaparece, o al llegar a la pantalla).
  // Al entrar, el foco va al contenido. Solo al montar: con un ref en línea se
  // repetía en cada actualización y robaba el foco (BUG-012).
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("[role=dialog],[role=menu],[role=listbox]")) return;
      navigate("/");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-toolbar shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
        <IconButton label="Volver a las descargas" shortcut="Esc" icon={<ArrowLeft className="size-5" />} onClick={() => navigate("/")} />
        <h1 className="m-0 text-md">{title}</h1>
        <div className="flex-1" />
        {actions}
      </header>
      <main ref={mainRef} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
        {children}
      </main>
    </div>
  );
}
