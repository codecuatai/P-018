[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$CardId,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$FilePath,

    [string]$EnvFile = "",

    [switch]$Force
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Net.Http -ErrorAction Stop

function Get-SecretValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [string]$DotEnvPath
    )

    # Prefer credentials already injected into the current process.
    $processValue = [Environment]::GetEnvironmentVariable($Name, "Process")
    if (-not [string]::IsNullOrWhiteSpace($processValue)) {
        return $processValue
    }

    if (-not (Test-Path -LiteralPath $DotEnvPath -PathType Leaf)) {
        throw "Credential source is unavailable. Expected process environment or .env file."
    }

    # Read the .env internally. Secret values are never written to stdout/stderr.
    foreach ($rawLine in [System.IO.File]::ReadLines((Resolve-Path -LiteralPath $DotEnvPath).Path)) {
        $line = $rawLine.Trim()

        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
            continue
        }

        if ($line.StartsWith("export ")) {
            $line = $line.Substring(7).Trim()
        }

        $separator = $line.IndexOf("=")
        if ($separator -lt 1) {
            continue
        }

        $key = $line.Substring(0, $separator).Trim()
        if ($key -ne $Name) {
            continue
        }

        $value = $line.Substring($separator + 1).Trim()

        if ($value.Length -ge 2) {
            if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
                ($value.StartsWith("'") -and $value.EndsWith("'"))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value
        }
    }

    throw "$Name is not configured in the process environment or .env."
}

function Resolve-LocalFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathValue,

        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    if (Test-Path -LiteralPath $PathValue -PathType Leaf) {
        return (Resolve-Path -LiteralPath $PathValue).Path
    }

    if (-not [System.IO.Path]::IsPathRooted($PathValue)) {
        $repoCandidate = Join-Path $RepoRoot $PathValue
        if (Test-Path -LiteralPath $repoCandidate -PathType Leaf) {
            return (Resolve-Path -LiteralPath $repoCandidate).Path
        }
    }

    throw "Attachment file not found: $PathValue"
}

function Get-MimeType {
    param([string]$PathValue)

    switch ([System.IO.Path]::GetExtension($PathValue).ToLowerInvariant()) {
        ".png"  { return "image/png" }
        ".jpg"  { return "image/jpeg" }
        ".jpeg" { return "image/jpeg" }
        ".webp" { return "image/webp" }
        ".gif"  { return "image/gif" }
        ".mp4"  { return "video/mp4" }
        ".webm" { return "video/webm" }
        ".txt"  { return "text/plain" }
        ".log"  { return "text/plain" }
        ".json" { return "application/json" }
        ".pdf"  { return "application/pdf" }
        default { return "application/octet-stream" }
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path $repoRoot ".env"
}
elseif (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
    $EnvFile = Join-Path $repoRoot $EnvFile
}

$resolvedFile = Resolve-LocalFile -PathValue $FilePath -RepoRoot $repoRoot
$fileName = [System.IO.Path]::GetFileName($resolvedFile)

$key = $null
$token = $null
$client = $null
$content = $null
$stream = $null
$fileContent = $null

try {
    $key = Get-SecretValue -Name "TRELLO_API_KEY" -DotEnvPath $EnvFile
    $token = Get-SecretValue -Name "TRELLO_API_TOKEN" -DotEnvPath $EnvFile

    $escapedCard = [System.Uri]::EscapeDataString($CardId)
    $escapedKey = [System.Uri]::EscapeDataString($key)
    $escapedToken = [System.Uri]::EscapeDataString($token)

    $client = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromSeconds(60)

    # Avoid duplicate evidence on audit reruns unless -Force is explicitly supplied.
    if (-not $Force) {
        $listUri = "https://api.trello.com/1/cards/$escapedCard/attachments?fields=id,name,url,date&key=$escapedKey&token=$escapedToken"

        try {
            $listResponse = $client.GetAsync($listUri).GetAwaiter().GetResult()
        }
        catch {
            throw "Unable to check existing Trello attachments."
        }

        if (-not $listResponse.IsSuccessStatusCode) {
            throw "Unable to check existing Trello attachments. HTTP $([int]$listResponse.StatusCode)."
        }

        $existingText = $listResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $existingAttachments = @($existingText | ConvertFrom-Json)
        $existing = $existingAttachments | Where-Object { $_.name -eq $fileName } | Select-Object -First 1

        if ($null -ne $existing) {
            [PSCustomObject]@{
                success      = $true
                skipped      = $true
                reason       = "attachment_with_same_name_exists"
                cardId       = $CardId
                attachmentId = $existing.id
                name         = $existing.name
                url          = $existing.url
            } | ConvertTo-Json -Compress
            exit 0
        }
    }

    $uploadUri = "https://api.trello.com/1/cards/$escapedCard/attachments?key=$escapedKey&token=$escapedToken"

    $content = [System.Net.Http.MultipartFormDataContent]::new()

    $stream = [System.IO.File]::OpenRead($resolvedFile)
    $fileContent = [System.Net.Http.StreamContent]::new($stream)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new(
        (Get-MimeType -PathValue $resolvedFile)
    )

    $content.Add($fileContent, "file", $fileName)
    $content.Add([System.Net.Http.StringContent]::new($fileName), "name")

    try {
        $response = $client.PostAsync($uploadUri, $content).GetAwaiter().GetResult()
    }
    catch {
        throw "Trello attachment upload request failed."
    }

    $responseText = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()

    if (-not $response.IsSuccessStatusCode) {
        $safeMessage = ""
        try {
            $errorObject = $responseText | ConvertFrom-Json
            if ($errorObject.message) {
                $safeMessage = " Trello: $($errorObject.message)"
            }
        }
        catch {
            # Intentionally do not echo an arbitrary response body.
        }

        throw "Trello attachment upload failed. HTTP $([int]$response.StatusCode).$safeMessage"
    }

    $result = $responseText | ConvertFrom-Json

    [PSCustomObject]@{
        success      = $true
        skipped      = $false
        cardId       = $CardId
        attachmentId = $result.id
        name         = $result.name
        mimeType     = $result.mimeType
        bytes        = $result.bytes
        url          = $result.url
    } | ConvertTo-Json -Compress
}
finally {
    if ($fileContent) { $fileContent.Dispose() }
    if ($stream) { $stream.Dispose() }
    if ($content) { $content.Dispose() }
    if ($client) { $client.Dispose() }

    # Do not retain credential references longer than necessary.
    $key = $null
    $token = $null
    $escapedKey = $null
    $escapedToken = $null
    $uploadUri = $null
    $listUri = $null
}
