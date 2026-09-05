[CmdletBinding()]
param(
    [int]$Port = 8501,
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Python = Join-Path $Root ".venv\Scripts\python.exe"
$App = Join-Path $Root "src\chesspuzzle\app.py"

if (-not $NoBuild -or -not (Test-Path $Python)) {
    & (Join-Path $Root "build.ps1")
}

if (-not (Test-Path $Python)) {
    throw "The project Python environment was not created. Run .\build.ps1 first."
}
if (-not (Test-Path $App)) {
    throw "The Streamlit app was not found at $App."
}

Write-Host "Starting Streamlit on http://localhost:$Port"
& $Python -m streamlit run $App --server.headless true --server.port $Port
