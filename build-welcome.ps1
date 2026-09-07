<#
  Builds the welcome email: one draft, sent to everyone who joined in the
  last few days, with the best fares we can find that morning across every
  airport.

  Why it exists: on 7 September 2026 the site went from 105 members to
  1,300 in two days, and the newest of them had nothing from CloudHenry
  until the following Monday. Six days is a long time to stay interested.

  The rows are real fares from the day's feed, picked for the size of the
  saving on a place people recognise, one per airport so it reads as a
  site for the whole country. Nothing inside the British Isles: a hop to
  Dublin is not what anyone joined for.

  Rows link to the search, not to the airline, because most readers are on
  the free list and booking is what the membership is for.

  Usage:
    .\build-welcome.ps1            build or replace today's draft
    .\build-welcome.ps1 -Rows 8    more fares

  No em dashes in any copy, per Henry.
#>
[CmdletBinding()]
param(
  [int] $Rows = 6,
  [int] $Horizon = 75
)
$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Admin   = "https://cloudhenry.ghost.io/ghost/api/admin"
$Site    = "https://www.cloudhenry.com"

$key = $env:GHOST_ADMIN_KEY
if (-not $key -and (Test-Path (Join-Path $RepoDir ".ghostkey"))) { $key = (Get-Content (Join-Path $RepoDir ".ghostkey") -Raw).Trim() }
if (-not $key -or $key -notmatch '^[0-9a-f]+:[0-9a-f]+$') { throw "No Ghost Admin key available." }
$parts = $key.Split(":"); $kid = $parts[0]; $secretHex = $parts[1]

function B64Url([byte[]] $b) { [Convert]::ToBase64String($b).TrimEnd("=").Replace("+","-").Replace("/","_") }
function Token {
  $now = [int][double]::Parse((Get-Date -UFormat %s))
  $header  = B64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT","kid":"' + $kid + '"}'))
  $payload = B64Url ([Text.Encoding]::UTF8.GetBytes('{"iat":' + $now + ',"exp":' + ($now + 300) + ',"aud":"/admin/"}'))
  $secret = New-Object byte[] ($secretHex.Length / 2)
  for ($i = 0; $i -lt $secret.Length; $i++) { $secret[$i] = [Convert]::ToByte($secretHex.Substring($i * 2, 2), 16) }
  $hmac = New-Object System.Security.Cryptography.HMACSHA256; $hmac.Key = $secret
  $sig = B64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$header.$payload")))
  return "$header.$payload.$sig"
}
function Call([string] $Method, [string] $Path, $Body) {
  $h = @{ Authorization = "Ghost " + (Token); "Accept-Version" = "v5.0" }
  if ($Body) {
    $json = $Body | ConvertTo-Json -Depth 12 -Compress
    return Invoke-RestMethod -Method $Method -Uri "$Admin$Path" -Headers $h -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 60
  }
  return Invoke-RestMethod -Method $Method -Uri "$Admin$Path" -Headers $h -TimeoutSec 60
}

$AIRPORT_NAME = @{ MAN="Manchester"; BHX="Birmingham"; LBA="Leeds Bradford"; STN="London Stansted"; LTN="London Luton";
  BRS="Bristol"; NCL="Newcastle"; GLA="Glasgow"; EDI="Edinburgh"; LGW="London Gatwick"; LPL="Liverpool";
  BFS="Belfast"; BOH="Bournemouth"; CWL="Cardiff"; EMA="East Midlands"; DUB="Dublin"; EXT="Exeter" }
