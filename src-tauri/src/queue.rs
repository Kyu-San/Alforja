//! La cola de descargas: un único actor que posee los procesos en marcha.
//!
//! Todas las transiciones (empezar, pausar, cancelar, quitar, terminar) pasan
//! por aquí, una detrás de otra, así que pausar mientras algo arranca o
//! reanudar dos veces seguidas no pueden pisarse. La base de datos refleja el
//! estado; no lo coordina.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::{mpsc, oneshot};

use crate::db::Db;
use crate::engine::{self, Engine, Line};
use crate::models::*;

pub type Sink = Arc<dyn Fn(AppEvent) + Send + Sync>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stop {
    Pause,
    Cancel,
    Remove { delete_file: bool },
}

enum Outcome {
    Done { path: String, actual_quality: Option<String> },
    Failed(AppError),
    Stopped,
}

enum Msg {
    Wake,
    Stop { id: String, how: Stop, reply: oneshot::Sender<AppResult<()>> },
    Progress { id: String, files: Vec<String> },
    Finished { id: String, outcome: Outcome },
}

#[derive(Clone)]
pub struct Queue {
    tx: mpsc::UnboundedSender<Msg>,
}

#[derive(Clone)]
pub struct Ctx {
    pub db: Arc<Db>,
    pub engine: Arc<RwLock<Option<Engine>>>,
    pub sink: Sink,
}

impl Ctx {
    fn engine(&self) -> Option<Engine> {
        self.engine.read().unwrap_or_else(|e| e.into_inner()).clone()
    }
    fn emit_download(&self, id: &str) {
        if let Ok(Some(d)) = self.db.get_download(id) {
            (self.sink)(AppEvent::Download { download: d });
        }
    }
}

impl Queue {
    pub fn start(ctx: Ctx) -> Queue {
        let (tx, rx) = mpsc::unbounded_channel();
        let q = Queue { tx: tx.clone() };
        tauri::async_runtime::spawn(actor(ctx, rx, tx));
        q
    }

    /// Hay algo nuevo en la cola (o hueco libre): que mire.
    pub fn wake(&self) {
        let _ = self.tx.send(Msg::Wake);
    }

    pub async fn stop(&self, id: &str, how: Stop) -> AppResult<()> {
        let (reply, rx) = oneshot::channel();
        self.tx
            .send(Msg::Stop { id: id.to_string(), how, reply })
            .map_err(|_| AppError::new("queue", "La cola no responde"))?;
        rx.await.map_err(|_| AppError::new("queue", "La cola no responde"))?
    }
}

struct Running {
    stop: Option<oneshot::Sender<()>>,
    how: Option<Stop>,
}

async fn actor(ctx: Ctx, mut rx: mpsc::UnboundedReceiver<Msg>, tx: mpsc::UnboundedSender<Msg>) {
    let mut running: HashMap<String, Running> = HashMap::new();
    // Archivos temporales vistos por descarga: se borran al cancelar o quitar,
    // también si la descarga estaba en pausa.
    let mut partials: HashMap<String, Vec<String>> = HashMap::new();

    while let Some(msg) = rx.recv().await {
        match msg {
            Msg::Wake => {}
            Msg::Progress { id, files } => {
                let seen = partials.entry(id).or_default();
                for f in files {
                    if !seen.contains(&f) {
                        seen.push(f);
                    }
                }
                continue;
            }
            Msg::Stop { id, how, reply } => {
                let _ = reply.send(handle_stop(&ctx, &mut running, &mut partials, &id, how));
            }
            Msg::Finished { id, outcome } => {
                let how = running.remove(&id).and_then(|r| r.how);
                finish(&ctx, &mut partials, &id, outcome, how);
            }
        }
        schedule(&ctx, &mut running, &tx);
    }
}

