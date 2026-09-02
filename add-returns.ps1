# Adds round-trip options to an existing fares.json.
# month-matrix only ever returns one-ways, so returns need prices/latest
# with one_way=false. Kept separate so it can run without re-fetching
# everything else.
$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Out     = Join-Path $RepoDir "fares.json"
$token   = (Get-Content (Join-Path $RepoDir ".token") -Raw).Trim()
$h       = @{ "X-Access-Token" = $token }

$j = Get-Content $Out -Raw | ConvertFrom-Json
$fares = @($j.fares)
Write-Host "routes: $($fares.Count)"

$added = 0; $done = 0
foreach ($f in $fares) {
  $u = "https://api.travelpayouts.com/v2/prices/latest?origin=$($f.origin)&destination=$($f.destination)&one_way=false&limit=30&period_type=year&show_to_affiliates=true&currency=gbp"
  try { $r = Invoke-RestMethod -Uri $u -Headers $h -TimeoutSec 40 } catch { $r = $null }

  if ($r -and $r.success -and $r.data) {
    $add = @()
    foreach ($d in @($r.data)) {
      if (-not $d.return_date -or [int]$d.value -le 0) { continue }
      $add += [pscustomobject]@{ d=[string]$d.depart_date; r=[string]$d.return_date; p=[int]$d.value; s=[int]$d.number_of_changes }
    }
    if ($add.Count -gt 0) {
      $existing = @(); if ($f.PSObject.Properties.Name -contains 'options' -and $f.options) { $existing = @($f.options) }
      $f | Add-Member -NotePropertyName options -NotePropertyValue (@($existing) + @($add | Sort-Object p | Select-Object -First 20)) -Force
      $added++
    }
  }
  $done++
  if ($done % 60 -eq 0) { Write-Host "  $done / $($fares.Count) (returns on $added)" }
  Start-Sleep -Milliseconds 260
}

$j.fares = $fares
[System.IO.File]::WriteAllText($Out, ($j | ConvertTo-Json -Depth 6 -Compress), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "DONE. return options added to $added routes. File: $([math]::Round((Get-Item $Out).Length/1KB,1)) KB"
