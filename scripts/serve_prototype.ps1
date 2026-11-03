param(
    [int]$Port = 4173
)

$repoRoot = Split-Path -Parent $PSScriptRoot
Write-Host "Serving Dragonheir prototype at http://127.0.0.1:$Port/prototype/"
python -m http.server $Port --bind 127.0.0.1 --directory $repoRoot
