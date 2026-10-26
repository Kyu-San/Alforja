import { create } from "zustand";
import { api, type ParseResult } from "../api";
import { message } from "../lib/errors";

// El recorrido de un enlace: escribirlo (si el portapapeles no tenía uno),
// analizarlo (S02) y elegir qué bajar (S03 video / S04 lista).
type Stage = "closed" | "input" | "parsing" | "error" | "ready";

interface Flow {
  stage: Stage;
  url: string;
  result: ParseResult | null;
  error: string | null;
  token: number;
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
  openInput: (prefill = "") => set({ stage: "input", url: prefill, error: null, result: null }),
  analyze: async (raw) => {
    const url = raw.trim();
    const token = get().token + 1;
    set({ stage: "parsing", url, error: null, result: null, token });
    try {
      const result = await api.parseUrl(url);
      if (get().token === token && get().stage === "parsing") set({ stage: "ready", result });
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
