import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

interface Workflow {
    name: string;
    on: Record<string, { workflows?: string[]; types?: string[]; tags?: string[] }>;
    jobs: Record<
        string,
        {
            if?: string;
            steps: { name?: string; uses?: string; with?: { script?: string; ref?: string } }[];
        }
    >;
}

const { load } = createRequire(import.meta.url)('js-yaml') as { load: (yaml: string) => Workflow };
const pages = load(
    readFileSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8')
);
const release = load(
    readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
);
const gate = pages.jobs.release_ready.steps.find((step) => step.with?.script)?.with?.script;
const recheck = pages.jobs.deploy.steps.find((step) => step.with?.script)?.with?.script;
assert.ok(gate && recheck);

async function run(
    script: string,
    options: {
        tag?: string;
        draft?: boolean;
        prerelease?: boolean;
        status?: number;
        workflowSha?: string;
    } = {}
) {
    const outputs: Record<string, string> = {};
    const notices: string[] = [];
    const github = {
        rest: {
            repos: {
                getLatestRelease: async () => {
                    if (options.status)
                        throw Object.assign(new Error('API error'), { status: options.status });
                    return {
                        data: {
                            tag_name: options.tag ?? 'v4.1.0',
                            draft: options.draft ?? false,
                            prerelease: options.prerelease ?? false,
                        },
                    };
                },
            },
        },
    };
    const context = {
        repo: { owner: 'vycdev', repo: 'Kromacut' },
        sha: 'main-commit',
        payload: {
            workflow_run: options.workflowSha ? { head_sha: options.workflowSha } : undefined,
        },
    };
    const core = {
        setOutput: (name: string, value: string) => {
            outputs[name] = value;
        },
        notice: (message: string) => notices.push(message),
    };
    const require = () => ({ readFileSync: () => JSON.stringify({ version: '4.1.0' }) });
    // Execute the workflow's actual script with only mocked network/file access.
    await new Function(
        'github',
        'context',
        'core',
        'require',
        'process',
        `return (async () => {${script}})();`
    )(github, context, core, require, { env: { EXPECTED_RELEASE_VERSION: '4.1.0' } });
    return { outputs, notices };
}

test('Pages follows native release completion, not tag creation, and excludes failed/fork runs', () => {
    assert.deepEqual(pages.on.workflow_run.workflows, [release.name]);
    assert.deepEqual(pages.on.workflow_run.types, ['completed']);
    assert.equal(pages.on.push.tags, undefined);
    assert.ok(pages.jobs.release_ready.if?.includes("conclusion == 'success'"));
    assert.ok(
        pages.jobs.release_ready.if?.includes('head_repository.full_name == github.repository')
    );
    assert.equal(pages.jobs.build_and_deploy.if, "needs.release_ready.outputs.ready == 'true'");
    assert.equal(
        pages.jobs.build_and_deploy.steps[0].with?.ref,
        '${{ needs.release_ready.outputs.source_ref }}'
    );
});

test('Pages deploys the release workflow commit only after its stable release is latest', async () => {
    assert.deepEqual((await run(gate, { workflowSha: 'release-commit' })).outputs, {
        version: '4.1.0',
        source_ref: 'release-commit',
        ready: 'true',
    });
    assert.equal((await run(gate)).outputs.source_ref, 'main-commit');
});

test('Pages skips unpublished, superseded, draft and prerelease versions', async () => {
    for (const options of [
        { status: 404 },
        { tag: 'v4.0.0' },
        { tag: 'v4.2.0' },
        { draft: true },
        { prerelease: true },
    ]) {
        const result = await run(gate, options);
        assert.equal(result.outputs.ready, 'false');
        assert.equal(result.notices.length, 1);
    }
});

test('Pages fails closed on API errors and if the release changes during the web build', async () => {
    await assert.rejects(run(gate, { status: 403 }), /API error/);
    await assert.rejects(run(gate, { status: 500 }), /API error/);
    await run(recheck);
    await assert.rejects(run(recheck, { tag: 'v4.2.0' }), /refusing to deploy a stale update feed/);
    await assert.rejects(run(recheck, { draft: true }), /refusing to deploy/);
});
