# Wizz Air timetable feed.
#
# Wizz's own site asks be.wizzair.com for a month of prices per route,
# both directions, one cheapest fare per day with the departure times.
# The API version moves; the current one is embedded in the home page
# (www.wizzair.com/en-gb), so it is read fresh each run. Routes come
# from the site's map (asset/map): the connections listed for each of
# our airports. Luton alone has close to eighty.
#
# Needs feeds-common.ps1. Merge-Wizz is a warning, never a stopped
# build: if Wizz says no, the airport file is what it was.

function Get-WizzBase {
  if ($script:WizzBase) { return $script:WizzBase }
  # The old /buildnumber page now 404s; the home page carries the same string.
  $html = Feed-Call GET "https://www.wizzair.com/en-gb" $null @{ "Accept" = "text/html" }
  $m = [regex]::Match([string]$html, 'https://be\.wizzair\.com/[0-9.]+/Api')
  if (-not $m.Success) { return $null }
  $script:WizzBase = $m.Value
  return $script:WizzBase
}

$WIZZ_HEADERS = @{ "Origin" = "https://www.wizzair.com"; "Referer" = "https://www.wizzair.com/" }
# build-fares.ps1 runs in strict mode, which refuses to read a variable that was never set.
$script:WizzBase = $null
$script:WizzMap = $null

# Destinations Wizz flies from an airport, from the route map.
function Get-WizzDestinations([string] $Origin) {
  $base = Get-WizzBase
  if (-not $base) { return @() }
  if (-not $script:WizzMap) { $script:WizzMap = Feed-Call GET "$base/asset/map?languageCode=en-gb" $null $WIZZ_HEADERS }
  if (-not $script:WizzMap -or -not $script:WizzMap.cities) { return @() }
  $city = $script:WizzMap.cities | Where-Object { $_.iata -eq $Origin } | Select-Object -First 1
  if (-not $city) { return @() }
  # The map lists metropolitan codes (ROM, LON) beside the real airports;
  # only airports are wanted, so anything that is some city's mac is dropped.
  $macs = @{}
  foreach ($c in $script:WizzMap.cities) { if ($c.mac) { $macs[[string]$c.mac] = 1 } }
  return @($city.connections | ForEach-Object { [string]$_.iata } | Where-Object { $_ -and $_ -ne $Origin -and -not $macs.ContainsKey($_) } | Sort-Object -Unique)
}

# One route, one month, both directions. Days Wizz has not priced yet
# come back as priceType "checkPrice" with no amount; those are skipped.
function Get-WizzMonth([string] $Origin, [string] $Dest, [string] $From, [string] $To) {
  $base = Get-WizzBase
  $body = @{ flightList = @(
      @{ departureStation = $Origin; arrivalStation = $Dest; from = $From; to = $To },
      @{ departureStation = $Dest; arrivalStation = $Origin; from = $From; to = $To }
    ); priceType = "regular"; adultCount = 1; childCount = 0; infantCount = 0 } | ConvertTo-Json -Depth 5 -Compress
  $r = Feed-Call POST "$base/search/timetable" $body $WIZZ_HEADERS
  Start-Sleep -Milliseconds 700   # Wizz throttles a fast run with 503s; a slower one sails through
  $out = @(); $in = @()
  if (-not $r) { return @{ out = $out; in = $in } }
  # departureDates lists every flight that day; the earliest out and the
  # latest back are what make a day trip possible.
  foreach ($f in @($r.outboundFlights)) {
    if (-not $f.price -or -not $f.price.amount -or $f.price.currencyCode -ne "GBP") { continue }
    $hours = @(@($f.departureDates) | ForEach-Object { Feed-Hour $_ } | Where-Object { $_ -ge 0 })
    $h = if ($hours.Count) { ($hours | Measure-Object -Minimum).Minimum } else { -1 }
    $out += [pscustomobject]@{ dest = $Dest; d = ([string]$f.departureDate).Substring(0, 10); p = (Feed-Pounds $f.price.amount); h = $h }
  }
  foreach ($f in @($r.returnFlights)) {
    if (-not $f.price -or -not $f.price.amount -or $f.price.currencyCode -ne "GBP") { continue }
    $hours = @(@($f.departureDates) | ForEach-Object { Feed-Hour $_ } | Where-Object { $_ -ge 0 })
    $hl = if ($hours.Count) { ($hours | Measure-Object -Maximum).Maximum } else { -1 }
    $in += [pscustomobject]@{ dest = $Dest; d = ([string]$f.departureDate).Substring(0, 10); p = (Feed-Pounds $f.price.amount); hl = $hl }
  }
  return @{ out = $out; in = $in }
}

function Merge-Wizz([string] $Origin, [array] $List, [int] $Months = 6) {
  $before = $script:FeedCalls
  $fares = @(); $inbound = @()
  try {
    $dests = @(Get-WizzDestinations $Origin)   # @() so an airport Wizz skips (BOH, CWL) is an empty list, not $null
    if (-not $dests.Count) { Feed-Log ("{0}: Wizz Air flies nowhere from here (or the map was unreachable)" -f $Origin); return $List }
    $n = 0
    foreach ($d in $dests) {
      foreach ($m in (Feed-Months $Months)) {
        $got = Get-WizzMonth $Origin $d $m.from $m.to
        $fares += $got.out; $inbound += $got.in
      }
      $n++
      if ($n % 10 -eq 0) { Feed-Log ("{0}: Wizz Air {1} of {2} routes, {3} fares so far" -f $Origin, $n, $dests.Count, $fares.Count) }
    }
  } catch {
    Feed-Log ("{0}: Wizz Air feed failed: {1} at {2}" -f $Origin, $_.Exception.Message, $_.ScriptStackTrace) "WARN"
    return $List
  }
  $List = Feed-Merge $Origin $List $fares $inbound "W6" "Wizz Air"
  Feed-Log ("{0}: Wizz Air {1} routes, {2} calls" -f $Origin, $dests.Count, ($script:FeedCalls - $before))
  return $List
}
