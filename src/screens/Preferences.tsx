import { CircleAlert, CircleCheck, Download, RefreshCw, Undo2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, type SettingsPatch } from "../api";
import { Button } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { Badge, Skeleton } from "../components/ui/Feedback";
import { FolderPicker, Select, Switch, TextField } from "../components/ui/Form";
import { useToast } from "../components/ui/Toast";
import { message } from "../lib/errors";
import { navigate } from "../lib/router";
import { useStore } from "../store";
import { Screen } from "./Screen";

const sections = [
  { id: "general", label: "General" },
  { id: "red", label: "Red" },
  { id: "cuenta", label: "Cuenta" },
  { id: "motor", label: "Motor" },
] as const;

function Row({ label, help, children, htmlFor }: { label: string; help?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,22rem)] items-start gap-6 border-b border-border py-4 last:border-b-0">
      <div>
        <label htmlFor={htmlFor} className="font-medium">
          {label}
        </label>
        {help ? <p className="mt-0.5 text-sm text-muted">{help}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Guarda al momento; si el backend lo rechaza, el error se queda junto al campo. */
function useSave() {
  const setSettings = useStore((s) => s.setSettings);
  const toast = useToast();
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const save = async (field: keyof SettingsPatch, patch: SettingsPatch) => {
    try {
      setSettings(await api.updateSettings(patch));
      setErrors((e) => ({ ...e, [field]: null }));
      return true;
    } catch (err) {
      setErrors((e) => ({ ...e, [field]: message(err) }));
      if (field === "outputDir") toast({ kind: "error", title: "No se cambió la carpeta", body: message(err) });
      return false;
    }
  };
  return { save, errors };
}

function General() {
  const s = useStore((st) => st.settings)!;
  const { save, errors } = useSave();
  const [template, setTemplate] = useState(s.filenameTemplate);
  return (
    <>
      <Row label="Carpeta de descargas" help="Dónde se guarda todo, salvo que elijas otra al descargar.">
        <FolderPicker
          label="Carpeta"
          value={s.outputDir}
          error={errors.outputDir}
          onPick={async () => {
            const d = await api.pickFolder(s.outputDir);
            if (d) save("outputDir", { outputDir: d });
          }}
        />
      </Row>
      <Row label="Descargas a la vez" help="Más a la vez no siempre es más rápido: el sitio puede limitar la velocidad.">
        <Select
          label="Cuántas"
          value={String(s.maxConcurrent)}
          onChange={(v) => save("maxConcurrent", { maxConcurrent: Number(v) })}
          options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
        />
      </Row>
      <Row
        label="Nombre de los archivos"
        htmlFor="tpl"
        help={
          <>
            Plantilla de yt-dlp. Por defecto: el título y el identificador del video. <code className="font-mono text-xs">%(uploader)s/%(title)s.%(ext)s</code> crea una carpeta por canal.
          </>
        }
      >
        <TextField
          id="tpl"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          onBlur={() => template !== s.filenameTemplate && save("filenameTemplate", { filenameTemplate: template })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          error={errors.filenameTemplate}
          inputClassName="font-mono text-sm"
        />
      </Row>
    </>
  );
}

function Network() {
  const s = useStore((st) => st.settings)!;
  const { save, errors } = useSave();
  const [proxy, setProxy] = useState(s.proxyUrl ?? "");
  return (
    <Row label="Proxy" htmlFor="proxy" help="Déjalo vacío para conectar directamente. Acepta http://, https:// y socks5://.">
      <TextField
        id="proxy"
        placeholder="socks5://127.0.0.1:1080"
        value={proxy}
        onChange={(e) => setProxy(e.target.value)}
        onBlur={() => proxy !== (s.proxyUrl ?? "") && save("proxyUrl", { proxyUrl: proxy })}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        error={errors.proxyUrl}
      />
    </Row>
  );
}

// Radix Select no admite "" como valor.
const NO_SESSION = "none";

function Account() {
  const s = useStore((st) => st.settings)!;
  const { save, errors } = useSave();
  return (
    <>
      <Row
        label="Usar tu sesión del navegador"
        help={
          <>
            Para bajar <strong className="font-medium text-text">tus</strong> listas privadas, Ver más tarde o videos con restricción de edad, la app lee la sesión que ya tienes abierta en ese navegador. No pide ni guarda
            contraseñas. En Windows, Chrome y Edge suelen bloquearlo: <strong className="font-medium text-text">Firefox es la opción fiable</strong>.
          </>
        }
      >
        <Select
          label="Navegador"
          value={s.cookiesBrowser ?? NO_SESSION}
          onChange={(v) => save("cookiesBrowser", { cookiesBrowser: v === NO_SESSION ? "" : v })}
          options={[
            { value: NO_SESSION, label: "No usar ninguna sesión" },
            { value: "firefox", label: "Firefox", hint: "recomendado" },
            { value: "chrome", label: "Chrome" },
            { value: "edge", label: "Edge" },
            { value: "brave", label: "Brave" },
            { value: "chromium", label: "Chromium" },
            { value: "safari", label: "Safari" },
          ]}
        />
        {errors.cookiesBrowser ? <p className="mt-1 text-xs text-danger">{errors.cookiesBrowser}</p> : null}
      </Row>
      <p className="py-4 text-sm text-muted">Solo con tu propia cuenta. Bajar contenido de YouTube va contra sus términos salvo que el video ofrezca la descarga; el uso es bajo tu responsabilidad.</p>
    </>
  );
}

const sourceLabel = { app: "instalado por la app", system: "del sistema", env: "fijado por variable de entorno" } as const;

function Engine() {
  const st = useStore((s) => s.engine);
  const settings = useStore((s) => s.settings)!;
  const setEngine = useStore((s) => s.setEngine);
  const { save } = useSave();
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.engineStatus().then(setEngine, (e) => setErr(message(e)));
  }, [setEngine]);

  const run = async (what: "check" | "update" | "rollback") => {
    setErr(null);
    if (what === "check") setChecking(true);
    try {
      const s = await (what === "check" ? api.engineCheck() : what === "update" ? api.engineUpdate() : api.engineRollback());
      setEngine(s);
      if (what === "update") toast({ kind: "success", title: `Motor actualizado a ${s.ytdlpVersion}` });
      if (what === "rollback") toast({ kind: "info", title: `Has vuelto a ${s.ytdlpVersion}` });
    } catch (e) {
      setErr(message(e));
    } finally {
      setChecking(false);
    }
  };

  const version = (v: string | null | undefined) =>
    st == null && !err ? (
      <Skeleton className="h-5 w-32" />
    ) : v ? (
      <span className="flex items-center gap-1.5 text-base">
        <CircleCheck className="size-4 text-success" aria-hidden /> <span className="tabular selectable">{v}</span>
      </span>
    ) : (
      <span className="flex items-center gap-1.5 text-base text-danger">
        <CircleAlert className="size-4" aria-hidden /> No encontrado
      </span>
    );

  const checked = st?.checkedAt ? new Date(st.checkedAt).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }) : null;
  const pinned = st?.ytdlpSource === "env";

  return (
    <>
      <Row
        label="yt-dlp"
        help={
          st?.ytdlpPath ? (
            <>
              {st.ytdlpSource ? `${sourceLabel[st.ytdlpSource]} · ` : ""}
              <span className="selectable font-mono text-xs break-all">{st.ytdlpPath}</span>
            </>
          ) : (
            "Es el motor que descarga. Sin él, nada funciona."
          )
        }
      >
        <div className="flex flex-col items-start gap-2">
          {version(st?.ytdlpVersion)}
          {st?.updateAvailable && st.latestVersion ? <Badge tone="warning">Hay una versión nueva: {st.latestVersion}</Badge> : st?.latestVersion && st.ytdlpVersion ? <Badge tone="success">Al día</Badge> : null}
        </div>
      </Row>
      <Row
        label="Actualizar"
        help={
          <>
            Desde las versiones oficiales de yt-dlp en GitHub, comprobando su suma SHA-256 antes de usarla. La anterior se guarda por si la nueva da problemas.
            {checked ? <> Última comprobación: {checked}.</> : null}
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          {st?.updateAvailable || !st?.ytdlpVersion ? (
            <Button variant="primary" icon={<Download className="size-4" />} loading={st?.updating} disabled={pinned} onClick={() => run("update")}>
              {st?.ytdlpVersion ? "Actualizar ahora" : "Instalar el motor"}
            </Button>
          ) : (
            <Button icon={<RefreshCw className="size-4" />} loading={checking} disabled={st?.updating} onClick={() => run("check")}>
              Buscar actualización
            </Button>
          )}
          {st?.canRollback ? (
            <Button variant="ghost" icon={<Undo2 className="size-4" />} disabled={st.updating} onClick={() => run("rollback")}>
              Volver a la anterior
            </Button>
          ) : null}
        </div>
        {pinned ? <p className="mt-2 text-xs text-muted">La variable DESCARGADOR_YTDLP fija el motor: la app no lo cambia.</p> : null}
        {err ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {err}
          </p>
        ) : null}
      </Row>
      <Row label="Actualizar solo" htmlFor="auto-update" help="Una vez al día, al abrir la app. Si hay descargas en marcha, espera y te avisa.">
        <Switch id="auto-update" label="Actualizar el motor solo" checked={settings.engineAutoUpdate} onChange={(v) => save("engineAutoUpdate", { engineAutoUpdate: v })} />
      </Row>
      <Row label="ffmpeg" help={st?.ffmpegPath ? <span className="selectable font-mono text-xs break-all">{st.ffmpegPath}</span> : "Une video y audio por encima de 1080p y convierte a MP3."}>
        {version(st?.ffmpegVersion)}
      </Row>
    </>
  );
}

export function Preferences({ section }: { section: string }) {
  const settings = useStore((s) => s.settings);
  const current = sections.find((s) => s.id === section) ?? sections[0];
  return (
    <Screen title="Preferencias">
      <div className="mx-auto grid max-w-4xl grid-cols-[12.5rem_minmax(0,1fr)] gap-8 px-6 py-6">
        <nav aria-label="Secciones">
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#/preferencias/${s.id}`}
                  aria-current={s.id === current.id ? "page" : undefined}
                  onClick={(e) => (e.preventDefault(), navigate(`/preferencias/${s.id}`))}
                  className={cn("flex h-8 items-center rounded-md px-3 text-base text-muted no-underline hover:bg-surface-hover hover:text-text", s.id === current.id && "bg-surface-raised text-text")}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <section aria-labelledby="pref-title">
          <h2 id="pref-title" className="m-0 mb-2 text-lg">
            {current.label}
          </h2>
          {!settings ? (
            <Skeleton className="mt-4 h-24 w-full" />
          ) : current.id === "general" ? (
            <General />
          ) : current.id === "red" ? (
            <Network />
          ) : current.id === "cuenta" ? (
            <Account />
          ) : (
            <Engine />
          )}
        </section>
      </div>
    </Screen>
  );
}
