import { create } from "zustand";
import { api, type AppEvent, type Download, type Settings } from "./api";

export interface Live {
  speed: number | null;
  etaS: number | null;
}

interface State {
  downloads: Record<string, Download>;
  live: Record<string, Live>;
  settings: Settings | null;
  loaded: boolean;
  loadError: string | null;
  selectedId: string | null;
  search: string;
  load: () => Promise<void>;
  apply: (e: AppEvent) => void;
  upsert: (d: Download) => void;
  remove: (ids: string[]) => void;
  select: (id: string | null) => void;
  setSearch: (q: string) => void;
  setSettings: (s: Settings) => void;
}

export const useStore = create<State>((set) => ({
  downloads: {},
  live: {},
  settings: null,
  loaded: false,
  loadError: null,
  selectedId: null,
  search: "",
  load: async () => {
    try {
      const [list, settings] = await Promise.all([api.listDownloads(), api.getSettings()]);
      set({ downloads: Object.fromEntries(list.map((d) => [d.id, d])), settings, loaded: true, loadError: null });
    } catch (e) {
      set({ loaded: true, loadError: (e as { message?: string })?.message ?? String(e) });
    }
  },
  apply: (e) =>
    set((s) => {
      switch (e.type) {
        case "progress": {
          const d = s.downloads[e.id];
          if (!d) return s;
          return {
            downloads: { ...s.downloads, [e.id]: { ...d, downloadedBytes: e.downloadedBytes, sizeBytes: e.totalBytes ?? d.sizeBytes } },
            live: { ...s.live, [e.id]: { speed: e.speed, etaS: e.etaS } },
          };
        }
        case "download": {
          const live = { ...s.live };
          if (e.download.status !== "downloading") delete live[e.download.id];
          return { downloads: { ...s.downloads, [e.download.id]: e.download }, live };
        }
        case "removed": {
          const downloads = { ...s.downloads };
          delete downloads[e.id];
          return { downloads, selectedId: s.selectedId === e.id ? null : s.selectedId };
        }
      }
    }),
  upsert: (d) => set((s) => ({ downloads: { ...s.downloads, [d.id]: d } })),
  remove: (ids) =>
    set((s) => {
      const downloads = { ...s.downloads };
      ids.forEach((id) => delete downloads[id]);
      return { downloads, selectedId: s.selectedId && ids.includes(s.selectedId) ? null : s.selectedId };
    }),
  select: (id) => set({ selectedId: id }),
  setSearch: (q) => set({ search: q }),
  setSettings: (settings) => set({ settings }),
}));

/** Lista ordenada (lo más nuevo arriba) y filtrada por la búsqueda. */
/** Selecciona una fila y le da el foco cuando ya esté pintada. */
export function focusDownload(id: string) {
  useStore.getState().select(id);
  const tryFocus = (n: number) => {
    const el = document.getElementById(`row-${id}`);
    if (el) el.focus();
    else if (n > 0) requestAnimationFrame(() => tryFocus(n - 1));
  };
  requestAnimationFrame(() => tryFocus(10));
}

export function visibleDownloads(s: Pick<State, "downloads" | "search">): Download[] {
  const q = s.search.trim().toLowerCase();
  return Object.values(s.downloads)
    .filter((d) => !q || (d.title ?? "").toLowerCase().includes(q) || d.sourceUrl.toLowerCase().includes(q))
    .sort((a, b) => b.position - a.position);
}
