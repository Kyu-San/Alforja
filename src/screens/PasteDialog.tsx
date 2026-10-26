import { CircleAlert, Download as DownloadIcon, Film, ListVideo, Music } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type MediaInfo, type PlaylistInfo } from "../api";
import { Button } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { Dialog } from "../components/ui/Dialog";
import { Skeleton } from "../components/ui/Feedback";
import { Checkbox, SearchField, Select, TextField } from "../components/ui/Form";
import { useToast } from "../components/ui/Toast";
import { message, splitDetail } from "../lib/errors";
import { clock, qualityLabel } from "../lib/format";
import { focusDownload, useStore } from "../store";
import {
  audioContainers,
  audioQualities,
  audioTrackOptions,
  defaultChoice,
  Destination,
  KindToggle,
  ORIGINAL_AUDIO,
  QualityList,
  SubtitlePicker,
  toOptions,
  videoContainers,
  type Choice,
} from "./DownloadOptions";
import { looksLikeUrl, useFlow } from "./pasteFlow";

export function PasteDialog() {
  const { stage, result, close } = useFlow();
  const open = stage !== "closed";
  const onOpenChange = (o: boolean) => !o && close();

  if (stage === "ready" && result?.type === "video") return <VideoDialog info={result} onOpenChange={onOpenChange} />;
  if (stage === "ready" && result?.type === "playlist") return <PlaylistDialog info={result} onOpenChange={onOpenChange} />;
  return <InputDialog open={open} onOpenChange={onOpenChange} />;
}

