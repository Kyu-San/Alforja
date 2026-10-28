import { create } from "zustand";
import { api, type Download, type ParseResult } from "../api";
import { message } from "../lib/errors";
import { focusDownload, useStore } from "../store";

// El recorrido de un enlace: escribirlo (si el portapapeles no tenía uno),
// analizarlo (S02) y elegir qué bajar (S03 video / S04 lista).
type Stage = "closed" | "input" | "parsing" | "error" | "ready";

interface Flow {
  stage: Stage;
  url: string;
  result: ParseResult | null;
  error: string | null;
  token: number;
  /** La última descarga que el modo directo puso en la cola sin diálogo (para avisar). */
  directStarted: Download | null;
  openInput: (prefill?: string) => void;
  analyze: (url: string) => Promise<void>;
  close: () => void;
}

export const looksLikeUrl = (s: string | null | undefined): s is string => !!s && /^https?:\/\/\S+$/i.test(s.trim());

export const useFlow = create<Flow>((set, get) => ({
  stage: "closed",
  url: "",
  result: null,
  error: null,
  token: 0,
  directStarted: null,
  openInput: (prefill = "") => set({ stage: "input", url: prefill, error: null, result: null }),
  analyze: async (raw) => {
    const url = raw.trim();
    const token = get().token + 1;
    set({ stage: "parsing", url, error: null, result: null, token });
    const current = () => get().token === token && get().stage === "parsing";
    try {
      // Modo directo: un video va directo a la cola; una lista sigue a S04.
      if (useStore.getState().direct?.isDirectMode) {
        const r = await api.directDownload(url);
        if (!current()) return;
        if (r.type === "started") {
          useStore.getState().add(r.download);
          set({ stage: "closed", directStarted: r.download });
          focusDownload(r.download.id);
        } else {
          set({ stage: "ready", result: { type: "playlist", ...r.info } });
        }
        return;
      }
      const result = await api.parseUrl(url);
      if (current()) set({ stage: "ready", result });
    } catch (e) {
      if (get().token === token && get().stage === "parsing") set({ stage: "error", error: message(e) });
    }
  },
  // Cerrar durante el análisis lo descarta (el resultado que llegue tarde se ignora).
  close: () => set((s) => ({ stage: "closed", token: s.token + 1 })),
}));

/** Botón "Pegar enlace" y Ctrl+V: usa el portapapeles si trae un enlace. */
export async function pasteFromClipboard() {
  const text = await api.readClipboard();
  const flow = useFlow.getState();
  if (looksLikeUrl(text)) {
    await flow.analyze(text);
  } else {
    flow.openInput();
  }
}
