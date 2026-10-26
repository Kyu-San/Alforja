import { useSyncExternalStore } from "react";

// Rutas por hash: la app es una sola ventana, pero cada pantalla tiene su
// dirección (útil para el teclado, para volver atrás y para las capturas).
//   #/                       S01 descargas
//   #/suscripciones          S05
//   #/navegador              S06
//   #/preferencias/<sección> S07 (S10 = cuenta, S11 = motor)

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const read = () => window.location.hash.replace(/^#/, "") || "/";

export function useRoute(): string[] {
  const path = useSyncExternalStore(subscribe, read, () => "/");
  return path.split("/").filter(Boolean);
}

export function navigate(path: string) {
  window.location.hash = path;
}
