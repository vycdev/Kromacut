//! Replaces a Save As destination only after its new contents are fully written.
//!
//! The webview streams the file into a temporary sibling through the fs plugin, then asks for
//! the sibling to be renamed over the destination. A failed or abandoned save removes the
//! sibling, so an existing file keeps its old contents.

use std::collections::HashMap;
use std::fs::{remove_file, rename, OpenOptions};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_fs::FsExt;

/// Temporary file paths handed to the webview, mapped to the destination each one replaces.
#[derive(Default)]
pub struct SafeSaves {
    pending: Mutex<HashMap<PathBuf, PathBuf>>,
}

fn create_temp_sibling(destination: &Path) -> Result<PathBuf, String> {
    let directory = destination
        .parent()
        .ok_or_else(|| "The save destination has no parent folder".to_string())?;
    // Renaming can replace a read-only file that opening it for writing would refuse.
    let replacing = match OpenOptions::new().write(true).open(destination) {
        Ok(_) => true,
        Err(error) if error.kind() == ErrorKind::NotFound => false,
        Err(error) => return Err(format!("Failed to open the file for writing: {error}")),
    };
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    // Keep a replaced file's new contents private until the commit copies its mode.
    #[cfg(unix)]
    if replacing {
        std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    }
    #[cfg(not(unix))]
    let _ = replacing;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    for collision in 0..1_000_u16 {
        let path = directory.join(format!(".kromacut-save-{stamp}-{collision}.tmp"));
        match options.open(&path) {
            Ok(_) => return Ok(path),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Failed to create a temporary save file: {error}")),
        }
    }
    Err("Could not allocate a unique temporary save file name".to_string())
}

fn discard_temp(temp: &Path) {
    if let Err(error) = remove_file(temp) {
        if error.kind() != ErrorKind::NotFound {
            log::warn!("Failed to remove temporary save file {temp:?}: {error}");
        }
    }
}

fn commit_temp(temp: &Path, destination: &Path) -> Result<(), String> {
    let result = (|| {
        OpenOptions::new()
            .write(true)
            .open(temp)
            .and_then(|file| file.sync_all())
            .map_err(|error| format!("Failed to flush the saved file: {error}"))?;
        // Keep an existing file's Unix mode instead of the umask default.
        // Best effort: some mounts (such as SMB shares) reject chmod but still accept the file.
        #[cfg(unix)]
        if let Ok(metadata) = std::fs::metadata(destination) {
            if let Err(error) = std::fs::set_permissions(temp, metadata.permissions()) {
                log::warn!("Failed to copy file permissions to {destination:?}: {error}");
            }
        }
        rename(temp, destination).map_err(|error| format!("Failed to replace the file: {error}"))
    })();
    if result.is_err() {
        discard_temp(temp);
    }
    result
}

/// Whether the path is in the app's local data folder, which holds the webview data that the fs
/// plugin denies the webview by default.
fn is_in_app_local_data<R: Runtime>(app: &AppHandle<R>, path: &Path) -> bool {
    // Canonicalize the deepest folder that exists, so both sides compare in the same form even
    // when one is missing (on Windows, canonical paths gain a `\\?\` prefix).
    let canonical = |path: &Path| {
        path.ancestors()
            .find_map(|ancestor| {
                let rest = path.strip_prefix(ancestor).ok()?;
                Some(std::fs::canonicalize(ancestor).ok()?.join(rest))
            })
            .unwrap_or_else(|| path.to_path_buf())
    };
    match (app.path().app_local_data_dir(), path.parent()) {
        (Ok(data), Some(directory)) => canonical(directory).starts_with(canonical(&data)),
        _ => false,
    }
}

// Async commands run off the main thread, so flushing a large export does not freeze the UI.
#[tauri::command(async)]
pub fn begin_safe_file_save<R: Runtime>(
    path: PathBuf,
    app: AppHandle<R>,
    state: State<'_, SafeSaves>,
) -> Result<String, String> {
    // Replace the file a symlink points to, not the link, and check that same file below.
    let path = match path.symlink_metadata() {
        Ok(metadata) if metadata.file_type().is_symlink() => std::fs::canonicalize(&path)
            .map_err(|error| format!("Failed to resolve the save destination: {error}"))?,
        _ => path,
    };
    let scope = app.fs_scope();
    if !scope.is_allowed(&path) {
        return Err("The save destination was not chosen in a Save dialog".to_string());
    }
    if is_in_app_local_data(&app, &path) {
        return Err("Files cannot be saved in the app's data folder".to_string());
    }
    let temp = create_temp_sibling(&path)?;
    if let Err(error) = scope.allow_file(&temp) {
        discard_temp(&temp);
        return Err(format!("Failed to allow the temporary save file: {error}"));
    }
    let mut pending = state
        .pending
        .lock()
        .map_err(|_| "Safe save lock was poisoned".to_string())?;
    pending.insert(temp.clone(), path);
    Ok(temp.to_string_lossy().into_owned())
}

