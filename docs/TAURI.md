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

1. Synchronize the version in `package.json`, both root entries in `package-lock.json`,
   `src-tauri/tauri.conf.json`, the package in `src-tauri/Cargo.toml`, the `kromacut` package in
   `src-tauri/Cargo.lock`, and `public/version.json`. Do not upgrade dependencies as a side effect.
2. Move the completed `CHANGELOG.md` entries into a dated `vX.Y.Z` section, retaining an empty
   `Unreleased` section for future work. Preserve previously published release entries.
3. Update the feed's English summary and every `release_notes_localized` translation together.
   Point `download_url` to the exact `/releases/tag/vX.Y.Z` page, not `/releases/latest`.
4. Run `node scripts/check-release-notes.mjs`, lint, the relevant regression tests, and
   `npm run test:e2e:i18n:build`. The latter builds and checks localized production routes.
5. Commit the reviewed release-preparation files and merge them to `main` before creating the tag.
   Leave private audit notes, local calibration data, and temporary files out of the commit.
6. After release approval, tag that reviewed commit as `vX.Y.Z` and push the tag. The native
   workflow validates the tag, manifest/lockfile versions, feed, and changelog before building.
   Manual workflow runs must select the version tag, not a branch.

The GitHub Actions workflow will automatically build native applications for:

- **macOS**: Apple Silicon (M1/M2/M3) and Intel
- **Windows**: x64 NSIS setup installer, plus an offline NSIS setup installer with the WebView2 offline installer embedded
- **Linux**: AppImage and .deb package

All artifacts are attached to a draft GitHub release. The publication job waits for all native
builds and the AppImage metadata checks before publishing it. Check that every platform completed
successfully and that the published downloads match the version; local web tests alone do not
verify all native installers.

### Website and update-feed ordering

Pages deployment checks that `public/version.json` matches the latest published stable desktop
release. Merging a version bump before the installers are ready therefore skips deployment and
leaves the existing site and update feed live. Successful completion of **Release Native App**
triggers another check, then builds Pages from that native workflow's exact source commit. A
final check prevents publishing an obsolete feed if the latest release changed during the build.
Main-branch pushes and manual Pages runs still support web-only updates with the current version.

The Pages workflow must already exist on the default branch for GitHub's
[`workflow_run` trigger](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
to work. Merge the workflow changes before tagging the first release that uses this ordering.
If native publication or Pages deployment fails, inspect the failed job before rerunning it;
do not announce the new version by manually bypassing the publication check.

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
