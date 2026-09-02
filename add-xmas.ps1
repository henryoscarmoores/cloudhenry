<#
  Christmas market pass.

  Nothing in the daily job was asking for the Christmas window, so the
  Christmas Markets tab had only what happened to turn up by accident:
  45 trips nationwide. prices/latest accepts beginning_of_period with
  period_type=month, so November and December can be requested directly,
  route by route, the same way the weekend pass works.

  Only queries routes to cities that actually hold Christmas markets,
  which keeps it to a few hundred calls rather than a few thousand.
#>
$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Out     = Join-Path $RepoDir "fares.json"
$token   = (Get-Content (Join-Path $RepoDir ".token") -Raw).Trim()
$h       = @{ "X-Access-Token" = $token }

# Cities with a genuine Christmas market, plus the North American ones
# people ask for.
$XMAS = @{
  PRG=1; BER=1; VIE=1; BUD=1; KRK=1; CPH=1; HAM=1; CGN=1; DUS=1; FRA=1
  AMS=1; BRU=1; GDN=1; WAW=1; RIX=1; VNO=1; HEL=1; OSL=1; GVA=1; MIL=1
  VCE=1; ROM=1; NYC=1; BOS=1; YTO=1; TLL=1; MUC=1; STR=1; ZRH=1; SZG=1
}

$WindowStart = [datetime]::Parse("2026-11-15")
$WindowEnd   = [datetime]::Parse("2026-12-24")

$j = Get-Content $Out -Raw | ConvertFrom-Json
$fares = @($j.fares)
$targets = @($fares | Where-Object { $XMAS.ContainsKey($_.destination) })
Write-Host "market routes to query: $($targets.Count) of $($fares.Count)"

$added = 0; $done = 0; $routesHit = 0
foreach ($f in $targets) {
  $found = @()
  foreach ($month in "2026-11-01", "2026-12-01") {
    $u = "https://api.travelpayouts.com/v2/prices/latest?origin=$($f.origin)&destination=$($f.destination)" +
         "&one_way=false&beginning_of_period=$month&period_type=month&limit=500" +
         "&show_to_affiliates=true&currency=gbp"
    try { $r = Invoke-RestMethod -Uri $u -Headers $h -TimeoutSec 30 } catch { $r = $null }

    if ($r -and $r.success -and $r.data) {
      foreach ($row in @($r.data)) {
        if (-not $row.return_date -or [int]$row.value -le 0) { continue }
        try {
          $dep = [datetime]::Parse($row.depart_date)
          $ret = [datetime]::Parse($row.return_date)
        } catch { continue }
        if ($dep -lt $WindowStart -or $dep -gt $WindowEnd) { continue }
        $nights = ($ret - $dep).Days
        if ($nights -lt 2 -or $nights -gt 5) { continue }
        $found += [pscustomobject]@{
          d = $row.depart_date; r = $row.return_date
          p = [int]$row.value;  s = [int]$row.number_of_changes
        }
      }
    }
    Start-Sleep -Milliseconds 190
  }

  if ($found.Count -gt 0) {
    $existing = @()
    if ($f.PSObject.Properties.Name -contains 'options' -and $f.options) { $existing = @($f.options) }
    $have = @{}
    foreach ($o in $existing) { $have["$($o.d)|$($o.r)"] = $true }

    $fresh = @()
    foreach ($o in ($found | Sort-Object p)) {
      $k = "$($o.d)|$($o.r)"
      if (-not $have.ContainsKey($k)) { $have[$k] = $true; $fresh += $o }
    }
    if ($fresh.Count -gt 0) {
      $f | Add-Member -NotePropertyName options -NotePropertyValue (@($existing) + @($fresh)) -Force
      $added += $fresh.Count
      $routesHit++
    }
  }

  $done++
  if ($done % 25 -eq 0) { Write-Host "  $done / $($targets.Count) - $added found on $routesHit routes" }
}

$j.fares = $fares
[System.IO.File]::WriteAllText($Out, ($j | ConvertTo-Json -Depth 6 -Compress), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "DONE. $added Christmas window fares added across $routesHit routes."
