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
    - every one-way date the cache holds for the route (latest, one call)
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
  [int]      $MaxOneWay = 120,
  [int]      $MaxReturn = 80,
  [switch]   $SkipWeekends,
  [switch]   $SkipXmas,
  [string[]] $OnlyOrigins,
  [int]      $PauseMs = 180,
  [switch]   $WriteSlim,
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
            typical = $null; options = @(); inbound = @()
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

    # Every date the cache holds for the route, one call each way. The
    # month-matrix endpoint used before returns the cheapest fare per day
    # for one month and, for most routes, only a handful of days: it gave
    # Manchester to Dublin 33 dates over three calls where a single
    # latest call over the year gives 61 and reaches further ahead.
    # Returns come the same way, and weekends are simply the returns
    # that fall Friday or Saturday to Sunday or Monday, so the three
    # extra weekend calls per route are gone too.
    $deep = $true
    $lo = Invoke-TP -Path "/v2/prices/latest" -Query @{
      origin = $origin; destination = $t.destination; one_way = "true"; limit = 1000
      period_type = "year"; show_to_affiliates = "true"; currency = $Currency
    }
    $calls++
    if ($lo -and $lo.success -and $lo.data) {
      foreach ($row in @($lo.data)) {
        $p = [int]$row.value
        if ($p -le 0 -or -not $row.depart_date) { continue }
        $opts += [pscustomobject]@{ d = ([string]$row.depart_date).Substring(0, 10); r = ""; p = $p; s = [int]$row.number_of_changes }
      }
    }
    $owPrices = @($opts | ForEach-Object { $_.p })
    if ($owPrices.Count -gt 0) { $t.typical = [int][math]::Round(($owPrices | Measure-Object -Average).Average) }

    # Returns the cache has seen this year.
    $lr = Invoke-TP -Path "/v2/prices/latest" -Query @{
      origin = $origin; destination = $t.destination; one_way = "false"; limit = 1000
      period_type = "year"; show_to_affiliates = "true"; currency = $Currency
    }
    $calls++
    $special = @()
    $country = if ($COUNTRY_OF.ContainsKey($t.destination)) { $COUNTRY_OF[$t.destination] } else { "" }
    if ($lr -and $lr.success -and $lr.data) {
      foreach ($row in @($lr.data)) {
        $p = [int]$row.value
        if ($p -le 0 -or -not $row.depart_date -or -not $row.return_date) { continue }
        $o = [pscustomobject]@{ d = ([string]$row.depart_date).Substring(0, 10); r = ([string]$row.return_date).Substring(0, 10); p = $p; s = [int]$row.number_of_changes }
        $isWk = $false
        if (-not $SkipWeekends -and -not $UK.ContainsKey($t.destination) -and $weekendOk.ContainsKey($country)) {
          try { $dep = [datetime]::Parse($o.d); $ret = [datetime]::Parse($o.r); $isWk = Is-Weekend -Dep $dep -Ret $ret } catch { $isWk = $false }
        }
        # Christmas market breaks are protected from the caps the same way.
        $isX = $false
        if (-not $SkipXmas -and $XMAS.ContainsKey($t.destination)) {
          try { $dep = [datetime]::Parse($o.d); $ret = [datetime]::Parse($o.r); $nights = ($ret - $dep).Days; $isX = ($dep -ge $XmasStart -and $dep -le $XmasEnd -and $nights -ge 2 -and $nights -le 5) } catch { $isX = $false }
        }
        if ($isWk -or $isX) { $special += $o } else { $opts += $o }
      }
    }
    # Christmas markets.
    # Weekends built from two singles. The return cache is thin (Barcelona
    # from Manchester: 14 returns for the year) but the one-way cache is
    # deep both ways, and Ryanair, easyJet, Jet2 and Wizz sell singles, so
    # a Friday out and a Sunday back is two real fares. One more call per
    # route for the inbound dates, then pair them: Friday or Saturday out,
    # Sunday or Monday back, one to three nights. Christmas market breaks
    # (two to five nights in the window) are assembled the same way.
    # Marked c = 1 so the site can say "two one-way tickets".
    if (-not $SkipWeekends -and -not $UK.ContainsKey($t.destination) -and $owPrices.Count -gt 0) {
      $li = Invoke-TP -Path "/v2/prices/latest" -Query @{
        origin = $t.destination; destination = $origin; one_way = "true"; limit = 1000
        period_type = "year"; show_to_affiliates = "true"; currency = $Currency
      }
      $calls++
      if ($li -and $li.success -and $li.data) {
        $inbound = @{}
        foreach ($row in @($li.data)) {
          $p = [int]$row.value
          if ($p -le 0 -or -not $row.depart_date) { continue }
          $k = ([string]$row.depart_date).Substring(0, 10)
          if (-not $inbound.ContainsKey($k) -or $p -lt $inbound[$k].p) { $inbound[$k] = [pscustomobject]@{ p = $p; s = [int]$row.number_of_changes } }
        }
        # Kept on the route so the search can assemble a return for any dates.
        $t.inbound = @($inbound.Keys | Sort-Object | ForEach-Object { [pscustomobject]@{ d = $_; p = $inbound[$_].p; s = $inbound[$_].s } })
        $have = @{}
        foreach ($o in $special) { $have["$($o.d)|$($o.r)"] = 1 }
        $pairHere = ($weekendOk.ContainsKey($country) -or $XMAS.ContainsKey($t.destination))
        foreach ($out in ($opts | Where-Object { -not $_.r })) {
          if (-not $pairHere) { break }
          try { $dep = [datetime]::Parse($out.d) } catch { continue }
          $isXmasDep = ($XMAS.ContainsKey($t.destination) -and $dep -ge $XmasStart -and $dep -le $XmasEnd)
          if (-not ($dep.DayOfWeek -eq 'Friday' -or $dep.DayOfWeek -eq 'Saturday') -and -not $isXmasDep) { continue }
          foreach ($nights in 1, 2, 3, 4, 5) {
            $ret = $dep.AddDays($nights)
            $wk = (($dep.DayOfWeek -eq 'Friday' -or $dep.DayOfWeek -eq 'Saturday') -and ($ret.DayOfWeek -eq 'Sunday' -or $ret.DayOfWeek -eq 'Monday') -and $nights -le 3)
            $xm = ($isXmasDep -and $nights -ge 2 -and $nights -le 5)
            if (-not $wk -and -not $xm) { continue }
            $rk = $ret.ToString('yyyy-MM-dd')
            if (-not $inbound.ContainsKey($rk)) { continue }
            $key = "$($out.d)|$rk"
            if ($have.ContainsKey($key)) { continue }
            $have[$key] = 1
            $special += [pscustomobject]@{ d = $out.d; r = $rk; p = ($out.p + $inbound[$rk].p); s = [math]::Max($out.s, $inbound[$rk].s); c = 1 }
          }
        }
      }
    }
    # Only needed when the year query was cut off at its 1000 row limit.
    $rtFull = ($lr -and $lr.success -and $lr.data -and @($lr.data).Count -ge 1000)
    if ($rtFull -and -not $SkipXmas -and $XMAS.ContainsKey($t.destination)) {
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
    # Real cached returns are kept whole; assembled pairs are capped at the
    # thirty cheapest per route so the London files stay a sane size.
    $paired = 0
    foreach ($o in ($special | Sort-Object p)) {
      $k = "$($o.d)|$($o.r)"
      if ($seen.ContainsKey($k)) { continue }
      $isPair = ($o.PSObject.Properties['c'] -ne $null)
      if ($isPair) { if ($paired -ge 30) { continue }; $paired++ }
      $seen[$k] = 1; $sp += $o
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
  # The airport file above is the valuable output. Nothing in here may
  # sink the run: the first full cloud build finished all twelve airports
  # and then died in this block with a type error, publishing nothing.
  try {
    $rankedList = @()
    foreach ($t in $withOpts) {
      $min = 999999
      foreach ($o in @($t.options)) { $pv = 0; try { $pv = [int]$o.p } catch {}; if ($pv -gt 0 -and $pv -lt $min) { $min = $pv } }
      $rankedList += [pscustomobject]@{ min = [int]$min; route = $t }
    }
    $ranked = @($rankedList | Sort-Object -Property min | Select-Object -First 40 | ForEach-Object { $_.route })
    foreach ($t in $ranked) {
      $ow = @(); $rt = @(); $wk = @()
      foreach ($o in @($t.options)) {
        if ($o.r) {
          $rt += $o
          try { if (Is-Weekend -Dep ([datetime]::Parse($o.d)) -Ret ([datetime]::Parse($o.r))) { $wk += $o } } catch {}
        } else { $ow += $o }
      }
      $ow = @($ow | Sort-Object -Property p | Select-Object -First 12)
      $rt = @($rt | Sort-Object -Property p | Select-Object -First 8)
      $wk = @($wk | Sort-Object -Property p | Select-Object -First 6)
      $seenK = @{}; $keep = @()
      foreach ($o in (@($wk) + @($ow) + @($rt))) { $k = "$($o.d)|$($o.r)"; if (-not $seenK.ContainsKey($k)) { $seenK[$k] = 1; $keep += $o } }
      $slim.Add([pscustomobject]@{
        origin = [string]$t.origin; destination = [string]$t.destination; price = [int]$t.price
        departure = [string]$t.departure; ret = [string]$t.ret; transfers = [int]$t.transfers
        airline = [string]$t.airline; flight = [string]$t.flight; typical = $t.typical; options = @($keep)
      })
    }
  } catch {
    Log ("{0}: slim summary skipped: {1}" -f $origin, $_.Exception.Message) "WARN"
  }
}

# ---- Slim file ------------------------------------------------------------
if ($OnlyOrigins -and -not $WriteSlim) {
  Log "Partial run ($($ORIGINS -join ',')): airport files written, slim fares.json left alone."
} elseif ($slim.Count -lt 300) {
  Log "Slim file would hold only $($slim.Count) routes. Keeping the previous fares.json." "WARN"
} else {
  try {
    $slimArr = @($slim.ToArray())
    $slimOut = [pscustomobject]@{ generated = $generated; currency = $Currency.ToUpper(); origins = @($ORIGINS); count = $slimArr.Count; fares = $slimArr }
    Write-Json -Path (Join-Path $RepoDir "fares.json") -Obj $slimOut
    Log ("fares.json: {0} routes, {1} KB" -f $slimArr.Count, [math]::Round((Get-Item (Join-Path $RepoDir "fares.json")).Length / 1KB))
  } catch {
    Log ("slim fares.json not written: {0}. The airport files are unaffected." -f $_.Exception.Message) "WARN"
  }
}

Log ("DONE. {0} routes, {1:n0} dated options, {2:n0} API calls, {3:n0} minutes." -f $totalRoutes, $totalOptions, $calls, ((Get-Date) - $runStart).TotalMinutes)
