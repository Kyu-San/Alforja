import * as DM from "@radix-ui/react-dropdown-menu";
import * as RG from "@radix-ui/react-radio-group";
import { Check, ChevronDown } from "lucide-react";
import { useId } from "react";
import { api, type AudioTrack, type Kind, type QualityOption, type SubtitleTrack } from "../api";
import { cn } from "../components/ui/cn";
import { Badge } from "../components/ui/Feedback";
import { Checkbox, FolderPicker, Label, Select, type Option } from "../components/ui/Form";
import { menuContent, menuItem } from "../components/ui/Menu";
import { bytes, language, qualityLabel } from "../lib/format";

export interface Choice {
  kind: Kind;
  videoContainer: "mp4" | "mkv";
  audioContainer: "mp3" | "m4a" | "ogg";
  /** "best" o "1080p" */
  videoQuality: string;
  /** "best" o "320k" */
  audioQuality: string;
  audioLang: string | null;
  subtitleLangs: string[];
  subtitlesEmbedded: boolean;
  outputDir: string;
}

export const defaultChoice = (outputDir: string): Choice => ({
  kind: "video",
  videoContainer: "mp4",
  audioContainer: "mp3",
  videoQuality: "best",
  audioQuality: "320k",
  audioLang: null,
  subtitleLangs: [],
  subtitlesEmbedded: false,
  outputDir,
});

const LAST = "alforja.ultima-eleccion";

/** La elección de la última descarga (sin la carpeta, que sale de los ajustes). */
export function loadLastChoice(outputDir: string): Choice {
  const base = defaultChoice(outputDir);
  try {
    const saved = JSON.parse(localStorage.getItem(LAST) ?? "null");
    if (!saved || typeof saved !== "object") return base;
    return {
      ...base,
      kind: saved.kind === "audio" ? "audio" : "video",
      videoContainer: saved.videoContainer === "mkv" ? "mkv" : "mp4",
      audioContainer: ["mp3", "m4a", "ogg"].includes(saved.audioContainer) ? saved.audioContainer : "mp3",
      videoQuality: typeof saved.videoQuality === "string" ? saved.videoQuality : base.videoQuality,
      audioQuality: typeof saved.audioQuality === "string" ? saved.audioQuality : base.audioQuality,
      subtitleLangs: Array.isArray(saved.subtitleLangs) ? saved.subtitleLangs.filter((l: unknown) => typeof l === "string") : [],
      subtitlesEmbedded: !!saved.subtitlesEmbedded,
    };
  } catch {
    return base;
  }
}

export function saveLastChoice(c: Choice) {
  try {
    const { outputDir: _dir, audioLang: _lang, ...rest } = c;
    localStorage.setItem(LAST, JSON.stringify(rest));
  } catch {
    // Sin almacenamiento: la próxima vez sale la elección por defecto.
  }
}

/** Una elección a partir de unas opciones guardadas (modo directo, suscripción). */
export function choiceFromOptions(o: { kind: Kind; container: string; quality: string; subtitleLangs?: string[]; subtitlesEmbedded?: boolean; outputDir?: string | null }, outputDir: string): Choice {
  const c = defaultChoice(o.outputDir || outputDir);
  return o.kind === "audio"
    ? { ...c, kind: "audio", audioContainer: o.container as Choice["audioContainer"], audioQuality: o.quality }
    : { ...c, kind: "video", videoContainer: o.container as Choice["videoContainer"], videoQuality: o.quality, subtitleLangs: o.subtitleLangs ?? [], subtitlesEmbedded: !!o.subtitlesEmbedded };
}

export function toOptions(c: Choice) {
  return c.kind === "video"
    ? { kind: c.kind, container: c.videoContainer, quality: c.videoQuality, audioLang: c.audioLang, subtitleLangs: c.subtitleLangs, subtitlesEmbedded: c.subtitlesEmbedded, outputDir: c.outputDir }
    : { kind: c.kind, container: c.audioContainer, quality: c.audioQuality, audioLang: c.audioLang, subtitleLangs: c.subtitleLangs, subtitlesEmbedded: false, outputDir: c.outputDir };
}

export function KindToggle({ value, onChange }: { value: Kind; onChange: (k: Kind) => void }) {
  return (
    <RG.Root value={value} onValueChange={(v) => onChange(v as Kind)} aria-label="Qué descargar" className="inline-flex rounded-md border border-border bg-surface p-0.5" orientation="horizontal">
      {(
        [
          ["video", "Video"],
          ["audio", "Solo audio"],
        ] as const
      ).map(([v, l]) => (
        <RG.Item key={v} value={v} className="h-7 rounded-sm px-3.5 text-sm text-muted outline-none data-[state=checked]:bg-surface-hover data-[state=checked]:text-text focus-visible:outline-2 focus-visible:outline-focus">
          {l}
        </RG.Item>
      ))}
    </RG.Root>
  );
}

