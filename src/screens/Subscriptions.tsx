import { CircleAlert, ClipboardPaste, ListVideo, RefreshCw, Rss, Trash2, Tv } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, type Subscription } from "../api";
import { Button, IconButton } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { Badge, EmptyState, Skeleton } from "../components/ui/Feedback";
import { Select, Switch } from "../components/ui/Form";
import { useToast } from "../components/ui/Toast";
import { message } from "../lib/errors";
import { ago, requestedQuality } from "../lib/format";
import { useStore } from "../store";
import { pasteFromClipboard } from "./pasteFlow";
import { Screen } from "./Screen";

function formatSummary(s: Subscription) {
  const o = s.preset.options;
  const q = o.kind === "video" && o.quality !== "best" ? `hasta ${o.quality}` : requestedQuality(o.kind, o.quality);
  return `${o.container.toUpperCase()} · ${q}`;
}

function Row({ s, onChange, onRemove }: { s: Subscription; onChange: (s: Subscription) => void; onRemove: (s: Subscription) => void }) {
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    try {
      const n = await api.checkSubscriptionNow(s.id);
      toast({ kind: n ? "success" : "info", title: n ? `${n} ${n === 1 ? "video nuevo" : "videos nuevos"} en la cola` : "No hay nada nuevo", body: s.title });
      onChange({ ...s, lastCheckedAt: new Date().toISOString(), lastError: null, downloadCount: s.downloadCount + n });
    } catch (e) {
      onChange({ ...s, lastCheckedAt: new Date().toISOString(), lastError: message(e).split("\n")[0] });
    } finally {
      setChecking(false);
    }
  };
  const toggle = async (enabled: boolean) => {
    try {
      onChange(await api.setSubscriptionEnabled(s.id, enabled));
    } catch (e) {
      toast({ kind: "error", title: "No se pudo", body: message(e) });
    }
  };
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-6 py-3">
      <div className="grid size-10 place-items-center rounded-md bg-surface-hover text-muted" aria-hidden>
        {s.kind === "channel" ? <Tv className="size-5" /> : <ListVideo className="size-5" />}
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className={`m-0 truncate text-base font-medium ${s.enabled ? "" : "text-muted"}`} title={s.title}>
            {s.title}
          </h2>
          <Badge>{s.kind === "channel" ? "Canal" : "Lista"}</Badge>
          {!s.enabled ? <Badge tone="warning">En pausa</Badge> : null}
        </div>
        <p className="m-0 mt-0.5 truncate text-sm text-muted tabular">
          {formatSummary(s)} · {s.downloadCount} {s.downloadCount === 1 ? "descarga" : "descargas"} · {s.lastCheckedAt ? `comprobada ${ago(s.lastCheckedAt)}` : "sin comprobar"}
        </p>
        {s.lastError ? (
          <p className="m-0 mt-1 flex items-center gap-1.5 text-sm text-danger">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            <span className="truncate">La última comprobación falló: {s.lastError}</span>
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <Switch label={`${s.enabled ? "Pausar" : "Reanudar"} ${s.title}`} checked={s.enabled} onChange={toggle} />
        <IconButton label={`Comprobar ahora ${s.title}`} icon={<RefreshCw className={checking ? "size-4 animate-[spin_1s_linear_infinite]" : "size-4"} />} onClick={check} disabled={checking} aria-busy={checking || undefined} />
        <IconButton label={`Darse de baja de ${s.title}`} icon={<Trash2 className="size-4" />} onClick={() => onRemove(s)} />
      </div>
    </li>
  );
}

const everyOptions = [1, 3, 6, 12, 24, 72].map((h) => ({ value: String(h), label: h < 24 ? `Cada ${h} h` : h === 24 ? "Una vez al día" : "Cada 3 días" }));

/** S05: canales y listas que se bajan solos. */
export function SubscriptionsScreen() {
  const toast = useToast();
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Subscription | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.listSubscriptions().then(setSubs, (e) => setError(message(e)));
  }, []);
  useEffect(() => {
    load();
    // Las comprobaciones en segundo plano refrescan la lista.
    let off: (() => void) | undefined;
    api.onEvent((e) => e.type === "subscriptionChecked" && load()).then((f) => (off = f));
    return () => off?.();
  }, [load]);

  const replace = (s: Subscription) => setSubs((xs) => xs?.map((x) => (x.id === s.id ? s : x)) ?? null);
  const remove = async (s: Subscription) => {
    try {
      await api.unsubscribe(s.id);
      setSubs((xs) => xs?.filter((x) => x.id !== s.id) ?? null);
      toast({ kind: "info", title: "Ya no estás suscrito", body: `${s.title}. Lo ya descargado sigue en la lista.` });
    } catch (e) {
      toast({ kind: "error", title: "No se pudo", body: message(e) });
    }
  };

  return (
    <Screen
      title="Suscripciones"
      actions={
        <div className="flex items-center gap-2">
          {settings ? (
            <div className="w-40">
              <Select
                label="Frecuencia"
                hideLabel
                value={String(settings.subscriptionEveryH)}
                onChange={async (v) => {
                  try {
                    setSettings(await api.updateSettings({ subscriptionEveryH: Number(v) }));
                  } catch (e) {
                    toast({ kind: "error", title: "No se guardó", body: message(e) });
                  }
                }}
                options={everyOptions}
              />
            </div>
          ) : null}
          <Button variant="primary" icon={<ClipboardPaste className="size-4" />} onClick={() => pasteFromClipboard()}>
            Añadir
          </Button>
        </div>
      }
    >
      {error ? (
        <EmptyState icon={<CircleAlert />} title="No se pudo cargar" action={<Button onClick={load}>Reintentar</Button>}>
          {error}
        </EmptyState>
      ) : subs == null ? (
        <div role="status" aria-label="Cargando suscripciones" className="flex flex-col gap-3 px-6 py-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : subs.length === 0 ? (
        <EmptyState
          icon={<Rss />}
          title="Sin suscripciones"
          action={
            <Button variant="primary" icon={<ClipboardPaste className="size-4" />} onClick={() => pasteFromClipboard()}>
              Pegar el enlace de un canal
            </Button>
          }
        >
          Pega el enlace de un canal o una lista y elige Suscribirse. Cada video nuevo se bajará solo, como tú digas.
        </EmptyState>
      ) : (
        <ul className="m-0 list-none p-0" aria-label="Suscripciones">
          {subs.map((s) => (
            <Row key={s.id} s={s} onChange={replace} onRemove={setRemoving} />
          ))}
        </ul>
      )}
      <Dialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="¿Darse de baja?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)} autoFocus>
              No
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={() => {
                const s = removing!;
                setRemoving(null);
                remove(s);
              }}
            >
              Darse de baja
            </Button>
          </>
        }
      >
        <p className="text-base">
          Dejarán de bajarse los videos nuevos de <span className="font-medium">{removing?.title}</span>. Lo ya descargado no se toca.
        </p>
      </Dialog>
    </Screen>
  );
}
