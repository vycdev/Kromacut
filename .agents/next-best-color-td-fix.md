# Fix next-best-color TD scale handling (post-calibration cleanup)

> **SUPERSEDED (2026-07-02) — do not implement.** Execution never started; this
> plan is replaced by [hiding-distance-migration.md](hiding-distance-migration.md),
> which makes `filament.td` single-meaning (always frontlit hiding distance). That
> migration auto-resolves defects #1 and #2 below, and its §4 carries over the
> remaining work (linear-light blend + tests). Kept for the defect analysis.

Status: superseded.

## Context

`src/lib/nextBestColor.ts` (the "Suggest next filament" heuristic, run in
`nextBestColor.worker.ts`) predates the frontlit calibration work and still treats
`filament.td` as one homogeneous quantity. Since Phase 1/2, `td` means two
different things:

- **Uncalibrated filament:** backlit-community-scale TD (what users type from spool
  sheets / TD test prints, ~1–6 mm). Auto-paint multiplies it by
  `FRONTLIT_TD_SCALE = 0.1` before simulating (`scaleFilamentForFrontlight`,
  [autoPaint.ts:415](../src/lib/autoPaint.ts#L415)).
- **Calibrated filament:** measured *frontlit* blending distance (~0.2–0.6 mm),
  consumed as-is.

`nextBestColor` receives **raw** profile filaments and never distinguishes the two.
Verified against the user's real calibrated profile
(`tests/assets/filament-profiles/8_Colors_Calibrated_New.kfil`, frontlit TDs
0.37–0.56 mm).

## The three defects

### 1. Simulation mixes incommensurate TD scales

`blendRgb`/`buildBlendCurve` use raw `f.td`
([nextBestColor.ts:205](../src/lib/nextBestColor.ts#L205), :221–222, :323–324).

- All-calibrated profile: curves are frontlit-consistent by accident (raw = frontlit). OK.
- All-uncalibrated profile: curves are ~10× too transmissive vs. what auto-paint
  will actually do (pre-existing bug, predates calibration).
- **Mixed profile: nonsense** — a calibrated 0.4 mm filament and an uncalibrated
  4.0 mm filament are blended on the same curves as if commensurate.

### 2. `recommendedTd` output is on the wrong scale for calibrated profiles

The suggestion borrows the nearest filament's raw `td`
([nextBestColor.ts:379-386](../src/lib/nextBestColor.ts#L379-L386)) and
AutoPaintTab adds the suggested filament **uncalibrated** with that value
([AutoPaintTab.tsx:1204](../src/components/AutoPaintTab.tsx#L1204)). The pipeline
then multiplies it by 0.1:

- Nearest filament uncalibrated (td 4.0) → suggestion 4.0 → effective 0.40 ✓
- Nearest filament calibrated (td 0.40) → suggestion 0.40 → **effective 0.04 mm,
  ~10× too opaque**. This is the broken case for every calibrated profile — the
  user's new normal.

### 3. Blend runs in gamma space; auto-paint blends in linear light

`blendRgb` ([nextBestColor.ts:107-111](../src/lib/nextBestColor.ts#L107-L111))
lerps raw sRGB values. Its comment claims it "matches autoPaint's blendColors",
but auto-paint moved to linear-light compositing (`blendSrgbChannel` in
[colorSpace.ts:30](../src/lib/colorSpace.ts#L30)) in this release cycle. The
comment is stale and the curves are systematically darker mid-blend than the real
pipeline's.

## Fix

### A. Single source of truth for the effective frontlit TD

Move the constant + add a helper in **`src/lib/calibration.ts`** (a leaf module the
worker can import without dragging in autoPaint's optimizer — the reason
nextBestColor inlines its color math):

```ts
export const FRONTLIT_TD_SCALE = 0.1;

/** Scalar frontlit TD for simulation: measured value if calibrated, else the
 *  backlit-scale user entry scaled down. Mirrors auto-paint's
 *  scaleFilamentForFrontlight. */
export function effectiveFrontlitTd(filament: {
    td: number;
    calibration?: unknown;
}): number {
    return sanitizeFrontlitCalibration(filament.calibration)
        ? filament.td
        : filament.td * FRONTLIT_TD_SCALE;
}
```

Update `autoPaint.ts` to import `FRONTLIT_TD_SCALE` from calibration.ts (delete its
local copy; keep `scaleFilamentForFrontlight`'s behavior identical — it can use the
helper for the scalar). No behavior change in auto-paint; regression-covered by the
existing legacy-calibration test.

### B. Normalize TDs at the top of `nextBestColor`

```ts
const filamentTds: number[] = filaments.map((f) => effectiveFrontlitTd(f));
```

Everything downstream (pair curves, `estimatedTd`, candidate curves, winner
curves) then runs on commensurate frontlit values. Note `buildBlendCurve`'s span
(`3 × fgTd`) becomes ~1.2 mm instead of ~12 mm for uncalibrated filaments — that is
the fix working, not a regression.

### C. Emit `recommendedTd` on the uncalibrated (backlit) scale

The suggested filament is added *uncalibrated*, so its stored td must be what the
×0.1 path expects. Convert the borrowed effective value back:

```ts
const recommendedTd = effectiveFrontlitTd(filaments[nearestFilamentIdx]) / FRONTLIT_TD_SCALE;
```

(≡ unchanged value when borrowing from an uncalibrated filament; ×10 when borrowing
from a calibrated one.) Keep borrowing from the nearest filament by ΔE — it
captures material similarity; `estimateTDFromColor` remains the wand's job.

### D. Blend in linear light

Rework `blendRgb` to lerp in linear light and return sRGB, matching
`blendSrgbChannel` semantics. The linearise/delinearise helpers already exist in
this file (used by `rgbToLab`/`labToHex`) — reuse them rather than importing
colorSpace, to keep the worker bundle self-contained (or import from
`colorSpace.ts` if the bundle impact is nil — implementer's choice; colorSpace is
tiny and React-free). Fix the stale comment either way.

Scalar-TD-only curves remain fine for this heuristic (see non-goals).

## Tests

There is currently no `nextBestColor` test. Add `tests/nextBestColor.test.ts`
(vite-ssr loader pattern like `frontlitCalibration.test.ts`) covering at least:

1. **Scale normalization:** two profiles describing the *same physical filaments* —
   one uncalibrated (td 4.0), one calibrated (td 0.40 + valid `FrontlitCalibration`
   with matching channel TDs) — produce the **same suggestion hex** for the same
   swatches (curves identical after normalization).
2. **Recommended TD scale:** with a calibrated profile, the returned
   `candidate.td` is on the backlit scale (≈ borrowed frontlit value ÷ 0.1), so
   that `effectiveFrontlitTd({ td: candidate.td })` ≈ the neighbor's measured
   frontlit TD.
3. **Linear-light blend:** `blendRgb`-equivalent output matches
   `blendSrgbChannel` for a couple of spot values (e.g. 50% transmission of white
   over black ≈ linear-light midpoint ~188, not gamma midpoint 128).

The `8_Colors_Calibrated_New.kfil` fixture can serve as realistic calibrated input
for test 1/2 if convenient.

## Docs & changelog

- `CHANGELOG.md` (unreleased): under **Fixed** — suggestion TD now accounts for
  calibrated (frontlit) profiles instead of recommending a 10×-too-opaque value;
  suggestion blending matches the linear-light optical model. Per AGENTS.md, if it
  reads better, fold into the existing next-best-color bullet's section instead of
  a standalone entry (the feature shipped in v3.1.0, so **Fixed** is correct).
- `src/docs/*`: only if any doc states how the recommended TD is derived (check
  `3d-mode.md`'s suggestion paragraph); the user-visible behavior ("recommended
  starting TD") is unchanged in kind.

## Non-goals (explicitly out of scope)

- **No renaming of TD anywhere** (UI labels, fields, docs). The
  "blending distance" naming discussion is a separate, user-gated task.
- No per-channel TD curves in the suggestion heuristic — scalar effective TD is
  sufficient for inventory planning; keep the module light.
- No changes to candidate generation, scoring weights, or ranking.
- No changes to auto-paint behavior — step A must be a pure refactor there.

## Acceptance

- `npm test` green (including the new nextBestColor tests), `npx tsc -b` and
  `npm run lint` clean.
- Manual sanity: with `8_Colors_Calibrated_New` loaded, "Suggest next filament"
  returns a candidate whose TD is ~3–6 (backlit scale), not ~0.4.
