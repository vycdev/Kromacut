use serde::Serialize;
use std::ffi::OsStr;
use std::fs::create_dir_all;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Platform {
    MacOs,
    Windows,
    Linux,
}

#[cfg(target_os = "macos")]
const PLATFORM: Platform = Platform::MacOs;
#[cfg(target_os = "windows")]
const PLATFORM: Platform = Platform::Windows;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
const PLATFORM: Platform = Platform::Linux;

/// A slicer the user can open models with: an app bundle on macOS, an `.exe` on Windows and an
/// executable (including Flatpak's exported launchers) on Linux.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SlicerApp {
    name: String,
    path: String,
}

enum WindowsFolder {
    /// A folder path below a programs directory.
    Fixed(&'static [&'static str]),
    /// Folders named `<prefix> <version>`; the highest installed version wins.
    Versioned(&'static str),
}

struct WindowsInstall {
    folder: WindowsFolder,
    executable: &'static str,
}

/// The usual install locations of the slicers Kromacut detects. Anything else can be picked
/// with Browse, so these only need to cover the official installers and packages.
struct Preset {
    name: &'static str,
    macos_bundles: &'static [&'static str],
    windows_installs: &'static [WindowsInstall],
    linux_commands: &'static [&'static str],
    flatpak_ids: &'static [&'static str],
}

const PRESETS: &[Preset] = &[
    Preset {
        name: "Bambu Studio",
        macos_bundles: &["BambuStudio.app"],
        windows_installs: &[WindowsInstall {
            folder: WindowsFolder::Fixed(&["Bambu Studio"]),
            executable: "bambu-studio.exe",
        }],
        linux_commands: &["bambu-studio"],
        flatpak_ids: &["com.bambulab.BambuStudio"],
    },
    Preset {
        name: "Orca Slicer",
        macos_bundles: &["OrcaSlicer.app"],
        windows_installs: &[WindowsInstall {
            folder: WindowsFolder::Fixed(&["OrcaSlicer"]),
            executable: "orca-slicer.exe",
        }],
        linux_commands: &["orca-slicer"],
        flatpak_ids: &[
            "com.orcaslicer.OrcaSlicer",
            "io.github.softfever.OrcaSlicer",
        ],
    },
    Preset {
        name: "PrusaSlicer",
        macos_bundles: &["PrusaSlicer.app"],
        windows_installs: &[WindowsInstall {
            folder: WindowsFolder::Fixed(&["Prusa3D", "PrusaSlicer"]),
            executable: "prusa-slicer.exe",
        }],
        linux_commands: &["prusa-slicer"],
        flatpak_ids: &["com.prusa3d.PrusaSlicer"],
    },
    Preset {
        name: "UltiMaker Cura",
        macos_bundles: &["UltiMaker Cura.app"],
        // Windows file names ignore case, so this also finds the older "Ultimaker Cura" folders.
        windows_installs: &[WindowsInstall {
            folder: WindowsFolder::Versioned("UltiMaker Cura"),
            executable: "UltiMaker-Cura.exe",
        }],
        linux_commands: &["cura"],
        flatpak_ids: &["com.ultimaker.cura"],
    },
];

/// Flatpak installs a launcher named after the app ID here, in each installation directory.
const FLATPAK_EXPORTS: &str = "flatpak/exports/bin";

/// Directories searched for presets on each platform.
#[derive(Default)]
struct SearchRoots {
    macos_applications: Vec<PathBuf>,
    windows_programs: Vec<PathBuf>,
    linux_path: Vec<PathBuf>,
    flatpak_exports: Vec<PathBuf>,
}

fn push_unique(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if path.is_absolute() && !paths.contains(&path) {
        paths.push(path);
    }
}

