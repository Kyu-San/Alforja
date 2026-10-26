// Espejo de src-tauri/src/models.rs (serde en camelCase).

export type Kind = "video" | "audio";
export type Status = "queued" | "parsing" | "downloading" | "processing" | "paused" | "done" | "error" | "cancelled";
export type VideoContainer = "mp4" | "mkv";
export type AudioContainer = "mp3" | "m4a" | "ogg";

export interface Download {
  id: string;
  sourceUrl: string;
  videoId: string | null;
  extractor: string | null;
  title: string | null;
  uploader: string | null;
  thumbnailUrl: string | null;
  durationS: number | null;
  kind: Kind;
  container: string;
  quality: string;
  actualQuality: string | null;
  audioLang: string | null;
  subtitleLangs: string[];
  subtitlesEmbedded: boolean;
  outputDir: string;
  outputPath: string | null;
  sizeBytes: number | null;
  downloadedBytes: number;
  status: Status;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  position: number;
  playlistId: string | null;
  subscriptionId: string | null;
  presetId: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface DownloadOptions {
  kind: Kind;
  container: string;
  quality: string;
  audioLang?: string | null;
  subtitleLangs?: string[];
  subtitlesEmbedded?: boolean;
  outputDir?: string | null;
}

export interface QualityOption { height: number; sizeBytes: number | null; highFps: boolean; hdr: boolean }
export interface AudioTrack { lang: string; isOriginal: boolean }
export interface SubtitleTrack { lang: string; name: string | null; auto: boolean }

export interface MediaInfo {
  url: string;
  id: string;
  extractor: string | null;
  title: string;
  uploader: string | null;
  durationS: number | null;
  thumbnail: string | null;
  qualities: QualityOption[];
  audioSizeBytes: number | null;
  audioTracks: AudioTrack[];
  subtitles: SubtitleTrack[];
}

export interface PlaylistEntry { id: string; url: string; title: string | null; durationS: number | null; thumbnail: string | null }

export interface PlaylistInfo {
  url: string;
  id: string;
  title: string;
  uploader: string | null;
  kind: "playlist" | "channel";
  entries: PlaylistEntry[];
}

export type ParseResult = ({ type: "video" } & MediaInfo) | ({ type: "playlist" } & PlaylistInfo);

export interface Settings {
  outputDir: string;
  maxConcurrent: number;
  uiLanguage: string;
  theme: "system" | "light" | "dark";
  proxyUrl: string | null;
  filenameTemplate: string;
  cookiesBrowser: string | null;
  subscriptionEveryH: number;
  engineAutoUpdate: boolean;
  notifyOnFinish: boolean;
}

export type SettingsPatch = Partial<Omit<Settings, "proxyUrl" | "cookiesBrowser">> & {
  /** "" para quitarlo. */
  proxyUrl?: string;
  cookiesBrowser?: string;
};

export interface EngineStatus {
  ytdlpPath: string | null;
  ytdlpVersion: string | null;
  /** "app" = instalado por la app, "system" = del PATH, "env" = variable de entorno */
  ytdlpSource: "app" | "system" | "env" | null;
  ffmpegPath: string | null;
  ffmpegVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  canRollback: boolean;
  checkedAt: string | null;
  updating: boolean;
}

export type AppEvent =
  | { type: "progress"; id: string; downloadedBytes: number; totalBytes: number | null; speed: number | null; etaS: number | null }
  | { type: "download"; download: Download }
  | { type: "removed"; id: string }
  | { type: "engine"; status: EngineStatus };

export interface AppError { code: string; message: string }

export function isAppError(e: unknown): e is AppError {
  return typeof e === "object" && e !== null && "code" in e && "message" in e;
}

/** La capa de datos. La real (Tauri) y la simulada tienen esta misma forma. */
export interface Api {
  readonly mode: "tauri" | "fake";
  parseUrl(url: string): Promise<ParseResult>;
  startDownload(url: string, options: DownloadOptions): Promise<Download>;
  startPlaylistDownload(url: string, entryIds: string[], options: DownloadOptions): Promise<Download[]>;
  listDownloads(search?: string): Promise<Download[]>;
  pauseDownload(id: string): Promise<void>;
  resumeDownload(id: string): Promise<Download>;
  cancelDownload(id: string): Promise<void>;
  retryDownload(id: string): Promise<Download>;
  removeDownload(id: string, deleteFile: boolean): Promise<void>;
  clearFinished(): Promise<string[]>;
  openFile(id: string): Promise<void>;
  revealInFolder(id: string): Promise<void>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: SettingsPatch): Promise<Settings>;
  engineStatus(): Promise<EngineStatus>;
  /** Pregunta a GitHub por la última versión. */
  engineCheck(): Promise<EngineStatus>;
  engineUpdate(): Promise<EngineStatus>;
  engineRollback(): Promise<EngineStatus>;
  onEvent(cb: (e: AppEvent) => void): Promise<() => void>;
  readClipboard(): Promise<string | null>;
  pickFolder(current: string): Promise<string | null>;
}
