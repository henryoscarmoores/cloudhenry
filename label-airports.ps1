<#
  Labels members with their airport, from the page they signed up on.

  Henry sends each Monday email to a label, loc-manchester and so on.
  People kept arriving without one. Ghost records the page a member
  signed up on, and eleven of the twelve airport pages are named
  join-<airport>, so the label can be worked out and applied.

  Runs in the cloud after the fare build, and can be run by hand. Never
  fails the build: whatever it cannot label, it reports and moves on.

  Needs a Ghost Admin API key, in the environment as GHOST_ADMIN_KEY or
  in a gitignored .ghostkey file beside this script. The key is "id:secret";
  the API wants a short-lived signed token made from it.
#>
$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Admin   = "https://cloudhenry.ghost.io/ghost/api/admin"

$key = $env:GHOST_ADMIN_KEY
if (-not $key -and (Test-Path (Join-Path $RepoDir ".ghostkey"))) { $key = (Get-Content (Join-Path $RepoDir ".ghostkey") -Raw).Trim() }
if (-not $key -or $key -notmatch '^[0-9a-f]+:[0-9a-f]+$') { Write-Host "No Ghost Admin key available; skipping."; exit 0 }
$parts = $key.Split(":"); $kid = $parts[0]; $secretHex = $parts[1]

function B64Url([byte[]] $b) { [Convert]::ToBase64String($b).TrimEnd("=").Replace("+","-").Replace("/","_") }
function Token {
  $now = [int][double]::Parse((Get-Date -UFormat %s))
  $header  = B64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT","kid":"' + $kid + '"}'))
  $payload = B64Url ([Text.Encoding]::UTF8.GetBytes('{"iat":' + $now + ',"exp":' + ($now + 300) + ',"aud":"/admin/"}'))
  $secret = New-Object byte[] ($secretHex.Length / 2)
  for ($i = 0; $i -lt $secret.Length; $i++) { $secret[$i] = [Convert]::ToByte($secretHex.Substring($i * 2, 2), 16) }
  $hmac = New-Object System.Security.Cryptography.HMACSHA256
  $hmac.Key = $secret
  $sig = B64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$header.$payload")))
  return "$header.$payload.$sig"
}
function Call([string] $Method, [string] $Path, $Body) {
  $h = @{ Authorization = "Ghost " + (Token); "Accept-Version" = "v5.0" }
  if ($Body) { return Invoke-RestMethod -Method $Method -Uri "$Admin$Path" -Headers $h -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 6 -Compress) -TimeoutSec 60 }
  return Invoke-RestMethod -Method $Method -Uri "$Admin$Path" -Headers $h -TimeoutSec 60
}

# join-leeds carries the label loc-leeds; every other page's slug is its label.
# Whoever cannot be placed gets "No Airport Selected" instead, so Henry can
# find them in one click in Ghost and ask. That label comes off the moment
# an airport label goes on.
$NONE = "No Airport Selected"
$members = @((Call GET "/members/?limit=all&include=labels").members)
$already = 0; $labelled = 0; $noPage = 0; $notJoin = 0; $flagged = 0; $failed = 0
foreach ($m in $members) {
  $names = @($m.labels | ForEach-Object { $_.name })
  if (@($m.labels | Where-Object { $_.slug -like "loc-*" }).Count -gt 0) { $already++; continue }
  try {
    $one = (Call GET "/members/$($m.id)/?include=attribution,labels").members[0]
    $url = ""
    if ($one.attribution -and $one.attribution.url) { $url = [string]$one.attribution.url }
    $loc = ""
    if (-not $url) { $noPage++ }
    elseif ($url -notmatch '/join-([a-z-]+)/') { $notJoin++ }
    else { $loc = "loc-" + $Matches[1] }

    if ($loc) {
      $keep = @($names | Where-Object { $_ -ne $NONE } | ForEach-Object { @{ name = $_ } })
      $keep += @{ name = $loc }
      Call PUT "/members/$($m.id)/" @{ members = @(@{ labels = $keep }) } | Out-Null
      $labelled++
      Write-Host "  labelled $loc"
    } elseif ($names -notcontains $NONE) {
      $keep = @($names | ForEach-Object { @{ name = $_ } })
      $keep += @{ name = $NONE }
      Call PUT "/members/$($m.id)/" @{ members = @(@{ labels = $keep }) } | Out-Null
      $flagged++
      Write-Host "  flagged $NONE"
    }
  } catch {
    $failed++
    Write-Host "  could not label member $($m.id): $($_.Exception.Message)"
  }
  Start-Sleep -Milliseconds 150
}
Write-Host ("members {0}: already labelled {1}, labelled now {2}, no signup page on record {3}, signed up off an airport page {4}, newly flagged '{5}' {6}, failed {7}" -f $members.Count, $already, $labelled, $noPage, $notJoin, $NONE, $flagged, $failed)

# Growth numbers for the morning check. Aggregates only, no names or
# emails: the repository is public. stats.json keeps one row per day so
# the trend is there to read; today's row is replaced on the evening run.
try {
  $all = @((Call GET "/members/?limit=all&include=labels,subscriptions").members)
  $now = [DateTime]::UtcNow
  function Since([int] $days) { $t = $now.AddDays(-$days); return @($all | Where-Object { [DateTime]::Parse($_.created_at).ToUniversalTime() -gt $t }).Count }
  function HasLabel([string] $name) { return @($all | Where-Object { @($_.labels | Where-Object { $_.name -eq $name }).Count -gt 0 }).Count }
  $trialing = @($all | Where-Object { @($_.subscriptions | Where-Object { $_.status -eq "trialing" }).Count -gt 0 }).Count
  $row = [ordered]@{
    date        = $now.ToString("yyyy-MM-dd")
    total       = $all.Count
    free        = @($all | Where-Object { $_.status -eq "free" }).Count
    paid        = @($all | Where-Object { $_.status -eq "paid" }).Count
    comped      = @($all | Where-Object { $_.status -eq "comped" }).Count
    trialing    = $trialing
    new_24h     = Since 1
    new_7d      = Since 7
    via_homepage     = HasLabel "via-homepage"
    via_airport_page = HasLabel "via-airport-page"
    no_airport       = HasLabel $NONE
  }
  $path = Join-Path $RepoDir "stats.json"
  $rows = @()
  if (Test-Path $path) { $rows = @((Get-Content $path -Raw | ConvertFrom-Json).days | Where-Object { $_.date -ne $row.date }) }
  $rows += [pscustomobject]$row
  $doc = [ordered]@{ updated = $now.ToString("yyyy-MM-ddTHH:mm:ssZ"); days = @($rows | Sort-Object date) }
  Set-Content -Path $path -Value ($doc | ConvertTo-Json -Depth 4) -Encoding utf8
  Write-Host ("stats: total {0}, free {1}, paid {2}, trialing {3}, new 24h {4}, new 7d {5}, via homepage {6}, via airport page {7}" -f $row.total, $row.free, $row.paid, $row.trialing, $row.new_24h, $row.new_7d, $row.via_homepage, $row.via_airport_page)
} catch {
  Write-Host "stats: could not write ($($_.Exception.Message))"
}
exit 0
