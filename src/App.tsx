import { useEffect } from "react";
import { api } from "./api";
import { ToastProvider, useToast } from "./components/ui/Toast";
import { TooltipProvider } from "./components/ui/Tooltip";
import { navigate, useRoute } from "./lib/router";
import { MainWindow } from "./screens/MainWindow";
import { PasteDialog } from "./screens/PasteDialog";
import { Preferences } from "./screens/Preferences";
import { BrowserScreen, SubscriptionsScreen } from "./screens/Stubs";
import { useStore } from "./store";

function Routes() {
  const [first, second] = useRoute();
  switch (first) {
    case "suscripciones":
      return <SubscriptionsScreen />;
    case "navegador":
      return <BrowserScreen />;
    case "preferencias":
      return <Preferences section={second ?? "general"} />;
    default:
      return <MainWindow />;
  }
}

function Events() {
  const apply = useStore((s) => s.apply);
  const toast = useToast();
  useEffect(() => {
    useStore.getState().load();
    let off: (() => void) | undefined;
    let errorsInARow = 0;
    api
      .onEvent((e) => {
        const prev = e.type === "download" ? useStore.getState().downloads[e.download.id] : undefined;
        apply(e);
        if (e.type !== "download" || prev?.status === e.download.status) return;
        if (e.download.status === "done") {
          errorsInARow = 0;
          if (document.hidden) toast({ kind: "success", title: "Descarga terminada", body: e.download.title ?? undefined });
        } else if (e.download.status === "error" && ["engine", "http_403"].includes(e.download.errorCode ?? "")) {
          // Varios fallos seguidos del motor suelen significar que hay que actualizarlo.
          if (++errorsInARow === 3) {
            toast({ kind: "error", title: "Fallan varias descargas seguidas", body: "Puede que el motor esté desactualizado.", action: { label: "Ver el motor", run: () => navigate("/preferencias/motor") } });
          }
        }
      })
      .then((f) => (off = f));
    return () => off?.();
  }, [apply, toast]);
  // Ctrl/Cmd+, abre las preferencias desde cualquier pantalla.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        navigate("/preferencias/general");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

export default function App() {
  return (
    <TooltipProvider>
      <ToastProvider>
        <Events />
        <Routes />
        <PasteDialog />
      </ToastProvider>
    </TooltipProvider>
  );
}
