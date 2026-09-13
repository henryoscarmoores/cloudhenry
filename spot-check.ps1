<#
  Daily spot-check of the fares the site is showing.

  Henry, 13 Sep 2026: find a wrong fare before a customer does. Picks a
  random sample of the Ryanair and Wizz Air fares in the published airport
  files, asks each airline again for that exact route and date, and writes
  spot-check.json with what came back:

    match      still on sale within 2 pounds of the price we show
    up / down  still on sale, but the price has moved by more than 2 pounds
    gone       the airline has nothing on that route and date any more
    unchecked  the airline could not be asked (network or rate limit)

  The morning health check reads spot-check.json and reports anything gone.
  Norwegian is not sampled: its feed is blocked from GitHub's runners.

  Usage: .\spot-check.ps1 [-Sample 30]
#>
param(
  [int]    $Sample = 30,
  [string] $RepoDir = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)
$ErrorActionPreference = "Stop"
Set-Location $RepoDir
. (Join-Path $RepoDir "feeds-common.ps1")
. (Join-Path $RepoDir "ryanair.ps1")
. (Join-Path $RepoDir "wizzair.ps1")

# The airports on the site, from the build itself, so the two never drift.
$originsLine = [regex]::Match([IO.File]::ReadAllText((Join-Path $RepoDir "build-fares.ps1")), '(?m)^\$ORIGINS = @\(([^)]*)\)').Groups[1].Value
$origins = @($originsLine -split ',' | ForEach-Object { $_.Trim().Trim('"') } | Where-Object { $_ })
if ($origins.Count -lt 5) { throw "could not read the airport list from build-fares.ps1" }

# Two days out at the earliest, as the emails and the search do.
$today = (Get-Date).Date
$from = $today.AddDays(2).ToString("yyyy-MM-dd")
$to   = $today.AddDays(120).ToString("yyyy-MM-dd")

$pool = @{ FR = (New-Object System.Collections.Generic.List[object]); W6 = (New-Object System.Collections.Generic.List[object]) }
foreach ($c in $origins) {
  $path = Join-Path $RepoDir "fares-$c.json"
  if (-not (Test-Path $path)) { continue }
  $j = [IO.File]::ReadAllText($path) | ConvertFrom-Json
  foreach ($t in @($j.fares)) {
    foreach ($o in @($t.options)) {
      $a = if ($o.PSObject.Properties['a']) { [string]$o.a } else { "" }
      if ($a -ne "FR" -and $a -ne "W6") { continue }
      if (-not $o.d -or $o.d -lt $from -or $o.d -gt $to) { continue }
      $ret = if ($o.PSObject.Properties['r'] -and $o.r) { [string]$o.r } else { "" }
      $pool[$a].Add([pscustomobject]@{ origin = $c; dest = [string]$t.destination; d = [string]$o.d; r = $ret; airline = $a; shown = [int]$o.p })
    }
  }
}
Write-Host ("pool: Ryanair {0}, Wizz Air {1}" -f $pool.FR.Count, $pool.W6.Count)

# Same sample all day (seeded by the date), about a third Wizz Air.
$rng = New-Object System.Random ([int](Get-Date -Format "yyyyMMdd"))
$picks = New-Object System.Collections.Generic.List[object]
$seen = @{}
function Take($list, [int] $want) {
  $got = 0; $tries = 0
  while ($got -lt $want -and $tries -lt $want * 20 -and $list.Count -gt 0) {
    $tries++
    $x = $list[$rng.Next($list.Count)]
    $k = "$($x.origin)|$($x.dest)|$($x.d)|$($x.r)"
    if ($seen.ContainsKey($k)) { continue }
    $seen[$k] = 1; $picks.Add($x); $got++
  }
}
$wantW6 = [Math]::Min([int][Math]::Floor($Sample / 3), $pool.W6.Count)
Take $pool.W6 $wantW6
Take $pool.FR ($Sample - $picks.Count)

