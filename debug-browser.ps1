[CmdletBinding()]
param(
    [int]$AppPort = 8501,
    [string]$BrowserPath = ""
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Url = "http://localhost:$AppPort"
$Package = Join-Path $Root "packages\chesspuzzle-components\browser-components"
$Npm = Get-Command npm.cmd -ErrorAction SilentlyContinue

if (-not $Npm) {
    $NodeNpm = Join-Path $env:ProgramFiles "nodejs\npm.cmd"
    if (Test-Path $NodeNpm) { $Npm = Get-Item $NodeNpm }
    else { throw "npm was not found on PATH or in $NodeNpm." }
}

if (-not $BrowserPath) {
    $BrowserPath = @(
        (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
        (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe")
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $BrowserPath) {
    throw "Microsoft Edge was not found. Pass -BrowserPath to msedge.exe."
}

Push-Location $Package
try {
    & $Npm.Source run debug:browser -- $Url $BrowserPath
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}