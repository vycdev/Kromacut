# Auto-paint benchmark

Run `npm run benchmark:autopaint > benchmark.json` to create a local JSON report. It is deliberately outside normal tests: it measures quality and cost across the saved profiles and image fixtures.

The main number is `realizedError.weightedMean`. It replays the preview's Lab-space color-to-height projection and compares the virtual color at that printable height with the target color. Lower is better.

For Phase 3 and later, accept a change only when average realized error improves, no fixture regresses by more than 5%, and the 8-filament case stays within a 2-second budget on the comparison machine. Record the machine and the command when comparing reports.
