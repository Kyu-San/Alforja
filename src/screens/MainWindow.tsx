import * as DM from "@radix-ui/react-dropdown-menu";
import { ClipboardPaste, Ellipsis, Globe, Inbox, Info, ListX, RefreshCw, Rss, SearchX, Settings, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { api } from "../api";
import { Button, IconButton } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { EmptyState, Skeleton } from "../components/ui/Feedback";
import { SearchField } from "../components/ui/Form";
import { menuContent, menuItem, menuSeparator, menuShortcut } from "../components/ui/Menu";
import { useToast } from "../components/ui/Toast";
import { message } from "../lib/errors";
import { bytes } from "../lib/format";
import { navigate } from "../lib/router";
import { useStore, visibleDownloads } from "../store";
import { DownloadItem, useDownloadActions } from "./DownloadItem";
import { pasteFromClipboard } from "./pasteFlow";
import { SmartModeDialog } from "./Stubs";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const mod = isMac ? "⌘" : "Ctrl";

function Toolbar({ searchRef }: { searchRef: React.RefObject<HTMLInputElement> }) {
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const remove = useStore((s) => s.remove);
  const toast = useToast();
  const [smart, setSmart] = useState(false);
  return (
    <div role="toolbar" aria-label="Acciones" className="flex h-toolbar shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
      <Button variant="primary" icon={<ClipboardPaste className="size-4" />} onClick={() => pasteFromClipboard()} title={`Pegar enlace (${mod}+V)`}>
        Pegar enlace
      </Button>
      <Button variant="ghost" icon={<Zap className="size-4" />} onClick={() => setSmart(true)} className="font-medium">
        Smart Mode
      </Button>
      <div className="flex-1" />
      <SearchField ref={searchRef} className="w-56" label="Buscar en la lista" placeholder="Buscar en la lista" value={search} onChange={setSearch} />
      <IconButton label="Suscripciones" icon={<Rss className="size-5" />} onClick={() => navigate("/suscripciones")} />
      <IconButton label="Navegador" icon={<Globe className="size-5" />} onClick={() => navigate("/navegador")} />
      <IconButton label="Preferencias" shortcut={`${mod}+,`} icon={<Settings className="size-5" />} onClick={() => navigate("/preferencias/general")} />
      <DM.Root>
        <DM.Trigger asChild>
          <IconButton label="Más acciones" icon={<Ellipsis className="size-5" />} />
        </DM.Trigger>
        <DM.Portal>
          <DM.Content align="end" sideOffset={6} className={menuContent}>
            <DM.Item
              className={menuItem}
              onSelect={() =>
                api
                  .clearFinished()
                  .then((ids) => {
                    remove(ids);
                    toast({ kind: "info", title: ids.length ? `${ids.length} quitadas de la lista` : "No había nada terminado", body: ids.length ? "Los archivos siguen en su carpeta." : undefined });
                  })
                  .catch((e) => toast({ kind: "error", title: "No se pudo", body: message(e) }))
              }
            >
              <ListX /> Quitar las terminadas
            </DM.Item>
            <DM.Item className={menuItem} onSelect={() => useStore.getState().load()}>
              <RefreshCw /> Recargar la lista
            </DM.Item>
            <DM.Separator className={menuSeparator} />
            <DM.Item className={menuItem} onSelect={() => navigate("/preferencias/motor")}>
              <Info /> Motor y versión <span className={menuShortcut} />
            </DM.Item>
          </DM.Content>
        </DM.Portal>
      </DM.Root>
      <SmartModeDialog open={smart} onOpenChange={setSmart} />
    </div>
  );
}

function StatusBar() {
  const { downloading, queued, totalSpeed } = useStore(
    useShallow((s) => {
      const ds = Object.values(s.downloads);
      return {
        downloading: ds.filter((d) => d.status === "downloading" || d.status === "processing").length,
        queued: ds.filter((d) => d.status === "queued").length,
        totalSpeed: Object.entries(s.live).reduce((a, [id, l]) => a + (s.downloads[id]?.status === "downloading" ? l.speed ?? 0 : 0), 0),
      };
    }),
  );
  const parts = [];
  if (downloading) parts.push(`${downloading} descargando`);
  if (totalSpeed > 0) parts.push(`${bytes(totalSpeed)}/s`);
  if (queued) parts.push(`${queued} en cola`);
  return (
    <div className="flex h-7 shrink-0 items-center border-t border-border bg-surface px-4 text-xs text-muted tabular" role="status" aria-live="off">
      {parts.length ? parts.join(" · ") : "Sin descargas en marcha"}
    </div>
  );
}

function ListLoading() {
  return (
    <div aria-label="Cargando la lista" role="status">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="grid h-row grid-cols-[auto_minmax(0,1fr)_minmax(0,17.5rem)_4.5rem] items-center gap-3 border-b border-border px-4">
          <Skeleton className="h-thumb-h w-thumb-w" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-1 w-full" />
          <span />
        </div>
      ))}
    </div>
  );
}

