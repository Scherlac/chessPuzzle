[CmdletBinding()]
param(
    [string]$Output = (Join-Path $PSScriptRoot "..\data\lichess_db_puzzle.csv.zst"),
    [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"
$Uri = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
$Output = [IO.Path]::GetFullPath($Output)

if ($VerifyOnly) {
    if (-not (Test-Path $Output)) {
        throw "Puzzle database was not found at $Output."
    }
    Write-Host (Get-FileHash -Algorithm SHA256 $Output | Select-Object -ExpandProperty Hash)
    exit 0
}

$parent = Split-Path $Output -Parent
New-Item -ItemType Directory -Force $parent | Out-Null
Write-Host "Downloading the Lichess puzzle database..."
Invoke-WebRequest -Uri $Uri -OutFile $Output
Write-Host "Saved to $Output"
Write-Host (Get-FileHash -Algorithm SHA256 $Output | Select-Object -ExpandProperty Hash)