/** S02: escribir el enlace, analizarlo, o ver por qué no se pudo. */
function InputDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { stage, url, error, analyze } = useFlow();
  const [value, setValue] = useState(url);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    setValue(url);
    setTouched(false);
  }, [url, open]);
  const invalid = touched && value.trim() !== "" && !looksLikeUrl(value);
  const parsing = stage === "parsing";
  const submit = () => {
    setTouched(true);
    if (looksLikeUrl(value)) analyze(value);
  };
  const [head, detail] = splitDetail(error);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={parsing ? "Analizando el enlace…" : stage === "error" ? "No se pudo analizar" : "Pegar un enlace"}
      busy={parsing}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={parsing} disabled={!value.trim()}>
            {stage === "error" ? "Reintentar" : "Analizar"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <TextField
          label="Enlace del video, la lista o el canal"
          placeholder="https://…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          error={invalid ? "Eso no parece un enlace: tiene que empezar por http:// o https://" : null}
          hint={!parsing && stage !== "error" ? "El portapapeles no tenía un enlace. Pégalo aquí (Ctrl+V)." : undefined}
          autoFocus
          disabled={parsing}
        />
        {parsing ? (
          <div className="flex gap-3" aria-hidden>
            <Skeleton className="h-16.75 w-30 shrink-0" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ) : null}
        {stage === "error" ? (
          <div role="alert" className="flex gap-2.5 rounded-md border border-danger/40 bg-surface p-3 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <div className="min-w-0">
              <p>{head}</p>
              {detail ? (
                <details className="mt-1 text-muted">
                  <summary className="cursor-default">Detalle técnico</summary>
                  <pre className="selectable mt-1 whitespace-pre-wrap break-words font-mono text-xs">{detail}</pre>
                </details>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}

function MediaHeader({ title, subtitle, thumbnail, icon }: { title: string; subtitle: string; thumbnail: string | null; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {thumbnail ? (
        <img src={thumbnail} alt="" className="h-16.75 w-30 shrink-0 rounded-sm bg-surface-hover object-cover" />
      ) : (
        <div className="grid h-16.75 w-30 shrink-0 place-items-center rounded-sm bg-surface-hover text-muted" aria-hidden>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="line-clamp-2 font-medium selectable">{title}</p>
        <p className="mt-0.5 truncate text-sm text-muted tabular">{subtitle}</p>
      </div>
    </div>
  );
}

function useChoice() {
  const outputDir = useStore((s) => s.settings?.outputDir ?? "");
  return useState<Choice>(() => defaultChoice(outputDir));
}

/** S03: un video. */
function VideoDialog({ info, onOpenChange }: { info: MediaInfo; onOpenChange: (o: boolean) => void }) {
  const toast = useToast();
  const [c, setC] = useChoice();
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Choice>) => setC((x) => ({ ...x, ...p }));
  useEffect(() => {
    // Por defecto, la mejor calidad que haya.
    set({ videoQuality: info.qualities[0] ? `${info.qualities[0].height}p` : "best" });
  }, [info.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setBusy(true);
    try {
      const d = await api.startDownload(info.url, toOptions(c));
      useStore.getState().upsert(d);
      onOpenChange(false);
      focusDownload(d.id);
    } catch (e) {
      toast({ kind: "error", title: "No se pudo empezar", body: message(e) });
    } finally {
      setBusy(false);
    }
  };
  const subtitle = [info.uploader, clock(info.durationS)].filter(Boolean).join(" · ");

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title="Descargar"
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<DownloadIcon className="size-4" />} onClick={start} loading={busy}>
            Descargar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <MediaHeader title={info.title} subtitle={subtitle} thumbnail={info.thumbnail} icon={c.kind === "audio" ? <Music className="size-6" /> : <Film className="size-6" />} />
        <KindToggle value={c.kind} onChange={(kind) => set({ kind })} />
        {c.kind === "video" ? (
          <QualityList qualities={info.qualities} value={c.videoQuality} onChange={(videoQuality) => set({ videoQuality })} audioSize={info.audioSizeBytes} />
        ) : (
          <Select label="Calidad del audio" value={c.audioQuality} onChange={(audioQuality) => set({ audioQuality })} options={audioQualities} />
        )}
        <div className="grid grid-cols-3 gap-2">
          {c.kind === "video" ? (
            <Select label="Formato" value={c.videoContainer} onChange={(v) => set({ videoContainer: v as Choice["videoContainer"] })} options={videoContainers} />
          ) : (
            <Select label="Formato" value={c.audioContainer} onChange={(v) => set({ audioContainer: v as Choice["audioContainer"] })} options={audioContainers} />
          )}
          <Select label="Pista de audio" value={c.audioLang ?? ORIGINAL_AUDIO} onChange={(v) => set({ audioLang: v === ORIGINAL_AUDIO ? null : v })} options={audioTrackOptions(info.audioTracks)} disabled={info.audioTracks.length < 2} />
          <SubtitlePicker tracks={info.subtitles} value={c.subtitleLangs} onChange={(subtitleLangs) => set({ subtitleLangs })} />
        </div>
        <Destination value={c.outputDir} onChange={(outputDir) => set({ outputDir })} />
        {c.kind === "video" ? (
          <Checkbox checked={c.subtitlesEmbedded} onChange={(subtitlesEmbedded) => set({ subtitlesEmbedded })} disabled={!c.subtitleLangs.length}>
            Incrustar los subtítulos en el video (además del archivo .srt)
          </Checkbox>
        ) : null}
      </div>
    </Dialog>
  );
}

const ROW = 56;

/** S04: una lista o un canal. */
function PlaylistDialog({ info, onOpenChange }: { info: PlaylistInfo; onOpenChange: (o: boolean) => void }) {
  const toast = useToast();
  const [c, setC] = useChoice();
  const set = (p: Partial<Choice>) => setC((x) => ({ ...x, ...p }));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(info.entries.map((e) => e.id)));
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? info.entries.filter((e) => (e.title ?? e.url).toLowerCase().includes(q)) : info.entries;
  }, [filter, info.entries]);
  const allVisibleChecked = visible.length > 0 && visible.every((e) => selected.has(e.id));
  const someVisibleChecked = visible.some((e) => selected.has(e.id));
  const toggleAll = (on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      visible.forEach((e) => (on ? n.add(e.id) : n.delete(e.id)));
      return n;
    });

  // Ventana virtual: solo se pintan las filas visibles (listas de miles).
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const viewH = 6 * ROW;
  const first = Math.max(0, Math.floor(scrollTop / ROW) - 4);
  const last = Math.min(visible.length, Math.ceil((scrollTop + viewH) / ROW) + 4);

  const start = async () => {
    setBusy(true);
    try {
      const ids = info.entries.filter((e) => selected.has(e.id)).map((e) => e.id);
      const ds = await api.startPlaylistDownload(info.url, ids, toOptions(c));
      ds.forEach(useStore.getState().upsert);
      onOpenChange(false);
      if (ds[0]) focusDownload(ds[0].id);
      toast({ kind: "success", title: `${ids.length} ${ids.length === 1 ? "video" : "videos"} en la cola`, body: `Se guardan en la carpeta «${info.title}».` });
    } catch (e) {
      toast({ kind: "error", title: "No se pudo empezar", body: message(e) });
    } finally {
      setBusy(false);
    }
  };

  const qualityOptions = [{ value: "best", label: "La mejor de cada video" }, ...[2160, 1440, 1080, 720, 480, 360].map((h) => ({ value: `${h}p`, label: `Hasta ${qualityLabel(h)}` }))];

  return (
    <Dialog
      open
      wide
      onOpenChange={onOpenChange}
      title={info.kind === "channel" ? "Descargar del canal" : "Descargar la lista"}
      busy={busy}
      footer={
        <>
          <span className="mr-auto text-sm text-muted tabular" aria-live="polite">
            {selected.size} de {info.entries.length} seleccionados
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<DownloadIcon className="size-4" />} onClick={start} loading={busy} disabled={!selected.size}>
            {selected.size === info.entries.length ? "Descargar todo" : `Descargar ${selected.size}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <MediaHeader
          title={info.title}
          subtitle={[info.uploader, `${info.entries.length} ${info.entries.length === 1 ? "video" : "videos"}`].filter(Boolean).join(" · ")}
          thumbnail={null}
          icon={<ListVideo className="size-6" />}
        />
        <div className="flex flex-wrap items-end gap-2">
          <KindToggle value={c.kind} onChange={(kind) => set({ kind })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {c.kind === "video" ? (
            <>
              <Select label="Calidad" value={c.videoQuality} onChange={(videoQuality) => set({ videoQuality })} options={qualityOptions} />
              <Select label="Formato" value={c.videoContainer} onChange={(v) => set({ videoContainer: v as Choice["videoContainer"] })} options={videoContainers} />
            </>
          ) : (
            <>
              <Select label="Calidad del audio" value={c.audioQuality} onChange={(audioQuality) => set({ audioQuality })} options={audioQualities} />
              <Select label="Formato" value={c.audioContainer} onChange={(v) => set({ audioContainer: v as Choice["audioContainer"] })} options={audioContainers} />
            </>
          )}
        </div>
        <Destination value={c.outputDir} onChange={(outputDir) => set({ outputDir })} />

        <div className="rounded-md border border-border">
          <div className="flex items-center gap-3 border-b border-border px-3 py-2">
            <Checkbox checked={allVisibleChecked ? true : someVisibleChecked ? "indeterminate" : false} onChange={toggleAll}>
              Seleccionar {filter ? "los filtrados" : "todos"}
            </Checkbox>
            <SearchField className="ml-auto w-56" label="Filtrar la lista" placeholder="Filtrar" value={filter} onChange={setFilter} />
          </div>
          <div ref={scroller} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="overflow-y-auto" style={{ height: Math.min(viewH, Math.max(ROW, visible.length * ROW)) }} role="group" aria-label="Videos de la lista">
            {visible.length === 0 ? (
              <p className="p-4 text-sm text-muted">Nada coincide con «{filter}».</p>
            ) : (
              <div style={{ height: visible.length * ROW, position: "relative" }}>
                {visible.slice(first, last).map((e, i) => (
                  <div key={e.id} className={cn("absolute inset-x-0 flex h-14 items-center gap-3 px-3", "hover:bg-surface-hover")} style={{ top: (first + i) * ROW }}>
                    <Checkbox
                      ariaLabel={e.title ?? e.url}
                      checked={selected.has(e.id)}
                      onChange={(on) =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (on) n.add(e.id);
                          else n.delete(e.id);
                          return n;
                        })
                      }
                    />
                    {e.thumbnail ? (
                      <img src={e.thumbnail} alt="" loading="lazy" className="h-11.25 w-20 shrink-0 rounded-sm bg-surface-hover object-cover" />
                    ) : (
                      <div className="grid h-11.25 w-20 shrink-0 place-items-center rounded-sm bg-surface-hover text-muted" aria-hidden>
                        <Film className="size-4" />
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate text-base">{e.title ?? e.url}</span>
                    <span className="text-sm text-muted tabular">{clock(e.durationS) ?? ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {c.kind === "video" ? <p className="text-xs text-muted">Si un video no tiene la calidad elegida, se baja la mejor que haya por debajo. El tamaño de cada uno se sabe al empezar a bajarlo.</p> : null}
      </div>
    </Dialog>
  );
}