fn handle_stop(ctx: &Ctx, running: &mut HashMap<String, Running>, partials: &mut HashMap<String, Vec<String>>, id: &str, how: Stop) -> AppResult<()> {
    if let Some(r) = running.get_mut(id) {
        // Lo termina la tarea; el estado final lo pone `finish`.
        r.how = Some(how);
        if let Some(s) = r.stop.take() {
            let _ = s.send(());
        }
        return Ok(());
    }
    let d = ctx.db.get_download(id)?.ok_or_else(|| AppError::new("not_found", "Esa descarga ya no existe"))?;
    match how {
        Stop::Pause => {
            if d.status != Status::Queued {
                return Err(AppError::new("invalid_state", "Solo se puede pausar lo que está en cola o descargando"));
            }
            ctx.db.set_status(id, Status::Paused)?;
            ctx.emit_download(id);
        }
        Stop::Cancel => {
            if d.status.is_finished() {
                return Err(AppError::new("invalid_state", "Esta descarga ya terminó"));
            }
            remove_partials(partials.remove(id));
            ctx.db.set_status(id, Status::Cancelled)?;
            ctx.emit_download(id);
        }
        Stop::Remove { delete_file } => {
            remove_partials(partials.remove(id));
            if delete_file {
                delete_output(&d);
            }
            ctx.db.delete_download(id)?;
            (ctx.sink)(AppEvent::Removed { id: id.to_string() });
        }
    }
    Ok(())
}

fn finish(ctx: &Ctx, partials: &mut HashMap<String, Vec<String>>, id: &str, outcome: Outcome, how: Option<Stop>) {
    let result: AppResult<()> = (|| {
        if let Some(Stop::Remove { delete_file }) = how {
            remove_partials(partials.remove(id));
            if let (Some(d), Outcome::Done { path, .. }) = (ctx.db.get_download(id)?, &outcome) {
                if delete_file {
                    delete_output(&Download { output_path: Some(path.clone()), ..d });
                }
            }
            ctx.db.delete_download(id)?;
            (ctx.sink)(AppEvent::Removed { id: id.to_string() });
            return Ok(());
        }
        match outcome {
            Outcome::Done { path, actual_quality } => {
                partials.remove(id);
                let size = std::fs::metadata(&path).ok().map(|m| m.len() as i64);
                ctx.db.set_done(id, &path, size, actual_quality.as_deref())?;
            }
            Outcome::Failed(e) => ctx.db.set_error(id, &e.code, &e.message)?,
            Outcome::Stopped => match how {
                Some(Stop::Cancel) => {
                    remove_partials(partials.remove(id));
                    ctx.db.set_status(id, Status::Cancelled)?;
                }
                _ => ctx.db.set_status(id, Status::Paused)?,
            },
        }
        ctx.emit_download(id);
        Ok(())
    })();
    if let Err(e) = result {
        eprintln!("cola: no se pudo cerrar {id}: {e}");
    }
}

fn schedule(ctx: &Ctx, running: &mut HashMap<String, Running>, tx: &mpsc::UnboundedSender<Msg>) {
    let max = ctx.db.get_settings().map(|s| s.max_concurrent.clamp(1, 10) as usize).unwrap_or(3);
    while running.len() < max {
        let ids: Vec<String> = running.keys().cloned().collect();
        let Ok(Some(d)) = ctx.db.next_queued(&ids) else { break };
        if ctx.db.set_status(&d.id, Status::Downloading).is_err() {
            break;
        }
        ctx.emit_download(&d.id);
        let (stop_tx, stop_rx) = oneshot::channel();
        running.insert(d.id.clone(), Running { stop: Some(stop_tx), how: None });
        let (ctx2, tx2) = (ctx.clone(), tx.clone());
        tauri::async_runtime::spawn(async move {
            let id = d.id.clone();
            let outcome = run(&ctx2, d, stop_rx, &tx2).await;
            let _ = tx2.send(Msg::Finished { id, outcome });
        });
    }
}

