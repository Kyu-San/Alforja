import { Globe, Rss, Zap } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/Feedback";
import { navigate } from "../lib/router";
import { Screen } from "./Screen";

// Pantallas que aún no están construidas (recomendables u opcionales en
// features.csv). Dicen claramente que todavía no existen, en vez de fingir.

export function SubscriptionsScreen() {
  return (
    <Screen title="Suscripciones">
      <EmptyState icon={<Rss />} title="Las suscripciones llegan en la próxima versión" action={<Button onClick={() => navigate("/")}>Volver a las descargas</Button>}>
        Podrás pegar el enlace de un canal o una lista y elegir Suscribirse: lo nuevo se descargará solo, con el formato que elijas.
      </EmptyState>
    </Screen>
  );
}

export function BrowserScreen() {
  return (
    <Screen title="Navegador">
      <EmptyState icon={<Globe />} title="El navegador integrado aún no está disponible" action={<Button onClick={() => navigate("/")}>Volver a las descargas</Button>}>
        Mientras tanto, copia el enlace desde tu navegador y pulsa Pegar enlace.
      </EmptyState>
    </Screen>
  );
}

export function SmartModeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Smart Mode" footer={<Button onClick={() => onOpenChange(false)}>Entendido</Button>}>
      <div className="flex gap-3">
        <Zap className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
        <p className="text-base">
          Con Smart Mode eliges el formato, la calidad, los subtítulos y la carpeta una sola vez, y cada enlace que pegues se descarga directamente, sin diálogo. <span className="text-muted">Llega en la próxima versión.</span>
        </p>
      </div>
    </Dialog>
  );
}
