use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{create_dir_all, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

const RELEASES_URL: &str = "https://github.com/vycdev/Kromacut/releases";

#[derive(Debug, Serialize, Deserialize)]
struct VersionInfo {
    version: String,
    download_url: Option<String>,
    release_notes: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticSession {
    id: String,
    path: String,
}

#[derive(Default)]
struct DiagnosticWriterState {
    writers: Mutex<HashMap<String, BufWriter<File>>>,
}

fn auto_paint_diagnostics_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_log_dir()
        .map_err(|error| format!("Failed to resolve the app log directory: {error}"))?
        .join("auto-paint-diagnostics");
    create_dir_all(&directory)
        .map_err(|error| format!("Failed to create the diagnostics directory: {error}"))?;
    Ok(directory)
}

fn unix_timestamp_millis() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .map_err(|error| format!("System clock is before the Unix epoch: {error}"))
}

fn create_diagnostic_file(
    directory: &Path,
    timestamp: u128,
) -> Result<(String, PathBuf, File), String> {
    for collision in 0..1_000_u16 {
        let id = if collision == 0 {
            format!("auto-paint-{timestamp}")
        } else {
            format!("auto-paint-{timestamp}-{collision}")
        };
        let path = directory.join(format!("{id}.jsonl"));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((id, path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!("Failed to create the diagnostic file: {error}"));
            }
        }
    }

    Err("Could not allocate a unique diagnostic file name".to_string())
}

fn append_diagnostic_entries<W: Write>(writer: &mut W, entries: &[String]) -> Result<(), String> {
    if entries
        .iter()
        .any(|entry| entry.contains('\n') || entry.contains('\r'))
    {
        return Err("Diagnostic entries must contain exactly one JSON line".to_string());
    }

    for entry in entries {
        writer
            .write_all(entry.as_bytes())
            .and_then(|_| writer.write_all(b"\n"))
            .map_err(|error| format!("Failed to append to the diagnostic file: {error}"))?;
    }
    writer
        .flush()
        .map_err(|error| format!("Failed to flush the diagnostic file: {error}"))
}

