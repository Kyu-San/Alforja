// Capa de datos simulada: misma forma que la real, todo en memoria.
// Se usa al abrir la interfaz en un navegador normal (npm run dev) y para las
// capturas y pruebas de la interfaz. Nunca descarga nada.
//
// ?seed=empty  empieza sin descargas
// ?seed=long   títulos muy largos
// ?slow=1      análisis lento (para ver el estado "Analizando")

import type { Api, AppEvent, Download, DownloadOptions, EngineStatus, MediaInfo, ParseResult, PlaylistInfo, Settings, Status } from "./types";

const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
const listeners = new Set<(e: AppEvent) => void>();
const emit = (e: AppEvent) => listeners.forEach((l) => l(e));
const err = (code: string, message: string) => ({ code, message });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
let seq = 0;
const uid = () => `fake-${++seq}-${Math.random().toString(36).slice(2, 8)}`;

let settings: Settings = {
  outputDir: "/Users/tú/Descargas",
  maxConcurrent: 3,
  uiLanguage: "es",
  theme: "dark",
  proxyUrl: null,
  filenameTemplate: "%(title).180B [%(id)s].%(ext)s",
  cookiesBrowser: null,
  subscriptionEveryH: 6,
  engineAutoUpdate: true,
  notifyOnFinish: true,
};

const downloads = new Map<string, Download>();
const parsed = new Map<string, ParseResult>();

function make(partial: Partial<Download> & { title: string }): Download {
  const position = Math.max(0, ...[...downloads.values()].map((d) => d.position)) + 1;
  return {
    id: uid(),
    sourceUrl: "https://ejemplo.com/v/" + position,
    videoId: "v" + position,
    extractor: "Ejemplo",
    uploader: "Canal de ejemplo",
    thumbnailUrl: null,
    durationS: 300,
    kind: "video",
    container: "mp4",
    quality: "1080p",
    actualQuality: null,
    audioLang: null,
    subtitleLangs: [],
    subtitlesEmbedded: false,
    outputDir: settings.outputDir,
    outputPath: null,
    sizeBytes: 412_000_000,
    downloadedBytes: 0,
    status: "queued",
    errorCode: null,
    errorMessage: null,
    attempts: 0,
    position,
    playlistId: null,
    subscriptionId: null,
    presetId: null,
    createdAt: now(),
    finishedAt: null,
    ...partial,
  };
}

function seed() {
  if (params.get("seed") === "empty") return;
  const long = params.get("seed") === "long";
  const t = (s: string) => (long ? `${s} — edición extendida con comentarios del director, escenas eliminadas y subtítulos en doce idiomas` : s);
  const rows: Array<Partial<Download> & { title: string }> = [
    { title: t("Concierto en directo — parte 2"), quality: "720p", status: "paused", sizeBytes: 530_000_000, downloadedBytes: 212_000_000 },
    { title: t("Video privado de una lista"), status: "error", errorCode: "private", errorMessage: "Es privado: conecta tu cuenta en Preferencias para bajarlo.", sizeBytes: null },
    { title: t("Clase de cocina: pan casero"), quality: "2160p", actualQuality: "1080p", status: "done", sizeBytes: 640_000_000, downloadedBytes: 640_000_000, outputPath: "/Users/tú/Descargas/Clase de cocina.mp4", finishedAt: now() },
    { title: t("Podcast 112 — entrevista completa"), kind: "audio", container: "mp3", quality: "320k", actualQuality: "320 kbps", status: "done", sizeBytes: 86_000_000, downloadedBytes: 86_000_000, outputPath: "/Users/tú/Descargas/Podcast 112.mp3", finishedAt: now() },
    { title: t("Documental: el viaje de la luz (4K)"), container: "mkv", quality: "2160p", status: "queued", sizeBytes: 2_100_000_000 },
    { title: t("Cómo afinar una guitarra en 5 minutos (sin afinador)"), status: "queued", sizeBytes: 412_000_000 },
  ];
  for (const r of rows) {
    const d = make(r);
    downloads.set(d.id, d);
  }
}
seed();

// ---------- simulación de la cola ----------

const running = new Map<string, number>();

function update(id: string, patch: Partial<Download>) {
  const d = downloads.get(id);
  if (!d) return;
  const n = { ...d, ...patch };
  downloads.set(id, n);
  emit({ type: "download", download: n });
}

function schedule() {
  const queued = [...downloads.values()].filter((d) => d.status === "queued" && !running.has(d.id)).sort((a, b) => a.position - b.position);
  while (running.size < settings.maxConcurrent && queued.length) {
    start(queued.shift()!);
  }
}

