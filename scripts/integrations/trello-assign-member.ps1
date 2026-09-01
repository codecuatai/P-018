[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$CardId,

    [Parameter(Mandatory = $true)]
    [ValidateSet("55trnvantai", "letinminh", "nghianguyn13")]
    [string]$Username,

    [string]$EnvFile = ""
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

    $processValue = [Environment]::GetEnvironmentVariable($Name, "Process")
    if (-not [string]::IsNullOrWhiteSpace($processValue)) {
        return $processValue
    }

    if (-not (Test-Path -LiteralPath $DotEnvPath -PathType Leaf)) {
        throw "Credential source is unavailable."
    }

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

        $keyName = $line.Substring(0, $separator).Trim()
        if ($keyName -cne $Name) {
            continue
        }

        $value = $line.Substring($separator + 1).Trim()
        if ($value.Length -ge 2 -and
            (($value.StartsWith('"') -and $value.EndsWith('"')) -or
             ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value
        }
    }

    throw "Required Trello credential is not configured."
}

function Invoke-TrelloJson {
    param(
        [Parameter(Mandatory = $true)]
        [System.Net.Http.HttpClient]$Client,

        [Parameter(Mandatory = $true)]
        [ValidateSet("GET", "POST")]
        [string]$Method,

        [Parameter(Mandatory = $true)]
        [string]$Path,

        [System.Net.Http.HttpContent]$Content = $null,

        [Parameter(Mandatory = $true)]
        [string]$Operation
    )

    $uri = "https://api.trello.com/1/$Path"
    try {
        if ($Method -eq "GET") {
            $response = $Client.GetAsync($uri).GetAwaiter().GetResult()
        }
        else {
            $response = $Client.PostAsync($uri, $Content).GetAwaiter().GetResult()
        }
    }
    catch {
        throw "Trello $Operation request failed."
    }

    try {
        $responseText = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
            throw "Trello $Operation failed. HTTP $([int]$response.StatusCode)."
        }

        if ([string]::IsNullOrWhiteSpace($responseText)) {
            return $null
        }

        return ($responseText | ConvertFrom-Json)
    }
    finally {
        $response.Dispose()
    }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path $repoRoot ".env"
}
elseif (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
    $EnvFile = Join-Path $repoRoot $EnvFile
}

$key = $null
$token = $null
$client = $null
$memberForm = $null

try {
    $key = Get-SecretValue -Name "TRELLO_API_KEY" -DotEnvPath $EnvFile
    $token = Get-SecretValue -Name "TRELLO_API_TOKEN" -DotEnvPath $EnvFile

    $client = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromSeconds(60)
    $client.DefaultRequestHeaders.Authorization =
        [System.Net.Http.Headers.AuthenticationHeaderValue]::new(
            "OAuth",
            "oauth_consumer_key=`"$key`", oauth_token=`"$token`""
        )
    $client.DefaultRequestHeaders.Accept.Add(
        [System.Net.Http.Headers.MediaTypeWithQualityHeaderValue]::new("application/json")
    )

    $escapedCard = [System.Uri]::EscapeDataString($CardId)
    $card = Invoke-TrelloJson -Client $client -Method "GET" `
        -Path "cards/$escapedCard`?fields=id,idBoard,shortLink,name,idMembers" `
        -Operation "card lookup"

    if ($null -eq $card -or [string]::IsNullOrWhiteSpace([string]$card.idBoard)) {
        throw "Card lookup did not return a board."
    }

    $escapedBoard = [System.Uri]::EscapeDataString([string]$card.idBoard)
    $boardMembers = @(Invoke-TrelloJson -Client $client -Method "GET" `
        -Path "boards/$escapedBoard/members`?fields=id,username,fullName" `
        -Operation "board member lookup")

    $member = $boardMembers | Where-Object { [string]$_.username -ceq $Username } | Select-Object -First 1
    if ($null -eq $member) {
        throw "Requested username is not a member of the card board."
    }

    $alreadyAssigned = @($card.idMembers) -contains [string]$member.id
    if (-not $alreadyAssigned) {
        $memberPairs = [System.Collections.Generic.List[
            System.Collections.Generic.KeyValuePair[string, string]
        ]]::new()
        $memberPairs.Add(
            [System.Collections.Generic.KeyValuePair[string, string]]::new(
                "value",
                [string]$member.id
            )
        )
        $memberForm = [System.Net.Http.FormUrlEncodedContent]::new($memberPairs)

        $null = Invoke-TrelloJson -Client $client -Method "POST" `
            -Path "cards/$escapedCard/idMembers" `
            -Content $memberForm `
            -Operation "member assignment"
    }

    $verifiedCard = Invoke-TrelloJson -Client $client -Method "GET" `
        -Path "cards/$escapedCard`?fields=id,idBoard,shortLink,idMembers" `
        -Operation "assignment verification"

    if (-not (@($verifiedCard.idMembers) -contains [string]$member.id)) {
        throw "Member assignment could not be verified."
    }

    [PSCustomObject]@{
        success         = $true
        alreadyAssigned = [bool]$alreadyAssigned
        cardId          = [string]$verifiedCard.shortLink
        username        = $Username
        verified        = $true
    } | ConvertTo-Json -Compress
}
catch {
    [PSCustomObject]@{
        success         = $false
        alreadyAssigned = $false
        cardId          = $CardId
        username        = $Username
        verified        = $false
        error           = [string]$_.Exception.Message
    } | ConvertTo-Json -Compress
    exit 1
}
finally {
    if ($memberForm) { $memberForm.Dispose() }
    if ($client) { $client.Dispose() }

    $key = $null
    $token = $null
}
