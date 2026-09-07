# AGENTS.md

Repository guidance for coding agents working on Kromacut.

## Product Context

Kromacut turns a 2D image into a stacked, color-layered 3D print. The app reduces an uploaded
image to a small palette, lets users tune color order and per-color layer heights, previews the
result in Three.js, and exports printable STL or 3MF files.

The important mental model is "image colors become physical layers." UI changes often affect
geometry, slicer behavior, and print instructions at the same time.

## Domain Notes

- **Hiding Distance (HD):** Used by auto-paint to model light through thin filament layers with
  Beer-Lambert-style optical simulation. `filament.td` stores the frontlit hiding distance in mm
  (introduced in profile schema v2; v3 adds appearance evidence); the field keeps its historical
  `td` name for data compatibility. Conventional
  backlit/lithophane Transmission Distance values are an *input format* only — converted ×0.1
  (`FRONTLIT_TD_SCALE`) at entry or during the one-time v1→v2 migration, never stored. HD is not
  just a display value; changing how it is stored or rounded can change generated layer stacks.
- **Auto-paint layers:** Auto-paint chooses physical filament stacks for target image colors. The
  worker path exists so optimizer choices such as exhaustive, simulated annealing, and genetic
  search do not freeze the UI.
- **Layer snapping:** Per-color heights and swap plans must stay aligned with layer height and
  first-layer height. Preserve the reconciliation logic in `useColorSlicing` and `useSwapPlan`
  when touching print settings.
- **Greedy/smooth meshing:** Mesh code is judged by slicer-safe topology, not just visual output.
  Avoid T-junctions, open boundaries, inverted winding, duplicate triangles, and non-manifold
  edges. The regression tests inspect these properties directly.
- **3MF exports:** The 3MF path preserves one printable object per physical layer where possible
  and uses physical filament colors instead of creating a new material for every preview color.
- **Dedithering:** This is a pre-quantization smoothing pass for isolated dithered pixels. Keep it
  separate from the quantizers unless the user asks for a combined workflow.
- **Filament profiles:** Auto-paint filament configurations persist to localStorage and can be
  imported/exported as `.kapp` JSON. Treat file shape and localStorage migration code as user data
  compatibility boundaries.

## Architecture To Preserve

- `App.tsx` owns the main workflow state and passes it down. Components should stay presentational
  or orchestration-focused; reusable behavior belongs in hooks.
- `src/lib/*` is intended to stay React-free. Put algorithmic work there and keep browser/UI
  concerns in hooks/components.
- Shared domain types live in `src/types/index.ts` to avoid circular imports between hooks,
  components, workers, and lib modules.
- The image pipeline uses separate original and processed canvases for non-destructive edits.
  Baking adjustments intentionally bumps `adjustmentsEpoch` so adjustment controls reset.
- Long-running work should keep the UI responsive. Existing patterns include worker offload for
  auto-paint and chunked/yielding mesh/export loops.
- The 3D preview uses crisp pixel textures (`NearestFilter`, no mipmaps) and layer geometry with
  per-face color/material semantics. A visually equivalent refactor can still break export
  topology, so verify both preview and exported model behavior.

## Persistence And User Data

- Auto-paint UI state is stored under `kromacut.autopaint.v1` with legacy migration support.
- Print settings have their own storage helper; do not silently change units, defaults, or key
  names without a migration.
- Palette and filament profile import/export are user-facing data formats. Be conservative when
  renaming fields or changing validation.

## Testing Guidance

The project uses a lightweight Node test runner with `node:test`; the script name is in
`package.json`. The current tests focus on meshing and 3MF topology using synthetic masks and image
fixtures.

Run the focused tests when touching:

- `src/lib/meshing.ts`
- `src/lib/export3mf.ts`
- code that changes layer counts, layer ordering, material colors, or generated geometry

For UI-only edits, lint/build is usually enough. For geometry, export, or auto-paint changes, prefer
adding a small regression test over relying on screenshots.

## Changelog Guidance

Update `CHANGELOG.md` under the current unreleased version for most completed changes. In general,
add an entry for user-visible features, bug fixes, behavior changes, export/geometry changes,
persistence or data-format changes, performance work, release/build changes, and meaningful new test
coverage or fixtures. Skip changelog entries for purely internal cleanup, typo-only edits, temporary
debugging, or mechanical refactors that do not change behavior or coverage.

Classify changelog entries relative to the last released version, not relative to earlier commits in
the same unreleased section. If a feature, test suite, or workflow was added during the current
unreleased version, later refinements to that same new work should usually stay under `Added` or be
folded into the original bullet, not listed as `Changed` or `Fixed`.

## Documentation Guidance

Kromacut has user-facing in-app documentation in `src/docs`. When changing behavior that affects how
someone uses the app, check whether those docs need to move with the code. This especially applies
to workflow steps, settings, import/export formats, print instructions, auto-paint behavior,
dedithering, supported platforms, release/update behavior, and troubleshooting advice.

Docs updates should explain the practical user-facing behavior, not implementation details. Skip
docs changes for purely internal cleanup, visual polish that does not change usage, or temporary
debugging.

## Editing Heuristics

- Preserve printability over cosmetic simplification. If mesh/export code gets shorter but loses
  topology guarantees, it is probably wrong.
- Keep algorithm changes deterministic where possible. If randomness is involved, expose or reuse a
  seed so regressions can be reproduced.
- Be careful with "obvious" rounding. Color values, TD values, layer heights, and 3MF vertex
  coordinates each have different tolerance constraints.
- When adding UI controls, wire them through print instructions, persistence, export metadata, and
  preview rebuild triggers if they affect the physical model.
- Prefer existing Shadcn/Radix and hook patterns. New abstractions should reduce real duplication
  or isolate a domain rule, not just move code around.
