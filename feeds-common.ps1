# Shared plumbing for the airline feeds (wizzair.ps1, norwegian.ps1,
# ryanair-calendar.ps1).
#
# Each feed returns two lists for an airport: one-way fares out of it
# ({dest, d, p, h}) and one-way fares back into it ({dest, d, p, hl}),
# where h is the earliest departure hour that day and hl the latest, when
# the airline tells us. Feed-Merge folds both into the airport's route
# list: outbound fares become options tagged with the airline code
# (a = "FR", "W6", "DY"), inbound fares go into the route's inbound list
# (which the search uses to assemble a return for any dates), and three
# kinds of pair are built here so the search's buttons have them straight
# away: weekends (Friday/Saturday out, Sunday/Monday back, 1 to 3
# nights), Christmas markets (2 to 5 nights between 15 November and 24
# December to the market cities) and extreme day trips (out before 9am,
# back after 5pm the same day).
#
# ryanair.ps1 predates this file and keeps its own copy of the same
# idea; nothing here changes it.

$FEED_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
$script:FeedCalls = 0

# Same list as XMAS in search.js. Change both or neither.
$FEED_XMAS = @{ PRG=1; BER=1; VIE=1; BUD=1; KRK=1; CPH=1; HAM=1; CGN=1; DUS=1; FRA=1; AMS=1; BRU=1; GDN=1; WAW=1; RIX=1; VNO=1; HEL=1; OSL=1; GVA=1; MIL=1; VCE=1; ROM=1; NYC=1; BOS=1; YTO=1; TLL=1 }
$FEED_XMAS_FROM = "2026-11-15"; $FEED_XMAS_TO = "2026-12-24"

function Feed-Log([string] $m, [string] $lvl = "INFO") {
  if (Get-Command Log -ErrorAction SilentlyContinue) { Log $m $lvl } else { Write-Host "[$lvl] $m" }
}

# Some airline sites (Norwegian for one) refuse PowerShell's web client
# outright with a 403 while answering Windows' own curl.exe, which ships
# with Windows 10 and with GitHub's Windows runners. So a 403 from the
# first call switches that host to curl.exe for the rest of the run.
$script:FeedUseCurl = @{}
$script:CurlExe = Join-Path $env:SystemRoot "System32\curl.exe"

function Feed-Curl([string] $Method, [string] $Url, $Body, [hashtable] $h) {
  $curlArgs = @("-s", "--max-time", "60", "-X", $Method)
  foreach ($k in $h.Keys) { $curlArgs += @("-H", ($k + ": " + $h[$k])) }
  if ($Body) { $curlArgs += @("-H", "Content-Type: application/json", "--data-binary", "@-") }
  $curlArgs += $Url
  $out = if ($Body) { $Body | & $script:CurlExe @curlArgs } else { & $script:CurlExe @curlArgs }
  $text = ($out -join "`n").Trim()
  if (-not $text) { return $null }
  if ($text.StartsWith("{") -or $text.StartsWith("[")) { return ($text | ConvertFrom-Json) }
  return $text
}

function Feed-Call([string] $Method, [string] $Url, $Body, [hashtable] $Headers) {
  $h = @{ "User-Agent" = $FEED_UA; "Accept" = "application/json" }
  if ($Headers) { foreach ($k in $Headers.Keys) { $h[$k] = $Headers[$k] } }
  $hostName = ([uri]$Url).Host
  $delay = 2
  for ($try = 1; $try -le 4; $try++) {
    try {
      $script:FeedCalls++
      if ($script:FeedUseCurl[$hostName] -and (Test-Path $script:CurlExe)) {
        $r = Feed-Curl $Method $Url $Body $h
      } elseif ($Body) { $r = Invoke-RestMethod -Method $Method -Uri $Url -Headers $h -ContentType "application/json" -Body $Body -TimeoutSec 60 }
      else { $r = Invoke-RestMethod -Method $Method -Uri $Url -Headers $h -TimeoutSec 60 }
      Start-Sleep -Milliseconds 400
      return $r
    } catch {
      $status = $null
      try { $status = [int]$_.Exception.Response.StatusCode } catch {}
      if ($status -eq 404 -or $status -eq 400) { return $null }
      if ($status -eq 403 -and -not $script:FeedUseCurl[$hostName] -and (Test-Path $script:CurlExe)) {
        Feed-Log "$hostName refused PowerShell's web client, switching to curl.exe"
        $script:FeedUseCurl[$hostName] = $true
        continue
      }
      if ($try -eq 4) { Feed-Log "Feed gave up ($status): $Url" "WARN"; return $null }
      # 503 and 429 mean "slow down" (Wizz throttles a fast run), so wait
      # properly rather than hammering: 10s, 30s, 90s.
      if ($status -eq 503 -or $status -eq 429) { Start-Sleep -Seconds (10 * [math]::Pow(3, $try - 1)) }
      else { Start-Sleep -Seconds $delay; $delay *= 3 }
    }
  }
}