function start(d: Download) {
  update(d.id, { status: "downloading" });
  const total = d.sizeBytes ?? 150_000_000;
  const speed = 4_000_000 + Math.random() * 6_000_000;
  const timer = window.setInterval(() => {
    const cur = downloads.get(d.id);
    if (!cur) return stop(d.id);
    const next = Math.min(total, cur.downloadedBytes + speed / 4);
    downloads.set(d.id, { ...cur, downloadedBytes: next, sizeBytes: total });
    emit({ type: "progress", id: d.id, downloadedBytes: next, totalBytes: total, speed, etaS: Math.round((total - next) / speed) });
    if (next >= total) {
      stop(d.id);
      update(d.id, { status: "processing" });
      window.setTimeout(() => {
        const c = downloads.get(d.id);
        if (!c || c.status !== "processing") return;
        const fail = /error|falla/i.test(c.sourceUrl);
        if (fail) {
          update(d.id, { status: "error", errorCode: "http_403", errorMessage: "El servidor rechazó la descarga (403). Si pasa con muchos videos, actualiza el motor." });
        } else {
          const ext = c.kind === "audio" ? c.container : c.container;
          const h = c.kind === "video" ? (c.quality === "best" ? "1080p" : c.quality) : `${parseInt(c.quality) || 320} kbps`;
          update(d.id, { status: "done", outputPath: `${c.outputDir}/${c.title ?? "video"}.${ext}`, actualQuality: h, finishedAt: now() });
        }
        schedule();
      }, 1200);
    }
  }, 250);
  running.set(d.id, timer);
}

function stop(id: string) {
  const t = running.get(id);
  if (t !== undefined) window.clearInterval(t);
  running.delete(id);
}

// ---------- análisis simulado ----------

function fakeVideo(url: string): MediaInfo {
  const heights = [2160, 1440, 1080, 720, 480, 360];
  return {
    url,
    id: "abc123",
    extractor: "Ejemplo",
    title: url.includes("largo") ? "Un título larguísimo de prueba para ver cómo se comporta el diálogo cuando el nombre del video no cabe en una línea" : "Documental: el viaje de la luz (4K)",
    uploader: "Canal de ejemplo",
    durationS: 2538,
    thumbnail: null,
    qualities: heights.map((h) => ({ height: h, sizeBytes: Math.round(h * h * 0.45), highFps: h >= 1080, hdr: h === 2160 })),
    audioSizeBytes: 41_000_000,
    audioTracks: [
      { lang: "es", isOriginal: true },
      { lang: "en", isOriginal: false },
    ],
    subtitles: [
      { lang: "es", name: "Español", auto: false },
      { lang: "en", name: "English", auto: false },
      { lang: "fr", name: "Français", auto: true },
    ],
  };
}

function fakePlaylist(url: string): PlaylistInfo {
  return {
    url,
    id: "PL1",
    title: url.includes("canal") ? "Canal de ejemplo" : "Curso completo de guitarra",
    uploader: "Canal de ejemplo",
    kind: url.includes("canal") ? "channel" : "playlist",
    entries: Array.from({ length: 24 }, (_, i) => ({
      id: `e${i + 1}`,
      url: `${url}&v=${i + 1}`,
      title: `Lección ${i + 1}: ${["acordes básicos", "ritmo", "escalas", "arpegios", "improvisación", "repaso"][i % 6]}`,
      durationS: 300 + i * 37,
      thumbnail: null,
    })),
  };
}

