# Hiding Distance — rename, single-meaning storage, and per-channel model

> **Status: IMPLEMENTED (2026-07-03, by Claude).** All sections landed, including the
> folded-in nextBestColor work (§4). Verified: 240 tests (12 new), tsc, eslint green;
> 24 auto-paint goldens regenerated; the calibrated-path regression guard
> (`tests/assets/autopaint-calibrated-baseline.json`, captured pre-change) proves
> byte-identical output for the 8-color calibrated profile. Implementation notes vs
> plan: `effectiveFrontlitTd` was unnecessary (single-meaning storage covers it);
> `.kapp` test fixtures stay authentic v1 files with migration applied in the
> fixture readers; the `profileManager→calibration→colorSpace/colorDifference/colorUtils`
> import chain gained explicit `.ts` extensions for plain-node test/script loading;
> one nextBestColor ranking test updated (linear light legitimately changes the
> winning candidate, and its old assertion contradicted its own comment).
>
> **Post-implementation self-review (2026-07-03)** found and fixed two issues:
> (1) the ×0.1 migration now rounds to 4 decimals — raw doubles like
> `1.1 × 0.1 = 0.11000000000000001` would have shown verbatim in the HD input;
> (2) migration gates re-keyed to fixed version constants (`TD_MIGRATION_VERSION`
> in profileManager, `>=` schema check in App.tsx) so a future v3 bump cannot
> re-apply the ×0.1 to v2 data. Goldens regenerated once more after the rounding
> change (a 1e-18 td delta had flipped one optimizer scenario). Final state:
> 240 tests, tsc, eslint green.

Status: implemented.
**Supersedes** [next-best-color-td-fix.md](next-best-color-td-fix.md) (never started —
its defects are either auto-resolved by this migration or folded in below).

## Decisions (user-approved)

- **Name:** "Hiding Distance" (HD), unit mm — the depth of material at which a
  filament visually hides what's beneath it. Display/docs rename only; the storage
  field stays `td` (`.kfil` compat is a user-data boundary per AGENTS.md).
- **Storage becomes single-meaning:** `filament.td` always stores the *frontlit*
  hiding distance, for calibrated and uncalibrated filaments alike. The current
  dual meaning (backlit-community scale for uncalibrated, frontlit for calibrated,
  reconciled by a runtime ×0.1) is the root cause of the nextBestColor bug class
  and dies here.
- **Conventional TD entry:** users can still type a spool-sheet / MakerWorld-test
  TD; the UI converts it (× `FRONTLIT_TD_SCALE = 0.1`) at entry. The factor is
  empirically validated: the user's physical calibration of 8 filaments measured
  HD ≈ old backlit TD × 0.1 across the set.
- **Uncalibrated filaments get heuristic per-channel HDs** (approved sub-decision).
  Today they blend channel-uniform (`[td,td,td]`); the `deriveChannelTds` color
  heuristic is only used inside calibration fitting. After this change every
  filament blends with channel HDs — measured (calibrated) or derived from the
  swatch color (uncalibrated). This is the biggest behavior change in the bundle:
  uncalibrated blend outputs change and goldens must be regenerated.

## 1. Data migration (the critical part — treat as a persistence boundary)

New semantic: `td` = frontlit HD. Old uncalibrated values (~1–6) must be scaled
×0.1 exactly once.

- Bump `CURRENT_PROFILE_VERSION` 1 → 2 in
  [profileManager.ts](../src/lib/profileManager.ts). Migration rule applied on
  every load/import when `version < 2` (or missing):
  - filament **without** valid calibration → `td *= FRONTLIT_TD_SCALE`
  - filament **with** calibration → `td = calibration.tdSingleValue` (defensive
    re-sync; already equal in practice)
  - stamp `version: 2`.
- Apply in **all three load paths** (same trio as the legacy-calibration
  stripping): `loadProfiles` (localStorage `kromacut.autopaint.profiles`),
  `importProfiles` (`.kfil` files in the wild are version 1 — must convert on
  import), and `loadAutoPaintPersisted` in [App.tsx](../src/App.tsx).
  - ⚠️ `kromacut.autopaint.v1` has **no version field**. Add one to the persisted
    shape (e.g. `schemaVersion: 2`); absent ⇒ old ⇒ migrate filaments as above,
    then persist with the marker. Do not key the migration off heuristics like
    "td looks big".
