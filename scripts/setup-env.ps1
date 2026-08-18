$repositoryRoot = Split-Path -Parent $PSScriptRoot
$examplePath = Join-Path $repositoryRoot '.env.example'
$environmentPath = Join-Path $repositoryRoot '.env'

if (-not (Test-Path -LiteralPath $examplePath -PathType Leaf)) {
    Write-Error '.env.example does not exist at the repository root.'
    exit 1
}

if (Test-Path -LiteralPath $environmentPath -PathType Leaf) {
    Write-Host '.env already exists. No files were changed.'
    exit 0
}

Copy-Item -LiteralPath $examplePath -Destination $environmentPath
Write-Host '.env does not exist.'
Write-Host 'Created .env from .env.example.'
Write-Host 'Update local placeholder values before starting the stack.'
