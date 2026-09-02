<#
.SYNOPSIS
  One command that refreshes CloudHenry's fares end to end.

.DESCRIPTION
  Runs the whole chain in the right order:

    1. fetch-fares.ps1   -> city-directions for 12 airports, then the
                            month matrix for dated one-way options
    2. add-returns.ps1   -> round trips, which the month matrix never
                            returns (it always comes back one-way)
    3. commit + push     -> GitHub
    4. purge the CDN     -> so the site sees it now rather than in hours

  Written to be run unattended by Task Scheduler. It logs everything,
  never pushes an empty or shrunken file, and exits non-zero on failure
  so a failed run is visible rather than silent.
#>

[CmdletBinding()]
param(
  [switch] $SkipPush
)

$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Log     = Join-Path $RepoDir "daily-refresh.log"
$Fares   = Join-Path $RepoDir "fares.json"

function Log {
  param([string] $M, [string] $L = "INFO")
  $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $L, $M
  Write-Host $line
  Add-Content -Path $Log -Value $line -Encoding utf8
}

try {
  Log "=== daily refresh starting ==="

  # Keep the previous file so a bad run can be compared against it.
  $before = 0
  if (Test-Path $Fares) {
    $before = (Get-Item $Fares).Length
    Copy-Item $Fares "$Fares.prev" -Force
  }
  Log "previous fares.json: $before bytes"

  # --- 1. one-way fares and dated options ------------------------------
  Log "step 1: fetching fares"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoDir "fetch-fares.ps1") -DryRun -AllRoutes -MonthsAhead 4 -SkipReturns
  if ($LASTEXITCODE -ne 0) { throw "fetch-fares.ps1 exited $LASTEXITCODE" }

  # --- 2. round trips ---------------------------------------------------
  Log "step 2: adding return trips"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoDir "add-returns.ps1")
  if ($LASTEXITCODE -ne 0) { throw "add-returns.ps1 exited $LASTEXITCODE" }

  # --- 2b. weekend breaks -----------------------------------------------
  # Asking per route with a short trip_duration finds far more genuine
  # Friday-to-Sunday breaks than asking per origin: 366 extra fares
  # against roughly 40 the other way.
  Log "step 2b: weekend breaks"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoDir "add-weekends.ps1")
  if ($LASTEXITCODE -ne 0) { throw "add-weekends.ps1 exited $LASTEXITCODE" }

  # --- 3. sanity check before anything is published ---------------------
  if (-not (Test-Path $Fares)) { throw "fares.json is missing after the run" }
  $after = (Get-Item $Fares).Length
  Log "new fares.json: $after bytes"

  $data = Get-Content $Fares -Raw | ConvertFrom-Json
  $count = @($data.fares).Count
  Log "routes: $count"

  if ($count -lt 100) { throw "only $count routes - refusing to publish a thin file" }
  if ($before -gt 0 -and $after -lt ($before * 0.5)) {
    throw "new file is less than half the previous size ($after vs $before) - refusing to publish"
  }

  if ($SkipPush) { Log "SkipPush set - stopping before publish"; exit 0 }

  # --- 4. publish -------------------------------------------------------
  Push-Location $RepoDir
  try {
    git add fares.json history.json | Out-Null
    $changed = git status --porcelain fares.json history.json
    if ([string]::IsNullOrWhiteSpace($changed)) {
      Log "no change since the last run - nothing to publish"
      exit 0
    }

    $msgFile = Join-Path $env:TEMP "ch-daily-msg.txt"
    Set-Content -Path $msgFile -Encoding utf8 -Value @(
      "Refresh fares $(Get-Date -Format 'yyyy-MM-dd')",
      "",
      "$count routes across 12 UK airports.",
      "",
      "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
    )

    git commit -F $msgFile | Out-Null
    git push origin main | Out-Null
    Log "pushed"
  } finally {
    Pop-Location
  }

  try {
    Invoke-WebRequest -Uri "https://purge.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/fares.json" -UseBasicParsing -TimeoutSec 60 | Out-Null
    Log "CDN purged"
  } catch {
    Log "CDN purge failed; it will refresh on its own within about 12 hours" "WARN"
  }

  Log "=== done ==="
  exit 0
}
catch {
  Log ("FAILED: " + $_.Exception.Message) "ERROR"
  # Put the last good file back so the site keeps serving something valid.
  if (Test-Path "$Fares.prev") {
    Copy-Item "$Fares.prev" $Fares -Force
    Log "restored the previous fares.json" "WARN"
  }
  exit 1
}