$UK = @{ LON=1; MAN=1; BHX=1; LBA=1; STN=1; LTN=1; BRS=1; NCL=1; GLA=1; EDI=1; LGW=1; LPL=1; BFS=1; CWL=1; EMA=1; BOH=1; ILY=1; KOI=1; ABZ=1; INV=1; SOU=1; EXT=1; NQY=1; LDY=1 }
$IE = @{ DUB=1; ORK=1; SNN=1; NOC=1; KIR=1; GWY=1; WAT=1 }
$BOGUS = @{ BSZ=1; DSE=1 }
# Places a reader recognises at a glance. A welcome email is no place for
# an airport nobody has heard of.
$POPULAR = @{}
foreach ($c in ("AMS PAR CDG BCN MAD VLC SVQ LIS OPO FCO ROM MIL MXP BGY VCE NAP PSA FLR PMO PMI IBZ ALC AGP FAO TFS LPA ACE FUE PRG KRK BUD VIE BER CPH OSL ARN NCE ATH SKG CFU HER RHO SPU DBV MLA PFO IST AYT DLM RAK AGA NYC BRU GVA ZRH MUC FRA HAM CGN WAW GDN RIX TLL TLS LYS BOD TRN VRN CTA BRI OLB CAG SZG INN").Split(" ")) { $POPULAR[$c] = 1 }

$PLACES = @{}
$src = Get-Content (Join-Path $RepoDir "places.js") -Raw -Encoding UTF8
foreach ($m in [regex]::Matches($src, '([A-Z]{3}):\["([^"]*)","([^"]*)","([^"]*)"\]')) {
  $PLACES[$m.Groups[1].Value] = @{ name = $m.Groups[2].Value; country = $m.Groups[3].Value; flag = $m.Groups[4].Value }
}
function FlagCode([string] $emoji) {
  if (-not $emoji -or $emoji.Length -lt 4) { return "" }
  $a = [char]::ConvertToUtf32($emoji, 0); $b = [char]::ConvertToUtf32($emoji, 2)
  if ($a -lt 0x1F1E6 -or $a -gt 0x1F1FF) { return "" }
  return ([string][char](65 + ($a - 0x1F1E6)) + [string][char](65 + ($b - 0x1F1E6))).ToLower()
}
function Esc([string] $s) { return [System.Net.WebUtility]::HtmlEncode($s) }
function Day([string] $iso) { $d = [datetime]::ParseExact($iso, "yyyy-MM-dd", $null); return $d.ToString("ddd d MMM") }

$today = (Get-Date).ToString("yyyy-MM-dd")
$limit = (Get-Date).AddDays($Horizon).ToString("yyyy-MM-dd")

# ---- pick the fares --------------------------------------------------
# One per airport, the biggest saving on a place people know, so the list
# reads as seventeen airports rather than one.
$pool = @()
foreach ($code in $AIRPORT_NAME.Keys) {
  $file = Join-Path $RepoDir ("fares-" + $code + ".json")
  if (-not (Test-Path $file)) { continue }
  $data = Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json
  $bestHere = $null
  foreach ($r in $data.fares) {
    $d = [string]$r.destination
    if ($UK.ContainsKey($d) -or $IE.ContainsKey($d) -or $BOGUS.ContainsKey($d)) { continue }
    if (-not $POPULAR.ContainsKey($d) -or -not $PLACES.ContainsKey($d)) { continue }
    $typ = if ($r.typical) { [int]$r.typical } else { 0 }
    foreach ($o in @($r.options)) {
      if (-not $o.p -or -not $o.d -or $o.d -lt $today -or $o.d -gt $limit) { continue }
      if ($o.r) { continue }                        # one way reads cleanest in a welcome
      if ($o.s -and [int]$o.s -gt 0) { continue }   # direct only
      if ($typ -le 0 -or $o.p -ge $typ * 0.7) { continue }   # a real saving, 30 per cent or better
      $saving = [int]((1 - ($o.p / $typ)) * 100)
      $cand = [pscustomobject]@{ origin = $code; dest = $d; price = [int]$o.p; typical = $typ; dep = [string]$o.d; saving = $saving }
      if (-not $bestHere -or $cand.saving -gt $bestHere.saving) { $bestHere = $cand }
    }
  }
  if ($bestHere) { $pool += $bestHere }
}
if ($pool.Count -lt 3) { throw "Only $($pool.Count) fares good enough for a welcome email. Check the fare files." }
$picks = @($pool | Sort-Object -Property @{ Expression = "saving"; Descending = $true } | Select-Object -First $Rows)
$cheapest = ($picks | Measure-Object price -Minimum).Minimum
$bestSaving = ($picks | Measure-Object saving -Maximum).Maximum

