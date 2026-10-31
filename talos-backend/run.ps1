param(
    [int]$Port = 18800,
    [string]$StateDir = "$env:USERPROFILE\.amigo"
)

$env:TALOS_STATE_DIR = $StateDir
if (-not $env:TALOS_GATEWAY_TOKEN) {
    $env:TALOS_GATEWAY_TOKEN = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
}

python -m talos_backend.cli onboard
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
python -m talos_backend.cli gateway run
