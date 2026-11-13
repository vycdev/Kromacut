use std::fs::{create_dir_all, read_dir, remove_file, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};

/// Header carrying the suggested file name; the request body is the raw 3MF archive.
const FILE_NAME_HEADER: &str = "x-kromacut-file-name";
/// Handoff copies older than this are removed the next time a model is opened. Slicers import
/// the 3MF when it opens, so a day leaves ample time without letting the cache grow.
const STALE_AFTER: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_FILE_NAME_CHARS: usize = 128;
const ZIP_SIGNATURE: &[u8] = b"PK\x03\x04";

fn handoff_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Failed to resolve the app cache directory: {error}"))?
        .join("slicer-handoff");
    create_dir_all(&directory)
        .map_err(|error| format!("Failed to create the slicer handoff directory: {error}"))?;
    Ok(directory)
}

/// Accepts only a plain `.3mf` file name, so the handoff can never leave its directory or hand
/// the operating system something other than a 3MF to open.
fn handoff_stem(file_name: &str) -> Result<&str, String> {
    let stem = file_name
        .strip_suffix(".3mf")
        .ok_or_else(|| "The model file name must end in .3mf".to_string())?;
    let valid = !stem.is_empty()
        && file_name.len() <= MAX_FILE_NAME_CHARS
        && !stem.starts_with('.')
        && stem
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if valid {
        Ok(stem)
    } else {
        Err(format!("Unsupported model file name: {file_name}"))
    }
}

/// Creates a new file rather than overwriting one a slicer may still have open.
fn create_handoff_file(directory: &Path, stem: &str) -> Result<(PathBuf, File), String> {
    for collision in 0..1_000_u16 {
        let name = if collision == 0 {
            format!("{stem}.3mf")
        } else {
            format!("{stem}-{collision}.3mf")
        };
        let path = directory.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Failed to create the model file: {error}")),
        }
    }

    Err("Could not allocate a unique model file name".to_string())
}

/// Best effort: a file that is still locked or already gone is simply left for next time.
fn remove_stale_handoff_files(directory: &Path, now: SystemTime) {
    let Ok(entries) = read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("3mf") {
            continue;
        }
        let stale = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age >= STALE_AFTER);
        if stale {
            let _ = remove_file(path);
        }
    }
}

fn write_handoff_file(directory: &Path, file_name: &str, model: &[u8]) -> Result<PathBuf, String> {
    if !model.starts_with(ZIP_SIGNATURE) {
        return Err("The model data is not a 3MF archive".to_string());
    }
    let stem = handoff_stem(file_name)?;
    remove_stale_handoff_files(directory, SystemTime::now());
    let (path, mut file) = create_handoff_file(directory, stem)?;
    if let Err(error) = file.write_all(model).and_then(|_| file.sync_all()) {
        drop(file);
        let _ = remove_file(&path);
        return Err(format!("Failed to write the model file: {error}"));
    }
    Ok(path)
}

/// Writes the exported 3MF into Kromacut's cache and opens it with the system's default 3MF
/// application, normally the user's slicer. Returns the path that was opened.
#[tauri::command]
pub async fn open_model_in_slicer(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(model) = request.body() else {
        return Err("Expected the 3MF archive as raw bytes".to_string());
    };
    let file_name = request
        .headers()
        .get(FILE_NAME_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "Missing the model file name".to_string())?;
    let path = write_handoff_file(&handoff_directory(&app)?, file_name, model)?;
    crate::open_with_default_app(&path)
        .map_err(|error| format!("Failed to open the model in the default 3MF app: {error}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::{handoff_stem, remove_stale_handoff_files, write_handoff_file, STALE_AFTER};
    use std::fs::{create_dir_all, read, remove_dir_all, File};
    use std::path::PathBuf;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    const MODEL: &[u8] = b"PK\x03\x04model";

    fn test_directory(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory =
            std::env::temp_dir().join(format!("kromacut-{name}-{}-{nanos}", std::process::id()));
        create_dir_all(&directory).unwrap();
        directory
    }

    #[test]
    fn handoff_accepts_only_plain_3mf_file_names() {
        assert_eq!(
            handoff_stem("kromacut-2026-11-13.3mf"),
            Ok("kromacut-2026-11-13")
        );
        assert_eq!(handoff_stem("my_model.v2.3mf"), Ok("my_model.v2"));
        for name in [
            "",
            ".3mf",
            "..3mf",
            "model.stl",
            "model.3MF",
            "model.3mf.exe",
            "../model.3mf",
            "..\\model.3mf",
            "/tmp/model.3mf",
            "C:model.3mf",
            "nested/model.3mf",
            "model name.3mf",
            "modèle.3mf",
            "model&calc.3mf",
            ".hidden.3mf",
        ] {
            assert!(handoff_stem(name).is_err(), "{name}");
        }
        let longest = format!("{}.3mf", "a".repeat(124));
        assert!(handoff_stem(&longest).is_ok());
        assert!(handoff_stem(&format!("a{longest}")).is_err());
    }

    #[test]
    fn handoff_writes_new_files_without_replacing_open_ones() {
        let directory = test_directory("slicer-handoff-write");
        let first = write_handoff_file(&directory, "kromacut-2026-11-13.3mf", MODEL).unwrap();
        let second =
            write_handoff_file(&directory, "kromacut-2026-11-13.3mf", b"PK\x03\x04next").unwrap();

        assert_eq!(first, directory.join("kromacut-2026-11-13.3mf"));
        assert_eq!(second, directory.join("kromacut-2026-11-13-1.3mf"));
        assert_eq!(read(&first).unwrap(), MODEL);
        assert_eq!(read(&second).unwrap(), b"PK\x03\x04next");
        remove_dir_all(directory).unwrap();
    }

    #[test]
    fn handoff_rejects_data_that_is_not_a_3mf_archive() {
        let directory = test_directory("slicer-handoff-invalid");
        for model in [&b""[..], b"PK", b"#!/bin/sh\n", b"solid stl\n"] {
            assert!(write_handoff_file(&directory, "model.3mf", model).is_err());
        }
        assert!(write_handoff_file(&directory, "../model.3mf", MODEL).is_err());
        assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 0);
        remove_dir_all(directory).unwrap();
    }

    #[test]
    fn handoff_removes_only_stale_3mf_files() {
        let directory = test_directory("slicer-handoff-prune");
        let now = SystemTime::now();
        let stale = now - STALE_AFTER - Duration::from_secs(1);
        let recent = now - STALE_AFTER + Duration::from_secs(60);
        for (name, modified) in [
            ("old.3mf", stale),
            ("recent.3mf", recent),
            ("old.txt", stale),
        ] {
            File::create(directory.join(name))
                .unwrap()
                .set_modified(modified)
                .unwrap();
        }

        remove_stale_handoff_files(&directory, now);

        assert!(!directory.join("old.3mf").exists());
        assert!(directory.join("recent.3mf").exists());
        assert!(directory.join("old.txt").exists());
        remove_dir_all(directory).unwrap();
    }
}
