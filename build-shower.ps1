<#
  Builds the "shower" email for the free list: one draft per airport with
  every good fare from that airport this week shown in full, nothing
  blurred, plus what the membership costs and one button to start the
  40 days free.

  Why it exists: on 9 September 2026 the free list stood at 1,942 people
  who had only ever seen three fares a week behind a blur. Henry: "let's
  really try and show them value ... shower them with great deals once or
  twice over the next 40 days." This is that email. It is sent to
  label:loc-<airport> + status:free, so everyone sees their own airport.

  Usage:
    .\build-shower.ps1                    drafts for every airport
    .\build-shower.ps1 -Airports MAN,LPL  some airports only
    .\build-shower.ps1 -Rows 12           more fares per email
    .\build-shower.ps1 -Replace           replace today's drafts

  Sending is a separate, deliberate step (Henry's yes first):
    .\build-shower.ps1 -Send              publish today's drafts to the
                                          free members of each airport

  No em dashes in any copy, per Henry. Never a discount, never "free tier".
#>
[CmdletBinding()]
param(
  [string[]] $Airports,
  [int] $Rows = 12,
  [int] $Horizon = 90,
  [switch] $Replace,
  [switch] $Send
)
$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Admin   = "https://cloudhenry.ghost.io/ghost/api/admin"
$Site    = "https://www.cloudhenry.com"
$Worker  = "https://cloudhenry.henryswalk.workers.dev"
$Newsletter = "default-newsletter"

$key = $env:GHOST_ADMIN_KEY
if (-not $key -and (Test-Path (Join-Path $RepoDir ".ghostkey"))) { $key = (Get-Content (Join-Path $RepoDir ".ghostkey") -Raw).Trim() }
if (-not $key -or $key -notmatch '^[0-9a-f]+:[0-9a-f]+$') { throw "No Ghost Admin key available." }
$parts = $key.Split(":"); $kid = $parts[0]; $secretHex = $parts[1]

function B64Url([byte[]] $b) { [Convert]::ToBase64String($b).TrimEnd("=").Replace("+","-").Replace("/","_") }
function SecretBytes { $s = New-Object byte[] ($secretHex.Length / 2); for ($i = 0; $i -lt $s.Length; $i++) { $s[$i] = [Convert]::ToByte($secretHex.Substring($i * 2, 2), 16) }; return $s }
function Token {
  $now = [int][double]::Parse((Get-Date -UFormat %s))
  $header  = B64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT","kid":"' + $kid + '"}'))
  $payload = B64Url ([Text.Encoding]::UTF8.GetBytes('{"iat":' + $now + ',"exp":' + ($now + 300) + ',"aud":"/admin/"}'))
  $hmac = New-Object System.Security.Cryptography.HMACSHA256; $hmac.Key = (SecretBytes)
  $sig = B64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$header.$payload")))
  return "$header.$payload.$sig"
}
# Same signature the Monday button carries: the Worker's one-tap sign-in
# only honours links signed with the secret half of the Ghost key.
function Go-Sign([string] $To, [long] $Exp) {
  $hmac = New-Object System.Security.Cryptography.HMACSHA256; $hmac.Key = (SecretBytes)
  return (B64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$To|$Exp")))).Substring(0, 24)
}
function Call([string] $Method, [string] $Path, $Body) {
  $h = @{ Authorization = "Ghost " + (Token); "Accept-Version" = "v5.0" }
  if ($Body) {
    $json = $Body | ConvertTo-Json -Depth 12 -Compress
    return Invoke-RestMethod -Method $Method -Uri "$Admin$Path" -Headers $h -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 60
  }
  return Invoke-RestMethod -Method $Method -Uri "$Admin$Path" -Headers $h -TimeoutSec 60
}

$LIST = @(
  @{ code="MAN"; name="Manchester";      slug="manchester" },
  @{ code="BHX"; name="Birmingham";      slug="birmingham" },
  @{ code="LBA"; name="Leeds Bradford";  slug="leeds" },
  @{ code="STN"; name="London Stansted"; slug="london-stansted" },
  @{ code="LTN"; name="London Luton";    slug="london-luton" },
  @{ code="BRS"; name="Bristol";         slug="bristol" },
  @{ code="NCL"; name="Newcastle";       slug="newcastle" },
  @{ code="GLA"; name="Glasgow";         slug="glasgow" },
  @{ code="EDI"; name="Edinburgh";       slug="edinburgh" },
  @{ code="LGW"; name="London Gatwick";  slug="london-gatwick" },
  @{ code="LPL"; name="Liverpool";       slug="liverpool" },
  @{ code="BFS"; name="Belfast";         slug="belfast" },
  @{ code="BOH"; name="Bournemouth";     slug="bournemouth" },
  @{ code="CWL"; name="Cardiff";         slug="cardiff" },
  @{ code="EMA"; name="East Midlands";   slug="east-midlands" },
  @{ code="DUB"; name="Dublin";          slug="dublin" },
  @{ code="EXT"; name="Exeter";          slug="exeter" },
  @{ code="LHR"; name="London Heathrow"; slug="london-heathrow" },
  @{ code="SEN"; name="London Southend"; slug="london-southend" },
  @{ code="LCY"; name="London City"; slug="london-city" },
  @{ code="PIK"; name="Glasgow Prestwick"; slug="prestwick" },
  @{ code="BHD"; name="Belfast City"; slug="belfast-city" },
  @{ code="ORK"; name="Cork"; slug="cork" },
  @{ code="SNN"; name="Shannon"; slug="shannon" },
  @{ code="SOU"; name="Southampton"; slug="southampton" },
  @{ code="ABZ"; name="Aberdeen"; slug="aberdeen" },
  @{ code="NWI"; name="Norwich"; slug="norwich" },
  @{ code="NQY"; name="Newquay"; slug="newquay" },
  @{ code="NOC"; name="Knock"; slug="knock" },
  @{ code="MME"; name="Teesside"; slug="teesside" },
  @{ code="INV"; name="Inverness"; slug="inverness" }
)
if ($Airports) { $want = @($Airports | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim().ToUpper() } | Where-Object { $_ }); $LIST = @($LIST | Where-Object { $want -contains $_.code }) }

$UK = @{ ABZ=1; ACI=1; BEB=1; BFS=1; BHD=1; BHX=1; BOH=1; BRR=1; BRS=1; CAL=1; CWL=1; DND=1; EDI=1; EMA=1; EXT=1; GLA=1; HUY=1; ILY=1; INV=1; ISC=1; KOI=1; LBA=1; LDY=1; LEQ=1; LGW=1; LHR=1; LON=1; LPL=1; LSI=1; LTN=1; MAN=1; MME=1; NCL=1; NQT=1; NQY=1; NWI=1; PIK=1; PPW=1; SDZ=1; SEN=1; SOU=1; STN=1; SYY=1; TRE=1; WIC=1; WRY=1 }
$IE = @{ CFN=1; DUB=1; GWY=1; KIR=1; NOC=1; ORK=1; SNN=1; WAT=1 }
$CD = @{ GCI=1; IOM=1; JER=1 }
$BOGUS = @{ BSZ=1; DSE=1 }
# Anything inside the British Isles is a hop, not a deal, whichever end
# you start from. Same rule as the search and the Monday email.
function Domestic([string] $o, [string] $d) {
  if ($UK.ContainsKey($d) -or $IE.ContainsKey($d) -or $CD.ContainsKey($d)) { return $true }
  return $false
}

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
$GBP = [string][char]0xA3
$FONT = "font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"

# Nothing sooner than two days out (Henry, 8 Sep 2026).
$today = (Get-Date).AddDays(2).ToString("yyyy-MM-dd")
$limit = (Get-Date).AddDays($Horizon).ToString("yyyy-MM-dd")
$stamp = (Get-Date).ToString("yyyy-MM-dd")

# ---- send mode: publish today's drafts to each airport's free members ---
if ($Send) {
  $sent = 0
  foreach ($a in $LIST) {
    $slug = "shower-" + $a.slug + "-" + $stamp
    $d = @((Call GET "/posts/?limit=1&filter=$([uri]::EscapeDataString("slug:$slug"))").posts)
    if (-not $d -or $d[0].status -ne "draft") { Write-Host ("{0}: no draft to send ({1})" -f $a.code, $slug); continue }
    $segment = "label:loc-" + $a.slug + "+status:free"
    $q = "?newsletter=$Newsletter&email_segment=" + [uri]::EscapeDataString($segment)
    $r = Call PUT ("/posts/" + $d[0].id + "/" + $q) @{ posts = @(@{ status = "published"; updated_at = $d[0].updated_at }) }
    Write-Host ("{0}: sent to {1} ({2})" -f $a.code, $segment, $r.posts[0].status)
    $sent++
  }
  Write-Host "Sent $sent shower emails."
  exit 0
}

# ---- build mode -------------------------------------------------------------
$made = 0
foreach ($a in $LIST) {
  $file = Join-Path $RepoDir ("fares-" + $a.code + ".json")
  if (-not (Test-Path $file)) { Write-Host ("{0}: no fare file, skipped" -f $a.code); continue }
  $data = Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json

  # Best option per destination: cheapest, up to one change, at least 25
  # per cent under the usual price, a place with a name. One row per
  # destination so twelve rows are twelve places, not twelve Faro dates.
  $cands = @()
  foreach ($r in $data.fares) {
    $d = [string]$r.destination
    if ((Domestic $a.code $d) -or $BOGUS.ContainsKey($d) -or -not $PLACES.ContainsKey($d)) { continue }
    $typ = if ($r.typical) { [int]$r.typical } else { 0 }
    if ($typ -le 0) { continue }
    $best = $null
    foreach ($o in @($r.options)) {
      if (-not $o.p -or -not $o.d -or $o.d -lt $today -or $o.d -gt $limit) { continue }
      if ($o.s -and [int]$o.s -gt 1) { continue }
      if (-not $best -or [int]$o.p -lt $best.price) {
        $best = [pscustomobject]@{ dest = $d; price = [int]$o.p; typical = $typ; dep = [string]$o.d; ret = [string]$o.r; stops = [int]($(if ($o.s) { $o.s } else { 0 })); saving = [int]((1 - ([int]$o.p / $typ)) * 100) }
      }
    }
    if ($best -and $best.price -lt $typ * 0.75) { $cands += $best }
  }
  $picks = @($cands | Sort-Object -Property @{ Expression = "saving"; Descending = $true }, price | Select-Object -First $Rows)
  $picks = @($picks | Sort-Object price)
  if ($picks.Count -lt 5) { Write-Host ("{0}: only {1} fares good enough, skipped" -f $a.code, $picks.Count); continue }
  $cheapest = ($picks | Measure-Object price -Minimum).Minimum
  $bestSaving = ($picks | Measure-Object saving -Maximum).Maximum
  $totalSaving = 0; foreach ($p in $picks) { $totalSaving += ($p.typical - $p.price) }
  $under30 = @($picks | Where-Object { $_.price -le 30 }).Count

  $goTo = "/join-" + $a.slug + "/?intent=trial"
  $goExp = [long][double]::Parse((Get-Date -UFormat %s)) + 21 * 86400
  $goLink = "$Worker/go?u=%%{uuid}%%&k=%%{key}%%&to=" + [uri]::EscapeDataString($goTo) + "&e=$goExp&s=" + (Go-Sign $goTo $goExp)

  $rowsHtml = ""
  for ($i = 0; $i -lt $picks.Count; $i++) {
    $f = $picks[$i]; $pl = $PLACES[$f.dest]
    $fc = FlagCode $pl.flag
    $flag = if ($fc) { "<img src=`"https://flagcdn.com/w20/$fc.png`" width=`"18`" height=`"13`" alt=`"$(Esc $pl.name)`" style=`"border:0;display:inline-block;vertical-align:-2px;border-radius:2px;margin-right:6px;`">" } else { "" }
    $link = "$Site/search/?from=$($a.code)&to=" + [uri]::EscapeDataString($pl.name)
    $bg = if ($i % 2 -eq 0) { "#FFFFFF" } else { "#F7FBFE" }
    $when = (Day $f.dep) + $(if ($f.ret) { " to " + (Day $f.ret) + " &middot; return" } else { " &middot; one way" }) + $(if ($f.stops -eq 0) { " &middot; direct" } else { " &middot; 1 stop" })
    $rowsHtml += "<tr><td style=`"padding:0;`"><a href=`"$link`" style=`"text-decoration:none;display:block;`">" +
      "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" bgcolor=`"$bg`" style=`"background:$bg;border-bottom:1px solid #E8F1F8;`"><tr>" +
      "<td style=`"padding:12px 16px;$FONT`">" +
        "<div style=`"font-size:15.5px;font-weight:800;color:#0E3550;`">$flag$(Esc $pl.name)</div>" +
        "<div style=`"font-size:12.5px;color:#5B7387;margin-top:3px;`">$when</div>" +
      "</td>" +
      "<td align=`"right`" style=`"padding:12px 16px;white-space:nowrap;$FONT`">" +
        "<div style=`"font-size:20px;font-weight:900;color:#0E6FB6;`">$GBP$($f.price)</div>" +
        "<div style=`"font-size:11.5px;color:#7A90A5;text-decoration:line-through;`">usually $GBP$($f.typical)</div>" +
      "</td></tr></table></a></td></tr>"
  }

  $head = "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" bgcolor=`"#0E6FB6`" style=`"background:#0E6FB6;border-radius:18px;`"><tr><td style=`"padding:26px 22px 22px;text-align:center;$FONT`">" +
    "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:#BEE3F8;`">On us this week</div>" +
    "<div style=`"font-size:27px;font-weight:900;color:#FFFFFF;line-height:1.15;margin:8px 0 6px;letter-spacing:-.5px;`">Every fare from $(Esc $a.name). Nothing hidden.</div>" +
    "<div style=`"font-size:14.5px;color:#D7EDFA;line-height:1.5;max-width:34em;margin:0 auto;`">You are on the free list, so on a Monday you see three fares and a blur. Today you see the lot. This is what members get every week for $($GBP)2.99 a month.</div>" +
    "</td></tr></table>"

  $statRow = "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"8`" border=`"0`" style=`"border-collapse:separate;margin-top:12px;`"><tr>" +
    "<td width=`"33%`" bgcolor=`"#F0F6FB`" style=`"background:#F0F6FB;border-radius:12px;padding:12px 8px;text-align:center;$FONT`"><div style=`"font-size:19px;font-weight:900;color:#0E3550;`">$($picks.Count)</div><div style=`"font-size:11px;color:#5B7387;`">places, $under30 under $($GBP)30</div></td>" +
    "<td width=`"33%`" bgcolor=`"#F0F6FB`" style=`"background:#F0F6FB;border-radius:12px;padding:12px 8px;text-align:center;$FONT`"><div style=`"font-size:19px;font-weight:900;color:#0E3550;`">$GBP$cheapest</div><div style=`"font-size:11px;color:#5B7387;`">cheapest this week</div></td>" +
    "<td width=`"33%`" bgcolor=`"#F0F6FB`" style=`"background:#F0F6FB;border-radius:12px;padding:12px 8px;text-align:center;$FONT`"><div style=`"font-size:19px;font-weight:900;color:#0E3550;`">$GBP$totalSaving</div><div style=`"font-size:11px;color:#5B7387;`">below the usual, added up</div></td>" +
    "</tr></table>"

  $fares = "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#7A90A5;margin:20px 0 8px;$FONT`">From $(Esc $a.name), checked this morning</div>" +
    "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"border:1px solid #E3EEF6;border-radius:14px;overflow:hidden;`">$rowsHtml</table>" +
    "<div style=`"font-size:12px;color:#7A90A5;margin-top:8px;$FONT`">Real prices from this morning's check. Fares like these go within a few days, which is why members get them every Monday and can search every date in between.</div>"

  $price = "<div style=`"margin-top:22px;padding:18px 20px;border-radius:14px;background:#0E3550;$FONT`">" +
    "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#F5C242;`">What $($GBP)2.99 a month gets you</div>" +
    "<div style=`"font-size:14.5px;color:#D7EDFA;line-height:1.65;margin-top:8px;`">" +
    "&#10003; Every fare from $(Esc $a.name), every Monday, none of them blurred<br>" +
    "&#10003; The full search: every route, every date, seven months ahead, from all 31 airports<br>" +
    "&#10003; Book straight through to the airline. We never touch your money<br>" +
    "&#10003; Cancel in two taps. No contract, no notice</div>" +
    "<div style=`"font-size:13.5px;color:#BEE3F8;line-height:1.5;margin-top:12px;border-top:1px solid rgba(255,255,255,.18);padding-top:12px;`">$($GBP)2.99 is less than a flat white. The cheapest fare above saves $GBP$(($picks | Sort-Object saving -Descending | Select-Object -First 1).typical - ($picks | Sort-Object saving -Descending | Select-Object -First 1).price) on its own. One good fare pays for the whole year.</div>" +
    "</div>"

  $cta = "<div style=`"text-align:center;margin-top:20px;$FONT`">" +
    "<table cellpadding=`"0`" cellspacing=`"0`" border=`"0`" align=`"center`"><tr><td bgcolor=`"#F5C242`" style=`"background:#F5C242;border-radius:999px;`">" +
    "<a href=`"$goLink`" style=`"display:inline-block;color:#12384F;font-weight:900;font-size:17px;padding:15px 30px;text-decoration:none;$FONT`">Try 40 days free &rarr;</a>" +
    "</td></tr></table>" +
    "<div style=`"font-size:12px;color:#7A90A5;margin-top:10px;`">Then $($GBP)2.99 a month or $($GBP)29 a year. Cancel any time, no contract.</div></div>"

  $signoff = "<div style=`"margin-top:20px;font-size:13.5px;color:#46607A;$FONT`">Your Monday email still comes either way. This one is just to show you what is behind the blur.<br><br>Have a good week,<br><b style=`"color:#0E3550;`">Henry</b><br>@henryoscarmoores</div>"

  $html = $head + $statRow + $fares + $price + $cta + $signoff
  $card = @{ type = "html"; version = 1; html = $html }
  $lexical = @{ root = @{ type = "root"; version = 1; direction = "ltr"; format = ""; indent = 0; children = @($card) } } | ConvertTo-Json -Depth 12 -Compress

  $slug = "shower-" + $a.slug + "-" + $stamp
  $existing = @((Call GET "/posts/?limit=5&filter=$([uri]::EscapeDataString("slug:$slug"))").posts)
  if ($existing.Count -gt 0 -and -not $Replace) { Write-Host ("{0}: draft already exists ({1}), skipped" -f $a.code, $slug); continue }
  foreach ($e in $existing) { if ($e.status -eq "draft") { Call DELETE "/posts/$($e.id)/" | Out-Null } }

  $post = @{ posts = @(@{
    title = "$($a.name): $($picks.Count) cheap fares this week, all of them, on us"
    slug = $slug
    lexical = $lexical
    status = "draft"
    visibility = "members"
    custom_excerpt = "Every cheap fare from $($a.name) this week with nothing blurred, and what members pay to get this every Monday."
    tags = @(@{ name = "#shower-auto" })
  }) }
  $new = (Call POST "/posts/?source=html" $post).posts[0]
  $made++
  Write-Host ("{0}: draft made, {1} fares, cheapest {2}{3}, best saving {4}%, {5}{6} below usual added up -> {7} (preview {8}/p/{9}/)" -f $a.code, $picks.Count, $GBP, $cheapest, $bestSaving, $GBP, $totalSaving, $new.slug, $Site, $new.uuid)
}
Write-Host "Made $made shower drafts. Send with -Send after Henry's yes."
