import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { open } from "@tauri-apps/plugin-dialog";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
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
  getSmartMode: () => invoke("get_smart_mode"),
  saveSmartMode: (options, enabled) => invoke("save_smart_mode", { options, enabled }),
  smartDownload: (url) => invoke("smart_download", { url }),
  subscribe: (url, options) => invoke("subscribe", { url, options }),
  listSubscriptions: () => invoke("list_subscriptions"),
  setSubscriptionEnabled: (id, enabled) => invoke("set_subscription_enabled", { id, enabled }),
  unsubscribe: (id) => invoke("unsubscribe", { id }),
  checkSubscriptionNow: (id) => invoke("check_subscription_now", { id }),
  notify: async (title, body) => {
    try {
      let ok = await isPermissionGranted();
      if (!ok) ok = (await requestPermission()) === "granted";
      if (ok) sendNotification({ title, body });
    } catch {
      // Sin servicio de notificaciones: no es un error para el usuario.
    }
  },
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
