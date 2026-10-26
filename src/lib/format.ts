// Números y textos tal como se muestran (en español, con coma decimal).

const nf1 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const nf0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

export function bytes(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? nf0.format(v) : nf1.format(v)} ${units[i]}`;
}

export const speed = (bps: number | null | undefined) => (bps && bps > 0 ? `${bytes(bps)}/s` : null);

export function clock(s: number | null | undefined): string | null {
  if (s == null || !isFinite(s) || s < 0) return null;
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? h + ":" : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export const percent = (done: number, total: number | null | undefined) =>
  total && total > 0 ? Math.max(0, Math.min(100, Math.floor((done / total) * 100))) : null;

export function qualityLabel(height: number): string {
  if (height >= 4320) return `${height}p 8K`;
  if (height >= 2160) return `${height}p 4K`;
  if (height >= 1440) return `${height}p 2K`;
  return `${height}p`;
}

export function requestedQuality(kind: string, quality: string): string {
  if (quality === "best") return kind === "audio" ? "la mejor" : "la mejor";
  if (kind === "audio") return `${parseInt(quality) || quality} kbps`;
  return quality;
}

const langNames = new Intl.DisplayNames(["es"], { type: "language" });
export function language(code: string): string {
  try {
    const n = langNames.of(code);
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : code;
  } catch {
    return code;
  }
}

/** "/Users/ana/Videos/Documentales/2026" → "/Users/…/Documentales/2026" si no cabe. */
export function middleEllipsis(path: string, max = 42): string {
  if (path.length <= max) return path;
  const parts = path.split(/([/\\])/);
  const head = parts.slice(0, 3).join("");
  let tail = "";
  for (let i = parts.length - 1; i > 2; i--) {
    const next = parts[i] + tail;
    if (head.length + next.length + 1 > max) break;
    tail = next;
  }
  return `${head}…${tail.startsWith("/") || tail.startsWith("\\") ? "" : "/"}${tail}`;
}

/** ¿Se pidió más de lo que se obtuvo? ("2160p" pedido, "1080p" obtenido) */
export function gotLess(requested: string, actual: string | null): boolean {
  const r = parseInt(requested);
  const a = actual ? parseInt(actual) : NaN;
  return !!actual && actual.endsWith("p") && isFinite(r) && isFinite(a) && a < r;
}
