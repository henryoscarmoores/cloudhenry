# Shared plumbing for the airline feeds (wizzair.ps1, norwegian.ps1).
#
# Each feed returns two lists for an airport: one-way fares out of it
# ({dest, d, p}) and one-way fares back into it ({dest, d, p}). Feed-Merge
# folds both into the airport's route list: outbound fares become
# options tagged with the airline code (a = "W6", "DY"), inbound fares go
# into the route's inbound list (which the search uses to assemble a
# return for any dates), and Friday/Saturday out, Sunday/Monday back
# pairs are built here so the weekend view has them straight away.
#
# ryanair.ps1 predates this file and keeps its own copy of the same
# idea; nothing here changes it.

$FEED_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
$script:FeedCalls = 0

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

function Feed-IsWeekend([datetime] $dep, [datetime] $ret) {
  $n = ($ret - $dep).Days
  return ($n -ge 1 -and $n -le 3 -and
    ($dep.DayOfWeek -eq 'Friday' -or $dep.DayOfWeek -eq 'Saturday') -and
    ($ret.DayOfWeek -eq 'Sunday' -or $ret.DayOfWeek -eq 'Monday'))
}

# The months to ask for: the rest of this month from tomorrow, then the
# next $Months whole months. Returns @{from; to} pairs as yyyy-MM-dd.
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

# $Fares: one-way fares out of $Origin ({dest, d, p}); $Inbound: one-way
# fares from dest back to $Origin ({dest, d, p}). $Code is the airline's
# IATA code, $Name its display name for the log.
function Feed-Merge([string] $Origin, [array] $List, [array] $Fares, [array] $Inbound, [string] $Code, [string] $Name) {
  if (-not $Fares.Count -and -not $Inbound.Count) { Feed-Log ("{0}: {1} returned nothing" -f $Origin, $Name) "WARN"; return $List }
  $byDest = @{}
  foreach ($t in $List) { $byDest[[string]$t.destination] = $t }

  # Cheapest inbound per destination per date.
  $inByDest = @{}
  foreach ($i in $Inbound) {
    if (-not $i.dest -or -not $i.d -or $i.p -le 0) { continue }
    if (-not $inByDest.ContainsKey($i.dest)) { $inByDest[$i.dest] = @{} }
    if (-not $inByDest[$i.dest].ContainsKey($i.d) -or $i.p -lt $inByDest[$i.dest][$i.d]) { $inByDest[$i.dest][$i.d] = [int]$i.p }
  }

  # Weekend pairs from the singles, cheapest first, at most 40 a route.
  $all = @()
  foreach ($f in $Fares) { if ($f.dest -and $f.d -and $f.p -gt 0) { $all += [pscustomobject]@{ dest = $f.dest; d = $f.d; r = ""; p = [int]$f.p; c = 0 } } }
  $outByDest = @{}
  foreach ($f in $all) { if (-not $outByDest.ContainsKey($f.dest)) { $outByDest[$f.dest] = @() }; $outByDest[$f.dest] += $f }
  $pairs = 0
  foreach ($dest in @($outByDest.Keys)) {
    if (-not $inByDest.ContainsKey($dest)) { continue }
    $count = 0
    foreach ($o in ($outByDest[$dest] | Sort-Object { $_.p })) {
      $dep = [datetime]::ParseExact($o.d, "yyyy-MM-dd", $null)
      foreach ($n in 1..3) {
        $back = $dep.AddDays($n); $rk = $back.ToString("yyyy-MM-dd")
        if ($inByDest[$dest].ContainsKey($rk) -and (Feed-IsWeekend $dep $back)) {
          $all += [pscustomobject]@{ dest = $dest; d = $o.d; r = $rk; p = ($o.p + $inByDest[$dest][$rk]); c = 1 }
          $count++; $pairs++
        }
      }
      if ($count -ge 40) { break }
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
    if ($f.c) { $opt = [pscustomobject]@{ d = $f.d; r = $f.r; p = $f.p; s = 0; c = 1; a = $Code } }
    else { $opt = [pscustomobject]@{ d = $f.d; r = $f.r; p = $f.p; s = 0; a = $Code } }
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
      $p = $inByDest[$dest][$k]
      if (-not $have.ContainsKey($k) -or $p -lt [int]$have[$k].p) { $have[$k] = [pscustomobject]@{ d = $k; p = $p; s = 0 }; $inboundAdded++ }
    }
    $t.inbound = @($have.Keys | Sort-Object | ForEach-Object { $have[$_] })
  }

  Feed-Log ("{0}: {1} added {2} fares ({3} weekend pairs), undercut {4}, {5} new routes, {6} inbound dates" -f $Origin, $Name, $added, $pairs, $replaced, $newRoutes, $inboundAdded)
  return $List
}
