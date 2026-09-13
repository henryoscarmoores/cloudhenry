<#
  Keeps only fares an airline is actually selling.

  Henry, 13 Sep 2026: "we need guaranteed flights only". A follower found
  routes in the search that stopped flying months ago, and Dublin to
  Nottingham showed at 14 pounds direct although Nottingham has no
  passenger flights. Those came from the Travelpayouts price cache: prices
  other people once saw on booking sites, with no airline behind them.

  Every option that came from an airline's own feed carries an airline
  code in "a" (FR Ryanair, W6 Wizz Air, DY Norwegian). This keeps those
  and drops everything else, removes routes left with nothing, rebuilds
  each route's headline fare from what is left, and corrects the counts.

  Runs in the daily workflow straight after build-fares.ps1, before the
  files are named, labelled and committed. Safe to run twice.
#>
param([string] $RepoDir = (Split-Path -Parent $MyInvocation.MyCommand.Path))
$ErrorActionPreference = "Stop"

$AIRLINE = @{ FR = "Ryanair"; W6 = "Wizz Air"; DY = "Norwegian" }

function Read-Json([string] $Path) { [System.IO.File]::ReadAllText($Path) | ConvertFrom-Json }
function Write-Json([string] $Path, $Obj) {
  [System.IO.File]::WriteAllText($Path, ($Obj | ConvertTo-Json -Depth 8 -Compress), (New-Object System.Text.UTF8Encoding($false)))
}
function Is-Confirmed($o) { return ($null -ne $o -and $o.PSObject.Properties['a'] -and [string]$o.a) }

# Returns the route rebuilt from its airline fares, or $null if it has none.
# Callers wrap array results in @(): a function returning a one-item array
# hands back the bare item otherwise.
function Tidy-Route($t) {
  $keep = @(@($t.options) | Where-Object { Is-Confirmed $_ })
  if ($keep.Count -eq 0) { return $null }
  $best = $keep | Sort-Object { [int]$_.p } | Select-Object -First 1
  $t.options = $keep
  if ($t.PSObject.Properties['inbound'] -and $t.inbound) { $t.inbound = @(@($t.inbound) | Where-Object { Is-Confirmed $_ }) }
  $t.price = [int]$best.p
  $t.departure = [string]$best.d
  $t.ret = if ($best.PSObject.Properties['r'] -and $best.r) { [string]$best.r } else { "" }
  $t.transfers = if ($best.PSObject.Properties['s'] -and $best.s) { [int]$best.s } else { 0 }
  $code = [string]$best.a
  $t.airline = if ($AIRLINE.ContainsKey($code)) { $AIRLINE[$code] } else { $code }
  $t.flight = ""
  return $t
}

$totalRoutes = 0; $totalFares = 0
$files = @(Get-ChildItem (Join-Path $RepoDir "fares-*.json") | Where-Object { $_.Name -match '^fares-[A-Z]{3}\.json$' } | Sort-Object Name)
foreach ($f in $files) {
  $doc = Read-Json $f.FullName
  $before = @($doc.fares).Count
  $kept = @(@($doc.fares) | ForEach-Object { Tidy-Route $_ } | Where-Object { $_ })
  $doc.fares = $kept
  $doc.count = $kept.Count
  Write-Json $f.FullName $doc
  $n = 0; foreach ($t in $kept) { $n += @($t.options).Count }
  $totalRoutes += $kept.Count; $totalFares += $n
  Write-Host ("{0}: {1} routes -> {2}, {3} airline fares" -f $f.Name, $before, $kept.Count, $n)
}

$slimPath = Join-Path $RepoDir "fares.json"
$slim = Read-Json $slimPath
$slimBefore = @($slim.fares).Count
$slimKept = @(@($slim.fares) | ForEach-Object { Tidy-Route $_ } | Where-Object { $_ })
$slim.fares = $slimKept
$slim.count = $slimKept.Count
if ($slim.PSObject.Properties['totals'] -and $slim.totals) {
  if ($slim.totals.PSObject.Properties['routes']) { $slim.totals.routes = $totalRoutes }
  if ($slim.totals.PSObject.Properties['fares'])  { $slim.totals.fares  = $totalFares }
}
Write-Json $slimPath $slim

# Refuse to finish if anything unconfirmed survived.
$leak = 0
foreach ($p in @($slimPath) + @($files | ForEach-Object { $_.FullName })) {
  foreach ($t in @((Read-Json $p).fares)) { foreach ($o in @($t.options)) { if (-not (Is-Confirmed $o)) { $leak++ } } }
}
if ($leak -gt 0) { throw "confirmed-only: $leak unconfirmed fares still present" }
Write-Host ("fares.json: {0} routes -> {1}. All airports: {2} routes, {3} airline fares. Unconfirmed left: 0." -f $slimBefore, $slimKept.Count, $totalRoutes, $totalFares)
