# Ryanair per-day price calendar.
#
# ryanair.ps1 takes the cheapest fare per destination per week, which
# is about 26 dates a route. Ryanair also answers, for one route and one
# month, the cheapest fare on every single day in both directions:
#   roundTripFares/MAN/ALC/cheapestPerDay?outboundMonthOfDate=2026-10-01
#     &inboundMonthOfDate=2026-10-01&currency=GBP
# One call per route per month, so every Ryanair route ends up with
# every day priced for the next four months, and the inbound side lets
# the search build a return for any dates. Runs after Merge-Ryanair
# (which is where the route list comes from) and goes through the
# shared Feed-Merge in feeds-common.ps1.

function Get-RyanairCalendar([string] $Origin, [string] $Dest, [string] $Month) {
  $url = "https://www.ryanair.com/api/farfnd/v4/roundTripFares/$Origin/$Dest/cheapestPerDay?outboundMonthOfDate=$Month-01&inboundMonthOfDate=$Month-01&currency=GBP"
  $r = Feed-Call GET $url $null $null
  $out = @(); $in = @()
  if (-not $r) { return @{ out = $out; in = $in } }
  $today = (Get-Date).ToString("yyyy-MM-dd")
  foreach ($f in @($r.outbound.fares)) {
    if ($f.soldOut -or $f.unavailable -or -not $f.price -or -not $f.price.value -or $f.price.currencyCode -ne "GBP") { continue }
    $d = [string]$f.day
    if ($d -le $today) { continue }
    $out += [pscustomobject]@{ dest = $Dest; d = $d; p = (Feed-Pounds $f.price.value); h = (Feed-Hour $f.departureDate) }
  }
  foreach ($f in @($r.inbound.fares)) {
    if ($f.soldOut -or $f.unavailable -or -not $f.price -or -not $f.price.value -or $f.price.currencyCode -ne "GBP") { continue }
    $d = [string]$f.day
    if ($d -le $today) { continue }
    $in += [pscustomobject]@{ dest = $Dest; d = $d; p = (Feed-Pounds $f.price.value); hl = (Feed-Hour $f.departureDate) }
  }
  return @{ out = $out; in = $in }
}

function Merge-RyanairCalendar([string] $Origin, [array] $List, [int] $Months = 6) {
  $before = $script:FeedCalls
  $dests = @()
  foreach ($t in $List) {
    # Strict mode in build-fares.ps1 objects to reading a property that is not there, so check first.
    if (@($t.options | Where-Object { $_.PSObject.Properties["a"] -and $_.a -eq "FR" }).Count -gt 0) { $dests += [string]$t.destination }
  }
  if (-not $dests.Count) { return $List }
  $fares = @(); $inbound = @()
  try {
    foreach ($d in $dests) {
      foreach ($m in (Feed-Months $Months)) {
        $got = Get-RyanairCalendar $Origin $d $m.month
        $fares += $got.out; $inbound += $got.in
      }
    }
  } catch {
    Feed-Log ("{0}: Ryanair calendar failed: {1} at {2}" -f $Origin, $_.Exception.Message, $_.ScriptStackTrace) "WARN"
    return $List
  }
  $List = Feed-Merge $Origin $List $fares $inbound "FR" "Ryanair"
  Feed-Log ("{0}: Ryanair calendar {1} routes, {2} calls" -f $Origin, $dests.Count, ($script:FeedCalls - $before))
  return $List
}