/** Lista de calidades (S03). Si el sitio no da alturas, una sola opción: la mejor. */
export function QualityList({ qualities, value, onChange, audioSize }: { qualities: QualityOption[]; value: string; onChange: (v: string) => void; audioSize: number | null }) {
  const options = qualities.length
    ? qualities.map((q) => ({ value: `${q.height}p`, label: qualityLabel(q.height), size: q.sizeBytes, q }))
    : [{ value: "best", label: "La mejor disponible", size: audioSize, q: null }];
  return (
    <RG.Root value={value} onValueChange={onChange} aria-label="Calidad" className="flex flex-col gap-1.5">
      {options.map((o) => (
        <RG.Item
          key={o.value}
          value={o.value}
          className={cn(
            "group flex h-10 items-center gap-2.5 rounded-md border border-border px-3 text-left outline-none",
            "hover:bg-surface-hover data-[state=checked]:border-accent focus-visible:outline-2 focus-visible:outline-focus",
          )}
        >
          <span className="grid size-4 shrink-0 place-items-center rounded-pill border border-border-input group-data-[state=checked]:border-5 group-data-[state=checked]:border-accent" aria-hidden />
          <span className="text-base">{o.label}</span>
          {o.q?.hdr ? <Badge tone="accent">HDR</Badge> : null}
          {o.q?.highFps ? <Badge>60 fps</Badge> : null}
          <span className="ml-auto text-sm text-muted tabular">{o.size ? `≈ ${bytes(o.size)}` : ""}</span>
        </RG.Item>
      ))}
    </RG.Root>
  );
}

export function SubtitlePicker({ tracks, value, onChange }: { tracks: SubtitleTrack[]; value: string[]; onChange: (v: string[]) => void }) {
  const id = useId();
  const triggerId = useId();
  const sorted = [...tracks].sort((a, b) => Number(a.auto) - Number(b.auto) || language(a.lang).localeCompare(language(b.lang)));
  const summary = value.length ? value.map(language).join(", ") : tracks.length ? "Ninguno" : "No tiene";
  return (
    <div className="min-w-0">
      <Label id={id}>Subtítulos</Label>
      <DM.Root modal={false}>
        <DM.Trigger
          id={triggerId}
          aria-labelledby={`${id} ${triggerId}`}
          disabled={!tracks.length}
          className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border-input bg-surface px-2.5 text-left text-base outline-none hover:border-muted focus-visible:border-accent disabled:opacity-45 data-[state=open]:border-accent"
        >
          <span className="truncate">{summary}</span>
          <ChevronDown className="size-4 shrink-0 text-muted" />
        </DM.Trigger>
        <DM.Portal>
          <DM.Content sideOffset={4} align="start" className={cn(menuContent, "max-h-72 overflow-y-auto")}>
            {sorted.map((t) => (
              <DM.CheckboxItem
                key={t.lang}
                className={cn(menuItem, "pl-8 relative")}
                checked={value.includes(t.lang)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(c) => onChange(c ? [...value, t.lang] : value.filter((l) => l !== t.lang))}
              >
                <DM.ItemIndicator className="absolute left-2">
                  <Check className="text-accent" />
                </DM.ItemIndicator>
                {language(t.lang)}
                {t.auto ? <span className="ml-auto pl-4 text-xs text-muted">automáticos</span> : null}
              </DM.CheckboxItem>
            ))}
          </DM.Content>
        </DM.Portal>
      </DM.Root>
    </div>
  );
}

export const ORIGINAL_AUDIO = "original";

export function audioTrackOptions(tracks: AudioTrack[]): Option[] {
  const original = tracks.find((t) => t.isOriginal);
  return [
    { value: ORIGINAL_AUDIO, label: original ? `Original (${language(original.lang)})` : "La del video" },
    ...tracks.filter((t) => t !== original).map((t) => ({ value: t.lang, label: language(t.lang) })),
  ];
}

export const videoContainers: Option[] = [
  { value: "mp4", label: "MP4", hint: "se abre en todas partes" },
  { value: "mkv", label: "MKV", hint: "sin conversión, más pistas" },
];
export const audioContainers: Option[] = [
  { value: "mp3", label: "MP3" },
  { value: "m4a", label: "M4A" },
  { value: "ogg", label: "OGG" },
];
export const audioQualities: Option[] = [
  { value: "320k", label: "320 kbps" },
  { value: "192k", label: "192 kbps" },
  { value: "128k", label: "128 kbps" },
  { value: "best", label: "Sin recomprimir de más" },
];

export function Destination({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <FolderPicker
      label="Guardar en"
      value={value}
      onPick={async () => {
        const dir = await api.pickFolder(value);
        if (dir) onChange(dir);
      }}
    />
  );
}

export { Checkbox, Select };