- New exports write `version: 2`. Importing a v2 file must NOT re-scale
  (regression test: double-import idempotence).
- Do not clamp or "sanitize" values during migration beyond the existing filament
  validation — convert as-is.

## 2. Runtime model — delete the ×0.1 layer, add channel HDs everywhere

- **Move `FRONTLIT_TD_SCALE` to [calibration.ts](../src/lib/calibration.ts)** and
  export it; it survives only as (a) the entry-conversion factor and (b) the
  migration factor. Delete `scaleFilamentForFrontlight` from
  [autoPaint.ts](../src/lib/autoPaint.ts) and both call sites (~lines 1430, 1545)
  — post-migration, `td` is already frontlit.
- **`autoPaint.ts:1633`** (`totalTD = Σ f.td × FRONTLIT_TD_SCALE`): note this
  currently scales raw tds of ALL filaments — for calibrated filaments that is a
  latent double-scaling bug today. Replace with `Σ f.td` (now uniformly HD) and
  check what consumes it for a behavior impact note.
- **Shared channel helper** in calibration.ts:

  ```ts
  /** Per-channel hiding distances: measured when calibrated, else derived
   *  from the swatch color around the scalar HD. */
  export function channelHds(filament: { color: string; td: number; calibration?: unknown }): CalibrationRgb {
      return sanitizeFrontlitCalibration(filament.calibration)?.td
          ?? deriveChannelTds(filament.color, filament.td);
  }
  ```

  Replace `calibratedTdChannels` (autoPaint.ts:406) with it; drop the
  `USE_CALIBRATED_CHANNEL_TD` flag. Audit that every blend/transition consumer
  (`blendColors`, `calculateTransitionThickness`, transition zones, optimizer
  scoring context, worker payloads, optimizer cache keys) now receives channel
  HDs for uncalibrated filaments too. Cache keys already include color+td, so
  derived channels are covered.
