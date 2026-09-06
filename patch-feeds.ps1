# Adds the airline feeds to the airport files already on disk, without a
# full rebuild. The daily build does the same thing itself; this is for
# first runs and topping up between builds.
#   .\patch-feeds.ps1                                  all feeds, all airports
#   .\patch-feeds.ps1 -Feeds wizz,norwegian -OnlyOrigins LTN,LGW
param(
  [string[]] $Feeds = @("ryanair", "wizz", "norwegian"),
  [string[]] $OnlyOrigins
)
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $RepoDir "feeds-common.ps1")
. (Join-Path $RepoDir "ryanair.ps1")
. (Join-Path $RepoDir "ryanair-calendar.ps1")
. (Join-Path $RepoDir "wizzair.ps1")
. (Join-Path $RepoDir "norwegian.ps1")
$Feeds = @($Feeds | ForEach-Object { $_ -split "," } | Where-Object { $_ })
$codes = if ($OnlyOrigins) { @($OnlyOrigins | ForEach-Object { $_ -split "," } | Where-Object { $_ }) } else { @("MAN","BHX","LBA","STN","LTN","BRS","NCL","GLA","EDI","LGW","LPL","BFS") }
foreach ($o in $codes) {
  $path = Join-Path $RepoDir "fares-$o.json"
  if (-not (Test-Path $path)) { Write-Host "${o}: no airport file, skipped"; continue }
  $j = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json
  $list = @($j.fares)
  if ($Feeds -contains "ryanair")   { $list = @(Merge-Ryanair -Origin $o -List $list); $list = @(Merge-RyanairCalendar -Origin $o -List $list) }
  if ($Feeds -contains "wizz")      { $list = @(Merge-Wizz -Origin $o -List $list) }
  if ($Feeds -contains "norwegian") { $list = @(Merge-Norwegian -Origin $o -List $list) }
  $j.fares = $list
  $j.count = $list.Count
  $json = $j | ConvertTo-Json -Depth 8 -Compress
  [System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ("{0}: {1} routes, {2} KB" -f $o, $list.Count, [math]::Round((Get-Item $path).Length / 1KB))
}
