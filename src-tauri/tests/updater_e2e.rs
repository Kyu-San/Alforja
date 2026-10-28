//! El actualizador del motor contra un servidor local que imita a GitHub
//! (API de releases + SHA2-256SUMS + binario). Solo Linux y macOS: el
//! "yt-dlp" de prueba es un script de shell.
#![cfg(unix)]

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

use alforja_lib::updater::{asset_name, binary_name, Updater};
use sha2::{Digest, Sha256};

type Files = Arc<Mutex<HashMap<String, Vec<u8>>>>;

/// Servidor HTTP mínimo: GET de rutas fijas, 404 para el resto.
fn serve(files: Files) -> String {
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = format!("http://{}", l.local_addr().unwrap());
    std::thread::spawn(move || {
        for s in l.incoming().flatten() {
            let files = files.clone();
            std::thread::spawn(move || {
                let mut r = BufReader::new(&s);
                let mut line = String::new();
                r.read_line(&mut line).ok();
                let path = line.split_whitespace().nth(1).unwrap_or("/").to_string();
                loop {
                    let mut h = String::new();
                    if r.read_line(&mut h).unwrap_or(0) <= 2 {
                        break;
                    }
                }
                let body = files.lock().unwrap().get(&path).cloned();
                let mut s = &s;
                match body {
                    Some(b) => {
                        let _ = write!(s, "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", b.len());
                        let _ = s.write_all(&b);
                    }
                    None => {
                        let _ = write!(s, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                    }
                }
            });
        }
    });
    addr
}

fn script(version: &str, ok: bool) -> Vec<u8> {
    if ok {
        format!("#!/bin/sh\necho {version}\n").into_bytes()
    } else {
        b"#!/bin/sh\necho roto >&2\nexit 1\n".to_vec()
    }
}

/// Publica una "release" en el servidor falso.
fn publish(files: &Files, base: &str, version: &str, bin: Vec<u8>, sums_hash: Option<String>) {
    let asset = asset_name().unwrap();
    let hash = sums_hash.unwrap_or_else(|| format!("{:x}", Sha256::digest(&bin)));
    let json = format!(
        r#"{{"tag_name": "{version}", "assets": [
            {{"name": "{asset}", "browser_download_url": "{base}/dl/{version}/{asset}"}},
            {{"name": "SHA2-256SUMS", "browser_download_url": "{base}/dl/{version}/SHA2-256SUMS"}}
        ]}}"#
    );
    let mut f = files.lock().unwrap();
    f.insert("/latest".into(), json.into_bytes());
    f.insert(format!("/dl/{version}/{asset}"), bin);
    f.insert(format!("/dl/{version}/SHA2-256SUMS"), format!("{}  yt-dlp\n{hash}  {asset}\n", "0".repeat(64)).into_bytes());
}

fn setup() -> (Files, String, tempfile::TempDir, Updater) {
    std::env::set_var("NO_PROXY", "127.0.0.1,localhost");
    std::env::set_var("no_proxy", "127.0.0.1,localhost");
    let files: Files = Arc::new(Mutex::new(HashMap::new()));
    let base = serve(files.clone());
    let dir = tempfile::tempdir().unwrap();
    let mut u = Updater::new(dir.path().join("bin"));
    u.api_url = format!("{base}/latest");
    (files, base, dir, u)
}

#[tokio::test]
async fn installs_updates_and_rolls_back() {
    let (files, base, _dir, u) = setup();

    publish(&files, &base, "2099.01.01", script("2099.01.01", true), None);
    let rel = u.latest().await.unwrap();
    assert_eq!(rel.version, "2099.01.01");
    assert_eq!(u.install(&rel).await.unwrap(), "2099.01.01");
    assert!(u.current_path().is_file());
    assert!(!u.can_rollback(), "la primera instalación no tiene anterior");

    publish(&files, &base, "2099.02.02", script("2099.02.02", true), None);
    let rel = u.latest().await.unwrap();
    assert_eq!(u.install(&rel).await.unwrap(), "2099.02.02");
    assert!(u.can_rollback());

    u.rollback().unwrap();
    let out = std::process::Command::new(u.current_path()).arg("--version").output().unwrap();
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "2099.01.01");
    // Y la "anterior" pasa a ser la nueva: se puede deshacer la vuelta atrás.
    assert!(u.can_rollback());
    assert!(u.bin_dir.join(binary_name()).is_file());
}

#[tokio::test]
async fn rejects_wrong_checksum_and_keeps_current() {
    let (files, base, _dir, u) = setup();
    publish(&files, &base, "2099.01.01", script("2099.01.01", true), None);
    u.install(&u.latest().await.unwrap()).await.unwrap();

    publish(&files, &base, "2099.03.03", script("2099.03.03", true), Some("f".repeat(64)));
    let err = u.install(&u.latest().await.unwrap()).await.unwrap_err();
    assert_eq!(err.code, "update_unverified");
    let out = std::process::Command::new(u.current_path()).arg("--version").output().unwrap();
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "2099.01.01", "el actual sigue intacto");
    assert!(!u.bin_dir.join(format!("{}.new", binary_name())).exists());
}

#[tokio::test]
async fn rejects_binary_that_does_not_run() {
    let (files, base, _dir, u) = setup();
    publish(&files, &base, "2099.04.04", script("", false), None);
    let err = u.install(&u.latest().await.unwrap()).await.unwrap_err();
    assert_eq!(err.code, "update_broken");
    assert!(!u.current_path().exists());
    assert!(!u.bin_dir.join(format!("{}.new", binary_name())).exists(), "no deja restos");
}

#[tokio::test]
async fn missing_sums_or_network_errors_are_clear() {
    let (files, base, _dir, u) = setup();
    let json = format!(r#"{{"tag_name": "2099.05.05", "assets": [{{"name": "{}", "browser_download_url": "{base}/x"}}]}}"#, asset_name().unwrap());
    files.lock().unwrap().insert("/latest".into(), json.into_bytes());
    assert_eq!(u.latest().await.unwrap_err().code, "update_missing_asset");

    let mut off = Updater::new(u.bin_dir.clone());
    off.api_url = "http://127.0.0.1:9/latest".into();
    assert_eq!(off.latest().await.unwrap_err().code, "update_network");
}