- **`estimateTDFromColor`** ([colorUtils.ts:39](../src/lib/colorUtils.ts#L39)):
  re-baseline to return HD directly — `(1.0 + luminance × 5.8) × FRONTLIT_TD_SCALE`
  (≈0.10–0.68). Rename to `estimateHidingDistanceFromColor` (keep an alias export
  only if call-site churn is a concern; prefer full rename, it's internal).
  Call sites: FilamentRow wand (:176), `useFilaments.ts:19` default for new
  filaments.
- **`computeProfileConfidence`** uncalibrated plausibility bands rescale ×0.1:
  `1.0–5.0 → 0.10–0.50` (0.5 score), `0.5–10 → 0.05–1.0` (0.3 score).
- **FilamentCalibrationDialog `estimateChannelTds`** (:207): the `filament.td * 0.1`
  becomes just `filament.td` (or the shared `channelHds` helper — preferred).
- **Calibration flow itself is unchanged** — it already produces and stores HD.

## 3. UI

- **Label rename:** "TD" → "HD" wherever shown (FilamentRow input suffix,
  calibration dialog select list + fit card "TD 0.51mm" → "HD 0.51 mm",
  next-best-color suggestion card). Tooltip on the input: "Hiding distance (mm):
  depth at which this filament hides what's beneath it. Measured by calibration,
  or estimated from color."
- **Input range:** current blur clamp is `0.1–100` — black's measured 0.05 can't
  even be typed. New clamp ~`0.01–2.0`, step 0.01.
- **"From TD" conversion affordance** on the filament row (small button or popover
  next to the HD input): user enters a conventional/backlit TD value, field stores
  `value × FRONTLIT_TD_SCALE`, marked uncalibrated (clears calibration like any
  manual edit). Label it plainly, e.g. "Convert from TD (lithophane/backlit
  value)". This is the community-facing bridge — keep it discoverable.
- **Per-channel visibility (read-only):** show `R/G/B` HD values (2 decimals, mm)
  — for calibrated filaments on the existing calibration badge tooltip labeled
  "measured"; for uncalibrated on the HD input tooltip labeled "estimated from
  color". No editing of channels (manual scalar edits already clear calibration —
  keep that semantics).
- New-filament default (`useFilaments.ts`) comes out on HD scale automatically via
  the re-baselined estimator.

## 4. nextBestColor (folded in from the superseded plan)

Post-migration, its raw `f.td` usage becomes correct automatically (the old plan's
defects #1 and #2 vanish). Remaining work:

- `recommendedTd` (:386) needs **no conversion** — it borrows the neighbor's td,
  which is now HD, and the added filament's uncalibrated path expects HD. Just
  verify and update the card label.
- **Blend in linear light**: `blendRgb` (:107) lerps gamma sRGB; rework to lerp in
  linear light matching `blendSrgbChannel` semantics (linearise/delinearise
  helpers already exist in-file), and fix the stale "matches autoPaint's
  blendColors" comment.
- Keep scalar-HD curves (no per-channel in this heuristic — planning tool, keep it
  light). No changes to candidate generation/scoring/ranking.

## 5. Tests

- **Migration:** v1 profile (uncalibrated td 4.0) loads as 0.40; calibrated
  filament untouched; v2 double-import idempotent; `kromacut.autopaint.v1` without
  the schema marker migrates once; mixed profile correct. Extend
  `tests/profileManager.test.ts`.
- **Calibrated-path regression (the key acceptance guard):** auto-paint output for
  an all-calibrated profile (use
  `tests/assets/filament-profiles/8_Colors_Calibrated_New.kfil`) must be
  **identical before and after this change** — calibrated filaments' channel HDs
  and scalars are untouched by the migration.
- **Uncalibrated behavior change:** goldens change intentionally (channel HDs +
  no more runtime scaling — net optics identical in magnitude but now
  color-shaped). Regenerate via `npm run test:autopaint:update`; re-check
  `autoPaintQuality` budgets still pass.
- **Estimator rescale:** `estimateHidingDistanceFromColor('#ffffff') ≈ 0.68`,
  `('#000000') = 0.1`.
- **channelHds helper:** calibrated → measured triple; uncalibrated → derived
  triple anchored at the scalar.
- **nextBestColor:** new `tests/nextBestColor.test.ts` — linear-light blend spot
  check (50% transmission of white over black ≈ linear midpoint ~188 sRGB, not
  128); suggestion for the calibrated fixture returns `candidate.td` on HD scale
  (~0.3–0.6); recommendedTd ≈ nearest neighbor's td.

## 6. Docs & changelog

- `src/docs/` (`3d-mode.md` filament/TD sections + calibration walkthrough,
  `settings-and-controls.md`, `troubleshooting.md`, `quick-start.md` — grep for
  "TD" and "Transmission Distance"): rename to Hiding Distance with a one-line
  bridge ("previously shown as TD; conventional lithophane TD values can be
  entered via Convert from TD — they're ≈10× the hiding distance").
- `CHANGELOG.md` (unreleased): under **Changed**, one bullet covering: the rename,
  the single-meaning storage + automatic one-time conversion of existing profiles
  and `.kfil` imports (call out `version: 2`), the Convert-from-TD entry, and
  per-channel blending for uncalibrated filaments. The latent
  calibrated-double-scaling fix at autoPaint.ts:1633 goes under **Fixed** only if
  it changed released behavior — it's within the unreleased calibration work, so
  fold it in.
- AGENTS.md "Domain Notes" TD bullet: update the terminology so future agents
  aren't taught the old dual meaning.

## Acceptance

- Old `.kfil` (v1, uncalibrated td 4.0) imports as HD 0.40; exporting produces v2;
  re-importing that is a no-op.
- `8_Colors_Calibrated_New` profile: identical auto-paint output pre/post change.
- New filament defaults, wand estimates, and next-best suggestions all land in
  ~0.1–0.7 HD range.
- UI shows "HD"; typing a conventional TD via the converter stores value×0.1.
- Full suite + regenerated goldens + tsc + lint green.

## Out of scope

- Renaming the `td` storage field or `FrontlitCalibration.td` (data compat).
- Editable per-channel values.
- Per-channel curves in nextBestColor.
- Any calibration-flow changes (it already produces HD).