impl SearchRoots {
    fn from_env() -> Self {
        let env_path = |name: &str| std::env::var_os(name).map(PathBuf::from);
        let home = env_path("HOME");
        let mut roots = Self::default();
        match PLATFORM {
            Platform::MacOs => {
                push_unique(&mut roots.macos_applications, "/Applications".into());
                if let Some(home) = &home {
                    push_unique(&mut roots.macos_applications, home.join("Applications"));
                }
            }
            Platform::Windows => {
                // ProgramW6432 is the 64-bit Program Files even for a 32-bit process.
                for name in ["ProgramW6432", "ProgramFiles"] {
                    if let Some(path) = env_path(name) {
                        push_unique(&mut roots.windows_programs, path);
                    }
                }
                if let Some(local) = env_path("LOCALAPPDATA") {
                    push_unique(&mut roots.windows_programs, local.join("Programs"));
                }
            }
            Platform::Linux => {
                if let Some(path) = std::env::var_os("PATH") {
                    for directory in std::env::split_paths(&path) {
                        push_unique(&mut roots.linux_path, directory);
                    }
                }
                let data_home = env_path("XDG_DATA_HOME")
                    .filter(|path| path.is_absolute())
                    .or_else(|| home.map(|home| home.join(".local").join("share")));
                if let Some(data_home) = data_home {
                    push_unique(&mut roots.flatpak_exports, data_home.join(FLATPAK_EXPORTS));
                }
                push_unique(
                    &mut roots.flatpak_exports,
                    Path::new("/var/lib").join(FLATPAK_EXPORTS),
                );
            }
        }
        roots
    }
}

fn has_extension(path: &Path, extension: &str) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .is_some_and(|actual| actual.eq_ignore_ascii_case(extension))
}

#[cfg(unix)]
fn is_executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .is_ok_and(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
}

#[cfg(not(unix))]
fn is_executable_file(path: &Path) -> bool {
    path.is_file()
}

/// Whether `path` is something Kromacut can launch with a model on `platform`.
fn is_launchable(platform: Platform, path: &Path) -> bool {
    path.is_absolute()
        && match platform {
            Platform::MacOs => has_extension(path, "app") && path.is_dir(),
            Platform::Windows => has_extension(path, "exe") && path.is_file(),
            Platform::Linux => is_executable_file(path),
        }
}

fn version_key(version: &str) -> Vec<u32> {
    version
        .split(|c: char| !c.is_ascii_digit())
        .filter_map(|part| part.parse().ok())
        .collect()
}

/// Every `<prefix> <version>` folder in `programs` containing `executable`, with its version.
fn versioned_installs(programs: &Path, prefix: &str, executable: &str) -> Vec<(Vec<u32>, PathBuf)> {
    let prefix = format!("{} ", prefix.to_ascii_lowercase());
    let Ok(entries) = std::fs::read_dir(programs) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let version = name.to_ascii_lowercase().strip_prefix(&prefix)?.to_string();
            let key = version_key(&version);
            let path = entry.path().join(executable);
            (!key.is_empty() && is_launchable(Platform::Windows, &path)).then_some((key, path))
        })
        .collect()
}

/// The newest `<prefix> <version>` folder in `programs` containing `executable`.
fn newest_versioned_install(programs: &Path, prefix: &str, executable: &str) -> Option<PathBuf> {
    versioned_installs(programs, prefix, executable)
        .into_iter()
        .max_by(|(a, _), (b, _)| a.cmp(b))
        .map(|(_, path)| path)
}

/// Whether `path` is any installed version of a preset that installs each version into its own
/// folder. Detection lists only the newest, but a slicer saved before an upgrade still works.
fn is_versioned_preset_install(platform: Platform, roots: &SearchRoots, path: &Path) -> bool {
    platform == Platform::Windows
        && roots.windows_programs.iter().any(|programs| {
            PRESETS
                .iter()
                .flat_map(|preset| preset.windows_installs)
                .any(|install| match install.folder {
                    WindowsFolder::Fixed(_) => false,
                    WindowsFolder::Versioned(prefix) => {
                        versioned_installs(programs, prefix, install.executable)
                            .iter()
                            .any(|(_, found)| found == path)
                    }
                })
        })
}

