param(
    [Parameter(Mandatory = $true)][string]$Email,
    [Parameter(Mandatory = $true)][string]$Password,
    [string]$Name = "X-One Local User",
    [string]$Role = "admin",
    [string]$EnvFile = ".env",
    [switch]$LocalProcess
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$envPath = (Resolve-Path (Join-Path $repoRoot $EnvFile)).Path

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker is required." }
if ($Password.Length -lt 8 -or $Password.Length -gt 128) { throw "Password must contain 8-128 characters." }
if ($Email -notmatch '^\S+@\S+\.\S+$') { throw "Email is not valid." }

Push-Location $repoRoot
try {
    if ($LocalProcess) {
        $scriptPath = Join-Path $repoRoot "scripts\local\local-process.ps1"
        $argumentJson = ConvertTo-Json -InputObject @("dist/scripts/create-local-admin.js") -Compress
        $argumentBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($argumentJson))
        $previousEmail = $env:LOCAL_ADMIN_EMAIL
        $previousPassword = $env:LOCAL_ADMIN_PASSWORD
        $previousName = $env:LOCAL_ADMIN_NAME
        $previousRole = $env:LOCAL_USER_ROLE
        try {
            $env:LOCAL_ADMIN_EMAIL = $Email
            $env:LOCAL_ADMIN_PASSWORD = $Password
            $env:LOCAL_ADMIN_NAME = $Name
            $env:LOCAL_USER_ROLE = $Role
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath -EnvFile $envPath -WorkingDirectory (Join-Path $repoRoot "apps\api-gateway") -FilePath "node" -ServiceKind gateway -LocalHostMode -DatabaseKey CORE_DATABASE_URL -CommandArgumentsBase64 $argumentBase64
        } finally {
            if ($null -eq $previousEmail) { Remove-Item Env:LOCAL_ADMIN_EMAIL -ErrorAction SilentlyContinue } else { $env:LOCAL_ADMIN_EMAIL = $previousEmail }
            if ($null -eq $previousPassword) { Remove-Item Env:LOCAL_ADMIN_PASSWORD -ErrorAction SilentlyContinue } else { $env:LOCAL_ADMIN_PASSWORD = $previousPassword }
            if ($null -eq $previousName) { Remove-Item Env:LOCAL_ADMIN_NAME -ErrorAction SilentlyContinue } else { $env:LOCAL_ADMIN_NAME = $previousName }
            if ($null -eq $previousRole) { Remove-Item Env:LOCAL_USER_ROLE -ErrorAction SilentlyContinue } else { $env:LOCAL_USER_ROLE = $previousRole }
        }
    } else {
        & docker compose --env-file $envPath exec -T -e "LOCAL_ADMIN_EMAIL=$Email" -e "LOCAL_ADMIN_PASSWORD=$Password" -e "LOCAL_ADMIN_NAME=$Name" -e "LOCAL_USER_ROLE=$Role" api-gateway node dist/scripts/create-local-admin.js
    }
    if ($LASTEXITCODE -ne 0) { throw "Local admin provisioning failed." }
} finally {
    Pop-Location
}