fn take_pending<R: Runtime>(
    app: &AppHandle<R>,
    state: &SafeSaves,
    temp: &Path,
) -> Result<Option<PathBuf>, String> {
    let destination = state
        .pending
        .lock()
        .map_err(|_| "Safe save lock was poisoned".to_string())?
        .remove(temp);
    if destination.is_some() {
        let _ = app.fs_scope().forbid_file(temp);
    }
    Ok(destination)
}

#[tauri::command(async)]
pub fn finish_safe_file_save<R: Runtime>(
    temp_path: PathBuf,
    app: AppHandle<R>,
    state: State<'_, SafeSaves>,
) -> Result<(), String> {
    let destination = take_pending(&app, &state, &temp_path)?
        .ok_or_else(|| "Unknown or finished temporary save file".to_string())?;
    commit_temp(&temp_path, &destination)
}

#[tauri::command(async)]
pub fn discard_safe_file_save<R: Runtime>(
    temp_path: PathBuf,
    app: AppHandle<R>,
    state: State<'_, SafeSaves>,
) -> Result<(), String> {
    if take_pending(&app, &state, &temp_path)?.is_some() {
        discard_temp(&temp_path);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{commit_temp, create_temp_sibling, discard_temp};
    use std::fs::{create_dir_all, read, read_dir, remove_dir_all, write};
    use std::path::PathBuf;

    fn test_directory(name: &str) -> PathBuf {
        let folder = format!("kromacut-safe-save-{name}-{}", std::process::id());
        let directory = std::env::temp_dir().join(folder);
        let _ = remove_dir_all(&directory);
        create_dir_all(&directory).unwrap();
        directory
    }

    fn entries(directory: &PathBuf) -> Vec<String> {
        let mut names: Vec<_> = read_dir(directory)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn commit_replaces_an_existing_file_with_the_complete_temp_contents() {
        let directory = test_directory("commit");
        let destination = directory.join("palette.kpal");
        write(&destination, b"old palette").unwrap();
        let temp = create_temp_sibling(&destination).unwrap();
        assert_eq!(temp.parent(), destination.parent());
        write(&temp, b"new palette").unwrap();

        commit_temp(&temp, &destination).unwrap();

        assert_eq!(read(&destination).unwrap(), b"new palette");
        assert_eq!(entries(&directory), ["palette.kpal"]);
        remove_dir_all(directory).unwrap();
    }

    #[test]
    fn discarding_a_partial_temp_file_keeps_the_original_file() {
        let directory = test_directory("discard");
        let destination = directory.join("palette.kpal");
        write(&destination, b"old palette").unwrap();
        let temp = create_temp_sibling(&destination).unwrap();
        write(&temp, b"new pal").unwrap();

        discard_temp(&temp);

        assert_eq!(read(&destination).unwrap(), b"old palette");
        assert_eq!(entries(&directory), ["palette.kpal"]);
        remove_dir_all(directory).unwrap();
    }

    #[test]
    fn failed_commit_removes_the_temp_file() {
        let directory = test_directory("failed-commit");
        let temp = create_temp_sibling(&directory.join("palette.kpal")).unwrap();
        write(&temp, b"new palette").unwrap();
        // A directory cannot be replaced by a file, so the rename fails on every platform.
        let blocked = directory.join("blocked");
        create_dir_all(blocked.join("child")).unwrap();

        assert!(commit_temp(&temp, &blocked).is_err());

        assert_eq!(entries(&directory), ["blocked"]);
        remove_dir_all(directory).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn read_only_files_are_not_replaced() {
        use std::os::unix::fs::PermissionsExt;
        let directory = test_directory("read-only");
        let destination = directory.join("palette.kpal");
        write(&destination, b"old palette").unwrap();
        std::fs::set_permissions(&destination, std::fs::Permissions::from_mode(0o444)).unwrap();

        assert!(create_temp_sibling(&destination).is_err());

        assert_eq!(read(&destination).unwrap(), b"old palette");
        assert_eq!(entries(&directory), ["palette.kpal"]);
        remove_dir_all(directory).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn commit_keeps_the_existing_file_mode() {
        use std::os::unix::fs::PermissionsExt;
        let directory = test_directory("mode");
        let destination = directory.join("palette.kpal");
        write(&destination, b"old palette").unwrap();
        std::fs::set_permissions(&destination, std::fs::Permissions::from_mode(0o640)).unwrap();
        let temp = create_temp_sibling(&destination).unwrap();
        let mode = |path| std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&temp), 0o600);
        write(&temp, b"new palette").unwrap();

        commit_temp(&temp, &destination).unwrap();

        assert_eq!(mode(&destination), 0o640);
        remove_dir_all(directory).unwrap();
    }

    fn invoke(
        webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
        cmd: &str,
        args: serde_json::Value,
    ) -> Result<serde_json::Value, serde_json::Value> {
        let url = if cfg!(windows) {
            "http://tauri.localhost"
        } else {
            "tauri://localhost"
        };
        tauri::test::get_ipc_response(
            webview,
            tauri::webview::InvokeRequest {
                cmd: cmd.into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: url.parse().unwrap(),
                body: tauri::ipc::InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize().unwrap())
    }

    /// Runs the webview's save sequence against the app's real fs plugin scope and capabilities.
    #[test]
    fn webview_saves_replace_only_dialog_chosen_files_through_the_fs_plugin() {
        use super::{begin_safe_file_save, discard_safe_file_save, finish_safe_file_save};
        use serde_json::json;
        use tauri::Manager;
        use tauri_plugin_fs::FsExt;

        let directory = test_directory("ipc");
        let destination = directory.join("palette.kpal");
        let unchosen = directory.join("other.kpal");
        write(&destination, b"old palette").unwrap();
        write(&unchosen, b"other palette").unwrap();
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_fs::init())
            .manage(super::SafeSaves::default())
            .invoke_handler(tauri::generate_handler![
                begin_safe_file_save,
                finish_safe_file_save,
                discard_safe_file_save
            ])
            .build(crate::app_context())
            .unwrap();
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        // The Save dialog allows exactly the chosen file.
        app.fs_scope().allow_file(&destination).unwrap();

        assert!(invoke(
            &webview,
            "begin_safe_file_save",
            json!({ "path": unchosen })
        )
        .is_err());

        let save = |path: &PathBuf, data: &[u8]| -> Result<(), serde_json::Value> {
            let temp = invoke(&webview, "begin_safe_file_save", json!({ "path": path }))?;
            let options = json!({ "read": false, "write": true, "create": true, "truncate": true });
            let rid = invoke(
                &webview,
                "plugin:fs|open",
                json!({ "path": temp, "options": options }),
            )?;
            let written = invoke(
                &webview,
                "plugin:fs|write",
                json!({ "rid": rid, "data": data }),
            );
            invoke(&webview, "plugin:resources|close", json!({ "rid": rid }))?;
            if written.is_err() || data.is_empty() {
                invoke(
                    &webview,
                    "discard_safe_file_save",
                    json!({ "tempPath": temp }),
                )?;
                return Err(json!("abandoned"));
            }
            invoke(
                &webview,
                "finish_safe_file_save",
                json!({ "tempPath": temp }),
            )?;
            // A finished temp file can no longer be written by the webview.
            let reopened = invoke(
                &webview,
                "plugin:fs|open",
                json!({ "path": temp, "options": options }),
            );
            assert!(reopened.is_err(), "{reopened:?}");
            Ok(())
        };

        assert!(save(&destination, b"").is_err());
        assert_eq!(read(&destination).unwrap(), b"old palette");
        assert_eq!(entries(&directory), ["other.kpal", "palette.kpal"]);

        save(&destination, b"new palette").unwrap();
        assert_eq!(read(&destination).unwrap(), b"new palette");
        assert_eq!(read(&unchosen).unwrap(), b"other palette");
        assert_eq!(entries(&directory), ["other.kpal", "palette.kpal"]);

        // Absolute and relative links to the chosen file update that file and stay links.
        #[cfg(unix)]
        {
            let elsewhere = test_directory("ipc-link");
            let link = elsewhere.join("link.kpal");
            std::os::unix::fs::symlink(&destination, &link).unwrap();
            let relative = elsewhere.join("relative.kpal");
            let folder = directory.file_name().unwrap();
            std::os::unix::fs::symlink(
                PathBuf::from("..").join(folder).join("palette.kpal"),
                &relative,
            )
            .unwrap();
            for (path, data) in [(&link, "linked palette"), (&relative, "relative palette")] {
                let data = data.as_bytes();
                save(path, data).unwrap();
                assert!(path.symlink_metadata().unwrap().file_type().is_symlink());
                assert_eq!(read(&destination).unwrap(), data);
            }
            assert_eq!(entries(&elsewhere), ["link.kpal", "relative.kpal"]);
            remove_dir_all(elsewhere).unwrap();
        }

        // The fs plugin denies the webview data folder, even for a dialog-chosen file.
        let data_file = app
            .path()
            .app_local_data_dir()
            .unwrap()
            .join("kromacut-safe-save-test/palette.kpal");
        app.fs_scope().allow_file(&data_file).unwrap();
        assert_eq!(
            invoke(
                &webview,
                "begin_safe_file_save",
                json!({ "path": data_file })
            ),
            Err(json!("Files cannot be saved in the app's data folder"))
        );
        remove_dir_all(directory).unwrap();
    }
}