/** La lista es un listbox: flechas, Inicio/Fin, Enter abre, Espacio pausa o reanuda, Supr quita. */
function DownloadList() {
  const state = useStore(useShallow((s) => ({ downloads: s.downloads, search: s.search, selectedId: s.selectedId, loaded: s.loaded, loadError: s.loadError })));
  const select = useStore((s) => s.select);
  const setSearch = useStore((s) => s.setSearch);
  const list = useMemo(() => visibleDownloads(state), [state.downloads, state.search]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = list.find((d) => d.id === state.selectedId) ?? null;
  const ref = useRef<HTMLDivElement>(null);

  const focusRow = (id: string) => {
    select(id);
    requestAnimationFrame(() => document.getElementById(`row-${id}`)?.focus());
  };

  if (!state.loaded) return <ListLoading />;
  if (state.loadError)
    return (
      <EmptyState icon={<ListX />} title="No se pudo cargar la lista" action={<Button onClick={() => useStore.getState().load()}>Reintentar</Button>}>
        {state.loadError}
      </EmptyState>
    );
  if (!Object.keys(state.downloads).length)
    return (
      <EmptyState
        icon={<Inbox />}
        title="Aún no hay descargas"
        action={
          <Button variant="primary" icon={<ClipboardPaste className="size-4" />} onClick={() => pasteFromClipboard()}>
            Pegar enlace
          </Button>
        }
      >
        Copia el enlace de un video, una lista o un canal y pulsa Pegar enlace (o {mod}+V).
      </EmptyState>
    );
  if (!list.length)
    return (
      <EmptyState icon={<SearchX />} title={`Nada coincide con «${state.search}»`} action={<Button onClick={() => setSearch("")}>Quitar la búsqueda</Button>} />
    );

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label="Descargas"
      className="min-h-0 flex-1 overflow-y-auto"
      onKeyDown={(e) => {
        const i = selected ? list.indexOf(selected) : -1;
        const go = (j: number) => {
          e.preventDefault();
          const d = list[Math.max(0, Math.min(list.length - 1, j))];
          if (d) focusRow(d.id);
        };
        if (e.key === "ArrowDown") go(i + 1);
        else if (e.key === "ArrowUp") go(i <= 0 ? 0 : i - 1);
        else if (e.key === "Home") go(0);
        else if (e.key === "End") go(list.length - 1);
        else if (selected && e.target instanceof HTMLElement && e.target.getAttribute("role") === "option") {
          if (e.key === "Enter" || e.key === " " || e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            rowKey.current?.(e.key, e.shiftKey);
          }
        }
      }}
    >
      {list.map((d, i) => (
        <DownloadItem key={d.id} d={d} selected={d.id === state.selectedId} focusable={selected ? d.id === selected.id : i === 0} />
      ))}
      {selected ? <RowKeys key={selected.id} id={selected.id} /> : null}
    </div>
  );
}

// Las teclas de la fila seleccionada usan las mismas acciones que sus botones.
const rowKey: { current: ((key: string, shift: boolean) => void) | null } = { current: null };
function RowKeys({ id }: { id: string }) {
  const d = useStore((s) => s.downloads[id]);
  const a = useDownloadActions(d);
  useEffect(() => {
    rowKey.current = (key, shift) => {
      if (key === "Enter" && d.status === "done") a.open();
      else if (key === " ") {
        if (d.status === "paused") a.resume();
        else if (d.status === "downloading" || d.status === "queued") a.pause();
        else if (d.status === "error" || d.status === "cancelled") a.retry();
      } else if ((key === "Delete" || key === "Backspace") && !shift) a.remove(false);
    };
    return () => {
      rowKey.current = null;
    };
  });
  return null;
}

export function MainWindow() {
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      if (document.querySelector("[role=dialog]")) return;
      if (modKey && e.key.toLowerCase() === "v" && !typing) {
        e.preventDefault();
        pasteFromClipboard();
      } else if (modKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={cn("flex h-full flex-col")}>
      <Toolbar searchRef={searchRef} />
      <DownloadList />
      <StatusBar />
    </div>
  );
}
