import { Globe } from "lucide-react";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/Feedback";
import { navigate } from "../lib/router";
import { Screen } from "./Screen";

// Pantalla que aún no está construida (opcional en features.csv). Dice
// claramente que todavía no existe, en vez de fingir.

export function BrowserScreen() {
  return (
    <Screen title="Navegador">
      <EmptyState icon={<Globe />} title="El navegador integrado aún no está disponible" action={<Button onClick={() => navigate("/")}>Volver a las descargas</Button>}>
        Mientras tanto, copia el enlace desde tu navegador y pulsa Pegar enlace.
      </EmptyState>
    </Screen>
  );
}