# Returns the live price in whole pounds, -1 when nothing is on sale, or
# $null when the airline could not be asked.
function Check-Ryanair($x) {
  $base = "https://www.ryanair.com/api/farfnd/v4/"
  if ($x.r) {
    $url = $base + "roundTripFares?departureAirportIataCode=$($x.origin)&arrivalAirportIataCode=$($x.dest)" +
           "&outboundDepartureDateFrom=$($x.d)&outboundDepartureDateTo=$($x.d)&inboundDepartureDateFrom=$($x.r)&inboundDepartureDateTo=$($x.r)" +
           "&market=en-gb&language=en&currency=GBP"
    $res = Ry-Get $url
    if ($null -eq $res) { return $null }
    $f = @($res.fares) | Where-Object { $_ -and $_.outbound -and $_.inbound } | Select-Object -First 1
    if ($f) {
      if ($f.summary -and $f.summary.price) { return (Ry-Price $f.summary.price) }
      return (Ry-Price $f.outbound.price) + (Ry-Price $f.inbound.price)
    }
    # Ryanair's return finder leaves out same-day returns (the day trips),
    # which the build makes from two singles, so price the two singles.
    $out = Check-Ryanair ([pscustomobject]@{ origin = $x.origin; dest = $x.dest; d = $x.d; r = "" })
    if ($null -eq $out -or $out -lt 0) { return $out }
    $back = Check-Ryanair ([pscustomobject]@{ origin = $x.dest; dest = $x.origin; d = $x.r; r = "" })
    if ($null -eq $back -or $back -lt 0) { return $back }
    return $out + $back
  }
  $url = $base + "oneWayFares?departureAirportIataCode=$($x.origin)&arrivalAirportIataCode=$($x.dest)" +
         "&outboundDepartureDateFrom=$($x.d)&outboundDepartureDateTo=$($x.d)&market=en-gb&language=en&currency=GBP"
  $res = Ry-Get $url
  if ($null -eq $res) { return $null }
  $f = @($res.fares) | Where-Object { $_ -and $_.outbound -and $_.outbound.price } | Select-Object -First 1
  if (-not $f) { return -1 }
  return (Ry-Price $f.outbound.price)
}

function Check-Wizz($x) {
  $base = Get-WizzBase
  if (-not $base) { return $null }
  $legs = @(@{ departureStation = $x.origin; arrivalStation = $x.dest; from = $x.d; to = $x.d })
  if ($x.r) { $legs += @{ departureStation = $x.dest; arrivalStation = $x.origin; from = $x.r; to = $x.r } }
  $body = @{ flightList = $legs; priceType = "regular"; adultCount = 1; childCount = 0; infantCount = 0 } | ConvertTo-Json -Depth 5 -Compress
  $res = Feed-Call POST "$base/search/timetable" $body $WIZZ_HEADERS
  if ($null -eq $res) { return $null }
  $out = @($res.outboundFlights) | Where-Object { $_ -and $_.price -and $_.price.amount -and $_.price.currencyCode -eq "GBP" -and ([string]$_.departureDate).StartsWith($x.d) } | Select-Object -First 1
  if (-not $out) { return -1 }
  $p = Feed-Pounds $out.price.amount
  if ($x.r) {
    $in = @($res.returnFlights) | Where-Object { $_ -and $_.price -and $_.price.amount -and $_.price.currencyCode -eq "GBP" -and ([string]$_.departureDate).StartsWith($x.r) } | Select-Object -First 1
    if (-not $in) { return -1 }
    $p += Feed-Pounds $in.price.amount
  }
  return $p
}

$counts = [ordered]@{ match = 0; up = 0; down = 0; gone = 0; unchecked = 0 }
$results = @()
foreach ($x in $picks) {
  $live = $null
  try { $live = if ($x.airline -eq "FR") { Check-Ryanair $x } else { Check-Wizz $x } } catch { $live = $null }
  Start-Sleep -Milliseconds 800
  $status = if ($null -eq $live) { "unchecked" } elseif ($live -lt 0) { "gone" } elseif ([Math]::Abs($live - $x.shown) -le 2) { "match" } elseif ($live -gt $x.shown) { "up" } else { "down" }
  $counts[$status]++
  $results += [ordered]@{ origin = $x.origin; dest = $x.dest; d = $x.d; r = $x.r; airline = $x.airline; shown = $x.shown; live = $(if ($null -eq $live -or $live -lt 0) { $null } else { $live }); status = $status }
  Write-Host ("{0} {1}-{2} {3}{4} shown {5} live {6}: {7}" -f $x.airline, $x.origin, $x.dest, $x.d, $(if ($x.r) { " to " + $x.r } else { "" }), $x.shown, $(if ($null -eq $live) { "?" } elseif ($live -lt 0) { "none" } else { $live }), $status)
}

$generated = ""
try { $generated = [string](([IO.File]::ReadAllText((Join-Path $RepoDir "fares.json")) | ConvertFrom-Json).generated) } catch {}
$doc = [ordered]@{
  checked_at     = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  data_generated = $generated
  sample         = $picks.Count
  match          = $counts.match
  up             = $counts.up
  down           = $counts.down
  gone           = $counts.gone
  unchecked      = $counts.unchecked
  not_sampled    = "Norwegian (blocked from GitHub's runners)"
  results        = $results
}
[IO.File]::WriteAllText((Join-Path $RepoDir "spot-check.json"), ($doc | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("spot-check: {0} checked, {1} match, {2} up, {3} down, {4} gone, {5} unchecked" -f $picks.Count, $counts.match, $counts.up, $counts.down, $counts.gone, $counts.unchecked)
if ($counts.gone -gt 0) { Write-Host "::warning::$($counts.gone) sampled fares are no longer on sale at the airline" }
