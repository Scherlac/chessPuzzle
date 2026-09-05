[CmdletBinding()]
param(
    [switch]$Clean
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Package = Join-Path $Root "packages\chesspuzzle-components"
$Frontend = Join-Path $Package "frontend"
$Python = Join-Path $Root ".venv\Scripts\python.exe"
$Npm = Get-Command npm.cmd -ErrorAction SilentlyContinue

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is required but was not found on PATH."
    }
}

Require-Command "uv"
if (-not $Npm) {
    $NodeNpm = Join-Path $env:ProgramFiles "nodejs\npm.cmd"
    if (Test-Path $NodeNpm) {
        $Npm = Get-Item $NodeNpm
    } else {
        throw "npm is required but was not found on PATH or in $NodeNpm."
    }
}

if (-not (Test-Path $Python)) {
    Write-Host "Creating .venv..."
    & uv venv (Join-Path $Root ".venv")
}

if ($Clean) {
    Write-Host "Removing generated package output..."
    Remove-Item (Join-Path $Package "build") -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $Package "dist") -Recurse -Force -ErrorAction SilentlyContinue
}

$Lockfile = Join-Path $Frontend "package-lock.json"
$NodeModules = Join-Path $Frontend "node_modules"
if (-not (Test-Path $NodeModules)) {
    Write-Host "Installing frontend dependencies..."
    Push-Location $Frontend
    try {
        if (Test-Path $Lockfile) {
            & $Npm.Source ci
        } else {
            & $Npm.Source install
        }
    } finally {
        Pop-Location
    }
}

Write-Host "Checking frontend status..."
Push-Location $Frontend
try {
    & $Npm.Source run typecheck
    & $Npm.Source run lint
    & $Npm.Source run package
} finally {
    Pop-Location
}

Write-Host "Installing the local Python package..."
& uv pip install --python $Python -e $Package

Write-Host "Build complete."
Write-Host "  Python: $Python"
Write-Host "  Wheel:  $(Join-Path $Package 'dist')"