export const fakeApi: Api = {
  mode: "fake",
  async parseUrl(url) {
    await sleep(params.get("slow") ? 2500 : 450);
    const u = url.trim();
    if (!/^https?:\/\/[^\s/]+/i.test(u)) throw err("invalid_url", "Eso no parece un enlace. Copia la dirección completa del video.");
    if (/privado/i.test(u)) throw err("private", "Es privado: conecta tu cuenta en Preferencias para bajarlo.");
    if (/no-compatible|unsupported/i.test(u)) throw err("unsupported", "Este sitio o enlace no es compatible.");
    const r: ParseResult = /list=|playlist|canal|@/i.test(u) ? { type: "playlist", ...fakePlaylist(u) } : { type: "video", ...fakeVideo(u) };
    parsed.set(u, r);
    return r;
  },
  async startDownload(url, o: DownloadOptions) {
    const m = parsed.get(url.trim());
    const info = m?.type === "video" ? m : null;
    const h = parseInt(o.quality) || 99999;
    const size = o.kind === "audio" ? info?.audioSizeBytes : info?.qualities.find((q) => q.height <= h)?.sizeBytes;
    const d = make({
      title: info?.title ?? url,
      sourceUrl: url,
      kind: o.kind,
      container: o.container,
      quality: o.quality,
      audioLang: o.audioLang ?? null,
      subtitleLangs: o.subtitleLangs ?? [],
      subtitlesEmbedded: !!o.subtitlesEmbedded,
      outputDir: o.outputDir || settings.outputDir,
      sizeBytes: size ?? null,
    });
    downloads.set(d.id, d);
    emit({ type: "download", download: d });
    schedule();
    return d;
  },
  async startPlaylistDownload(url, entryIds, o) {
    const m = parsed.get(url.trim());
    if (m?.type !== "playlist") throw err("not_playlist", "Ese enlace no es una lista.");
    const entries = m.entries.filter((e) => entryIds.includes(e.id));
    if (!entries.length) throw err("empty_selection", "Elige al menos un video de la lista.");
    const out: Download[] = [];
    const playlistId = uid();
    for (const e of entries) {
      const d = make({ title: e.title ?? e.url, sourceUrl: e.url, kind: o.kind, container: o.container, quality: o.quality, outputDir: `${o.outputDir || settings.outputDir}/${m.title}`, playlistId, sizeBytes: 60_000_000, durationS: e.durationS });
      downloads.set(d.id, d);
      emit({ type: "download", download: d });
      out.push(d);
    }
    schedule();
    return out;
  },
  async listDownloads(search) {
    const q = search?.trim().toLowerCase();
    return [...downloads.values()]
      .filter((d) => !q || (d.title ?? "").toLowerCase().includes(q) || d.sourceUrl.toLowerCase().includes(q))
      .sort((a, b) => b.position - a.position);
  },
  async pauseDownload(id) {
    const d = downloads.get(id);
    if (!d || !["queued", "downloading", "parsing", "processing"].includes(d.status)) throw err("invalid_state", "Solo se puede pausar lo que está en cola o descargando");
    stop(id);
    update(id, { status: "paused" });
    schedule();
  },
  async resumeDownload(id) {
    const d = downloads.get(id);
    if (!d || d.status !== "paused") throw err("invalid_state", "Solo se puede reanudar lo que está en pausa");
    update(id, { status: "queued" });
    schedule();
    return downloads.get(id)!;
  },
  async cancelDownload(id) {
    const d = downloads.get(id);
    if (!d || ["done", "error", "cancelled"].includes(d.status)) throw err("invalid_state", "Esta descarga ya terminó");
    stop(id);
    update(id, { status: "cancelled", downloadedBytes: 0 });
    schedule();
  },
  async retryDownload(id) {
    const d = downloads.get(id);
    if (!d || !["error", "cancelled"].includes(d.status)) throw err("invalid_state", "Solo se puede reintentar lo que falló o se canceló");
    update(id, { status: "queued", errorCode: null, errorMessage: null, attempts: d.attempts + (d.status === "error" ? 1 : 0), sourceUrl: d.sourceUrl.replace(/error|falla/gi, "ok") });
    schedule();
    return downloads.get(id)!;
  },
  async removeDownload(id) {
    stop(id);
    downloads.delete(id);
    emit({ type: "removed", id });
    schedule();
  },
  async clearFinished() {
    const ids = [...downloads.values()].filter((d) => ["done", "error", "cancelled"].includes(d.status)).map((d) => d.id);
    ids.forEach((id) => downloads.delete(id));
    return ids;
  },
  async openFile(id) {
    if (!downloads.get(id)?.outputPath) throw err("not_done", "Esta descarga aún no tiene archivo");
  },
  async revealInFolder(id) {
    if (!downloads.get(id)?.outputPath) throw err("not_done", "Esta descarga aún no tiene archivo");
  },
  async getSettings() {
    return settings;
  },
  async updateSettings(patch) {
    if (patch.maxConcurrent !== undefined && (patch.maxConcurrent < 1 || patch.maxConcurrent > 10)) throw err("invalid_settings", "Entre 1 y 10 descargas a la vez.");
    if (patch.proxyUrl && !/^(https?|socks5h?):\/\/[^\s/]+/i.test(patch.proxyUrl.trim())) throw err("invalid_settings", "Escribe una dirección que empiece por http://, https:// o socks5://");
    if (patch.filenameTemplate !== undefined && (/\.\.|^[/\\]|^[a-z]:/i.test(patch.filenameTemplate) || !patch.filenameTemplate.includes("%(")))
      throw err("invalid_template", "La plantilla del nombre no es válida: no puede tener «..» ni ser una ruta absoluta.");
    const { proxyUrl, cookiesBrowser, ...rest } = patch;
    settings = { ...settings, ...rest };
    if (proxyUrl !== undefined) settings.proxyUrl = proxyUrl.trim() || null;
    if (cookiesBrowser !== undefined) settings.cookiesBrowser = cookiesBrowser || null;
    schedule();
    return settings;
  },
  async engineStatus(): Promise<EngineStatus> {
    return { ytdlpPath: "(simulado)", ytdlpVersion: "2026.10.21", ffmpegPath: "(simulado)", ffmpegVersion: "7.1" };
  },
  async onEvent(cb) {
    listeners.add(cb);
    // Como la app real al arrancar: lo que estaba en cola empieza.
    window.setTimeout(schedule, 300);
    return () => listeners.delete(cb);
  },
  async readClipboard() {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  },
  async pickFolder() {
    return "/Users/tú/Videos/Elegida";
  },
};

// Para las pruebas de la interfaz.
export function __fakeStatuses(): Record<string, Status> {
  return Object.fromEntries([...downloads.values()].map((d) => [d.title ?? d.id, d.status]));
}
