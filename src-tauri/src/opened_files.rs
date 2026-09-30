use serde::Serialize;
use std::collections::VecDeque;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

const MAX_FILE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_PENDING_FILES: usize = 64;

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Profile,
    Palette,
}

#[derive(Debug, Serialize)]
pub struct OpenedFile {
    name: String,
    kind: FileKind,
    content: Option<String>,
    error: Option<String>,
}

#[derive(Default)]
pub struct OpenedFiles(pub Mutex<VecDeque<PathBuf>>);

fn file_kind(path: &Path) -> Option<FileKind> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "kfil" | "kapp" => Some(FileKind::Profile),
        "kpal" => Some(FileKind::Palette),
        _ => None,
    }
}

impl OpenedFiles {
    pub fn enqueue(&self, paths: impl IntoIterator<Item = PathBuf>, cwd: &Path) {
        let mut pending = self.0.lock().unwrap_or_else(|error| error.into_inner());
        for path in paths {
            if file_kind(&path).is_none() {
                continue;
            }
            let absolute = if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            };
            if pending.len() < MAX_PENDING_FILES && !pending.contains(&absolute) {
                pending.push_back(absolute);
            }
        }
    }
}

pub fn enqueue_and_notify(app: &AppHandle, paths: impl IntoIterator<Item = PathBuf>, cwd: &Path) {
    app.state::<OpenedFiles>().enqueue(paths, cwd);
    // The event is only a wake-up. The queue remains available until the UI takes it.
    let _ = app.emit("kromacut-opened-files", ());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn read_opened_file(path: PathBuf) -> OpenedFile {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let kind = file_kind(&path).expect("only supported files enter the queue");
    let result = (|| -> Result<String, String> {
        let metadata = std::fs::metadata(&path).map_err(|error| error.to_string())?;
        if !metadata.is_file() {
            return Err("Not a regular file".into());
        }
        if metadata.len() > MAX_FILE_BYTES {
            return Err("File exceeds the 32 MiB import limit".into());
        }
        let file = File::open(&path).map_err(|error| error.to_string())?;
        if !file
            .metadata()
            .map_err(|error| error.to_string())?
            .is_file()
        {
            return Err("Not a regular file".into());
        }
        let mut content = String::new();
        file.take(MAX_FILE_BYTES + 1)
            .read_to_string(&mut content)
            .map_err(|error| error.to_string())?;
        if content.len() as u64 > MAX_FILE_BYTES {
            return Err("File exceeds the 32 MiB import limit".into());
        }
        Ok(content)
    })();
    match result {
        Ok(content) => OpenedFile {
            name,
            kind,
            content: Some(content),
            error: None,
        },
        Err(error) => OpenedFile {
            name,
            kind,
            content: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub async fn take_opened_file(state: State<'_, OpenedFiles>) -> Result<Option<OpenedFile>, String> {
    let path = state
        .0
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .pop_front();
    match path {
        Some(path) => tauri::async_runtime::spawn_blocking(move || read_opened_file(path))
            .await
            .map(Some)
            .map_err(|error| error.to_string()),
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn queue_accepts_only_owned_extensions_and_resolves_relative_paths() {
        let queue = OpenedFiles::default();
        let cwd = std::env::current_dir().unwrap();
        queue.enqueue(
            [
                "My spools.KFIL",
                "old.kapp",
                "colors.kpal",
                "picture.png",
                "model.3mf",
                "raw.json",
            ]
            .map(PathBuf::from),
            &cwd,
        );
        let pending = queue.0.lock().unwrap();
        assert_eq!(pending.len(), 3);
        assert_eq!(pending[0], cwd.join("My spools.KFIL"));
        assert_eq!(file_kind(&pending[1]), Some(FileKind::Profile));
        assert_eq!(file_kind(&pending[2]), Some(FileKind::Palette));
    }

    #[test]
    fn duplicate_wakeups_do_not_duplicate_pending_files_but_reopening_is_allowed() {
        let queue = OpenedFiles::default();
        let cwd = std::env::current_dir().unwrap();
        queue.enqueue([PathBuf::from("one.kfil"), cwd.join("one.kfil")], &cwd);
        assert_eq!(queue.0.lock().unwrap().len(), 1);
        queue.0.lock().unwrap().pop_front();
        queue.enqueue([PathBuf::from("one.kfil")], &cwd);
        assert_eq!(queue.0.lock().unwrap().len(), 1);
    }

    #[test]
    fn reader_reports_missing_directory_and_oversized_files_without_importing() {
        let directory = std::env::temp_dir().join(format!(
            "kromacut-open-files-{}-{}",
            std::process::id(),
            super::super::unix_timestamp_millis().unwrap()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        assert!(read_opened_file(directory.join("missing.kfil"))
            .error
            .is_some());
        let folder = directory.join("folder.kpal");
        std::fs::create_dir(&folder).unwrap();
        assert!(read_opened_file(folder).content.is_none());
        let huge = directory.join("huge.kfil");
        File::create(&huge)
            .unwrap()
            .set_len(MAX_FILE_BYTES + 1)
            .unwrap();
        assert!(read_opened_file(huge).error.unwrap().contains("32 MiB"));
        let valid = directory.join("valid.kapp");
        std::fs::write(&valid, "\u{feff}{\"name\":\"Unicode 日本語\"}").unwrap();
        let opened = read_opened_file(valid);
        assert_eq!(opened.kind, FileKind::Profile);
        assert!(opened.content.unwrap().contains("日本語"));
        std::fs::remove_dir_all(directory).unwrap();
    }
}