function Feed-Pounds($amount) {
  return [int][math]::Round([double]$amount, [System.MidpointRounding]::AwayFromZero)
}

# Hour of day from an ISO timestamp like 2026-10-04T18:55:00, or -1.
function Feed-Hour($iso) {
  $s = [string]$iso
  if ($s.Length -ge 13 -and $s[10] -eq 'T') { try { return [int]$s.Substring(11, 2) } catch { return -1 } }
  return -1
}

function Feed-IsWeekend([datetime] $dep, [datetime] $ret) {
  $n = ($ret - $dep).Days
  return ($n -ge 1 -and $n -le 3 -and
    ($dep.DayOfWeek -eq 'Friday' -or $dep.DayOfWeek -eq 'Saturday') -and
    ($ret.DayOfWeek -eq 'Sunday' -or $ret.DayOfWeek -eq 'Monday'))
}

# The months to ask for: the rest of this month from tomorrow, then the
# next $Months whole months. Returns @{from; to; month} as yyyy-MM-dd.
function Feed-Months([int] $Months = 5) {
  $out = @()
  $start = (Get-Date).Date.AddDays(1)
  $first = $start.AddDays(1 - $start.Day)
  for ($i = 0; $i -le $Months; $i++) {
    $m = $first.AddMonths($i)
    $a = if ($i -eq 0) { $start } else { $m }
    $b = $m.AddMonths(1).AddDays(-1)
    $out += [pscustomobject]@{ from = $a.ToString("yyyy-MM-dd"); to = $b.ToString("yyyy-MM-dd"); month = $m.ToString("yyyy-MM") }
  }
  return $out
}