fn find_preset(platform: Platform, preset: &Preset, roots: &SearchRoots) -> Option<PathBuf> {
    let candidates: Vec<PathBuf> = match platform {
        Platform::MacOs => roots
            .macos_applications
            .iter()
            .flat_map(|root| preset.macos_bundles.iter().map(|bundle| root.join(bundle)))
            .collect(),
        Platform::Windows => {
            return roots.windows_programs.iter().find_map(|programs| {
                preset
                    .windows_installs
                    .iter()
                    .find_map(|install| match install.folder {
                        WindowsFolder::Fixed(folders) => {
                            let path = folders
                                .iter()
                                .fold(programs.clone(), |path, folder| path.join(folder))
                                .join(install.executable);
                            is_launchable(platform, &path).then_some(path)
                        }
                        WindowsFolder::Versioned(prefix) => {
                            newest_versioned_install(programs, prefix, install.executable)
                        }
                    })
            });
        }
        Platform::Linux => roots
            .linux_path
            .iter()
            .flat_map(|root| preset.linux_commands.iter().map(|name| root.join(name)))
            .chain(
                roots
                    .flatpak_exports
                    .iter()
                    .flat_map(|root| preset.flatpak_ids.iter().map(|id| root.join(id))),
            )
            .collect(),
    };
    candidates
        .into_iter()
        .find(|path| is_launchable(platform, path))
}

fn detect_slicer_apps(platform: Platform, roots: &SearchRoots) -> Vec<SlicerApp> {
    PRESETS
        .iter()
        .filter_map(|preset| {
            let path = find_preset(platform, preset, roots)?;
            Some(SlicerApp {
                name: preset.name.to_string(),
                path: path.to_string_lossy().into_owned(),
            })
        })
        .collect()
}

/// Names a launchable app after the preset it belongs to, or after its file name.
fn describe_slicer_app(platform: Platform, path: &Path) -> Option<SlicerApp> {
    if !is_launchable(platform, path) {
        return None;
    }
    let file_name = path.file_name()?.to_string_lossy();
    let preset = PRESETS.iter().find(|preset| match platform {
        Platform::MacOs => preset
            .macos_bundles
            .iter()
            .any(|bundle| bundle.eq_ignore_ascii_case(&file_name)),
        Platform::Windows => preset
            .windows_installs
            .iter()
            .any(|install| install.executable.eq_ignore_ascii_case(&file_name)),
        Platform::Linux => preset
            .linux_commands
            .iter()
            .chain(preset.flatpak_ids)
            .any(|name| *name == file_name),
    });
    let name = match preset {
        Some(preset) => preset.name.to_string(),
        None if platform == Platform::Linux => file_name.into_owned(),
        None => path.file_stem()?.to_string_lossy().into_owned(),
    };
    Some(SlicerApp {
        name,
        path: path.to_string_lossy().into_owned(),
    })
}

/// The Flatpak app ID when `app` is one of Flatpak's exported launchers.
fn flatpak_app_id(app: &Path) -> Option<&str> {
    app.parent()?
        .ends_with(FLATPAK_EXPORTS)
        .then(|| app.file_name()?.to_str())
        .flatten()
}

fn launch_command(platform: Platform, app: &Path, model: &Path) -> Command {
    if platform == Platform::MacOs {
        let mut command = Command::new("/usr/bin/open");
        command.arg("-a").arg(app).arg(model);
        return command;
    }
    if platform == Platform::Linux {
        if let Some(id) = flatpak_app_id(app) {
            // The exported launcher does not forward files, so the sandboxed slicer could not
            // read Kromacut's cache. File forwarding grants it this one file.
            let mut command = Command::new("flatpak");
            command
                .args(["run", "--file-forwarding", id, "@@"])
                .arg(model)
                .arg("@@");
            return command;
        }
    }
    let mut command = Command::new(app);
    command.arg(model);
    if let Some(directory) = app.parent() {
        command.current_dir(directory);
    }
    command
}

/// Slicers picked with Browse are remembered here, in the app config directory.
const PICKED_APPS_FILE: &str = "picked-slicers.json";
const MAX_PICKED_APPS: usize = 16;

pub fn picked_apps_file(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(PICKED_APPS_FILE))
        .map_err(|error| format!("Failed to resolve the app config directory: {error}"))
}

/// A missing or unreadable file only means nothing was picked yet.
fn read_picked_apps(file: &Path) -> Vec<String> {
    std::fs::read(file)
        .ok()
        .and_then(|data| serde_json::from_slice(&data).ok())
        .unwrap_or_default()
}

