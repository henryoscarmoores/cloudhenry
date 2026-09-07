# Ryanair fare finder feed.
#
# The Travelpayouts cache only knows fares people have searched for, so
# weekends and regional routes were thin. Ryanair's own fare finder, the
# thing behind "cheapest fares" on their site, lists real dated fares
# with flight times, and takes a Friday/Saturday out, Sunday/Monday back
# filter, which is exactly the weekend break question the search kept
# failing. No key, no commission: the fare links straight to Ryanair.
#
# Dot-sourced by build-fares.ps1 (Merge-Ryanair runs per airport before
# the file is written) and by patch-ryanair.ps1 (adds the feed to the
# airport files already on disk). Every failure is a warning, never a
# stopped build: if Ryanair says no, the airport file is simply what the
# Travelpayouts cache gave us, as before.
#
# Option shape stays {d, r, p, s} with one extra field, a = "FR", which
# search.js reads to send the click to ryanair.com instead of Aviasales.

$RY_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
$script:RyCalls = 0

function Ry-Log([string] $m, [string] $lvl = "INFO") {
  if (Get-Command Log -ErrorAction SilentlyContinue) { Log $m $lvl } else { Write-Host "[$lvl] $m" }
}

function Ry-Get([string] $url) {
  $delay = 2
  for ($try = 1; $try -le 3; $try++) {
    try {
      $script:RyCalls++
      $r = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = $RY_UA; "Accept" = "application/json" } -TimeoutSec 60
      Start-Sleep -Milliseconds 300
      return $r
    } catch {
      $status = $null
      try { $status = [int]$_.Exception.Response.StatusCode } catch {}
      if ($status -eq 404 -or $status -eq 400) { return $null }
      if ($try -eq 3) { Ry-Log "Ryanair gave up ($status): $url" "WARN"; return $null }
      Start-Sleep -Seconds $delay
      $delay *= 3
    }
  }
}

function Ry-Price($p) {
  return [int][math]::Round([double]$p.value, [System.MidpointRounding]::AwayFromZero)
}

# Cheapest fare per destination per week, for the next $Weeks weeks.
# The endpoint returns one fare per destination for whatever window it
# is given, so a week at a time is what turns it into a calendar.
function Get-RyanairOneWay([string] $Origin, [int] $Weeks = 32) {
  $out = @()
  $start = (Get-Date).Date.AddDays(1)
  for ($w = 0; $w -lt $Weeks; $w++) {
    $a = $start.AddDays(7 * $w); $b = $a.AddDays(6)
    $url = "https://www.ryanair.com/api/farfnd/v4/oneWayFares?departureAirportIataCode=$Origin" +
           "&outboundDepartureDateFrom=$($a.ToString('yyyy-MM-dd'))&outboundDepartureDateTo=$($b.ToString('yyyy-MM-dd'))" +
           "&market=en-gb&language=en&currency=GBP&limit=500&offset=0"
    $r = Ry-Get $url
    if (-not $r -or -not $r.fares) { continue }
    foreach ($f in $r.fares) {
      $o = $f.outbound
      if (-not $o -or -not $o.arrivalAirport -or -not $o.price -or -not $o.departureDate) { continue }
      $out += [pscustomobject]@{ dest = [string]$o.arrivalAirport.iataCode; d = ([string]$o.departureDate).Substring(0, 10); r = ""; p = (Ry-Price $o.price) }
    }
  }
  return $out
}

