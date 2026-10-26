import * as CM from "@radix-ui/react-context-menu";
import { CircleAlert, CircleCheck, Clock, Copy, Film, FolderOpen, Music, Pause, Play, RotateCw, Trash2, X } from "lucide-react";
import { memo, useState, type ReactNode } from "react";
import { api, type Download } from "../api";
import { IconButton } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { ProgressBar } from "../components/ui/Feedback";
import { menuContent, menuDanger, menuItem, menuSeparator, menuShortcut } from "../components/ui/Menu";
import { Tooltip } from "../components/ui/Tooltip";
import { useToast } from "../components/ui/Toast";
import { message, splitDetail } from "../lib/errors";
import { bytes, clock, gotLess, percent, requestedQuality, speed } from "../lib/format";
import { useStore, type Live } from "../store";
import { ConfirmDelete } from "./ConfirmDelete";

/** Mensaje corto para la fila; el completo va en el tooltip. */
const shortError: Record<string, string> = {
  private: "Privado: conecta tu cuenta",
  age: "Restricción de edad",
  geo: "No disponible en tu país",
  unsupported: "Enlace no compatible",
  unavailable: "Ya no existe",
  rate_limited: "Limitado: espera y reintenta",
  http_403: "Rechazado (403)",
  network: "Sin conexión",
  disk_full: "Disco lleno",
  ffmpeg_missing: "Falta ffmpeg",
  engine_missing: "Falta el motor",
  engine: "Falló la descarga",
  output_dir: "No se puede escribir en la carpeta",
};

export function useDownloadActions(d: Download) {
  const toast = useToast();
  const run = (fn: () => Promise<unknown>) => () => {
    fn().catch((e) => toast({ kind: "error", title: "No se pudo", body: message(e) }));
  };
  const active = ["queued", "parsing", "downloading", "processing"].includes(d.status);
  return {
    active,
    open: run(() => api.openFile(d.id)),
    reveal: run(() => api.revealInFolder(d.id)),
    pause: run(() => api.pauseDownload(d.id)),
    resume: run(() => api.resumeDownload(d.id)),
    cancel: run(() => api.cancelDownload(d.id)),
    retry: run(() => api.retryDownload(d.id)),
    remove: (deleteFile: boolean) => run(() => api.removeDownload(d.id, deleteFile))(),
    copyLink: run(async () => {
      await navigator.clipboard.writeText(d.sourceUrl);
      toast({ kind: "info", title: "Enlace copiado" });
    }),
  };
}

function Meta({ d, live }: { d: Download; live?: Live }) {
  const quality = d.status === "done" && d.actualQuality && !gotLess(d.quality, d.actualQuality) ? d.actualQuality : requestedQuality(d.kind, d.quality);
  const parts: ReactNode[] = [d.container.toUpperCase(), quality];
  if (d.status === "downloading") {
    parts.push(`${bytes(d.downloadedBytes)} / ${bytes(d.sizeBytes)}`);
  } else if (d.sizeBytes) {
    parts.push(bytes(d.sizeBytes));
  }
  if (d.uploader) parts.push(d.uploader);
  return <div className="truncate text-sm text-muted tabular">{parts.join(" · ")}{live && d.status === "downloading" && speed(live.speed) ? ` · ${speed(live.speed)}` : ""}</div>;
}

function StatusCell({ d, live }: { d: Download; live?: Live }) {
  const pct = percent(d.downloadedBytes, d.sizeBytes);
  switch (d.status) {
    case "queued":
      return (
        <span className="flex items-center gap-1.5 text-sm text-muted">
          <Clock className="size-4" aria-hidden /> En cola
        </span>
      );
    case "parsing":
      return <Progress label="Analizando…" value={null} />;
    case "processing":
      return <Progress label={d.kind === "audio" ? "Convirtiendo el audio…" : "Uniendo video y audio…"} value={null} />;
    case "downloading": {
      const eta = clock(live?.etaS);
      return <Progress label={eta ? `Faltan ${eta}` : "Descargando…"} right={pct != null ? `${pct} %` : undefined} value={pct} />;
    }
    case "paused":
      return <Progress label="En pausa" right={pct != null ? `${pct} %` : undefined} value={pct ?? 0} tone="muted" />;
    case "done": {
      const less = gotLess(d.quality, d.actualQuality);
      return (
        <span className="flex min-w-0 items-center gap-1.5 text-sm">
          <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
          <span>Listo</span>
          {less ? <span className="truncate text-warning">· {d.actualQuality} (no había {d.quality})</span> : null}
        </span>
      );
    }
    case "error": {
      const [head, detail] = splitDetail(d.errorMessage);
      return (
        <Tooltip label={detail ? `${head}\n\n${detail}` : head}>
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-danger" tabIndex={-1}>
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{shortError[d.errorCode ?? ""] ?? head}</span>
          </span>
        </Tooltip>
      );
    }
    case "cancelled":
      return <span className="text-sm text-muted">Cancelada</span>;
  }
}

function Progress({ label, right, value, tone = "accent" }: { label: string; right?: string; value: number | null; tone?: "accent" | "muted" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={cn("flex items-center gap-2 text-sm tabular whitespace-nowrap", tone === "muted" && "text-muted")}>
        <span className="truncate">{label}</span>
        {right ? <span className="ml-auto">{right}</span> : null}
      </div>
      <ProgressBar value={value} tone={tone} label={label} />
    </div>
  );
}

