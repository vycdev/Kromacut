import { spawn } from 'node:child_process';

/** Let pending Vite imports progress while a benchmark CLI runs in its own process. */
export function runBenchmarkCli(args: string[]) {
    return new Promise<{ status: number | null; stdout: string; stderr: string }>(
        (resolve, reject) => {
            const child = spawn(
                process.execPath,
                [
                    '--no-warnings',
                    '--experimental-strip-types',
                    'tests/benchmark/multiHeadAppearance.ts',
                    ...args,
                ],
                { timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }
            );
            let stdout = '';
            let stderr = '';
            child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
                stdout += chunk;
            });
            child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
                stderr += chunk;
            });
            child.on('error', reject);
            child.on('close', (status) => resolve({ status, stdout, stderr }));
        }
    );
}
