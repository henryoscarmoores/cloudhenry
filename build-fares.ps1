<#
.SYNOPSIS
  Builds every fare file the site reads, from Travelpayouts, as broadly
  as the cache allows.

.DESCRIPTION
  The old pipeline asked each airport for its thirty cheapest
  destinations and stopped there. "Germany from Manchester" came back
  with Hamburg and nothing else, because Berlin, Munich, Cologne and the
  rest were never asked about. This one asks for every destination the
  cache holds from each airport (Manchester alone has close to three
  hundred), then fills in the dates for each route.

  Per route it gathers:
    - one-way fares, one per day, for the next few months (month-matrix)
    - return fares the cache has seen this year (prices/latest)
    - weekend breaks, Friday or Saturday out and Sunday home (Europe only)
    - Christmas market long weekends, mid November to Christmas Eve

  It writes:
    fares-MAN.json ... fares-BFS.json   one file per airport, everything
    fares.json                          a slim file: the best routes from
                                        each airport, for the homepage,
                                        join pages and Today's Deals

  The search page loads the airport file it needs. The other pages keep
  reading the slim file, so nothing else on the site changes.

  Safety: an airport whose run comes back thin keeps its previous file.
  A broken run leaves yesterday's fares in place rather than nothing.

.PARAMETER MonthsAhead
  How many months of one-way dates to pull per route. Three by default.

.PARAMETER OnlyOrigins
  Run for some airports only, e.g. -OnlyOrigins MAN,LBA. For testing.

.EXAMPLE
  .\build-fares.ps1 -OnlyOrigins LBA -MonthsAhead 1
  .\build-fares.ps1