# $Fares: one-way fares out of $Origin ({dest, d, p, [h]}); $Inbound:
# one-way fares from dest back to $Origin ({dest, d, p, [hl]}). $Code is
# the airline's IATA code, $Name its display name for the log.
function Feed-Merge([string] $Origin, [array] $List, [array] $Fares, [array] $Inbound, [string] $Code, [string] $Name) {
  if (-not $Fares.Count -and -not $Inbound.Count) { Feed-Log ("{0}: {1} returned nothing" -f $Origin, $Name) "WARN"; return $List }
  $byDest = @{}
  foreach ($t in $List) { $byDest[[string]$t.destination] = $t }

  # Cheapest inbound per destination per date, with the latest hour seen.
  $inByDest = @{}
  foreach ($i in $Inbound) {
    if (-not $i.dest -or -not $i.d -or $i.p -le 0) { continue }
    if (-not $inByDest.ContainsKey($i.dest)) { $inByDest[$i.dest] = @{} }
    $hl = if ($i.PSObject.Properties['hl']) { [int]$i.hl } else { -1 }
    $cur = $inByDest[$i.dest][$i.d]
    if (-not $cur) { $inByDest[$i.dest][$i.d] = @{ p = [int]$i.p; hl = $hl } }
    else { if ($i.p -lt $cur.p) { $cur.p = [int]$i.p }; if ($hl -gt $cur.hl) { $cur.hl = $hl } }
  }

  $all = @()
  foreach ($f in $Fares) {
    if ($f.dest -and $f.d -and $f.p -gt 0) {
      $h = if ($f.PSObject.Properties['h']) { [int]$f.h } else { -1 }
      $all += [pscustomobject]@{ dest = $f.dest; d = $f.d; r = ""; p = [int]$f.p; c = 0; x = 0; h = $h }
    }
  }
  $outByDest = @{}
  foreach ($f in $all) { if (-not $outByDest.ContainsKey($f.dest)) { $outByDest[$f.dest] = @() }; $outByDest[$f.dest] += $f }

  # Pairs from the singles, cheapest first. The caps are per month, not
  # per route: a flat forty per route let cheap autumn weekends crowd out
  # January and February entirely (a Birmingham reader found one January
  # route on 6 Sep 2026). Twelve weekends and ten day trips a month per
  # route is every weekend with room to spare; Christmas stays at forty.
  $weekends = 0; $xmas = 0; $days = 0
  foreach ($dest in @($outByDest.Keys)) {
    if (-not $inByDest.ContainsKey($dest)) { continue }
    $ins = $inByDest[$dest]
    $isXmasDest = $FEED_XMAS.ContainsKey($dest)
    $nW = @{}; $nD = @{}; $nX = 0
    foreach ($o in ($outByDest[$dest] | Sort-Object { $_.p })) {
      $dep = [datetime]::ParseExact($o.d, "yyyy-MM-dd", $null)
      $mon = $o.d.Substring(0, 7)
      if (-not $nW.ContainsKey($mon)) { $nW[$mon] = 0; $nD[$mon] = 0 }
      # Day trip: same date, early out, late back.
      if ($nD[$mon] -lt 10 -and $o.h -ge 0 -and $o.h -le 9 -and $ins.ContainsKey($o.d) -and $ins[$o.d].hl -ge 17) {
        $all += [pscustomobject]@{ dest = $dest; d = $o.d; r = $o.d; p = ($o.p + $ins[$o.d].p); c = 1; x = 1; h = -1 }
        $nD[$mon]++; $days++
      }
      $maxN = if ($isXmasDest) { 5 } else { 3 }
      foreach ($n in 1..$maxN) {
        $back = $dep.AddDays($n); $rk = $back.ToString("yyyy-MM-dd")
        if (-not $ins.ContainsKey($rk)) { continue }
        $isW = ($n -le 3) -and (Feed-IsWeekend $dep $back)
        $isX = $isXmasDest -and $n -ge 2 -and $o.d -ge $FEED_XMAS_FROM -and $o.d -le $FEED_XMAS_TO
        if (($isW -and $nW[$mon] -lt 12) -or ($isX -and $nX -lt 40)) {
          $all += [pscustomobject]@{ dest = $dest; d = $o.d; r = $rk; p = ($o.p + $ins[$rk].p); c = 1; x = 0; h = -1 }
          if ($isW) { $nW[$mon]++; $weekends++ }
          if ($isX) { $nX++; $xmas++ }
        }
      }
    }
  }

  $added = 0; $replaced = 0; $newRoutes = 0
  foreach ($f in $all) {
    if ($f.dest -eq $Origin) { continue }
    $t = $byDest[$f.dest]
    if (-not $t) {
      $t = [pscustomobject]@{ origin = $Origin; destination = $f.dest; price = $f.p; departure = $f.d; ret = $f.r; transfers = 0; airline = $Name; flight = ""; typical = $null; options = @(); inbound = @() }
      $byDest[$f.dest] = $t
      $List += $t
      $newRoutes++
    }
    $opt = [ordered]@{ d = $f.d; r = $f.r; p = $f.p; s = 0 }
    if ($f.c) { $opt.c = 1 }
    if ($f.x) { $opt.x = 1 }
    $opt.a = $Code
    $opt = [pscustomobject]$opt
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
    }
    if ($f.p -lt [int]$t.price) { $t.price = $f.p; $t.departure = $f.d; $t.ret = $f.r; $t.airline = $Name; $t.transfers = 0 }
  }

  # Inbound singles onto the route, cheapest per date, so the search can
  # build a return for any dates the reader picks.
  $inboundAdded = 0
  foreach ($dest in @($inByDest.Keys)) {
    $t = $byDest[$dest]
    if (-not $t) { continue }
    if (-not $t.PSObject.Properties['inbound']) { $t | Add-Member -NotePropertyName inbound -NotePropertyValue @() }
    $have = @{}
    foreach ($x in @($t.inbound)) { if ($x -and $x.d) { $have[[string]$x.d] = $x } }
    foreach ($k in $inByDest[$dest].Keys) {
      $p = $inByDest[$dest][$k].p
      if (-not $have.ContainsKey($k) -or $p -lt [int]$have[$k].p) { $have[$k] = [pscustomobject]@{ d = $k; p = $p; s = 0 }; $inboundAdded++ }
    }
    $t.inbound = @($have.Keys | Sort-Object | ForEach-Object { $have[$_] })
  }

  Feed-Log ("{0}: {1} added {2} fares ({3} weekends, {4} Christmas, {5} day trips), undercut {6}, {7} new routes, {8} inbound dates" -f $Origin, $Name, $added, $weekends, $xmas, $days, $replaced, $newRoutes, $inboundAdded)
  return $List
}
