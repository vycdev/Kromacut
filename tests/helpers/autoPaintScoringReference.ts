import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { Plugin } from 'vite';
import { withViteTestServer } from './viteModule.ts';

const SCORING_FUNCTIONS = [
    'deltaE2000Lab',
    'selectHybridPrintableCandidateIndex',
    'mapTargetsToPrintablePalette',
    'evaluateSequenceAgainstImage',
];
const REFERENCE_SHA256 = '78b63970a275a01f13d17a3835e66f8d3c0482bbb592ea7767d7ab262d1c5f19';

/** Run the frozen pre-optimization scorer in its own module graph on this JS runtime. */
export async function loadAutoPaintScoringReference(): Promise<
    typeof import('../../src/lib/autoPaint.ts')
> {
    const reference = readFileSync(
        new URL('../assets/auto-paint-scoring-reference.ts.txt', import.meta.url),
        'utf8'
    ).replace(/\r\n/g, '\n');
    assert.equal(
        createHash('sha256').update(reference).digest('hex'),
        REFERENCE_SHA256,
        'The frozen pre-optimization scoring reference changed'
    );
    const referenceAst = ts.createSourceFile(
        'reference.ts',
        reference,
        ts.ScriptTarget.Latest,
        true
    );
    const functions = new Map(
        referenceAst.statements
            .filter(ts.isFunctionDeclaration)
            .map((declaration) => [
                declaration.name!.text,
                reference.slice(declaration.getStart(referenceAst), declaration.end),
            ])
    );
    assert.deepEqual([...functions.keys()], SCORING_FUNCTIONS);
    let transformed = false;
    const plugin: Plugin = {
        name: 'frozen-auto-paint-scoring-reference',
        enforce: 'pre',
        transform(code, id) {
            if (!id.split('?')[0].replace(/\\/g, '/').endsWith('/src/lib/autoPaint.ts')) return;
            const ast = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true);
            const declarations = ast.statements
                .filter(ts.isFunctionDeclaration)
                .filter((declaration) => functions.has(declaration.name?.text ?? ''));
            assert.equal(declarations.length, SCORING_FUNCTIONS.length);
            for (const declaration of declarations.reverse()) {
                code =
                    code.slice(0, declaration.getStart(ast)) +
                    functions.get(declaration.name!.text)! +
                    code.slice(declaration.end);
            }
            transformed = true;
            return { code, map: null };
        },
    };
    return withViteTestServer(
        async (server) => {
            const module = (await server.ssrLoadModule(
                '/src/lib/autoPaint.ts'
            )) as typeof import('../../src/lib/autoPaint.ts');
            assert.ok(transformed, 'Reference module must use the frozen scoring functions');
            return module;
        },
        [plugin]
    );
}
