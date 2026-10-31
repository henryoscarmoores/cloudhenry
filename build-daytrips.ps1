<#
.SYNOPSIS
  Finds extreme day trips: out and back from the same UK airport on the
  same calendar day, with enough hours on the ground to be worth going.

.DESCRIPTION
  build-fares.ps1 pulls a month matrix of one-way prices. That feed holds
  dates but no clock times, so it cannot tell a 06:15 departure from a
  21:40 one and therefore cannot find a day trip at all.

  This uses a different Travelpayouts endpoint, aviasales/v3
  prices_for_dates, which returns full timestamps and, when asked for
  round trips, a return timestamp too. Everything a day trip needs is in
  one call per origin per month:

    departure_at   2026-11-12T07:25:00Z
    return_at      2026-11-12T19:05:00Z
    duration_to    minutes in the air outbound

  Hours on the ground is return_at minus the outbound landing time, so a
  trip that technically returns the same day but gives you two hours in
  the terminal is filtered out rather than shown.

  Same-day returns are rare. Manchester turns up about five per month
  against a hundred-odd round trips, which is why this writes a single
  all-airports file for one page rather than anything per airport.

.PARAMETER MonthsAhead
  How many months forward to ask for. Six by default.

.PARAMETER MinGroundHours
  Discard anything with less time on the ground than this. Five by
  default: below that you have flown somewhere to look at an airport.

.PARAMETER OnlyOrigins
  Run for some airports only, e.g. -OnlyOrigins MAN,LBA. For testing.

.EXAMPLE
  .\build-daytrips.ps1 -OnlyOrigins MAN -MonthsAhead 2
  .\build-daytrips.ps1
#>
[CmdletBinding()]
param(
  [int]      $MonthsAhead    = 6,
  [double]   $MinGroundHours = 5,
  [int]      $MaxPrice       = 250,
  [string[]] $OnlyOrigins,
  [int]      $PauseMs        = 250
)
$ErrorActionPreference = "Stop"
$RepoDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$TokenFile = Join-Path $RepoDir ".token"
$LogFile   = Join-Path $RepoDir "build-daytrips.log"

function Log {
  param([string] $Message, [string] $Level = "INFO")
  $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
  Write-Host $line
  Add-Content -Path $LogFile -Value $line
}

if (-not (Test-Path $TokenFile)) { throw "No .token file at $TokenFile" }
$token   = (Get-Content $TokenFile -Raw).Trim()
$headers = @{ "X-Access-Token" = $token }

function Invoke-TP {
  param([string] $Path, [hashtable] $Query)
  $qs  = ($Query.GetEnumerator() | ForEach-Object { "{0}={1}" -f $_.Key, [uri]::EscapeDataString([string]$_.Value) }) -join "&"
  $url = "https://api.travelpayouts.com$Path`?$qs"
  $delay = 2
  for ($try = 1; $try -le 4; $try++) {
    try {
      $r = Invoke-RestMethod -Uri $url -Headers $headers -TimeoutSec 60
      Start-Sleep -Milliseconds $PauseMs
      return $r
    } catch {
      $status = $null
      try { $status = [int]$_.Exception.Response.StatusCode } catch {}
      if ($status -eq 404) { return $null }
      if ($try -eq 4) { Log "Gave up on $Path ($status)" "WARN"; return $null }
      Start-Sleep -Seconds $delay
      $delay *= 2
    }
  }
}

# Same origin list as build-fares.ps1, so the page covers every airport
# the site already sells.
$ORIGINS = @("MAN","BHX","LBA","STN","LTN","BRS","NCL","GLA","EDI","LGW","LPL","BFS","BOH","CWL","EMA","DUB","PIK","ORK","SNN","NOC")
if ($OnlyOrigins) { $ORIGINS = @($OnlyOrigins | ForEach-Object { $_ -split "," } | Where-Object { $_ } | ForEach-Object { $_.Trim().ToUpper() }) }

# City and country names come from places.js so this script never carries
# its own copy of the list.
$CITY_OF = @{}; $COUNTRY_OF = @{}
$placesSrc = Get-Content (Join-Path $RepoDir "places.js") -Raw
foreach ($m in [regex]::Matches($placesSrc, '([A-Z]{3}):\["([^"]*)","([^"]*)"')) {
  $CITY_OF[$m.Groups[1].Value]    = $m.Groups[2].Value
  $COUNTRY_OF[$m.Groups[1].Value] = $m.Groups[3].Value
}

$trips = New-Object System.Collections.Generic.List[object]
$calls = 0
$runStart = Get-Date

foreach ($origin in $ORIGINS) {
  $found = 0
  for ($i = 0; $i -lt $MonthsAhead; $i++) {
    $month = (Get-Date).AddMonths($i).ToString("yyyy-MM")
    $r = Invoke-TP "/aviasales/v3/prices_for_dates" @{
      origin = $origin; departure_at = $month; currency = "gbp"
      one_way = "false"; direct = "true"; limit = 1000; sorting = "price"; token = $token
    }
    $calls++
    foreach ($x in @($r.data)) {
      if (-not $x.return_at -or -not $x.departure_at) { continue }
      if ($x.departure_at.Substring(0, 10) -ne $x.return_at.Substring(0, 10)) { continue }
      if ($x.price -gt $MaxPrice) { continue }

      $out  = [datetime]$x.departure_at
      $back = [datetime]$x.return_at
      $land = $out.AddMinutes([int]$x.duration_to)
      $ground = [math]::Round(($back - $land).TotalHours, 1)
      if ($ground -lt $MinGroundHours) { continue }

      $dest = [string]$x.destination
      $trips.Add([pscustomobject]@{
        origin      = $origin
        destination = $dest
        city        = $(if ($CITY_OF[$dest])    { $CITY_OF[$dest] }    else { $dest })
        country     = $(if ($COUNTRY_OF[$dest]) { $COUNTRY_OF[$dest] } else { "" })
        date        = $x.departure_at.Substring(0, 10)
        out         = $out.ToString("HH:mm")
        back        = $back.ToString("HH:mm")
        ground      = $ground
        price       = [int]$x.price
        airline     = [string]$x.airline
        flightOut   = [string]$x.flight_number
        minsOut     = [int]$x.duration_to
        minsBack    = [int]$x.duration_back
      })
      $found++
    }
  }
  Log ("{0}: {1} day trips" -f $origin, $found)
}

# Best first: most time on the ground, then cheapest. A day trip is sold
# on hours there, not on being two pounds less than the next one.
$sorted = @($trips | Sort-Object -Property @{Expression="ground";Descending=$true}, @{Expression="price";Descending=$false})

$out = [pscustomobject]@{
  generated = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  currency  = "GBP"
  minGround = $MinGroundHours
  origins   = @($ORIGINS)
  count     = $sorted.Count
  trips     = $sorted
}
$path = Join-Path $RepoDir "daytrips.json"
$json = $out | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText($path, $json, (New-Object Text.UTF8Encoding $false))

Log ("DONE. {0} day trips from {1} airports, {2} API calls, {3:n1} minutes." -f $sorted.Count, $ORIGINS.Count, $calls, ((Get-Date) - $runStart).TotalMinutes)
Log ("daytrips.json: {0} KB" -f [math]::Round((Get-Item $path).Length / 1KB, 1))
