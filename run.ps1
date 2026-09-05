[CmdletBinding()]
param(
    [int]$Port = 8501,
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Python = Join-Path $Root ".venv\Scripts\python.exe"
$App = Join-Path $Root "src\chesspuzzle\app.py"
$Frontend = Join-Path $Root "packages\chesspuzzle-components\browser-components"
$FrontendOutput = Join-Path $Root "packages\chesspuzzle-components\src\chess_components\assets\browser-components.js"

function Test-BuildNeeded {
    if (-not (Test-Path $Python) -or -not (Test-Path $FrontendOutput)) {
        return $true
    }

    $outputTime = (Get-Item $FrontendOutput).LastWriteTimeUtc
    $inputs = @(
        (Join-Path $Frontend "src"),
        (Join-Path $Frontend "package.json"),
        (Join-Path $Frontend "package-lock.json"),
        (Join-Path $Frontend "build.mjs"),
        (Join-Path $Root "packages\chesspuzzle-components\src\chess_components\assets\checker.js"),
        (Join-Path $Root "packages\chesspuzzle-components\src\chess_components\assets\loader.js")
    )

    $newestInput = Get-ChildItem $inputs -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    return $null -eq $newestInput -or $newestInput.LastWriteTimeUtc -gt $outputTime
}

if (-not (Test-Path $Python) -or (-not $NoBuild -and (Test-BuildNeeded))) {
    Write-Host "Build output is missing or stale; running build..."
    & (Join-Path $Root "build.ps1")
} elseif (-not $NoBuild) {
    Write-Host "Build output is up to date; skipping build."
}

if (-not (Test-Path $Python)) {
    throw "The project Python environment was not created. Run .\build.ps1 first."
}
if (-not (Test-Path $App)) {
    throw "The Streamlit app was not found at $App."
}

Write-Host "Starting Streamlit on http://localhost:$Port"
& $Python -m streamlit run $App --server.headless true --server.port $Port
