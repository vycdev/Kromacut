import assert from 'node:assert/strict';
import test from 'node:test';

// Guard against the import-extension regression introduced during the develop
// rebase: relative *value* imports in lib modules that are loaded node-directly
// (via --experimental-strip-types) must carry the `.ts` extension — the runner
// does NOT auto-resolve extensionless relative paths.
//
// When that broke (e.g. autoPaint -> './layerActivation', optimizer ->
// './autoPaint'), it surfaced only as a confusing "a resource generated
// asynchronous activity after the test ended" message plus a silently lower
// test count (177 -> 85). These cases turn that into an explicit, named failure.
const modules = [
    '../src/lib/autoPaint.ts',
    '../src/lib/optimizer.ts',
    '../src/lib/layerActivation.ts',
    '../src/lib/flatPaint.ts',
    '../src/lib/meshing.ts',
    '../src/lib/multiHeadAnalysis.ts',
    '../src/lib/multiHeadAnalysisColorFirst.ts',
    '../src/lib/multiHeadSchedule.ts',
    '../src/lib/patchedLayersToPlan.ts',
];

for (const spec of modules) {
    test(`lib module resolves all transitive imports: ${spec}`, async () => {
        await assert.doesNotReject(
            () => import(spec),
            `${spec} (or something it imports) failed to resolve — check for an extensionless relative import`
        );
    });
}
