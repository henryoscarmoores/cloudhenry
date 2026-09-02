<#
  Weekend pass.

  Asking prices/latest for a whole origin returns mostly midweek trips:
  about ten genuine Friday-to-Sunday breaks out of 594 rows. Asking route
  by route, with trip_duration pinned to a short break, returns far more
  per call. This walks every route and keeps only real weekends.

  Merges into fares.json alongside the existing options, so the search
  page needs no changes.
#>
$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Out     = Join-Path $RepoDir "fares.json"
$token   = (Get-Content (Join-Path $RepoDir ".token") -Raw).Trim()
$h       = @{ "X-Access-Token" = $token }

$j = Get-Content $Out -Raw | ConvertFrom-Json
$fares = @($j.fares)
Write-Host "routes: $($fares.Count)"

function Is-Weekend {
  param([datetime] $Dep, [datetime] $Ret)
  $outOk = ($Dep.DayOfWeek -eq 'Friday' -or $Dep.DayOfWeek -eq 'Saturday')
  $backOk = ($Ret.DayOfWeek -eq 'Sunday')
  $nights = ($Ret - $Dep).Days
  return ($outOk -and $backOk -and $nights -ge 1 -and $nights -le 2)
}

$done = 0; $added = 0; $routesHit = 0
foreach ($f in $fares) {
  $wk = @()
  foreach ($dur in 1, 2, 3) {
    $u = "https://api.travelpayouts.com/v2/prices/latest?origin=$($f.origin)&destination=$($f.destination)" +
         "&one_way=false&trip_duration=$dur&limit=500&period_type=year&show_to_affiliates=true&currency=gbp"
    try { $r = Invoke-RestMethod -Uri $u -Headers $h -TimeoutSec 30 } catch { $r = $null }
    if ($r -and $r.success -and $r.data) {
      foreach ($row in @($r.data)) {
        if (-not $row.return_date -or [int]$row.value -le 0) { continue }
        try {
          $dep = [datetime]::Parse($row.depart_date)
          $ret = [datetime]::Parse($row.return_date)
        } catch { continue }
        if (Is-Weekend -Dep $dep -Ret $ret) {
          $wk += [pscustomobject]@{
            d = $row.depart_date; r = $row.return_date
            p = [int]$row.value;  s = [int]$row.number_of_changes
          }
        }
      }
    }
    Start-Sleep -Milliseconds 190
  }

  if ($wk.Count -gt 0) {
    $seen = @{}; $clean = @()
    foreach ($o in ($wk | Sort-Object p)) {
      $k = "$($o.d)|$($o.r)"
      if (-not $seen.ContainsKey($k)) { $seen[$k] = $true; $clean += $o }
    }
    $existing = @()
    if ($f.PSObject.Properties.Name -contains 'options' -and $f.options) { $existing = @($f.options) }

    # Do not duplicate anything already held.
    $have = @{}
    foreach ($o in $existing) { $have["$($o.d)|$($o.r)"] = $true }
    $fresh = @($clean | Where-Object { -not $have.ContainsKey("$($_.d)|$($_.r)") })

    if ($fresh.Count -gt 0) {
      $f | Add-Member -NotePropertyName options -NotePropertyValue (@($existing) + @($fresh)) -Force
      $added += $fresh.Count
      $routesHit++
    }
  }

  $done++
  if ($done % 40 -eq 0) { Write-Host "  $done / $($fares.Count) - $added weekend fares on $routesHit routes" }
}

$j.fares = $fares
[System.IO.File]::WriteAllText($Out, ($j | ConvertTo-Json -Depth 6 -Compress), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "DONE. $added weekend fares added across $routesHit routes. File: $([math]::Round((Get-Item $Out).Length/1KB,1)) KB"