# Weekend breaks: out Friday or Saturday, back Sunday or Monday, one to
# three nights. Ryanair pages this sixteen at a time and answers with
# nothing at all for bigger pages, so it is walked in pages of sixteen
# over three week windows, which gives each destination up to nine
# weekends over six months rather than one.
function Get-RyanairWeekends([string] $Origin, [int] $Days = 183) {
  $out = @()
  $start = (Get-Date).Date.AddDays(1); $end = $start.AddDays($Days)
  $a = $start
  while ($a -lt $end) {
    $b = $a.AddDays(20); if ($b -gt $end) { $b = $end }
    for ($off = 0; $off -lt 480; $off += 16) {
      $url = "https://www.ryanair.com/api/farfnd/v4/roundTripFares?departureAirportIataCode=$Origin" +
             "&outboundDepartureDateFrom=$($a.ToString('yyyy-MM-dd'))&outboundDepartureDateTo=$($b.ToString('yyyy-MM-dd'))" +
             "&inboundDepartureDateFrom=$($a.ToString('yyyy-MM-dd'))&inboundDepartureDateTo=$($b.AddDays(3).ToString('yyyy-MM-dd'))" +
             "&durationFrom=1&durationTo=3&outboundDepartureDaysOfWeek=FRIDAY,SATURDAY&inboundDepartureDaysOfWeek=SUNDAY,MONDAY" +
             "&market=en-gb&language=en&currency=GBP&limit=16&offset=$off"
      $r = Ry-Get $url
      $n = 0
      if ($r -and $r.fares) {
        foreach ($f in $r.fares) {
          $n++
          $o = $f.outbound; $i = $f.inbound
          if (-not $o -or -not $i -or -not $f.summary -or -not $f.summary.price -or -not $o.departureDate -or -not $i.departureDate) { continue }
          $out += [pscustomobject]@{ dest = [string]$o.arrivalAirport.iataCode; d = ([string]$o.departureDate).Substring(0, 10); r = ([string]$i.departureDate).Substring(0, 10); p = (Ry-Price $f.summary.price) }
        }
      }
      if ($n -lt 16) { break }
    }
    $a = $b.AddDays(1)
  }
  return $out
}

# Folds the Ryanair fares into an airport's route list. Same dates
# already known: the cheaper price wins, and a tie goes to Ryanair so
# the click lands on the airline. Unknown destinations become new
# routes. Returns the (possibly longer) list.
function Merge-Ryanair([string] $Origin, [array] $List) {
  $fares = @()
  $before = $script:RyCalls
  try {
    $fares = @(Get-RyanairOneWay $Origin) + @(Get-RyanairWeekends $Origin)
  } catch {
    Ry-Log ("{0}: Ryanair feed failed: {1}" -f $Origin, $_.Exception.Message) "WARN"
    return $List
  }
  if (-not $fares.Count) { Ry-Log ("{0}: Ryanair returned nothing ({1} calls)" -f $Origin, ($script:RyCalls - $before)) "WARN"; return $List }

  $byDest = @{}
  foreach ($t in $List) { $byDest[[string]$t.destination] = $t }
  $added = 0; $replaced = 0; $newRoutes = 0; $weekends = 0
  foreach ($f in $fares) {
    if (-not $f.dest -or $f.dest -eq $Origin -or $f.p -le 0) { continue }
    $t = $byDest[$f.dest]
    if (-not $t) {
      $t = [pscustomobject]@{ origin = $Origin; destination = $f.dest; price = $f.p; departure = $f.d; ret = $f.r; transfers = 0; airline = "Ryanair"; flight = ""; typical = $null; options = @(); inbound = @() }
      $byDest[$f.dest] = $t
      $List += $t
      $newRoutes++
    }
    $opt = [pscustomobject]@{ d = $f.d; r = $f.r; p = $f.p; s = 0; a = "FR" }
    $key = "$($f.d)|$($f.r)"
    $existing = $null
    foreach ($o in @($t.options)) { if ("$($o.d)|$($o.r)" -eq $key) { $existing = $o; break } }
    if ($existing) {
      if ($f.p -le [int]$existing.p) {
        $t.options = @(@($t.options) | Where-Object { "$($_.d)|$($_.r)" -ne $key }) + @($opt)
        $replaced++
      }
    } else {
      $t.options = @($t.options) + @($opt)
      $added++
      if ($f.r) { $weekends++ }
    }
    if ($f.p -lt [int]$t.price) { $t.price = $f.p; $t.departure = $f.d; $t.ret = $f.r; $t.airline = "Ryanair"; $t.transfers = 0 }
  }
  Ry-Log ("{0}: Ryanair added {1} fares ({2} weekends), undercut {3}, {4} new routes, {5} calls" -f $Origin, $added, $weekends, $replaced, $newRoutes, ($script:RyCalls - $before))
  return $List
}
