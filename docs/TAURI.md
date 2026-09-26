# Kromacut Native App (Tauri)

Kromacut can be built as a native application for macOS, Windows, and Linux using Tauri.

## Prerequisites

- Rust
    ```bash
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    source "$HOME/.cargo/env"
    ```
- Node.js

## Development

```bash
npm run tauri:dev
```

## Production Build

```bash
npm run tauri:build
```

Build artifacts are created under `src-tauri/target/release/bundle/`.

## Configuration

Main config file: `src-tauri/tauri.conf.json`

- Window defaults are set for Kromacut’s two-pane layout.
- Bundle identifier is configured in the same file.

## Versioning and Release

When releasing a new version:

1. Update `package.json` version.
2. Update `src-tauri/tauri.conf.json` version.
3. Commit and tag the release.

Example:

```bash
git add package.json src-tauri/tauri.conf.json
git commit -m "Bump version to vX.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

The GitHub Actions workflow will automatically build native applications for:

- **macOS**: Apple Silicon (M1/M2/M3) and Intel
- **Windows**: x64 NSIS setup installer, plus an offline NSIS setup installer with the WebView2 offline installer embedded
- **Linux**: AppImage and .deb package

All artifacts are attached to the GitHub release.

## Distribution Notes

**macOS:** Unsigned builds require removing quarantine:

```bash
sudo xattr -d com.apple.quarantine /Applications/Kromacut.app
```

For notarized distribution, configure a Developer ID signing identity in `tauri.conf.json`.

**Windows:** The setup installer may trigger Windows SmartScreen for unsigned builds. Users can click "More info" → "Run anyway".

The standard Windows installers embed the small WebView2 bootstrapper. The NSIS setup installer also checks for WebView2 `114.0.1823.67` or newer and can update the runtime when internet access is available. The release workflow also publishes a larger `*_offline-setup.exe` for Windows machines that need to install without internet access.

**Linux:** AppImage bundles are portable and require no installation. `.deb` packages integrate with the system package manager.

### AppImage delta updates

Release AppImages embed a stable GitHub Releases update location for the matching CPU architecture.
Compatible tools such as [AppImageUpdate](https://github.com/AppImageCommunity/AppImageUpdate)
can use the accompanying `.AppImage.zsync` file to reuse unchanged data. Download savings depend
on how much of the packaged application changed; this is not a smaller standalone installer.
An older AppImage without embedded update information needs a one-time manual download of a
supporting release. Kromacut's in-app update notice still opens the release download page; it does
not install updates automatically. Windows installers, macOS bundles, `.deb`, and `.rpm` packages
are unaffected.

The Linux release job sets `LDAI_UPDATE_INFORMATION` for linuxdeploy's AppImage plugin and uses
`zsyncmake` from the `zsync` package to generate a sidecar beside the final AppImage with its exact
release download URL. This avoids relying on appimagetool's sidecar output directory.
For the current x86-64 build, the official update
string is `gh-releases-zsync|vycdev|Kromacut|latest|Kromacut_*_amd64.AppImage.zsync`. Fork workflows
derive the owner and repository from their own GitHub context. `latest` follows stable releases,
not prereleases.

Before the sidecar is uploaded to the draft release, `scripts/check-appimage-update.mjs` checks the
runtime's embedded update information, exact release filename, target URL, file size, SHA-1, and
block-checksum table length. The SHA-1 check verifies artifact consistency; it is not a digital
signature. Publication waits for this validation and requires both uploaded assets. The sidecar is
uploaded explicitly because tauri-action's artifact list does not include `.zsync` files.

To validate a local Linux release build (replace the tag with the built version):

```bash
node scripts/check-appimage-update.mjs src-tauri/target/release/bundle/appimage vycdev/Kromacut v4.1.0
```

Keep the final AppImage unchanged after generating its sidecar. Rebuild both together if packaging,
embedded metadata, or signing changes. Manual release-workflow runs must target the version tag.