function Actions({ d }: { d: Download }) {
  const a = useDownloadActions(d);
  const btn = (label: string, icon: ReactNode, onClick: () => void) => (
    <IconButton label={label} size="sm" icon={icon} onClick={(e) => (e.stopPropagation(), onClick())} tabIndex={-1} />
  );
  return (
    <div className="flex justify-end gap-0.5">
      {d.status === "downloading" || d.status === "queued" ? btn("Pausar", <Pause className="size-4" />, a.pause) : null}
      {d.status === "paused" ? btn("Reanudar", <Play className="size-4" />, a.resume) : null}
      {a.active || d.status === "paused" ? btn("Cancelar", <X className="size-4" />, a.cancel) : null}
      {d.status === "done" ? btn("Mostrar en la carpeta", <FolderOpen className="size-4" />, a.reveal) : null}
      {d.status === "error" || d.status === "cancelled" ? btn("Reintentar", <RotateCw className="size-4" />, a.retry) : null}
    </div>
  );
}

function Thumb({ d }: { d: Download }) {
  const [broken, setBroken] = useState(false);
  if (d.thumbnailUrl && !broken) {
    return <img src={d.thumbnailUrl} alt="" loading="lazy" onError={() => setBroken(true)} className="h-thumb-h w-thumb-w shrink-0 rounded-sm bg-surface-hover object-cover" />;
  }
  return (
    <div className="grid h-thumb-h w-thumb-w shrink-0 place-items-center rounded-sm bg-surface-hover text-muted" aria-hidden>
      {d.kind === "audio" ? <Music className="size-5" /> : <Film className="size-5" />}
    </div>
  );
}

export const DownloadItem = memo(function DownloadItem({ d, selected, focusable }: { d: Download; selected: boolean; focusable: boolean }) {
  const live = useStore((s) => s.live[d.id]);
  const select = useStore((s) => s.select);
  const a = useDownloadActions(d);
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <CM.Root modal={false} onOpenChange={(o) => o && select(d.id)}>
        <CM.Trigger asChild>
          <div
            role="row"
            id={`row-${d.id}`}
            aria-selected={selected}
            tabIndex={focusable ? 0 : -1}
            data-status={d.status}
            onClick={() => select(d.id)}
            onFocus={() => !selected && select(d.id)}
            onDoubleClick={() => d.status === "done" && a.open()}
            className={cn(
              "group relative grid h-row grid-cols-[auto_minmax(0,1fr)_minmax(0,17.5rem)_4.5rem] items-center gap-3 border-b border-border px-4 outline-none",
              "hover:bg-surface-hover focus-visible:bg-surface-hover",
              selected && "bg-surface-raised hover:bg-surface-raised before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
            )}
          >
            <div role="gridcell">
              <Thumb d={d} />
            </div>
            <div role="gridcell" className="min-w-0">
              <Tooltip label={d.title && d.title.length > 60 ? d.title : null}>
                <div className={cn("truncate font-medium", d.status === "cancelled" && "text-muted line-through decoration-muted/60")}>{d.title ?? d.sourceUrl}</div>
              </Tooltip>
              <Meta d={d} live={live} />
            </div>
            <div role="gridcell" className="min-w-0">
              <StatusCell d={d} live={live} />
            </div>
            <div role="gridcell">
              <Actions d={d} />
            </div>
          </div>
        </CM.Trigger>
        <CM.Portal>
          <CM.Content className={menuContent}>
            <CM.Item className={menuItem} disabled={d.status !== "done"} onSelect={a.open}>
              <Play /> Abrir <span className={menuShortcut}>Enter</span>
            </CM.Item>
            <CM.Item className={menuItem} disabled={d.status !== "done"} onSelect={a.reveal}>
              <FolderOpen /> Mostrar en la carpeta
            </CM.Item>
            <CM.Item className={menuItem} onSelect={a.copyLink}>
              <Copy /> Copiar el enlace
            </CM.Item>
            <CM.Separator className={menuSeparator} />
            {d.status === "paused" ? (
              <CM.Item className={menuItem} onSelect={a.resume}>
                <Play /> Reanudar <span className={menuShortcut}>Espacio</span>
              </CM.Item>
            ) : (
              <CM.Item className={menuItem} disabled={!(d.status === "downloading" || d.status === "queued")} onSelect={a.pause}>
                <Pause /> Pausar <span className={menuShortcut}>Espacio</span>
              </CM.Item>
            )}
            <CM.Item className={menuItem} disabled={!(d.status === "error" || d.status === "cancelled")} onSelect={a.retry}>
              <RotateCw /> Reintentar
            </CM.Item>
            <CM.Item className={menuItem} disabled={!(a.active || d.status === "paused")} onSelect={a.cancel}>
              <X /> Cancelar
            </CM.Item>
            <CM.Separator className={menuSeparator} />
            <CM.Item className={menuItem} onSelect={() => a.remove(false)}>
              <Trash2 /> Quitar de la lista <span className={menuShortcut}>Supr</span>
            </CM.Item>
            <CM.Item className={cn(menuItem, menuDanger)} disabled={d.status !== "done"} onSelect={() => setConfirm(true)}>
              <Trash2 /> Quitar y borrar el archivo… <span className={menuShortcut}>⇧ Supr</span>
            </CM.Item>
          </CM.Content>
        </CM.Portal>
      </CM.Root>
      <ConfirmDelete open={confirm} onOpenChange={setConfirm} d={d} onConfirm={() => a.remove(true)} />
    </>
  );
});