fn remove_partials(files: Option<Vec<String>>) {
    for f in files.unwrap_or_default() {
        for p in [f.clone(), format!("{f}.ytdl")] {
            let _ = std::fs::remove_file(p);
        }
        if let Some(stem) = f.strip_suffix(".part") {
            let _ = std::fs::remove_file(format!("{stem}.ytdl"));
        }
    }
}

/// Borra el archivo final, solo si está dentro de la carpeta de la descarga.
fn delete_output(d: &Download) {
    let Some(path) = &d.output_path else { return };
    let (Ok(file), Ok(dir)) = (Path::new(path).canonicalize(), Path::new(&d.output_dir).canonicalize()) else { return };
    if file.starts_with(&dir) && file.is_file() {
        let _ = std::fs::remove_file(file);
    }
}

async fn run(ctx: &Ctx, d: Download, mut stop_rx: oneshot::Receiver<()>, tx: &mpsc::UnboundedSender<Msg>) -> Outcome {
    let Some(engine) = ctx.engine() else {
        return Outcome::Failed(AppError::new("engine_missing", "No se encontró el motor (yt-dlp). Instálalo o actualízalo en Preferencias → Motor."));
    };
    let settings = match ctx.db.get_settings() {
        Ok(s) => s,
        Err(e) => return Outcome::Failed(e),
    };
    let args = match engine.download_args(&d, &settings) {
        Ok(a) => a,
        Err(e) => return Outcome::Failed(e),
    };
    if let Err(e) = std::fs::create_dir_all(&d.output_dir) {
        return Outcome::Failed(AppError::new("output_dir", format!("No se puede escribir en la carpeta {}: {e}", d.output_dir)));
    }

    let mut child = match engine.command().args(&args).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true).spawn() {
        Ok(c) => c,
        Err(e) => return Outcome::Failed(AppError::new("engine_missing", format!("No se pudo ejecutar el motor: {e}"))),
    };
    let pid = child.id();

    // stdout y stderr en un solo canal de líneas.
    let (line_tx, mut lines) = mpsc::unbounded_channel::<(bool, String)>();
    if let Some(out) = child.stdout.take() {
        let t = line_tx.clone();
        tauri::async_runtime::spawn(async move {
            let mut r = BufReader::new(out).lines();
            while let Ok(Some(l)) = r.next_line().await {
                let _ = t.send((false, l));
            }
        });
    }
    if let Some(err) = child.stderr.take() {
        let t = line_tx.clone();
        tauri::async_runtime::spawn(async move {
            let mut r = BufReader::new(err).lines();
            while let Ok(Some(l)) = r.next_line().await {
                let _ = t.send((true, l));
            }
        });
    }
    drop(line_tx);

    let mut st = RunState::new(d.size_bytes);
    let mut stderr_tail: Vec<String> = Vec::new();
    let mut stopped = false;

    loop {
        tokio::select! {
            r = &mut stop_rx, if !stopped => {
                if r.is_ok() {
                    stopped = true;
                    if let Some(pid) = pid {
                        engine::kill_tree(pid);
                        let p = pid;
                        tauri::async_runtime::spawn(async move {
                            tokio::time::sleep(Duration::from_secs(3)).await;
                            engine::kill_tree_hard(p);
                        });
                    }
                }
            }
            line = lines.recv() => {
                let Some((is_err, line)) = line else { break };
                if is_err && !line.trim().is_empty() {
                    stderr_tail.push(line.clone());
                    if stderr_tail.len() > 30 { stderr_tail.remove(0); }
                }
                if stopped { continue; }
                st.handle(ctx, &d.id, engine::parse_line(&line), tx);
            }
            _ = tokio::time::sleep(Duration::from_millis(800)), if st.waiting_since.is_some() && !stopped => {
                // Terminó una parte y no empieza otra: es ffmpeg trabajando.
                st.waiting_since = None;
                st.set_processing(ctx, &d.id);
            }
        }
    }
    let status = child.wait().await;
    // El último progreso queda guardado.
    let _ = ctx.db.set_progress(&d.id, st.overall(), st.total());

    if stopped {
        return Outcome::Stopped;
    }
    match (status, st.done_path) {
        (Ok(s), Some(path)) if s.success() => Outcome::Done { path, actual_quality: st.actual_quality },
        _ => Outcome::Failed(engine::classify_error(&stderr_tail.join("\n"))),
    }
}

