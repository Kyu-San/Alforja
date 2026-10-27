import { Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { Switch } from "../components/ui/Form";
import { useToast } from "../components/ui/Toast";
import { message } from "../lib/errors";
import { qualityLabel } from "../lib/format";
import { useStore } from "../store";
import {
  audioContainers,
  audioQualities,
  Checkbox,
  choiceFromOptions,
  Destination,
  KindToggle,
  loadLastChoice,
  Select,
  SubtitlePicker,
  toOptions,
  videoContainers,
  type Choice,
} from "./DownloadOptions";

// Idiomas para elegir subtítulos sin tener un video delante.
const COMMON_LANGS = ["es", "en", "pt", "fr", "de", "it", "ca", "ja", "ko", "zh"].map((lang) => ({ lang, name: null, auto: false }));

export const smartQualityOptions = [
  { value: "best", label: "La mejor disponible" },
  ...[2160, 1440, 1080, 720, 480, 360].map((h) => ({ value: `${h}p`, label: `Hasta ${qualityLabel(h)}` })),
];

/** S08: elegir una vez cómo se descarga todo; luego, pegar = descargar. */
export function SmartModeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const smart = useStore((s) => s.smart);
  const setSmart = useStore((s) => s.setSmart);
  const outputDir = useStore((s) => s.settings?.outputDir ?? "");
  const toast = useToast();
  const [c, setC] = useState<Choice>(() => (smart ? choiceFromOptions(smart.options, outputDir) : loadLastChoice(outputDir)));
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Choice>) => setC((x) => ({ ...x, ...p }));

  // Al abrir: lo guardado o, la primera vez, la última elección y activado.
  useEffect(() => {
    if (!open) return;
    setC(smart ? choiceFromOptions(smart.options, outputDir) : loadLastChoice(outputDir));
    setEnabled(smart ? smart.isSmartMode : true);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true);
    try {
      const p = await api.saveSmartMode(toOptions(c), enabled);
      setSmart(p);
      onOpenChange(false);
      toast({ kind: "info", title: enabled ? "Smart Mode activado" : "Smart Mode desactivado", body: enabled ? "Pega un enlace y se descarga directamente." : undefined });
    } catch (e) {
      toast({ kind: "error", title: "No se guardó", body: message(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Smart Mode"
      description="Elige una vez cómo quieres tus descargas. Con Smart Mode activado, cada video que pegues se descarga así, sin preguntar. Las listas y los canales siguen mostrando su diálogo."
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<Zap className="size-4" />} onClick={save} loading={busy}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
          <label htmlFor="smart-on" className="font-medium">
            Activar Smart Mode
          </label>
          <Switch id="smart-on" label="Activar Smart Mode" checked={enabled} onChange={setEnabled} />
        </div>
        <KindToggle value={c.kind} onChange={(kind) => set({ kind })} />
        <div className="grid grid-cols-2 gap-2">
          {c.kind === "video" ? (
            <>
              <Select label="Calidad" value={c.videoQuality} onChange={(videoQuality) => set({ videoQuality })} options={smartQualityOptions} />
              <Select label="Formato" value={c.videoContainer} onChange={(v) => set({ videoContainer: v as Choice["videoContainer"] })} options={videoContainers} />
            </>
          ) : (
            <>
              <Select label="Calidad del audio" value={c.audioQuality} onChange={(audioQuality) => set({ audioQuality })} options={audioQualities} />
              <Select label="Formato" value={c.audioContainer} onChange={(v) => set({ audioContainer: v as Choice["audioContainer"] })} options={audioContainers} />
            </>
          )}
        </div>
        {c.kind === "video" ? (
          <>
            <SubtitlePicker tracks={COMMON_LANGS} value={c.subtitleLangs} onChange={(subtitleLangs) => set({ subtitleLangs })} />
            <Checkbox checked={c.subtitlesEmbedded} onChange={(subtitlesEmbedded) => set({ subtitlesEmbedded })} disabled={!c.subtitleLangs.length}>
              Incrustar los subtítulos en el video
            </Checkbox>
          </>
        ) : null}
        <Destination value={c.outputDir} onChange={(outputDir) => set({ outputDir })} />
        <p className="text-xs text-muted">Si un video no tiene la calidad o los subtítulos elegidos, se baja lo más parecido que haya y la fila lo dice.</p>
      </div>
    </Dialog>
  );
}