/// Adds `path` as the newest picked app and drops the oldest ones beyond the cap. `keep` is the
/// slicer saved for Open in Slicer: it is never dropped, or it could no longer be launched.
fn remember_picked_app(file: &Path, path: &str, keep: Option<&str>) -> Result<(), String> {
    let mut picked = read_picked_apps(file);
    picked.retain(|known| known != path);
    picked.push(path.to_string());
    while picked.len() > MAX_PICKED_APPS {
        let Some(oldest) = picked.iter().position(|known| Some(known.as_str()) != keep) else {
            break;
        };
        picked.remove(oldest);
    }
    if let Some(directory) = file.parent() {
        create_dir_all(directory)
            .map_err(|error| format!("Failed to create the app config directory: {error}"))?;
    }
    let data = serde_json::to_vec(&picked)
        .map_err(|error| format!("Failed to encode the picked slicers: {error}"))?;
    std::fs::write(file, data).map_err(|error| format!("Failed to remember the slicer: {error}"))
}

/// Models are only opened with a detected preset or an app the user picked in the native
/// dialog, so the webview can never ask Kromacut to run an arbitrary program.
fn find_known_slicer_app(
    platform: Platform,
    roots: &SearchRoots,
    picked_apps: &Path,
    path: &Path,
) -> Option<SlicerApp> {
    let known = detect_slicer_apps(platform, roots)
        .into_iter()
        .map(|app| app.path)
        .chain(read_picked_apps(picked_apps))
        .any(|known| Path::new(&known) == path)
        || is_versioned_preset_install(platform, roots, path);
    if known {
        describe_slicer_app(platform, path)
    } else {
        None
    }
}

/// Opens `model` with the slicer at `app`, which must be a detected or picked slicer. Like the
/// default-app handoff, success means the slicer was started, not that it has loaded the file.
/// Call off the UI thread.
pub fn open_with_slicer_app(app: &Path, model: &Path, picked_apps: &Path) -> io::Result<()> {
    if find_known_slicer_app(PLATFORM, &SearchRoots::from_env(), picked_apps, app).is_none() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("No detected or picked slicer at {}", app.display()),
        ));
    }
    let mut command = launch_command(PLATFORM, app, model);

    #[cfg(target_os = "macos")]
    return crate::default_app::checked_launcher(&mut command);

    #[cfg(not(target_os = "macos"))]
    {
        let mut child = command.spawn()?;
        // The slicer keeps running after the handoff; reap it when it exits.
        std::thread::spawn(move || {
            let _ = child.wait();
        });
        Ok(())
    }
}

/// Slicers from the presets that are installed in their usual locations.
#[tauri::command]
pub async fn list_slicer_apps() -> Result<Vec<SlicerApp>, String> {
    tauri::async_runtime::spawn_blocking(|| detect_slicer_apps(PLATFORM, &SearchRoots::from_env()))
        .await
        .map_err(|error| format!("Failed to look for slicers: {error}"))
}

/// The detected or picked slicer at `path`, or `None` when it no longer exists, cannot be
/// launched, or was never detected or picked.
#[tauri::command]
pub async fn find_slicer_app(app: AppHandle, path: String) -> Result<Option<SlicerApp>, String> {
    let picked_apps = picked_apps_file(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        find_known_slicer_app(
            PLATFORM,
            &SearchRoots::from_env(),
            &picked_apps,
            Path::new(&path),
        )
    })
    .await
    .map_err(|error| format!("Failed to check the slicer: {error}"))
}