# ---- the email -------------------------------------------------------
$FONT = "font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"

function FareRow($f, [int] $i) {
  $p = $PLACES[$f.dest]
  $fc = FlagCode $p.flag
  $flag = if ($fc) { "<img src=`"https://flagcdn.com/w20/$fc.png`" width=`"18`" height=`"13`" alt=`"$(Esc $p.name)`" style=`"border:0;display:inline-block;vertical-align:-2px;border-radius:2px;margin-right:6px;`">" } else { "" }
  $link = "$Site/search/?from=$($f.origin)&to=" + [uri]::EscapeDataString($p.name)
  $bg = if ($i % 2 -eq 0) { "#FFFFFF" } else { "#F7FBFE" }
  return "<tr><td style=`"padding:0;`"><a href=`"$link`" style=`"text-decoration:none;display:block;`">" +
    "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" bgcolor=`"$bg`" style=`"background:$bg;border-bottom:1px solid #E8F1F8;`"><tr>" +
    "<td style=`"padding:13px 16px;$FONT`">" +
      "<div style=`"font-size:15.5px;font-weight:800;color:#0E3550;`">$flag$(Esc $AIRPORT_NAME[$f.origin]) to $(Esc $p.name)</div>" +
      "<div style=`"font-size:12.5px;color:#5B7387;margin-top:3px;`">$(Day $f.dep) &middot; one way &middot; direct</div>" +
    "</td>" +
    "<td align=`"right`" style=`"padding:13px 16px;white-space:nowrap;$FONT`">" +
      "<div style=`"font-size:20px;font-weight:900;color:#0E6FB6;`">$([char]0xA3)$($f.price)</div>" +
      "<div style=`"font-size:11.5px;color:#7A90A5;text-decoration:line-through;`">$([char]0xA3)$($f.typical)</div>" +
      "<div style=`"display:inline-block;margin-top:4px;background:#E6F6EE;color:#1E7A55;font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:999px;`">$($f.saving)% OFF</div>" +
    "</td></tr></table></a></td></tr>"
}

$rowsHtml = ""
for ($i = 0; $i -lt $picks.Count; $i++) { $rowsHtml += FareRow $picks[$i] $i }

$head = "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" bgcolor=`"#0E6FB6`" style=`"background:#0E6FB6;border-radius:18px;`"><tr><td style=`"padding:26px 22px 22px;text-align:center;$FONT`">" +
  "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:#BEE3F8;`">Welcome aboard</div>" +
  "<div style=`"font-size:27px;font-weight:900;color:#FFFFFF;line-height:1.15;margin:8px 0 6px;letter-spacing:-.5px;`">You are in.</div>" +
  "<div style=`"font-size:14.5px;color:#D7EDFA;line-height:1.5;max-width:34em;margin:0 auto;`">Thanks for joining. Here is what we found this morning across all 17 airports, so you can see what lands in your inbox every Monday.</div>" +
  "</td></tr></table>"

$statRow = "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"8`" border=`"0`" style=`"border-collapse:separate;margin-top:12px;`"><tr>" +
  "<td width=`"33%`" bgcolor=`"#F0F6FB`" style=`"background:#F0F6FB;border-radius:12px;padding:12px 8px;text-align:center;$FONT`"><div style=`"font-size:19px;font-weight:900;color:#0E3550;`">16</div><div style=`"font-size:11px;color:#5B7387;`">airports</div></td>" +
  "<td width=`"33%`" bgcolor=`"#F0F6FB`" style=`"background:#F0F6FB;border-radius:12px;padding:12px 8px;text-align:center;$FONT`"><div style=`"font-size:19px;font-weight:900;color:#0E3550;`">$([char]0xA3)$cheapest</div><div style=`"font-size:11px;color:#5B7387;`">cheapest today</div></td>" +
  "<td width=`"33%`" bgcolor=`"#F0F6FB`" style=`"background:#F0F6FB;border-radius:12px;padding:12px 8px;text-align:center;$FONT`"><div style=`"font-size:19px;font-weight:900;color:#0E3550;`">$bestSaving%</div><div style=`"font-size:11px;color:#5B7387;`">off the usual price</div></td>" +
  "</tr></table>"

$fares = "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#7A90A5;margin:20px 0 8px;$FONT`">This morning's best</div>" +
  "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"border:1px solid #E3EEF6;border-radius:14px;overflow:hidden;`">$rowsHtml</table>" +
  "<div style=`"font-size:12px;color:#7A90A5;margin-top:8px;$FONT`">Prices checked this morning. Fares like these go within a few days.</div>"

$what = "<div style=`"margin-top:22px;padding:16px 18px;border-radius:14px;background:#F0F6FB;$FONT`">" +
  "<div style=`"font-size:15px;font-weight:800;color:#0E3550;margin-bottom:8px;`">What happens now</div>" +
  "<div style=`"font-size:14px;color:#46607A;line-height:1.6;`">" +
  "Every Monday morning you get the cheapest fares we can find from your airport, checked by hand.<br>" +
  "Members also get the full search: every fare, every date, seven months ahead, and go straight through to book.</div></div>"

$cta = "<div style=`"text-align:center;margin-top:20px;$FONT`">" +
  "<table cellpadding=`"0`" cellspacing=`"0`" border=`"0`" align=`"center`"><tr><td bgcolor=`"#F5C242`" style=`"background:#F5C242;border-radius:999px;`">" +
  "<a href=`"$Site/search/`" style=`"display:inline-block;color:#12384F;font-weight:900;font-size:17px;padding:15px 30px;text-decoration:none;$FONT`">Search every fare &rarr;</a>" +
  "</td></tr></table>" +
  "<div style=`"font-size:12px;color:#7A90A5;margin-top:10px;`">40 days free, then $([char]0xA3)2.99 a month. Cancel any time, no contract.</div></div>"

$signoff = "<div style=`"margin-top:20px;font-size:13.5px;color:#46607A;$FONT`">Have a good day,<br><b style=`"color:#0E3550;`">Henry</b><br>@henryoscarmoores</div>"

$html = $head + $statRow + $fares + $what + $cta + $signoff
$card = @{ type = "html"; version = 1; html = $html }
$lexical = @{ root = @{ type = "root"; version = 1; direction = "ltr"; format = ""; indent = 0; children = @($card) } } | ConvertTo-Json -Depth 12 -Compress

$slug = "welcome-" + (Get-Date).ToString("yyyy-MM-dd")
$existing = @((Call GET "/posts/?limit=1&filter=$([uri]::EscapeDataString("slug:$slug"))").posts)
foreach ($e in $existing) { if ($e.status -eq "draft") { Call DELETE "/posts/$($e.id)/" | Out-Null } }

$post = @{ posts = @(@{
  title = "Welcome to CloudHenry. Here is what we found this morning."
  slug = $slug
  lexical = $lexical
  status = "draft"
  visibility = "members"
  custom_excerpt = "The best fares from all 17 airports today, and what lands in your inbox on Monday."
  tags = @(@{ name = "#welcome-auto" })
}) }
$made = (Call POST "/posts/?source=html" $post).posts[0]
Write-Host ("Welcome draft made: {0} fares, cheapest {1}{2}, best saving {3}% -> {4}" -f $picks.Count, [char]0xA3, $cheapest, $bestSaving, $made.slug)
foreach ($p in $picks) { Write-Host ("  {0} to {1} {2}{3} was {2}{4} ({5}% off) {6}" -f $AIRPORT_NAME[$p.origin], $PLACES[$p.dest].name, [char]0xA3, $p.price, $p.typical, $p.saving, $p.dep) }
