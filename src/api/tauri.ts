import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { open } from "@tauri-apps/plugin-dialog";
import type { Api, AppEvent } from "./types";

export const tauriApi: Api = {
  mode: "tauri",
  parseUrl: (url) => invoke("parse_url", { url }),
  startDownload: (url, options) => invoke("start_download", { url, options }),
  startPlaylistDownload: (url, entryIds, options) => invoke("start_playlist_download", { url, entryIds, options }),
  listDownloads: (search) => invoke("list_downloads", { search: search ?? null }),
  pauseDownload: (id) => invoke("pause_download", { id }),
  resumeDownload: (id) => invoke("resume_download", { id }),
  cancelDownload: (id) => invoke("cancel_download", { id }),
  retryDownload: (id) => invoke("retry_download", { id }),
  removeDownload: (id, deleteFile) => invoke("remove_download", { id, deleteFile }),
  clearFinished: () => invoke("clear_finished"),
  openFile: (id) => invoke("open_file", { id }),
  revealInFolder: (id) => invoke("reveal_in_folder", { id }),
  getSettings: () => invoke("get_settings"),
  updateSettings: (patch) => invoke("update_settings", { patch }),
  engineStatus: () => invoke("engine_status"),
  engineCheck: () => invoke("engine_check"),
  engineUpdate: () => invoke("engine_update"),
  engineRollback: () => invoke("engine_rollback"),
  onEvent: (cb) => listen<AppEvent>("app-event", (e) => cb(e.payload)),
  readClipboard: async () => {
    try {
      return await readText();
    } catch {
      return null;
    }
  },
  pickFolder: async (current) => {
    const r = await open({ directory: true, defaultPath: current, title: "Elige la carpeta de destino" });
    return typeof r === "string" ? r : null;
  },
};