#>
[CmdletBinding()]
param(
  [int]      $MonthsAhead = 3,
  [int]      $MaxOneWay = 40,
  [int]      $MaxReturn = 24,
  [switch]   $SkipWeekends,
  [switch]   $SkipXmas,
  [string[]] $OnlyOrigins,
  [int]      $PauseMs = 180,
  [string]   $Currency = "gbp"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$TokenFile = Join-Path $RepoDir ".token"
$LogFile   = Join-Path $RepoDir "build-fares.log"

$ORIGINS = @("MAN","BHX","LBA","STN","LTN","BRS","NCL","GLA","EDI","LGW","LPL","BFS")
if ($OnlyOrigins) { $ORIGINS = @($OnlyOrigins | ForEach-Object { $_.ToUpper() }) }

# Other UK airports. Kept in the data (someone may search for them) but
# never worth a weekend or Christmas pass.
$UK = @{ LON=1; MAN=1; BHX=1; LBA=1; STN=1; LTN=1; BRS=1; NCL=1; GLA=1; EDI=1; LGW=1; LPL=1; BFS=1; CWL=1; ILY=1; KOI=1; ABZ=1; INV=1; SOU=1; EXT=1; NQY=1; LDY=1 }

# Weekend breaks only make sense within a few hours' flight. Countries,
# matched against places.js, so the list does not need every airport code.
$WEEKEND_COUNTRIES = @("Spain","France","Italy","Germany","Netherlands","Belgium","Portugal","Ireland","Poland","Czechia",
  "Austria","Hungary","Denmark","Sweden","Norway","Finland","Switzerland","Croatia","Greece","Malta","Cyprus",
  "Lithuania","Latvia","Estonia","Romania","Bulgaria","Serbia","Slovakia","Slovenia","Luxembourg","Iceland",
  "Morocco","Tunisia","Türkiye","Gibraltar","Kosovo","Moldova","Faroes","Montenegro","Albania","Bosnia")

# Cities with a real Christmas market, plus the North American ones people ask for.
$XMAS = @{ PRG=1; BER=1; VIE=1; BUD=1; KRK=1; CPH=1; HAM=1; CGN=1; DUS=1; FRA=1; AMS=1; BRU=1; GDN=1; WAW=1; RIX=1; VNO=1;
           HEL=1; OSL=1; GVA=1; MIL=1; VCE=1; ROM=1; NYC=1; BOS=1; YTO=1; TLL=1; MUC=1; STR=1; ZRH=1; SZG=1; NUE=1; DRS=1; LEJ=1; STO=1; ARN=1 }
$XmasStart = [datetime]::Parse("2026-11-15")
$XmasEnd   = [datetime]::Parse("2026-12-24")

function Log {
  param([string] $Message, [string] $Level = "INFO")
  $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
  Write-Host $line
  Add-Content -Path $LogFile -Value $line
}

if (-not (Test-Path $TokenFile)) { throw "No .token file at $TokenFile" }
$token = (Get-Content $TokenFile -Raw).Trim()
$headers = @{ "X-Access-Token" = $token }

# One place for every API call: the query string, the pause, and a retry
# with backoff for the rate limiter.
function Invoke-TP {
  param([string] $Path, [hashtable] $Query)
  $qs = ($Query.GetEnumerator() | ForEach-Object { "{0}={1}" -f $_.Key, [uri]::EscapeDataString([string]$_.Value) }) -join "&"
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

# The country for each destination, read from places.js so this script
# never carries its own copy of the list.
$COUNTRY_OF = @{}
$placesSrc = Get-Content (Join-Path $RepoDir "places.js") -Raw
foreach ($m in [regex]::Matches($placesSrc, '([A-Z]{3}):\["([^"]*)","([^"]*)"')) {
  $COUNTRY_OF[$m.Groups[1].Value] = $m.Groups[3].Value
}
$weekendOk = @{}
foreach ($c in $WEEKEND_COUNTRIES) { $weekendOk[$c] = 1 }

function Write-Json {
  param([string] $Path, $Obj)
  $json = $Obj | ConvertTo-Json -Depth 8 -Compress
  [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Is-Weekend {
  param([datetime] $Dep, [datetime] $Ret)
  $nights = ($Ret - $Dep).Days
  return (($Dep.DayOfWeek -eq 'Friday' -or $Dep.DayOfWeek -eq 'Saturday') -and $Ret.DayOfWeek -eq 'Sunday' -and $nights -ge 1 -and $nights -le 2)
}

$months = @()
for ($i = 0; $i -lt $MonthsAhead; $i++) { $months += (Get-Date).AddMonths($i).ToString("yyyy-MM-01") }

$generated = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$slim = New-Object System.Collections.Generic.List[object]
$totalRoutes = 0; $totalOptions = 0; $calls = 0
$runStart = Get-Date

foreach ($origin in $ORIGINS) {
  Log "== $origin"

  # ---- 1. Discovery: every destination the cache has from here --------
  $routes = @{}
  foreach ($oneWay in "true","false") {
    for ($page = 1; $page -le 3; $page++) {
      $r = Invoke-TP -Path "/v2/prices/latest" -Query @{
        origin = $origin; period_type = "year"; one_way = $oneWay; limit = 1000; page = $page
        show_to_affiliates = "true"; currency = $Currency
      }
      $calls++
      if (-not $r -or -not $r.success -or -not $r.data -or @($r.data).Count -eq 0) { break }
      foreach ($row in @($r.data)) {
        $d = [string]$row.destination
        if (-not $d -or $d -eq $origin) { continue }
        $p = [int]$row.value
        if ($p -le 0) { continue }
        if (-not $routes.ContainsKey($d) -or $p -lt $routes[$d].price) {
          $routes[$d] = [pscustomobject]@{
            origin = $origin; destination = $d; price = $p
            departure = [string]$row.depart_date; ret = [string]$row.return_date
            transfers = [int]$row.number_of_changes; airline = [string]$row.gate; flight = ""
            typical = $null; options = @()
          }
        }
      }
      if (@($r.data).Count -lt 1000) { break }
    }
  }
  $list = @($routes.Values | Sort-Object price)
  Log ("{0}: {1} destinations found" -f $origin, $list.Count)

  if ($list.Count -lt 40) {
    Log "$origin came back thin ($($list.Count) routes). Keeping the previous file." "WARN"
    continue
  }

  # ---- 2. Depth: dates for every route ------------------------------
  $n = 0
  foreach ($t in $list) {
    $opts = @()

    # One-way, a price per day, for the months ahead.
    foreach ($mon in $months) {
      $m = Invoke-TP -Path "/v2/prices/month-matrix" -Query @{ origin = $origin; destination = $t.destination; month = $mon; currency = $Currency }
      $calls++
      if ($m -and $m.success -and $m.data) {
        foreach ($row in @($m.data)) {
          $p = [int]$row.value
          if ($p -le 0 -or -not $row.depart_date) { continue }
          $opts += [pscustomobject]@{ d = [string]$row.depart_date; r = ""; p = $p; s = [int]$row.number_of_changes }
        }
      }
    }
    $owPrices = @($opts | ForEach-Object { $_.p })
    if ($owPrices.Count -gt 0) { $t.typical = [int][math]::Round(($owPrices | Measure-Object -Average).Average) }

    # Returns the cache has seen this year.
    $lr = Invoke-TP -Path "/v2/prices/latest" -Query @{
      origin = $origin; destination = $t.destination; one_way = "false"; limit = 60
      period_type = "year"; show_to_affiliates = "true"; currency = $Currency
    }
    $calls++
    if ($lr -and $lr.success -and $lr.data) {
      foreach ($row in @($lr.data)) {
        $p = [int]$row.value
        if ($p -le 0 -or -not $row.depart_date -or -not $row.return_date) { continue }
        $opts += [pscustomobject]@{ d = [string]$row.depart_date; r = [string]$row.return_date; p = $p; s = [int]$row.number_of_changes }
      }
    }

    # Weekends, Europe and the near neighbours only.
    $special = @()
    $country = if ($COUNTRY_OF.ContainsKey($t.destination)) { $COUNTRY_OF[$t.destination] } else { "" }
    if (-not $SkipWeekends -and -not $UK.ContainsKey($t.destination) -and $weekendOk.ContainsKey($country)) {
      foreach ($dur in 1, 2, 3) {
        $w = Invoke-TP -Path "/v2/prices/latest" -Query @{
          origin = $origin; destination = $t.destination; one_way = "false"; trip_duration = $dur; limit = 500
          period_type = "year"; show_to_affiliates = "true"; currency = $Currency
        }
        $calls++
        if ($w -and $w.success -and $w.data) {
          foreach ($row in @($w.data)) {
            $p = [int]$row.value
            if ($p -le 0 -or -not $row.return_date) { continue }
            try { $dep = [datetime]::Parse($row.depart_date); $ret = [datetime]::Parse($row.return_date) } catch { continue }
            if (Is-Weekend -Dep $dep -Ret $ret) {
              $special += [pscustomobject]@{ d = [string]$row.depart_date; r = [string]$row.return_date; p = $p; s = [int]$row.number_of_changes }
            }
          }
        }
      }
    }

    # Christmas markets.
    if (-not $SkipXmas -and $XMAS.ContainsKey($t.destination)) {
      foreach ($month in "2026-11-01", "2026-12-01") {
        $x = Invoke-TP -Path "/v2/prices/latest" -Query @{
          origin = $origin; destination = $t.destination; one_way = "false"; beginning_of_period = $month
          period_type = "month"; limit = 500; show_to_affiliates = "true"; currency = $Currency
        }
        $calls++
        if ($x -and $x.success -and $x.data) {
          foreach ($row in @($x.data)) {
            $p = [int]$row.value
            if ($p -le 0 -or -not $row.return_date) { continue }
            try { $dep = [datetime]::Parse($row.depart_date); $ret = [datetime]::Parse($row.return_date) } catch { continue }
            if ($dep -lt $XmasStart -or $dep -gt $XmasEnd) { continue }
            $nights = ($ret - $dep).Days
            if ($nights -lt 2 -or $nights -gt 5) { continue }
            $special += [pscustomobject]@{ d = [string]$row.depart_date; r = [string]$row.return_date; p = $p; s = [int]$row.number_of_changes }
          }
        }
      }
    }

    # De-duplicate by date pair, cap one-ways and returns separately, and
    # always keep the weekend and Christmas ones: they are few and they
    # are the whole point of two of the search's tabs.
    $seen = @{}; $ow = @(); $rt = @(); $sp = @()
    foreach ($o in ($special | Sort-Object p)) {
      $k = "$($o.d)|$($o.r)"
      if (-not $seen.ContainsKey($k)) { $seen[$k] = 1; $sp += $o }
    }
    foreach ($o in ($opts | Sort-Object p)) {
      $k = "$($o.d)|$($o.r)"
      if ($seen.ContainsKey($k)) { continue }
      $seen[$k] = 1
      if ($o.r) { $rt += $o } else { $ow += $o }
    }
    $t.options = @($sp) + @($ow | Select-Object -First $MaxOneWay) + @($rt | Select-Object -First $MaxReturn)
    $totalOptions += @($t.options).Count

    $n++
    if ($n % 50 -eq 0) { Log ("  {0}: {1} of {2} routes, {3} calls, {4:n0} min" -f $origin, $n, $list.Count, $calls, ((Get-Date) - $runStart).TotalMinutes) }
  }

  # ---- 3. Write the airport's file ----------------------------------
  $withOpts = @($list | Where-Object { @($_.options).Count -gt 0 })
  $out = [pscustomobject]@{ generated = $generated; currency = $Currency.ToUpper(); origin = $origin; count = $withOpts.Count; fares = $withOpts }
  Write-Json -Path (Join-Path $RepoDir "fares-$origin.json") -Obj $out
  $totalRoutes += $withOpts.Count
  Log ("{0}: wrote {1} routes, {2} KB" -f $origin, $withOpts.Count, [math]::Round((Get-Item (Join-Path $RepoDir "fares-$origin.json")).Length / 1KB))

  # ---- 4. Slim copy for the rest of the site -------------------------
  # Best forty routes by cheapest option, a dozen one-ways and eight
  # returns each, plus any weekends. Same shape as the airport file, so
  # the homepage, join pages and Today's Deals need no changes.
  $ranked = $withOpts | Sort-Object { ($_.options | Measure-Object p -Minimum).Minimum } | Select-Object -First 40
  foreach ($t in $ranked) {
    $ow = @($t.options | Where-Object { -not $_.r } | Sort-Object p | Select-Object -First 12)
    $rt = @($t.options | Where-Object { $_.r } | Sort-Object p | Select-Object -First 8)
    $wk = @($t.options | Where-Object { $_.r } | Where-Object {
      try { Is-Weekend -Dep ([datetime]::Parse($_.d)) -Ret ([datetime]::Parse($_.r)) } catch { $false }
    } | Sort-Object p | Select-Object -First 6)
    $seenK = @{}; $keep = @()
    foreach ($o in (@($wk) + @($ow) + @($rt))) { $k = "$($o.d)|$($o.r)"; if (-not $seenK.ContainsKey($k)) { $seenK[$k] = 1; $keep += $o } }
    $slim.Add([pscustomobject]@{
      origin = $t.origin; destination = $t.destination; price = $t.price; departure = $t.departure; ret = $t.ret
      transfers = $t.transfers; airline = $t.airline; flight = $t.flight; typical = $t.typical; options = $keep
    })
  }
}

# ---- Slim file ------------------------------------------------------------
if ($OnlyOrigins) {
  Log "Partial run ($($ORIGINS -join ',')): airport files written, slim fares.json left alone."
} elseif ($slim.Count -lt 300) {
  Log "Slim file would hold only $($slim.Count) routes. Keeping the previous fares.json." "WARN"
} else {
  $slimOut = [pscustomobject]@{ generated = $generated; currency = $Currency.ToUpper(); origins = $ORIGINS; count = $slim.Count; fares = @($slim) }
  Write-Json -Path (Join-Path $RepoDir "fares.json") -Obj $slimOut
  Log ("fares.json: {0} routes, {1} KB" -f $slim.Count, [math]::Round((Get-Item (Join-Path $RepoDir "fares.json")).Length / 1KB))
}

Log ("DONE. {0} routes, {1:n0} dated options, {2:n0} API calls, {3:n0} minutes." -f $totalRoutes, $totalOptions, $calls, ((Get-Date) - $runStart).TotalMinutes)
