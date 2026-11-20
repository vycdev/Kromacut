fn main() {
    let mut attributes = tauri_build::Attributes::new();
    // tauri-build links its Windows app manifest into binaries only, but the unit test executable
    // links the same Tauri and dialog code. Without the manifest's Common Controls v6 dependency it
    // fails to start with STATUS_ENTRYPOINT_NOT_FOUND. So embed the manifest ourselves, in every
    // target.
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os == "windows" && target_env == "msvc" {
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        embed_manifest_in_every_target();
    }
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}

/// Writes tauri-build's default manifest into a resource script in tauri-winres' format, so the
/// app's embedded manifest bytes do not change, then links it into tests and libraries as well as
/// binaries. `windows/app-manifest.xml` is a verbatim copy of tauri-build 2.6.3's
/// `windows-app-manifest.xml`; re-diff it when upgrading tauri-build. Only `"` is escaped, the
/// one character tauri-winres escapes that the manifest contains.
fn embed_manifest_in_every_target() {
    let manifest = include_str!("windows/app-manifest.xml");
    let mut script = String::from("#pragma code_page(65001)\n1 24\n{\n");
    for line in manifest.lines() {
        script.push_str(&format!("\" {} \"\n", line.trim().replace('"', "\"\"")));
    }
    script.push_str("}\n");
    let path = std::path::Path::new(&std::env::var("OUT_DIR").unwrap()).join("app-manifest.rc");
    std::fs::write(&path, script).expect("failed to write the manifest resource script");
    embed_resource::compile_for_everything(&path, embed_resource::NONE)
        .manifest_required()
        .expect("failed to compile the manifest resource");
}
