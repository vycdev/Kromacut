# Update Checking System

Kromacut includes an automatic update checker for the Tauri desktop app.

## How It Works

1. **Version Check**: The app periodically checks `https://kromacut.com/version.json` for the latest version.
2. **Comparison**: The fetched version is compared with the installed version.
3. **Notification**: If a newer version is available, a notification appears in the bottom-right corner.
4. **User Action**: Users can download the update or dismiss the notification.

## Version File Format

The `version.json` file should be hosted at `https://kromacut.com/version.json` with the following structure:

```json
{
    "version": "4.1.0",
    "download_url": "https://github.com/vycdev/Kromacut/releases/tag/v4.1.0",
    "release_notes": "Bug fixes and performance improvements"
}
```

### Fields

- `version` (required): The latest version number (semver format recommended)
- `download_url` (optional): Direct link to download the update
- `release_notes` (optional): Brief description of what's new

### Localized Release Notes

Keep `release_notes` in English for compatibility with already-released desktop clients. New
releases also supply `release_notes_localized`, an object mapping every supported language code
from `src/lib/languagePreferences.ts` to a full translation of those same notes. Its `en` entry
must equal `release_notes`. The production example is `public/version.json`.

Update every translation together when changing the release summary. Preserve upgrade warnings,
backup instructions, and version-specific details; do not substitute a generic update message or
reuse notes from a previous release. Run `node scripts/check-release-notes.mjs` before publishing.
The coverage check rejects missing, blank, or identical English entries for translated languages;
runtime fallback is not translation coverage.

Both desktop update displays choose the current language at render time, so changing language
does not make another update request. The Rust update response preserves the entire translation
map. An older remote feed without a translation remains readable in its original English, with
an explicit `lang="en"` on the note; no bundled note from another release is substituted.

## Update Frequency

- **On Startup**: Checks for updates when the app launches
- **Periodic**: Re-checks every 4 hours while the app is running
- **Non-blocking**: Version checks happen in the background

## Version Synchronization

The version number is managed in multiple places and should be kept in sync:

1. `package.json` and both application entries in `package-lock.json`
2. `src-tauri/tauri.conf.json`
3. `src-tauri/Cargo.toml` under `[package]` and the `kromacut` entry in `src-tauri/Cargo.lock`
4. `public/version.json`, its version-specific download link, and a dated `CHANGELOG.md` entry

`node scripts/check-release-notes.mjs` validates these alongside localized note coverage. It runs
as part of the normal build. In release CI it also requires the exact matching version tag; a
manual dispatch from a branch cannot publish a release with mismatched installers.

Pages only deploys a feed that names the latest published stable desktop release. A main-branch
version bump waits until the native release workflow finishes and publishes its installers;
that completion triggers deployment from the release commit. See [the release sequence](TAURI.md#website-and-update-feed-ordering).

## Disabling Update Checks

Update checks only run in the Tauri desktop environment. The web version is unaffected. In the desktop app, turn off **Settings → Updates → Check for updates on startup** to disable automatic startup and periodic checks. The manual **Check** action remains available.

## Testing

Run the native update-response tests and the release-metadata/deployment-guard regressions:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
node --no-warnings --experimental-strip-types --test tests/releaseMetadata.test.ts tests/pagesReleaseGate.test.ts tests/i18n.test.ts
```

The guard tests simulate missing, draft, superseded, and successfully published releases without
publishing anything. Keep synthetic version numbers in test fixtures; do not deploy a higher
`version.json` as a way to test an update notification.

## Privacy

The update checker makes a single HTTP GET request to the version endpoint. No user data or telemetry is collected or transmitted.
