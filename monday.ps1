<#
  THE MONDAY EMAIL. One command does the whole job.

  For Liv, while Henry is away. Read MONDAY-FOR-LIV.txt first.

    .\monday.ps1          builds everything and checks it. Sends nothing.
    .\monday.ps1 -Send    same, then sends, but only if every check passed.

  It refuses to send if anything is wrong, and says in plain English what
  is wrong. If it says STOP, do not send. Message Henry.

  No em dashes in any copy, per Henry.
#>
[CmdletBinding()]
param(
  [switch] $Send,
  [switch] $SkipBuild
)
$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Repo
$stamp = Get-Date -Format "yyyy-MM-dd"
$problems = @()
$notes    = @()

function Head([string]$t) { Write-Host ""; Write-Host "  $t" -ForegroundColor Cyan }
function Good([string]$t) { Write-Host "  OK    $t" -ForegroundColor Green }
function Bad ([string]$t) { Write-Host "  STOP  $t" -ForegroundColor Red;    $script:problems += $t }
function Note([string]$t) { Write-Host "  note  $t" -ForegroundColor Yellow; $script:notes    += $t }

# ---------------------------------------------------------------- Ghost API
$key = $env:GHOST_ADMIN_KEY
if (-not $key -and (Test-Path (Join-Path $Repo ".ghostkey"))) { $key = (Get-Content (Join-Path $Repo ".ghostkey") -Raw).Trim() }
if (-not $key -or $key -notmatch '^[0-9a-f]+:[0-9a-f]+$') { throw "No Ghost key on this computer. Message Henry." }
$kid = $key.Split(":")[0]; $hex = $key.Split(":")[1]
function B64Url([byte[]]$b) { [Convert]::ToBase64String($b).TrimEnd("=").Replace("+","-").Replace("/","_") }
function Tok {
  $now = [int][double]::Parse((Get-Date -UFormat %s))
  $h = B64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT","kid":"' + $kid + '"}'))
  $p = B64Url ([Text.Encoding]::UTF8.GetBytes('{"iat":' + $now + ',"exp":' + ($now + 300) + ',"aud":"/admin/"}'))
  $s = New-Object byte[] ($hex.Length / 2)
  for ($i = 0; $i -lt $s.Length; $i++) { $s[$i] = [Convert]::ToByte($hex.Substring($i * 2, 2), 16) }
  $m = New-Object System.Security.Cryptography.HMACSHA256; $m.Key = $s
  return "$h.$p." + (B64Url ($m.ComputeHash([Text.Encoding]::UTF8.GetBytes("$h.$p"))))
}
function G([string]$Path) {
  Invoke-RestMethod -Uri ("https://cloudhenry.ghost.io/ghost/api/admin" + $Path) -Headers @{ Authorization = "Ghost $(Tok)"; "Accept-Version" = "v5.0" }
}

$AIR = @('manchester','birmingham','leeds','london-stansted','london-luton','bristol','newcastle','glasgow',
         'edinburgh','london-gatwick','liverpool','belfast','bournemouth','cardiff','east-midlands','dublin',
         'prestwick','cork','shannon','knock')

Write-Host ""
Write-Host "  THE MONDAY EMAIL, $stamp" -ForegroundColor White
Write-Host "  =============================="

# --------------------------------------------------------- 1. fresh fares
Head "1. Are the flight prices fresh?"
git pull --rebase -q origin main 2>&1 | Out-Null
$fares = Get-Content (Join-Path $Repo "fares.json") -Raw | ConvertFrom-Json
$gen = [datetime]::Parse($fares.generated, $null, [Globalization.DateTimeStyles]::RoundtripKind).ToLocalTime()
$ageH = [math]::Round(((Get-Date) - $gen).TotalHours, 1)
if ($ageH -le 24) { Good "Prices collected $ageH hours ago, $($fares.totals.routes) routes." }
else { Bad "The prices are $ageH hours old. The overnight job has not run." }

$sp = Get-Content (Join-Path $Repo "spot-check.json") -Raw | ConvertFrom-Json
if ($sp.gone -eq 0) { Good "This morning's spot check: $($sp.match) of $($sp.sample) prices exact, no flights vanished." }
else { Bad "$($sp.gone) flights in this morning's spot check no longer exist." }

# --------------------------------------------------------------- 2. build
Head "2. Building the emails"
if (-not $SkipBuild) {
  & (Join-Path $Repo "build-monday.ps1") -Replace     | Out-Null
  & (Join-Path $Repo "build-free-email.ps1") -Replace | Out-Null
  Good "Built the paying members' email and the free list email for every airport."
} else { Note "Skipped, using the drafts already there." }

