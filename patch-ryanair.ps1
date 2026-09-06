# Adds the Ryanair feed to the airport files already on disk, without a
# full rebuild. The daily build does the same thing itself; this is for
# the first run and for topping up between builds.
#   .\patch-ryanair.ps1                 all twelve airports
#   .\patch-ryanair.ps1 -OnlyOrigins MAN,STN
param([string[]] $OnlyOrigins)
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $RepoDir "ryanair.ps1")
$codes = if ($OnlyOrigins) { $OnlyOrigins } else { @("MAN","BHX","LBA","STN","LTN","BRS","NCL","GLA","EDI","LGW","LPL","BFS") }
foreach ($o in $codes) {
  $path = Join-Path $RepoDir "fares-$o.json"
  if (-not (Test-Path $path)) { Write-Host "${o}: no airport file, skipped"; continue }
  $j = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json
  $list = @(Merge-Ryanair -Origin $o -List @($j.fares))
  $j.fares = $list
  $j.count = $list.Count
  $json = $j | ConvertTo-Json -Depth 8 -Compress
  [System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ("{0}: {1} routes, {2} KB" -f $o, $list.Count, [math]::Round((Get-Item $path).Length / 1KB))
}
