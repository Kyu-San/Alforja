import { Trash2 } from "lucide-react";
import type { Download } from "../api";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";

export function ConfirmDelete({ open, onOpenChange, d, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; d: Download; onConfirm: () => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="¿Borrar el archivo?"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} autoFocus>
            No, dejarlo
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 className="size-4" />}
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            Borrar el archivo
          </Button>
        </>
      }
    >
      <p className="text-base">
        Se quita de la lista y se borra <span className="selectable font-medium">{d.outputPath?.split(/[/\\]/).pop()}</span> del disco. No va a la papelera.
      </p>
    </Dialog>
  );
}
