$ErrorActionPreference = "Stop"

$packageSource = if ($env:AMIGO_PACKAGE_SOURCE) { $env:AMIGO_PACKAGE_SOURCE } else { "talos-backend" }
$pythonVersion = if ($env:AMIGO_PYTHON_VERSION) { $env:AMIGO_PYTHON_VERSION } else { "3.13" }

if ($pythonVersion -notmatch '^3\.(1[2-9]|[2-9][0-9])$') {
    throw "AMIGO_PYTHON_VERSION must be Python 3.12 or newer."
}

if ($packageSource -match '^https://|^git\+https://') {
    $urlText = $packageSource -replace '^git\+', ''
    $sourceUrl = [Uri]::new($urlText)
    if ($sourceUrl.UserInfo -or $sourceUrl.Query -or $sourceUrl.Fragment) {
        throw "Package source URLs may not contain credentials, query strings, or fragments."
    }
}
elseif ($packageSource -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$' -and -not (Test-Path -LiteralPath $packageSource)) {
    throw "Package source must be a package name, HTTPS URL, or existing local path."
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    $installerPath = Join-Path ([IO.Path]::GetTempPath()) ("amigo-uv-" + [Guid]::NewGuid().ToString("N") + ".ps1")
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri "https://astral.sh/uv/install.ps1" -OutFile $installerPath
        & $installerPath
    }
    finally {
        if (Test-Path -LiteralPath $installerPath) {
            Remove-Item -LiteralPath $installerPath -Force
        }
    }

    $env:PATH = "$env:USERPROFILE\.local\bin;$env:USERPROFILE\.cargo\bin;$env:PATH"
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv installation completed but uv is not on PATH."
}

& uv tool install --python $pythonVersion --upgrade -- $packageSource
if ($LASTEXITCODE -ne 0) {
    throw "Amigo package installation failed with code $LASTEXITCODE."
}

$toolBin = (& uv tool dir --bin).Trim()
if ($LASTEXITCODE -ne 0 -or -not $toolBin) {
    throw "Could not locate uv's tool executable directory."
}
$env:PATH = "$toolBin;$env:PATH"

if ($env:AMIGO_UPDATE_PATH -ne "0") {
    & uv tool update-shell
    if ($LASTEXITCODE -ne 0) {
        throw "Could not add the Amigo command directory to PATH."
    }
}

Write-Host "Amigo CLI installed. Open a new terminal if needed, then run: amigo onboard"
Write-Host "To install from a non-default source, set AMIGO_PACKAGE_SOURCE to its HTTPS URL or local path."
