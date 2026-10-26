import type { Api } from "./types";
import { tauriApi } from "./tauri";
import { fakeApi } from "./fake";

// Dentro de la app de escritorio, la real; en un navegador normal, la simulada.
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const api: Api = inTauri ? tauriApi : fakeApi;
export * from "./types";
