import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Every e2e suite that must pass before changes land, in run order. Area suites need their own
// server (Vite dev, Vite preview, or the Pages-style 404 server) on their own port, so each one is
// a separate Playwright run. The long @full export matrix in kromacut-flow.spec.ts is excluded;
// run it on demand with test:e2e:matrix, test:e2e:stress, or test:e2e:full.
const E2E_SUITES = [
    'test:e2e',
    'test:e2e:docs',
    'test:e2e:landing',
    'test:e2e:privacy',
    'test:e2e:terms',
    'test:e2e:not-found',
    'test:e2e:i18n',
    'test:e2e:i18n:build',
];
const ON_DEMAND_TAG = '@full';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const scripts = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;

function suiteArgs(script) {
    const command = scripts[script];
    const words = command?.trim().split(/\s+/) ?? [];
    if (words[0] !== 'playwright' || words[1] !== 'test' || /[&|;<>"'`$]/.test(command)) {
        throw new Error(`${script} must be a plain "playwright test ..." command`);
    }
    return words.slice(1);
}

// A file-name-safe label, used for report folders and CI artifacts.
function suiteName(script) {
    return script.replace(/^test:e2e:?/, '').replaceAll(':', '-') || 'smoke';
}

function configOf(args) {
    const index = args.indexOf('--config');
    return index === -1 ? 'playwright.config.ts' : args[index + 1];
}

function playwright(args, options = {}) {
    const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
    return spawnSync(process.execPath, [cli, ...args], { cwd: root, ...options });
}

function listTests(args) {
    const result = playwright([...args, '--list', '--reporter=json'], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    const report = result.status === 0 ? JSON.parse(result.stdout) : undefined;
    if (!report || report.errors.length > 0) {
        throw new Error(`Could not list tests for "${args.join(' ')}":\n${result.stderr}`);
    }
    const tests = [];
    const walk = (suite, titles) => {
        for (const spec of suite.specs ?? []) tests.push([...titles, spec.title].join(' › '));
        for (const child of suite.suites ?? []) walk(child, [...titles, child.title]);
    };
    for (const file of report.suites) walk(file, [file.file]);
    return tests;
}

// Fails when a Playwright config or test would be skipped by test:e2e:all.
function checkE2eCoverage() {
    const errors = [];
    const configs = new Set(E2E_SUITES.map((script) => configOf(suiteArgs(script))));
    for (const file of readdirSync(root)) {
        if (/^playwright(\..+)?\.config\.ts$/.test(file) && !configs.has(file)) {
            errors.push(`${file} is not run by any suite in scripts/run-e2e-suites.mjs`);
        }
    }
    const covered = new Set(E2E_SUITES.flatMap((script) => listTests(suiteArgs(script))));
    for (const test of new Set(listTests(['test']))) {
        if (!covered.has(test) && !test.includes(ON_DEMAND_TAG)) {
            errors.push(
                `"${test}" is not run by any suite; tag it @smoke or match it in an area config`
            );
        }
    }
    return errors;
}

function runSuites(extraArgs) {
    const failures = [];
    for (const script of E2E_SUITES) {
        const name = suiteName(script);
        console.log(`\n=== ${script} (${scripts[script]})\n`);
        const started = Date.now();
        // Keep each suite's traces and HTML report; later suites would otherwise delete them.
        const result = playwright(
            [...suiteArgs(script), '--output', `test-results/${name}`, ...extraArgs],
            {
                stdio: 'inherit',
                env: {
                    ...process.env,
                    KROMACUT_E2E_FRESH_SERVERS: '1',
                    PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report/${name}`,
                },
            }
        );
        const seconds = Math.round((Date.now() - started) / 1000);
        const passed = result.status === 0;
        console.log(`\n=== ${script} ${passed ? 'passed' : 'FAILED'} in ${seconds}s`);
        if (!passed) failures.push(script);
    }
    return failures;
}

// --list prints the suites as JSON for the CI job matrix, --check only checks coverage, and any
// other arguments are passed to every suite's Playwright run.
const args = process.argv.slice(2);
if (args[0] === '--list') {
    console.log(JSON.stringify(E2E_SUITES.map((script) => ({ script, name: suiteName(script) }))));
} else {
    const coverageErrors = checkE2eCoverage();
    for (const error of coverageErrors) console.error(`e2e coverage: ${error}`);
    if (args[0] === '--check') {
        if (coverageErrors.length === 0) {
            console.log(`test:e2e:all covers every e2e test except ${ON_DEMAND_TAG}.`);
        }
    } else {
        const failures = runSuites(args);
        console.log(
            failures.length === 0
                ? `\nAll ${E2E_SUITES.length} e2e suites passed.`
                : `\nFailed e2e suites: ${failures.join(', ')}`
        );
        if (failures.length > 0) process.exitCode = 1;
    }
    if (coverageErrors.length > 0) process.exitCode = 1;
}
