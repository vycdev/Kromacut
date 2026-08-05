<#
.SYNOPSIS
Runs npm commands for Kromacut inside an isolated Docker container.

.DESCRIPTION
The container only sees the project directory. It cannot read any other
host files (user profile, SSH keys, browser data, other repos).

- node_modules lives in a named Docker volume (kromacut_node_modules), so
  the container installs its own Linux dependencies and the host
  node_modules is hidden from it and never modified.
- .git is masked with an empty tmpfs, so install scripts cannot plant
  git hooks that would later run on the host.
- All Linux capabilities are dropped, privilege escalation is disabled,
  and memory/process limits are applied.

.EXAMPLE
.\scripts\sandbox.ps1 ci                  # clean install inside the sandbox
.\scripts\sandbox.ps1 test                # npm test
.\scripts\sandbox.ps1 run lint
.\scripts\sandbox.ps1 run dev "--" --host # dev server on http://localhost:5173
.\scripts\sandbox.ps1 -Offline test       # no network at all
.\scripts\sandbox.ps1 -Shell              # interactive shell in the container

.NOTES
Remaining risk: the project directory itself is mounted read-write, so a
malicious package could still modify source files. Review `git status` /
diffs after running installs, before committing or running anything on
the host.
#>
param(
    [switch]$Offline,
    [switch]$Shell,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$NpmArgs
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$image = 'node:25-bookworm-slim'

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Docker engine is not running. Start Docker Desktop first.'
    exit 1
}

$dockerArgs = @(
    'run', '--rm',
    '-v', "${projectRoot}:/work",
    '-v', 'kromacut_node_modules:/work/node_modules',
    '-v', 'kromacut_npm_cache:/root/.npm',
    '--tmpfs', '/work/.git',
    '-w', '/work',
    '--cap-drop=ALL',
    '--security-opt', 'no-new-privileges',
    '--pids-limit', '1024',
    '--memory', '4g',
    '-e', 'npm_config_update_notifier=false',
    '-e', 'npm_config_fund=false'
)

# TTY only when attached to a real console, so the script also works from CI
if ([Console]::IsInputRedirected) { $dockerArgs += '-i' } else { $dockerArgs += '-it' }

if ($Offline) { $dockerArgs += @('--network', 'none') }

# Vite dev/preview server needs its port published (and `-- --host` to bind 0.0.0.0)
if ($NpmArgs -contains 'dev') { $dockerArgs += @('-p', '5173:5173') }
if ($NpmArgs -contains 'preview') { $dockerArgs += @('-p', '4173:4173') }

$dockerArgs += $image

if ($Shell) {
    $dockerArgs += 'bash'
} else {
    $dockerArgs += @('npm') + $NpmArgs
}

& docker @dockerArgs
exit $LASTEXITCODE
