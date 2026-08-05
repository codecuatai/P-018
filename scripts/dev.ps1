param([Parameter(ValueFromRemainingArguments = $true)][string[]]$ComposeArgs)
docker compose up --build @ComposeArgs
