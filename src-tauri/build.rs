fn main() {
    let mut attributes = tauri_build::Attributes::new();
    // tauri-build embeds its Windows app manifest only into binaries, but the unit test
    // executable links the same Tauri and dialog code. Without the manifest's Common Controls v6
    // dependency it fails to start with STATUS_ENTRYPOINT_NOT_FOUND. So hand the same manifest
    // (copied from tauri-build) to the MSVC linker, which embeds it into every target.
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os == "windows" && target_env == "msvc" {
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("windows")
            .join("app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
        // Without this the linker adds a UAC section that tauri-build's manifest does not have.
        println!("cargo:rustc-link-arg=/MANIFESTUAC:NO");
    }
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
