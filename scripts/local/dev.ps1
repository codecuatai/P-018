param([Parameter(ValueFromRemainingArguments = $true)][string[]]$ComposeArgs)
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repoRoot
try { docker compose up --build @ComposeArgs } finally { Pop-Location }