struct RunState {
    estimate: Option<i64>,
    completed: i64,
    current: i64,
    current_total: Option<i64>,
    last_emit: Option<Instant>,
    last_save: Instant,
    waiting_since: Option<Instant>,
    processing: bool,
    done_path: Option<String>,
    actual_quality: Option<String>,
}

impl RunState {
    fn new(estimate: Option<i64>) -> Self {
        RunState {
            estimate,
            completed: 0,
            current: 0,
            current_total: None,
            last_emit: None,
            last_save: Instant::now(),
            waiting_since: None,
            processing: false,
            done_path: None,
            actual_quality: None,
        }
    }

    fn overall(&self) -> i64 {
        self.completed + self.current
    }

    /// Video y audio se bajan por separado: el total es lo terminado más lo
    /// que falta del archivo actual, y nunca menos que la estimación inicial.
    fn total(&self) -> Option<i64> {
        let known = self.current_total.map(|t| self.completed + t);
        match (known, self.estimate) {
            (Some(a), Some(b)) => Some(a.max(b)),
            (a, b) => a.or(b),
        }
    }

    fn set_processing(&mut self, ctx: &Ctx, id: &str) {
        if !self.processing {
            self.processing = true;
            let _ = ctx.db.set_status(id, Status::Processing);
            ctx.emit_download(id);
        }
    }

    fn handle(&mut self, ctx: &Ctx, id: &str, line: Line, tx: &mpsc::UnboundedSender<Msg>) {
        match line {
            Line::Meta(m) => {
                let _ = ctx.db.set_meta(id, &m);
                ctx.emit_download(id);
            }
            Line::Progress { status, downloaded, total, speed, eta, files } => {
                if !files.is_empty() {
                    let _ = tx.send(Msg::Progress { id: id.to_string(), files });
                }
                if status == "finished" {
                    self.completed += total.unwrap_or(downloaded).max(downloaded);
                    self.current = 0;
                    self.current_total = None;
                    self.waiting_since = Some(Instant::now());
                    return;
                }
                self.waiting_since = None;
                if self.processing {
                    self.processing = false;
                    let _ = ctx.db.set_status(id, Status::Downloading);
                    ctx.emit_download(id);
                }
                self.current = downloaded;
                self.current_total = total;
                let now = Instant::now();
                if self.last_emit.map_or(true, |t| now.duration_since(t) >= Duration::from_millis(250)) {
                    self.last_emit = Some(now);
                    (ctx.sink)(AppEvent::Progress {
                        id: id.to_string(),
                        downloaded_bytes: self.overall(),
                        total_bytes: self.total(),
                        speed,
                        eta_s: eta,
                    });
                }
                if now.duration_since(self.last_save) >= Duration::from_secs(2) {
                    self.last_save = now;
                    let _ = ctx.db.set_progress(id, self.overall(), self.total());
                }
            }
            Line::Processing => {
                self.waiting_since = None;
                self.set_processing(ctx, id);
            }
            Line::Done(p) => self.done_path = Some(p),
            Line::Resolution(q) => self.actual_quality = q,
            Line::Error(_) | Line::Other => {}
        }
    }
}

/// Carpeta por defecto: Descargas del sistema (o la de inicio).
pub fn default_output_dir() -> PathBuf {
    dirs::download_dir().or_else(dirs::home_dir).unwrap_or_else(|| PathBuf::from("."))
}