/// Lets the user pick a slicer that is not in the presets. `None` means the dialog was
/// cancelled; picking something that cannot be launched is an error. `keep` is the path of the
/// saved slicer, which stays launchable however many other apps are picked.
#[tauri::command]
pub async fn pick_slicer_app(
    app: AppHandle,
    title: String,
    filter_name: String,
    keep: Option<String>,
) -> Result<Option<SlicerApp>, String> {
    let picked_apps = picked_apps_file(&app)?;
    let mut dialog = app.dialog().file().set_title(title);
    match PLATFORM {
        Platform::MacOs => {
            dialog = dialog
                .add_filter(filter_name, &["app"])
                .set_directory("/Applications");
        }
        Platform::Windows => dialog = dialog.add_filter(filter_name, &["exe"]),
        Platform::Linux => {}
    }
    tauri::async_runtime::spawn_blocking(move || {
        let Some(picked) = dialog.blocking_pick_file() else {
            return Ok(None);
        };
        let path = picked
            .into_path()
            .map_err(|error| format!("Unsupported slicer location: {error}"))?;
        let slicer = describe_slicer_app(PLATFORM, &path)
            .ok_or_else(|| format!("Not a launchable app: {}", path.display()))?;
        remember_picked_app(&picked_apps, &slicer.path, keep.as_deref())?;
        Ok(Some(slicer))
    })
    .await
    .map_err(|error| format!("Failed to run the slicer picker: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{
        describe_slicer_app, detect_slicer_apps, find_known_slicer_app, flatpak_app_id,
        is_launchable, launch_command, read_picked_apps, remember_picked_app, Platform,
        SearchRoots, SlicerApp, MAX_PICKED_APPS,
    };
    use std::fs::{create_dir_all, remove_dir_all, write};
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

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

    fn touch(path: &Path) {
        create_dir_all(path.parent().unwrap()).unwrap();
        write(path, b"").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
    }

    fn app(name: &str, path: &Path) -> SlicerApp {
        SlicerApp {
            name: name.to_string(),
            path: path.to_string_lossy().into_owned(),
        }
    }

    fn args(command: &std::process::Command) -> Vec<String> {
        command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn detects_installed_macos_bundles_only() {
        let root = test_directory("slicers-macos");
        let system = root.join("Applications");
        let user = root.join("home").join("Applications");
        create_dir_all(system.join("OrcaSlicer.app")).unwrap();
        create_dir_all(user.join("UltiMaker Cura.app")).unwrap();
        create_dir_all(user.join("OrcaSlicer.app")).unwrap();
        // A file with a bundle name is not an app.
        touch(&system.join("PrusaSlicer.app"));
        let roots = SearchRoots {
            macos_applications: vec![system.clone(), user.clone()],
            ..SearchRoots::default()
        };

        assert_eq!(
            detect_slicer_apps(Platform::MacOs, &roots),
            vec![
                app("Orca Slicer", &system.join("OrcaSlicer.app")),
                app("UltiMaker Cura", &user.join("UltiMaker Cura.app")),
            ]
        );
        remove_dir_all(root).unwrap();
    }

    #[test]
    fn detects_windows_installs_and_the_newest_cura() {
        let root = test_directory("slicers-windows");
        let programs = root.join("Program Files");
        let local = root.join("Local").join("Programs");
        touch(&programs.join("Bambu Studio").join("bambu-studio.exe"));
        touch(
            &programs
                .join("Prusa3D")
                .join("PrusaSlicer")
                .join("prusa-slicer.exe"),
        );
        touch(&local.join("OrcaSlicer").join("orca-slicer.exe"));
        for version in ["5.9.1", "5.10.0", "5.2.1"] {
            touch(
                &programs
                    .join(format!("UltiMaker Cura {version}"))
                    .join("UltiMaker-Cura.exe"),
            );
        }
        // A folder without its executable, or without a version, is not an install.
        create_dir_all(programs.join("UltiMaker Cura 5.11.0")).unwrap();
        touch(&programs.join("UltiMaker Cura").join("UltiMaker-Cura.exe"));
        let roots = SearchRoots {
            windows_programs: vec![programs.clone(), local.clone()],
            ..SearchRoots::default()
        };

        assert_eq!(
            detect_slicer_apps(Platform::Windows, &roots),
            vec![
                app(
                    "Bambu Studio",
                    &programs.join("Bambu Studio").join("bambu-studio.exe")
                ),
                app(
                    "Orca Slicer",
                    &local.join("OrcaSlicer").join("orca-slicer.exe")
                ),
                app(
                    "PrusaSlicer",
                    &programs
                        .join("Prusa3D")
                        .join("PrusaSlicer")
                        .join("prusa-slicer.exe")
                ),
                app(
                    "UltiMaker Cura",
                    &programs
                        .join("UltiMaker Cura 5.10.0")
                        .join("UltiMaker-Cura.exe")
                ),
            ]
        );
        remove_dir_all(root).unwrap();
    }

    #[test]
    fn detects_cura_folders_from_before_the_ultimaker_rename() {
        let root = test_directory("slicers-windows-legacy");
        // Cura 5.2 and older install to "Ultimaker Cura <version>".
        let exe = root.join("Ultimaker Cura 5.2.1").join("UltiMaker-Cura.exe");
        touch(&exe);
        let roots = SearchRoots {
            windows_programs: vec![root.clone()],
            ..SearchRoots::default()
        };

        assert_eq!(
            detect_slicer_apps(Platform::Windows, &roots),
            vec![app("UltiMaker Cura", &exe)]
        );
        remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn detects_linux_commands_before_flatpaks() {
        use super::FLATPAK_EXPORTS;

        let root = test_directory("slicers-linux");
        let bin = root.join("bin");
        let user_flatpak = root.join("home").join(FLATPAK_EXPORTS);
        let system_flatpak = root.join("var").join(FLATPAK_EXPORTS);
        touch(&bin.join("prusa-slicer"));
        touch(&system_flatpak.join("com.prusa3d.PrusaSlicer"));
        touch(&system_flatpak.join("com.bambulab.BambuStudio"));
        touch(&user_flatpak.join("com.orcaslicer.OrcaSlicer"));
        // Not executable, so not launchable.
        write(bin.join("cura"), b"").unwrap();
        let roots = SearchRoots {
            linux_path: vec![bin.clone()],
            flatpak_exports: vec![user_flatpak.clone(), system_flatpak.clone()],
            ..SearchRoots::default()
        };

        assert_eq!(
            detect_slicer_apps(Platform::Linux, &roots),
            vec![
                app(
                    "Bambu Studio",
                    &system_flatpak.join("com.bambulab.BambuStudio")
                ),
                app(
                    "Orca Slicer",
                    &user_flatpak.join("com.orcaslicer.OrcaSlicer")
                ),
                app("PrusaSlicer", &bin.join("prusa-slicer")),
            ]
        );
        remove_dir_all(root).unwrap();
    }

    #[test]
    fn describes_picked_apps_by_preset_or_file_name() {
        let root = test_directory("slicers-describe");
        let bundle = root.join("PrusaSlicer.app");
        let custom_bundle = root.join("Creality Print.app");
        create_dir_all(&bundle).unwrap();
        create_dir_all(&custom_bundle).unwrap();
        let exe = root.join("ORCA-SLICER.EXE");
        let custom_exe = root.join("CrealityPrint.exe");
        let appimage = root.join("PrusaSlicer-2.9.0.AppImage");
        for path in [&exe, &custom_exe, &appimage] {
            touch(path);
        }

        assert_eq!(
            describe_slicer_app(Platform::MacOs, &bundle),
            Some(app("PrusaSlicer", &bundle))
        );
        assert_eq!(
            describe_slicer_app(Platform::MacOs, &custom_bundle),
            Some(app("Creality Print", &custom_bundle))
        );
        assert_eq!(
            describe_slicer_app(Platform::Windows, &exe),
            Some(app("Orca Slicer", &exe))
        );
        assert_eq!(
            describe_slicer_app(Platform::Windows, &custom_exe),
            Some(app("CrealityPrint", &custom_exe))
        );
        #[cfg(unix)]
        assert_eq!(
            describe_slicer_app(Platform::Linux, &appimage),
            Some(app("PrusaSlicer-2.9.0.AppImage", &appimage))
        );
        remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_paths_that_cannot_be_launched() {
        let root = test_directory("slicers-reject");
        let bundle = root.join("OrcaSlicer.app");
        create_dir_all(&bundle).unwrap();
        let exe = root.join("orca-slicer.exe");
        let model = root.join("model.3mf");
        touch(&exe);
        touch(&model);

        for (platform, path) in [
            (Platform::MacOs, exe.clone()),
            (Platform::MacOs, root.join("Missing.app")),
            (Platform::MacOs, PathBuf::from("OrcaSlicer.app")),
            (Platform::Windows, bundle.clone()),
            (Platform::Windows, model.clone()),
            (Platform::Windows, root.join("missing.exe")),
            (Platform::Linux, bundle.clone()),
            (Platform::Linux, root.join("missing")),
        ] {
            assert!(!is_launchable(platform, &path), "{platform:?} {path:?}");
            assert_eq!(describe_slicer_app(platform, &path), None);
        }
        // Off Unix hosts there is no executable bit, so a plain file passes the Linux check.
        #[cfg(unix)]
        {
            let plain = root.join("notes.txt");
            write(&plain, b"").unwrap();
            assert!(!is_launchable(Platform::Linux, &plain));
            assert_eq!(describe_slicer_app(Platform::Linux, &plain), None);
        }
        remove_dir_all(root).unwrap();
    }

    #[test]
    fn launches_each_kind_of_app_with_the_model() {
        let model = Path::new("/cache/slicer-handoff/model.3mf");

        let bundle = Path::new("/Applications/OrcaSlicer.app");
        let open = launch_command(Platform::MacOs, bundle, model);
        assert_eq!(open.get_program(), "/usr/bin/open");
        assert_eq!(
            args(&open),
            [
                "-a",
                "/Applications/OrcaSlicer.app",
                "/cache/slicer-handoff/model.3mf"
            ]
        );

        let flatpak = Path::new("/var/lib/flatpak/exports/bin/com.prusa3d.PrusaSlicer");
        assert_eq!(flatpak_app_id(flatpak), Some("com.prusa3d.PrusaSlicer"));
        let run = launch_command(Platform::Linux, flatpak, model);
        assert_eq!(run.get_program(), "flatpak");
        assert_eq!(
            args(&run),
            [
                "run",
                "--file-forwarding",
                "com.prusa3d.PrusaSlicer",
                "@@",
                "/cache/slicer-handoff/model.3mf",
                "@@"
            ]
        );

        let binary = Path::new("/opt/slicers/PrusaSlicer.AppImage");
        assert_eq!(flatpak_app_id(binary), None);
        let direct = launch_command(Platform::Linux, binary, model);
        assert_eq!(direct.get_program(), binary.as_os_str());
        assert_eq!(args(&direct), ["/cache/slicer-handoff/model.3mf"]);
        assert_eq!(direct.get_current_dir(), Some(Path::new("/opt/slicers")));

        // Flatpak launchers are only special on Linux.
        let windows = launch_command(Platform::Windows, flatpak, model);
        assert_eq!(windows.get_program(), flatpak.as_os_str());
    }

    #[test]
    fn only_detected_or_picked_apps_can_open_models() {
        let root = test_directory("slicers-known");
        let programs = root.join("Program Files");
        let orca = programs.join("OrcaSlicer").join("orca-slicer.exe");
        let picked = root.join("Tools").join("CrealityPrint.exe");
        let other = root.join("Tools").join("calc.exe");
        for path in [&orca, &picked, &other] {
            touch(path);
        }
        let roots = SearchRoots {
            windows_programs: vec![programs.clone()],
            ..SearchRoots::default()
        };
        let picked_apps = root.join("config").join("picked-slicers.json");
        let find =
            |path: &Path| find_known_slicer_app(Platform::Windows, &roots, &picked_apps, path);

        assert_eq!(find(&orca), Some(app("Orca Slicer", &orca)));
        assert_eq!(find(&picked), None);
        remember_picked_app(&picked_apps, &picked.to_string_lossy(), None).unwrap();
        assert_eq!(find(&picked), Some(app("CrealityPrint", &picked)));
        assert_eq!(find(&other), None);
        assert_eq!(find(&root.join("Tools").join("missing.exe")), None);

        // A picked app that was uninstalled can no longer be launched.
        std::fs::remove_file(&picked).unwrap();
        assert_eq!(find(&picked), None);
        remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_saved_cura_stays_launchable_after_a_newer_one_is_installed() {
        let root = test_directory("slicers-cura-upgrade");
        let programs = root.join("Program Files");
        let cura = |version: &str| {
            programs
                .join(format!("UltiMaker Cura {version}"))
                .join("UltiMaker-Cura.exe")
        };
        let (older, newer) = (cura("5.7.2"), cura("5.8.0"));
        touch(&older);
        touch(&newer);
        // Same executable name, but not in a versioned Cura folder under a programs directory.
        let elsewhere = root
            .join("Tools")
            .join("UltiMaker Cura 5.7.2")
            .join("UltiMaker-Cura.exe");
        let unversioned = programs.join("UltiMaker Cura").join("UltiMaker-Cura.exe");
        let nested = programs
            .join("UltiMaker Cura 5.7.2")
            .join("bin")
            .join("UltiMaker-Cura.exe");
        let other = programs.join("UltiMaker Cura 5.7.2").join("calc.exe");
        for path in [&elsewhere, &unversioned, &nested, &other] {
            touch(path);
        }
        let roots = SearchRoots {
            windows_programs: vec![programs.clone()],
            ..SearchRoots::default()
        };
        let picked_apps = root.join("config").join("picked-slicers.json");
        let find =
            |path: &Path| find_known_slicer_app(Platform::Windows, &roots, &picked_apps, path);

        assert_eq!(
            detect_slicer_apps(Platform::Windows, &roots),
            vec![app("UltiMaker Cura", &newer)]
        );
        assert_eq!(find(&older), Some(app("UltiMaker Cura", &older)));
        assert_eq!(find(&newer), Some(app("UltiMaker Cura", &newer)));
        for path in [&elsewhere, &unversioned, &nested, &other] {
            assert_eq!(find(path), None, "{path:?}");
        }
        // Versioned folders only count on Windows.
        assert_eq!(
            find_known_slicer_app(Platform::Linux, &roots, &picked_apps, &older),
            None
        );

        // Uninstalling the older version forgets it.
        remove_dir_all(older.parent().unwrap()).unwrap();
        assert_eq!(find(&older), None);
        remove_dir_all(root).unwrap();
    }

    #[test]
    fn picked_apps_are_deduplicated_and_capped() {
        let root = test_directory("slicers-picked");
        let file = root.join("picked-slicers.json");
        assert!(read_picked_apps(&file).is_empty());
        write(&file, b"not json").unwrap();
        assert!(read_picked_apps(&file).is_empty());

        remember_picked_app(&file, "/opt/a", None).unwrap();
        remember_picked_app(&file, "/opt/b", None).unwrap();
        remember_picked_app(&file, "/opt/a", None).unwrap();
        assert_eq!(read_picked_apps(&file), ["/opt/b", "/opt/a"]);

        for index in 0..MAX_PICKED_APPS {
            remember_picked_app(&file, &format!("/opt/app-{index}"), None).unwrap();
        }
        let picked = read_picked_apps(&file);
        assert_eq!(picked.len(), MAX_PICKED_APPS);
        assert_eq!(picked.first().map(String::as_str), Some("/opt/app-0"));
        assert_eq!(
            picked.last().map(String::as_str),
            Some(format!("/opt/app-{}", MAX_PICKED_APPS - 1).as_str())
        );
        remove_dir_all(root).unwrap();
    }

    #[test]
    fn the_saved_slicer_outlives_later_picks() {
        let root = test_directory("slicers-saved");
        let file = root.join("picked-slicers.json");
        let saved = "/opt/saved";
        remember_picked_app(&file, saved, None).unwrap();

        // The saved slicer is the oldest pick, yet the apps picked after it are dropped instead.
        for index in 0..=MAX_PICKED_APPS {
            remember_picked_app(&file, &format!("/opt/app-{index}"), Some(saved)).unwrap();
        }
        let picked = read_picked_apps(&file);
        assert_eq!(picked.len(), MAX_PICKED_APPS);
        assert_eq!(picked.first().map(String::as_str), Some(saved));
        assert_eq!(picked[1], "/opt/app-2");
        assert_eq!(
            picked.last().map(String::as_str),
            Some(format!("/opt/app-{MAX_PICKED_APPS}").as_str())
        );

        // Once something else is saved, the old choice ages out like any other pick.
        remember_picked_app(&file, "/opt/newest", Some("/opt/app-2")).unwrap();
        let picked = read_picked_apps(&file);
        assert_eq!(picked.len(), MAX_PICKED_APPS);
        assert!(!picked.iter().any(|known| known == saved));
        assert_eq!(picked.first().map(String::as_str), Some("/opt/app-2"));
        remove_dir_all(root).unwrap();
    }
}