#[tauri::command]
fn begin_auto_paint_diagnostic(
    app: AppHandle,
    state: State<'_, DiagnosticWriterState>,
) -> Result<DiagnosticSession, String> {
    let directory = auto_paint_diagnostics_directory(&app)?;
    let timestamp = unix_timestamp_millis()?;
    let (id, path, file) = create_diagnostic_file(&directory, timestamp)?;
    state
        .writers
        .lock()
        .map_err(|_| "Diagnostic writer lock was poisoned".to_string())?
        .insert(id.clone(), BufWriter::new(file));

    Ok(DiagnosticSession {
        id,
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn append_auto_paint_diagnostic(
    session_id: String,
    entries: Vec<String>,
    state: State<'_, DiagnosticWriterState>,
) -> Result<(), String> {
    let mut writers = state
        .writers
        .lock()
        .map_err(|_| "Diagnostic writer lock was poisoned".to_string())?;
    let writer = writers
        .get_mut(&session_id)
        .ok_or_else(|| format!("Unknown or closed diagnostic session: {session_id}"))?;

    append_diagnostic_entries(writer, &entries)
}

#[tauri::command]
fn finish_auto_paint_diagnostic(
    session_id: String,
    state: State<'_, DiagnosticWriterState>,
) -> Result<(), String> {
    let mut writers = state
        .writers
        .lock()
        .map_err(|_| "Diagnostic writer lock was poisoned".to_string())?;
    let mut writer = writers
        .remove(&session_id)
        .ok_or_else(|| format!("Unknown or closed diagnostic session: {session_id}"))?;
    writer
        .flush()
        .map_err(|error| format!("Failed to close the diagnostic file: {error}"))
}

fn open_directory(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let result = Command::new("explorer").arg(path).spawn();

    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(path).spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(path).spawn();

    result
        .map(|_| ())
        .map_err(|error| format!("Failed to open the diagnostics directory: {error}"))
}

#[tauri::command]
fn open_auto_paint_diagnostics_directory(app: AppHandle) -> Result<String, String> {
    let directory = auto_paint_diagnostics_directory(&app)?;
    open_directory(&directory)?;
    Ok(directory.to_string_lossy().into_owned())
}

fn normalized_version(version: &str) -> &str {
    version.trim().trim_start_matches(['v', 'V'])
}

fn is_different_version(latest: &str, current: &str) -> bool {
    normalized_version(latest) != normalized_version(current)
}

#[tauri::command]
async fn check_for_updates(current_version: String) -> Result<Option<VersionInfo>, String> {
    // Try to fetch version info from kromacut.com/version.json
    let url = "https://kromacut.com/version.json";

    match reqwest::get(url).await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<VersionInfo>().await {
                    Ok(version_info) => {
                        if is_different_version(&version_info.version, &current_version) {
                            Ok(Some(version_info))
                        } else {
                            Ok(None)
                        }
                    }
                    Err(e) => Err(format!("Failed to parse version info: {}", e)),
                }
            } else {
                Err(format!("Server returned status: {}", response.status()))
            }
        }
        Err(e) => Err(format!("Failed to check for updates: {}", e)),
    }
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn open_releases_page() -> Result<(), String> {
    open_external_url(RELEASES_URL)
}

fn open_external_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let result = Command::new("cmd").args(["/C", "start", "", url]).spawn();

    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(url).spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(url).spawn();

    result
        .map(|_| ())
        .map_err(|e| format!("Failed to open releases page: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DiagnosticWriterState::default())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            check_for_updates,
            get_app_version,
            open_releases_page,
            begin_auto_paint_diagnostic,
            append_auto_paint_diagnostic,
            finish_auto_paint_diagnostic,
            open_auto_paint_diagnostics_directory
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{append_diagnostic_entries, create_diagnostic_file, is_different_version};
    use std::fs::{create_dir_all, read_to_string, remove_dir_all, File};
    use std::io::Cursor;

    fn diagnostic_test_directory(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "kromacut-{name}-{}-{}",
            std::process::id(),
            super::unix_timestamp_millis().unwrap()
        ))
    }

    #[test]
    fn detects_any_different_release_version() {
        assert!(is_different_version("2.6.1", "2.6.0"));
        assert!(is_different_version("2.6.0", "3.0.0"));
        assert!(is_different_version("3.0.0", "2.9.9"));
    }

    #[test]
    fn ignores_exact_version_matches() {
        assert!(!is_different_version("2.6.0", "2.6.0"));
        assert!(!is_different_version(" v2.6.0 ", "2.6.0"));
    }

    #[test]
    fn diagnostic_file_creation_avoids_collisions_and_persists_flushed_jsonl() {
        let directory = diagnostic_test_directory("diagnostic-file");
        create_dir_all(&directory).unwrap();
        let timestamp = 123_u128;
        File::create(directory.join("auto-paint-123.jsonl")).unwrap();

        let (id, path, file) = create_diagnostic_file(&directory, timestamp).unwrap();
        assert_eq!(id, "auto-paint-123-1");
        let mut writer = std::io::BufWriter::new(file);
        append_diagnostic_entries(
            &mut writer,
            &[
                "{\"kind\":\"start\"}".to_string(),
                "{\"kind\":\"end\"}".to_string(),
            ],
        )
        .unwrap();
        assert_eq!(
            read_to_string(&path).unwrap(),
            "{\"kind\":\"start\"}\n{\"kind\":\"end\"}\n"
        );

        drop(writer);
        remove_dir_all(directory).unwrap();
    }

    #[test]
    fn diagnostic_append_rejects_multiline_batches_without_partial_writes() {
        let mut output = Cursor::new(Vec::<u8>::new());
        let error = append_diagnostic_entries(
            &mut output,
            &[
                "{\"kind\":\"valid\"}".to_string(),
                "invalid\nline".to_string(),
            ],
        )
        .unwrap_err();

        assert!(error.contains("exactly one JSON line"));
        assert!(output.into_inner().is_empty());
    }
}
