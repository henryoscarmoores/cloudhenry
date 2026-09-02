<#
.SYNOPSIS
  Pulls CloudHenry fares from Travelpayouts and publishes them as a static
  JSON file the search page can read from the CDN.

.DESCRIPTION
  The API key never leaves this machine. The page only ever reads the
  finished fares.json, so nothing secret is ever public.

  Flow:  Travelpayouts  ->  fares.json  ->  git push  ->  jsDelivr  ->  page

  Travelpayouts serves cached data and recommends using it to build static
  pages, which is exactly what this does.

.PARAMETER Inspect
  Fetch one airport, print the raw response shape, write nothing. Run this
  first -- the field names in the response decide the mapping below, and
  guessing them is how this kind of script quietly produces empty output.

.PARAMETER DryRun
  Do everything except commit and push. Writes fares.json locally so you
  can look at it.

.PARAMETER SkipMonthMatrix
  Skip the per-route month lookups. Much faster and far fewer API calls,
  but no "usual price", so no deal score on this run.

.EXAMPLE
  .\fetch-fares.ps1 -Inspect
  .\fetch-fares.ps1 -DryRun
  .\fetch-fares.ps1
#>

[CmdletBinding()]
param(
  [switch] $Inspect,
  [switch] $DryRun,
  [switch] $SkipMonthMatrix,
  [int]    $TopRoutesPerOrigin = 12,
  [int]    $MonthsAhead = 2,
  [int]    $MaxOptionsPerRoute = 24,
  [switch] $AllRoutes,
  [string] $Currency = "gbp"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# ---------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------
$RepoDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$TokenFile  = Join-Path $RepoDir ".token"
$OutFile    = Join-Path $RepoDir "fares.json"
$HistFile   = Join-Path $RepoDir "history.json"
$LogFile    = Join-Path $RepoDir "fetch-fares.log"

$ORIGINS = @("MAN","BHX","LBA","STN","LTN","BRS","NCL","GLA","EDI","LGW","LPL","BFS")

$API = "https://api.travelpayouts.com"

# ---------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------
function Log {
  param([string] $Message, [string] $Level = "INFO")
  $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

# ---------------------------------------------------------------------
# Token -- read from a gitignored file, never hardcoded, never logged
# ---------------------------------------------------------------------
function Get-Token {
  if (-not (Test-Path $TokenFile)) {
    throw "No token file. Create $TokenFile containing only your Travelpayouts API token (one line, nothing else). It is gitignored and will not be committed."
  }
  $t = (Get-Content $TokenFile -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($t)) { throw "$TokenFile is empty." }
  if ($t.Length -lt 16) { throw "Token in $TokenFile looks too short to be valid." }
  return $t
}

# ---------------------------------------------------------------------
# HTTP with retry. Travelpayouts rate-limits; back off rather than hammer.
# ---------------------------------------------------------------------
function Invoke-TP {
  param([string] $Path, [hashtable] $Query, [string] $Token)

  $pairs = @()
  foreach ($k in $Query.Keys) {
    $pairs += ("{0}={1}" -f $k, [uri]::EscapeDataString([string]$Query[$k]))
  }
  $url = "$API$Path`?" + ($pairs -join "&")

  $attempt = 0
  while ($true) {
    $attempt++
    try {
      # Token goes in the header, so it never appears in a URL or a log line.
      return Invoke-RestMethod -Uri $url -Headers @{ "X-Access-Token" = $Token } -TimeoutSec 40
    } catch {
      $status = $null
      if ($_.Exception.PSObject.Properties.Name -contains "Response" -and $_.Exception.Response) {
        try { $status = [int]$_.Exception.Response.StatusCode } catch { $status = $null }
      }
      if ($attempt -ge 4) {
        Log ("Gave up on {0} after {1} attempts (status {2})" -f $Path, $attempt, $status) "ERROR"
        return $null
      }
      $wait = [math]::Pow(2, $attempt)
      Log ("{0} failed (status {1}); retrying in {2}s" -f $Path, $status, $wait) "WARN"
      Start-Sleep -Seconds $wait
    }
  }
}

# ---------------------------------------------------------------------
# Inspect mode -- look before mapping
# ---------------------------------------------------------------------
if ($Inspect) {
  $token = Get-Token
  Log "Inspect: fetching city-directions for MAN"
  $r = Invoke-TP -Path "/v1/city-directions" -Query @{ origin = "MAN"; currency = $Currency } -Token $token
  if ($null -eq $r) { Log "No response." "ERROR"; exit 1 }

  "";"success : $($r.success)"
  if ($r.PSObject.Properties.Name -contains "error" -and $r.error) { "error   : $($r.error)" }

  $data = $r.data
  $keys = @($data.PSObject.Properties.Name)
  "destinations returned : $($keys.Count)"
  if ($keys.Count -gt 0) {
    $first = $keys[0]
    "";"first destination key : $first"
    "fields on that entry  :"
    $data.$first.PSObject.Properties | ForEach-Object { "   {0,-22} = {1}" -f $_.Name, $_.Value }
  }
  "";"Map these field names into Build-Row below, then run with -DryRun."
  exit 0
}

# ---------------------------------------------------------------------
# Field mapping. Adjust after -Inspect if the names differ.
# ---------------------------------------------------------------------
function Get-Field {
  param($Obj, [string[]] $Names, $Default = $null)
  foreach ($n in $Names) {
    if ($Obj.PSObject.Properties.Name -contains $n) {
      $v = $Obj.$n
      if ($null -ne $v -and "$v" -ne "") { return $v }
    }
  }
  return $Default
}

function Build-Row {
  param([string] $Origin, [string] $Dest, $Entry)
  [pscustomobject]@{
    origin      = $Origin
    destination = $Dest
    price       = [int](Get-Field $Entry @("price","value") 0)
    departure   = [string](Get-Field $Entry @("departure_at","depart_date") "")
    ret         = [string](Get-Field $Entry @("return_at","return_date") "")
    transfers   = [int](Get-Field $Entry @("transfers","number_of_changes") 0)
    airline     = [string](Get-Field $Entry @("airline","gate") "")
    flight      = [string](Get-Field $Entry @("flight_number") "")
    typical     = $null   # filled by the month matrix pass
    options     = $null   # dated departures from the month matrix
  }
}

# ---------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------
$token = Get-Token
Log "Run started. Origins: $($ORIGINS.Count). Currency: $Currency."

$rows = New-Object System.Collections.Generic.List[object]

foreach ($origin in $ORIGINS) {
  $r = Invoke-TP -Path "/v1/city-directions" -Query @{ origin = $origin; currency = $Currency } -Token $token
  if ($null -eq $r -or -not $r.success) {
    Log "No usable data for $origin" "WARN"
    continue
  }
  $data = $r.data
  $dests = @($data.PSObject.Properties.Name)
  foreach ($d in $dests) {
    $row = Build-Row -Origin $origin -Dest $d -Entry $data.$d
    if ($row.price -gt 0) { $rows.Add($row) }
  }
  Log ("{0}: {1} destinations" -f $origin, $dests.Count)
  Start-Sleep -Milliseconds 350   # be polite to the rate limiter
}

if ($rows.Count -eq 0) { Log "Nothing fetched. Aborting without writing." "ERROR"; exit 1 }
Log "Collected $($rows.Count) routes."

# ---- Dated options -----------------------------------------------------
# The month matrix returns one row per departure date, each with its own
# price, stop count and (when it is a return) a return date. That gives
# three things at once: the date picker, the one-way/return split, and the
# twelve-month average behind the deal score.
if (-not $SkipMonthMatrix) {
  $months = @()
  for ($i = 0; $i -lt $MonthsAhead; $i++) {
    $months += (Get-Date).AddMonths($i).ToString("yyyy-MM-01")
  }

  $targets = if ($AllRoutes) {
    $rows
  } else {
    $rows | Group-Object origin | ForEach-Object { $_.Group | Sort-Object price | Select-Object -First $TopRoutesPerOrigin }
  }

  Log "Month matrix: $(@($targets).Count) routes x $($months.Count) months."
  $done = 0

  foreach ($t in $targets) {
    $opts = @()
    foreach ($mon in $months) {
      $m = Invoke-TP -Path "/v2/prices/month-matrix" -Query @{
        origin = $t.origin; destination = $t.destination; month = $mon; currency = $Currency
      } -Token $token

      if ($null -ne $m -and $m.success -and $m.data) {
        foreach ($d in @($m.data)) {
          $p = [int](Get-Field $d @("value","price") 0)
          if ($p -le 0) { continue }
          $dep = [string](Get-Field $d @("depart_date") "")
          if (-not $dep) { continue }
          $opts += [pscustomobject]@{
            d = $dep
            r = [string](Get-Field $d @("return_date") "")
            p = $p
            s = [int](Get-Field $d @("number_of_changes") 0)
          }
        }
      }
      Start-Sleep -Milliseconds 320
    }

    if (@($opts).Count -gt 0) {
      # Cheapest first, de-duplicated by date + return date, capped so the
      # published file stays a sensible size.
      $seenKeys = @{}
      $clean = @()
      foreach ($o in (@($opts) | Sort-Object p)) {
        $k = "$($o.d)|$($o.r)"
        if (-not $seenKeys.ContainsKey($k)) { $seenKeys[$k] = $true; $clean += $o }
      }
      $t.options = @($clean | Select-Object -First $MaxOptionsPerRoute)
      $t.typical = [int]([math]::Round((@($clean) | ForEach-Object { $_.p } | Measure-Object -Average).Average))
    }

    $done++
    if ($done % 40 -eq 0) { Log "  ... $done of $(@($targets).Count)" }
  }

  $withTypical = @($rows | Where-Object { $null -ne $_.typical }).Count
  $withOpts    = @($rows | Where-Object { $null -ne $_.options -and @($_.options).Count -gt 0 }).Count
  Log "Usual price on $withTypical routes; one-way options on $withOpts."
}

# ---- Return trips ------------------------------------------------------
# month-matrix only ever returns one-ways: every row comes back with an
# empty return_date. Round trips come from prices/latest with
# one_way=false, so they need their own pass.
if (-not $SkipReturns) {
  Log "Return trips for $(@($rows).Count) routes."
  $doneR = 0
  foreach ($t in $rows) {
    $lr = Invoke-TP -Path "/v2/prices/latest" -Query @{
      origin = $t.origin; destination = $t.destination
      one_way = "false"; limit = 30; currency = $Currency
      period_type = "year"; show_to_affiliates = "true"
    } -Token $token

    if ($null -ne $lr -and $lr.success -and $lr.data) {
      $add = @()
      foreach ($d in @($lr.data)) {
        $p = [int](Get-Field $d @("value","price") 0)
        $dep = [string](Get-Field $d @("depart_date") "")
        $ret = [string](Get-Field $d @("return_date") "")
        if ($p -le 0 -or -not $dep -or -not $ret) { continue }
        $add += [pscustomobject]@{ d = $dep; r = $ret; p = $p; s = [int](Get-Field $d @("number_of_changes") 0) }
      }
      if (@($add).Count -gt 0) {
        $existing = @()
        if ($null -ne $t.options) { $existing = @($t.options) }
        $merged = @($existing) + @($add | Sort-Object p | Select-Object -First $MaxOptionsPerRoute)
        $t.options = @($merged)
      }
    }

    $doneR++
    if ($doneR % 60 -eq 0) { Log "  ... returns $doneR of $(@($rows).Count)" }
    Start-Sleep -Milliseconds 300
  }

  $withRet = @($rows | Where-Object {
    $null -ne $_.options -and @($_.options | Where-Object { $_.r }).Count -gt 0
  }).Count
  Log "Return options on $withRet routes."
}

# ---- Rolling history, so the deal score improves over time ------------
$today = (Get-Date).ToString("yyyy-MM-dd")
$history = @{}
if (Test-Path $HistFile) {
  try {
    $raw = Get-Content $HistFile -Raw | ConvertFrom-Json
    foreach ($p in $raw.PSObject.Properties) { $history[$p.Name] = @($p.Value) }
  } catch { Log "History unreadable; starting a fresh one." "WARN" }
}

foreach ($row in $rows) {
  $key = "$($row.origin)-$($row.destination)"

  # An empty array returned from an if-block is unrolled to $null, which
  # would make $seen a bare int after the first +=. Build it explicitly.
  $seen = @()
  if ($history.ContainsKey($key)) { $seen = @($history[$key]) }
  $seen = @($seen) + @([int]$row.price)

  if (@($seen).Count -gt 60) { $seen = @($seen)[-60..-1] }   # keep ~2 months
  $history[$key] = @($seen)

  # Prefer the month matrix; fall back to our own observed average.
  if ($null -eq $row.typical -and @($seen).Count -ge 5) {
    $row.typical = [int]([math]::Round((@($seen) | Measure-Object -Average).Average))
  }
}

# ---- Write ------------------------------------------------------------
$payload = [pscustomobject]@{
  generated = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  currency  = $Currency.ToUpper()
  origins   = $ORIGINS
  count     = $rows.Count
  fares     = $rows
}

# UTF-8 WITHOUT a BOM. PowerShell 5.1's -Encoding utf8 writes one, and a
# BOM at the start of a JSON file breaks JSON.parse over HTTP.
$noBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutFile,  ($payload | ConvertTo-Json -Depth 6 -Compress), $noBom)
[System.IO.File]::WriteAllText($HistFile, ($history | ConvertTo-Json -Depth 4 -Compress), $noBom)
Log "Wrote fares.json ($([math]::Round((Get-Item $OutFile).Length / 1KB, 1)) KB)."

if ($DryRun) { Log "Dry run -- not pushing."; exit 0 }

# ---- Publish ----------------------------------------------------------
git -C $RepoDir add fares.json history.json | Out-Null
$changed = git -C $RepoDir status --porcelain fares.json history.json
if ([string]::IsNullOrWhiteSpace($changed)) { Log "No change since last run."; exit 0 }

# Built as an array rather than a here-string: PowerShell 5.1 only
# recognises a here-string terminator on CRLF line endings, and this
# file is LF.
$msgFile = Join-Path $env:TEMP "cloudhenry-fares-msg.txt"
$msgLines = @(
  "Refresh fares $today",
  "",
  "$($rows.Count) routes across $($ORIGINS.Count) UK airports.",
  "",
  "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
)
Set-Content -Path $msgFile -Encoding utf8 -Value $msgLines

git -C $RepoDir commit -F $msgFile | Out-Null
git -C $RepoDir push origin main   | Out-Null
Log "Pushed."

# jsDelivr caches a branch for hours; purge so the site sees it now.
try {
  Invoke-WebRequest -Uri "https://purge.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/fares.json" -UseBasicParsing -TimeoutSec 40 | Out-Null
  Log "CDN purged."
} catch {
  Log "CDN purge failed; the file will refresh on its own within about 12 hours." "WARN"
}

Log "Done."
