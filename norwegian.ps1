# Norwegian low fare calendar feed.
#
# norwegian.com answers a month of prices for any airport pair, one
# cheapest fare per day, including itineraries with a change in Oslo.
# Only non-stop days are kept (transitCount 0), which is also how the
# route list is found: a pair with no non-stop day in the first month
# is not a Norwegian route. Origins are the three UK airports Norwegian
# serves; destinations are their Nordic, Spanish, Canary and city-break
# network.
#
# Needs feeds-common.ps1. Merge-Norwegian is a warning, never a stopped
# build.

$NORWEGIAN_ORIGINS = @("LGW", "MAN", "EDI")
$script:NorwegianOdd = 0   # replies without a calendar, logged for the first two only
$NORWEGIAN_DESTS = @("OSL","BGO","SVG","TRD","AES","TOS","KRS","BOO","CPH","BLL","AAL","ARN","GOT","HEL","AGP","ALC","BCN","MAD","TFS","LPA","ACE","FUE","PMI","NCE","FCO","ATH","LIS","OPO","DXB","BUD","PRG","KRK","WAW")

function Get-NorwegianMonth([string] $Origin, [string] $Dest, [string] $Month) {
  $url = "https://www.norwegian.com/api/fare-calendar/calendar?adultCount=1&originAirportCode=$Origin&destinationAirportCode=$Dest&outboundDate=$Month-15&tripType=1&currencyCode=GBP&languageCode=en-GB"
  $r = Feed-Call GET $url $null $null
  $out = @()
  if (-not $r) { return $out }
  # From GitHub's runners norwegian.com started answering with something
  # other than the calendar (8 Sep 2026: every origin failed with "property
  # 'outbound' cannot be found", which under strict mode killed the whole
  # feed at the first route). Treat a reply without the calendar as "no
  # fares" and say what came back, once, so the next person can see why.
  if ($r -is [string]) {
    try { $r = $r | ConvertFrom-Json } catch {
      if ($script:NorwegianOdd -lt 2) { Feed-Log ("Norwegian {0}-{1}: reply is not JSON: {2}" -f $Origin, $Dest, $r.Substring(0, [Math]::Min(160, $r.Length))) "WARN" }
      $script:NorwegianOdd++
      return $out
    }
  }
  $ob = $r.PSObject.Properties['outbound']
  if (-not $ob -or -not $ob.Value -or -not $ob.Value.PSObject.Properties['days'] -or -not $ob.Value.days) {
    if ($script:NorwegianOdd -lt 2) {
      $peek = ""; try { $peek = (($r | ConvertTo-Json -Compress -Depth 2) -replace '\s+', ' ') } catch { $peek = [string]$r }
      Feed-Log ("Norwegian {0}-{1}: no outbound.days in reply: {2}" -f $Origin, $Dest, $peek.Substring(0, [Math]::Min(200, $peek.Length))) "WARN"
    }
    $script:NorwegianOdd++
    return $out
  }
  $today = (Get-Date).ToString("yyyy-MM-dd")
  foreach ($day in @($r.outbound.days)) {
    if ($day.isSoldOut -or -not $day.price -or [double]$day.price -le 0) { continue }
    if ($day.transitCount -and [int]$day.transitCount -gt 0) { continue }
    $d = ([string]$day.date).Substring(0, 10)
    if ($d -le $today) { continue }
    $out += [pscustomobject]@{ dest = $Dest; d = $d; p = (Feed-Pounds $day.price) }
  }
  return $out
}

function Merge-Norwegian([string] $Origin, [array] $List, [int] $Months = 6) {
  if ($NORWEGIAN_ORIGINS -notcontains $Origin) { return $List }
  $before = $script:FeedCalls
  $fares = @(); $inbound = @(); $routes = 0
  try {
    $monthList = Feed-Months $Months
    foreach ($d in $NORWEGIAN_DESTS) {
      # First month doubles as the route check: no non-stop day, no route.
      $first = Get-NorwegianMonth $Origin $d $monthList[0].month
      if (-not $first.Count) { continue }
      $routes++
      $fares += $first
      $inbound += @(Get-NorwegianMonth $d $Origin $monthList[0].month | ForEach-Object { [pscustomobject]@{ dest = $d; d = $_.d; p = $_.p } })
      for ($i = 1; $i -lt $monthList.Count; $i++) {
        $fares += @(Get-NorwegianMonth $Origin $d $monthList[$i].month)
        $inbound += @(Get-NorwegianMonth $d $Origin $monthList[$i].month | ForEach-Object { [pscustomobject]@{ dest = $d; d = $_.d; p = $_.p } })
      }
    }
  } catch {
    Feed-Log ("{0}: Norwegian feed failed: {1} at {2}" -f $Origin, $_.Exception.Message, $_.ScriptStackTrace) "WARN"
    return $List
  }
  $List = Feed-Merge $Origin $List $fares $inbound "DY" "Norwegian"
  Feed-Log ("{0}: Norwegian {1} routes, {2} calls" -f $Origin, $routes, ($script:FeedCalls - $before))
  return $List
}
