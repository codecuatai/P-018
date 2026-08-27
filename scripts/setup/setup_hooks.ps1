# Install git pre-push hook for AI log submission (Windows PowerShell).
# Run once after cloning: powershell -ExecutionPolicy Bypass -File scripts\setup\setup_hooks.ps1

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$gitHooksDirectory = Join-Path $repositoryRoot '.git\hooks'
$hookFile = Join-Path $gitHooksDirectory 'pre-push'

if (-not (Test-Path -LiteralPath $gitHooksDirectory -PathType Container)) {
    throw "Git hooks directory was not found: $gitHooksDirectory"
}

# Git on Windows runs hooks via Git Bash, so the hook body must be bash.
$HookBody = @'
#!/usr/bin/env bash
# Pre-push: sweep recent Antigravity / Gemini prompts, then submit AI logs.
# Git normally starts hooks at the worktree root, but resolve it explicitly so
# the script paths remain valid when the hook is invoked from another cwd.
repository_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$repository_root" || exit 0
bash scripts/ai-logging/_pyrun.sh scripts/ai-logging/log_antigravity.py --auto || true
bash scripts/ai-logging/_pyrun.sh scripts/ai-logging/submit_log.py || true
exit 0
'@

Set-Content -LiteralPath $hookFile -Value $HookBody -Encoding UTF8 -NoNewline
Write-Host "[ai-log] Git pre-push hook installed."

$aiLogDirectory = Join-Path $repositoryRoot '.ai-log'
$aiLogKeepFile = Join-Path $aiLogDirectory '.gitkeep'
if (-not (Test-Path -LiteralPath $aiLogDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $aiLogDirectory | Out-Null
}
if (-not (Test-Path -LiteralPath $aiLogKeepFile -PathType Leaf)) {
    New-Item -ItemType File -Path $aiLogKeepFile | Out-Null
}

Write-Host "[ai-log] Setup complete. Configure AI_LOG_SERVER in your .env file."
