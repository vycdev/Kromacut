use std::io;
use std::path::Path;

/// Dispatches a file or directory to its default application. Success means the OS accepted
/// the handoff, not that the application has finished using the file. Call off the UI thread.
#[cfg(target_os = "macos")]
pub fn open_with_default_app(path: &Path) -> io::Result<()> {
    checked_launcher(std::process::Command::new("/usr/bin/open").arg(path))
}

#[cfg(target_os = "macos")]
fn checked_launcher(command: &mut std::process::Command) -> io::Result<()> {
    // `open` exits after dispatch unless passed -W. Merely spawning it loses Launch Services
    // failures such as a missing association, which are reported through its exit status.
    let output = command.output()?;
    if output.status.success() {
        Ok(())
    } else {
        Err(io::Error::other(format!(
            "Default application launcher exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        )))
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn open_with_default_app(path: &Path) -> io::Result<()> {
    use gio::prelude::FileExt;

    // GIO is already required by the Linux desktop runtime. Unlike waiting on xdg-open,
    // this reports dispatch errors without potentially waiting until the slicer exits.
    let uri = gio::File::for_path(path).uri();
    gio::AppInfo::launch_default_for_uri(&uri, None::<&gio::AppLaunchContext>)
        .map_err(|error| io::Error::other(error.to_string()))
}

#[cfg(target_os = "windows")]
pub fn open_with_default_app(path: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::RPC_E_CHANGED_MODE;
    use windows_sys::Win32::System::Com::{
        CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
    };
    use windows_sys::Win32::UI::Shell::{
        ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let mut file: Vec<u16> = path.as_os_str().encode_wide().collect();
    if file.contains(&0) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Path contains NUL",
        ));
    }
    file.push(0);
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI,
        lpVerb: windows_sys::w!("open"),
        lpFile: file.as_ptr(),
        nShow: SW_SHOWNORMAL,
        ..Default::default()
    };

    // SAFETY: COM is initialized for this worker thread. An existing apartment can be used
    // without balancing its initialization; only our own successful calls are uninitialized.
    let initialized = unsafe {
        CoInitializeEx(
            std::ptr::null(),
            (COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) as u32,
        )
    };
    if initialized < 0 && initialized != RPC_E_CHANGED_MODE {
        return Err(io::Error::other(format!(
            "Failed to initialize the application launcher: HRESULT {initialized:#x}"
        )));
    }
    // SAFETY: All pointers in `info` are null or valid NUL-terminated strings which outlive
    // the call. NOASYNC waits for dispatch, not application exit. No process handle is kept.
    let result = if unsafe { ShellExecuteExW(&mut info) } == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    };
    if initialized >= 0 {
        // SAFETY: Balances the successful CoInitializeEx call on this thread.
        unsafe { CoUninitialize() };
    }
    result
}

#[cfg(test)]
mod tests {
    #[test]
    fn native_dispatch_reports_a_missing_file() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "kromacut-launch-test-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir(&directory).unwrap();
        // The file is absent, so no application is launched. Windows errors are suppressed
        // by SEE_MASK_FLAG_NO_UI; all platforms must return the failure to the caller.
        let result = super::open_with_default_app(&directory.join("missing model.3mf"));
        std::fs::remove_dir(&directory).unwrap();
        assert!(result.is_err());
    }
}

#[cfg(all(test, target_os = "macos"))]
mod macos_tests {
    use super::checked_launcher;
    use std::process::Command;

    #[test]
    fn launcher_reports_failure_after_a_successful_spawn() {
        let error = checked_launcher(
            Command::new("/bin/sh").args(["-c", "printf 'No application registered' >&2; exit 7"]),
        )
        .unwrap_err();
        assert!(error.to_string().contains("7"));
        assert!(error.to_string().contains("No application registered"));
    }

    #[test]
    fn launcher_accepts_a_successful_dispatch() {
        checked_launcher(Command::new("/bin/sh").args(["-c", "exit 0"])).unwrap();
    }

    #[test]
    fn launcher_reports_spawn_failure() {
        assert!(checked_launcher(&mut Command::new("/dev/null/no-launcher")).is_err());
    }
}