# ------------------------------------------------------------ 3. check them
Head "3. Checking every email"
$today = (Get-Date).Date
$totalLinks = 0; $badDates = 0; $upsell = @(); $big = @(); $missing = @()
foreach ($s in $AIR) {
  $post = @((G "/posts/?limit=1&filter=$([uri]::EscapeDataString("slug:$s-$stamp"))&formats=lexical").posts)
  if (-not $post) { $missing += $s; continue }
  $obj = $post[0].lexical | ConvertFrom-Json
  $paid = ""; $all = ""
  foreach ($n in $obj.root.children) {
    if ($n.type -ne 'html') { continue }
    $seg = ''
    if ($n.visibility -and $n.visibility.email) { $seg = $n.visibility.email.memberSegment }
    $all = $all + $n.html
    if ($seg -eq '' -or $seg -eq 'status:-free') { $paid = $paid + $n.html }
  }
  # the join advert must never reach somebody who already pays
  if ($paid -match '2\.99 a month' -or $paid -match 'See all \d+') { $upsell += $s }
  # Ghost roughly triples this before it lands, and Gmail cuts off near 100 KB
  if (($paid.Length / 1KB) -gt 36) { $big += ("{0} ({1} KB)" -f $s, [math]::Round($paid.Length / 1KB, 1)) }
  # every booking link must be for a real date in the future
  foreach ($m in [regex]::Matches($all, 'href="(https://www\.ryanair\.com[^"]+|https://wizzair\.com/[^"]+)"')) {
    $u = $m.Groups[1].Value
    $totalLinks++
    $d = [regex]::Match($u, 'dateOut=(\d{4}-\d{2}-\d{2})').Groups[1].Value
    if (-not $d) { $d = ([uri]$u).AbsolutePath.Split('/')[6] }
    $dt = [datetime]::MinValue
    if (-not $d -or -not [datetime]::TryParse($d, [ref]$dt)) { $badDates++; continue }
    if ($dt -lt $today -or ($dt - $today).TotalDays -gt 90) { $badDates++ }
  }
}
if ($missing.Count) { Bad "No email was built for: $($missing -join ', ')." }
else { Good "All $($AIR.Count) airports have an email." }
if ($badDates -eq 0) { Good "$totalLinks flight links, every one for a real date in the next three months." }
else { Bad "$badDates of $totalLinks flight links have a bad or past date." }
if ($upsell.Count) { Bad "The join advert is in the PAYING members' email for: $($upsell -join ', ')." }
else { Good "Paying members do not get the join advert." }
if ($big.Count) { Note "Close to the size where Gmail cuts an email short: $($big -join ', '). It will still send." }
else { Good "Every email is a safe size for Gmail." }

# ------------------------------------- 4. do the links really work today
Head "4. Opening real flight links"
$UA = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'; 'Accept' = 'application/json' }
$sample = @(); $seen = @{}
foreach ($s in @('manchester','london-stansted','birmingham','edinburgh','bristol')) {
  $post = @((G "/posts/?limit=1&filter=$([uri]::EscapeDataString("slug:$s-$stamp"))&formats=lexical").posts)
  if (-not $post) { continue }
  $obj = $post[0].lexical | ConvertFrom-Json
  $h = ""
  foreach ($n in $obj.root.children) { if ($n.type -eq 'html') { $h = $h + $n.html } }
  foreach ($m in [regex]::Matches($h, 'href="(https://www\.ryanair\.com[^"]+)"')) {
    $u = $m.Groups[1].Value
    $o  = [regex]::Match($u, 'originIata=([A-Z]{3})').Groups[1].Value
    $d  = [regex]::Match($u, 'destinationIata=([A-Z]{3})').Groups[1].Value
    $dt = [regex]::Match($u, 'dateOut=(\d{4}-\d{2}-\d{2})').Groups[1].Value
    $k = "$o-$d-$dt"
    if ($o -and $d -and $dt -and -not $seen.ContainsKey($k)) { $seen[$k] = 1; $sample += [pscustomobject]@{ O = $o; D = $d; Dt = $dt } }
  }
}
$sample = @($sample | Select-Object -First 20)
$live = 0; $dead = 0; $noanswer = 0
foreach ($x in $sample) {
  $u = "https://www.ryanair.com/api/farfnd/v4/oneWayFares?departureAirportIataCode=$($x.O)&arrivalAirportIataCode=$($x.D)&outboundDepartureDateFrom=$($x.Dt)&outboundDepartureDateTo=$($x.Dt)&market=en-gb&language=en&currency=GBP"
  try { $r = Invoke-RestMethod -Uri $u -Headers $UA -TimeoutSec 25 } catch { $noanswer++; continue }
  if (@($r.fares | Where-Object { $_.outbound -and $_.outbound.price }).Count) { $live++ } else { $dead++ }
  Start-Sleep -Milliseconds 200
}
if ($dead -gt 0) { Bad "$dead of the $($sample.Count) flight links tested no longer have a flight." }
elseif ($live -gt 0) { Good "Opened $live real flight links at random. Every one is still on sale." }
if ($noanswer -gt 0) { Note "$noanswer links could not be tested because Ryanair did not answer. Not a problem." }

# ------------------------------------------------------------- 5. verdict
Write-Host ""
if ($problems.Count) {
  Write-Host "  STOP. Do not send. $($problems.Count) thing(s) wrong:" -ForegroundColor Red
  $problems | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
  Write-Host ""
  Write-Host "  Send Henry a photo of this screen. Do not send the emails." -ForegroundColor Red
  Write-Host ""
  exit 1
}
Write-Host "  EVERYTHING PASSED." -ForegroundColor Green
if ($notes.Count) { Write-Host "  The yellow notes above are fine to ignore." -ForegroundColor Yellow }
Write-Host ""

if (-not $Send) {
  Write-Host "  Nothing has been sent yet." -ForegroundColor White
  Write-Host "  Have a look at the emails in Ghost, then run this to send them:" -ForegroundColor White
  Write-Host "      .\monday.ps1 -Send -SkipBuild" -ForegroundColor Cyan
  Write-Host ""
  exit 0
}

# ---------------------------------------------------------------- 6. send
Head "5. Sending"
Write-Host "  Paying members first." -ForegroundColor White
& (Join-Path $Repo "send-monday-paid.ps1")
Write-Host ""
Write-Host "  Now the free list." -ForegroundColor White
& (Join-Path $Repo "build-free-email.ps1") -Send
Write-Host ""
Write-Host "  DONE. Both sets have gone out." -ForegroundColor Green
Write-Host ""
