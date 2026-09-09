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
  [int] $Horizon = 120,
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
  @{ code="INV"; name="Inverness"; slug="inverness" },
  @{ code="HUY"; name="Humberside"; slug="humberside" },
  @{ code="JER"; name="Jersey"; slug="jersey" },
  @{ code="GCI"; name="Guernsey"; slug="guernsey" },
  @{ code="IOM"; name="Isle of Man"; slug="isle-of-man" },
  @{ code="KIR"; name="Kerry"; slug="kerry" },
  @{ code="LDY"; name="City of Derry"; slug="derry" },
  @{ code="DND"; name="Dundee"; slug="dundee" }
)
if ($Airports) { $want = @($Airports | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim().ToUpper() } | Where-Object { $_ }); $LIST = @($LIST | Where-Object { $want -contains $_.code }) }

$UK = @{ ABZ=1; ACI=1; BEB=1; BFS=1; BHD=1; BHX=1; BOH=1; BRR=1; BRS=1; CAL=1; CWL=1; DND=1; EDI=1; EMA=1; EXT=1; GLA=1; HUY=1; ILY=1; INV=1; ISC=1; KOI=1; LBA=1; LDY=1; LEQ=1; LGW=1; LHR=1; LON=1; LPL=1; LSI=1; LTN=1; MAN=1; MME=1; NCL=1; NQT=1; NQY=1; NWI=1; PIK=1; PPW=1; SDZ=1; SEN=1; SOU=1; STN=1; SYY=1; TRE=1; WIC=1; WRY=1 }
$IE = @{ CFN=1; DUB=1; GWY=1; KIR=1; NOC=1; ORK=1; SNN=1; WAT=1 }
$CD = @{ GCI=1; IOM=1; JER=1 }
$BOGUS = @{ BSZ=1; DSE=1 }
# Winter sun is the search's own list (theme=sun in search.js) plus the
# Tenerife, Larnaca, Madeira and Enfidha codes. City breaks are the places
# people actually want a weekend in. Everything else is a bargain.
$SUN = @{}; foreach ($c in "ACE LPA TCI TFS TFN FUE AGA RAK SSH HRG CAI DXB MLA PFO LCA AGP ALC FAO MIR TUN NBE AYT DLM FNC".Split(" ")) { $SUN[$c] = 1 }
$CITY = @{}; foreach ($c in ("BCN LIS OPO FCO CIA MXP BGY LIN VCE TSF NAP PRG BUD VIE CPH AMS ATH IBZ PMI SVQ VLC MAD NCE MRS BER KRK CDG ORY BVA GVA SZG INN SPU DBV ZAD PSA FLR BLQ VRN TRN MUC HAM STR DUS CGN FRA BRU ARN OSL HEL KEF IST SAW RVN TOS BGO RIX TLL VNO WAW WMI GDN LJU ZAG TIA SOF OTP BOD LYS TLS NTE BIO SDR BJV ADB TIV PUY BRI CTA PMO OLB CAG CFU RHO HER SKG").Split(" ")) { $CITY[$c] = 1 }
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
function DayShort([string] $iso) { $d = [datetime]::ParseExact($iso, "yyyy-MM-dd", $null); return $d.ToString("d MMM") }
$GBP = [string][char]0xA3
$FONT = "font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"

# Nothing sooner than a week out (Henry, 9 Sep 2026: "no flights on today or tomorrow with unrealistic time frames").
$today = (Get-Date).AddDays(7).ToString("yyyy-MM-dd")
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

  # Per destination, the cheapest one way and the cheapest return, each up
  # to one change and inside the window. A one way is judged against the
  # route's typical price; a return against the route's usual return
  # price, the mean of its return options, which is the figure the search
  # shows. Under 75 per cent of usual to count. Henry, 9 Sep 2026: "a few
  # return trips in there as well, winter sun remember and desirable
  # destinations".
  $ows = @(); $rts = @()
  foreach ($r in $data.fares) {
    $d = [string]$r.destination
    if ((Domestic $a.code $d) -or $BOGUS.ContainsKey($d) -or -not $PLACES.ContainsKey($d)) { continue }
    $typ = if ($r.typical) { [int]$r.typical } else { 0 }
    $rtAll = @($r.options | Where-Object { $_.r -and $_.p })
    $rtTyp = if ($rtAll.Count -ge 3) { [int][math]::Round((($rtAll | Measure-Object p -Average).Average)) } else { 0 }
    $bo = $null; $br = $null
    foreach ($o in @($r.options)) {
      if (-not $o.p -or -not $o.d -or $o.d -lt $today -or $o.d -gt $limit) { continue }
      if ($o.s -and [int]$o.s -gt 1) { continue }
      $row = [pscustomobject]@{ dest = $d; price = [int]$o.p; typical = 0; dep = [string]$o.d; ret = [string]$o.r; stops = [int]($(if ($o.s) { $o.s } else { 0 })); saving = 0; kind = "" }
      if ($o.r) { if ($rtTyp -gt 0 -and (-not $br -or $row.price -lt $br.price)) { $row.typical = $rtTyp; $br = $row } }
      else      { if ($typ -gt 0 -and (-not $bo -or $row.price -lt $bo.price)) { $row.typical = $typ; $bo = $row } }
    }
    foreach ($b in @($bo, $br)) {
      if (-not $b) { continue }
      if ($b.price -ge $b.typical * 0.75) { continue }
      $b.saving = [int][math]::Floor((1 - ($b.price / $b.typical)) * 100)
      $m = [int]$b.dep.Substring(5, 2)
      # Winter sun means winter: October to March, same rule as the search.
      $b.kind = if ($SUN.ContainsKey($d) -and ($m -ge 10 -or $m -le 3)) { "sun" } elseif ($CITY.ContainsKey($d)) { "city" } else { "bargain" }
      if ($b.ret) { $rts += $b } else { $ows += $b }
    }
  }

  # The mix: a third winter sun, a third city breaks, the rest the plain
  # bargains. Sun and city each lead with up to two returns. One row per
  # destination. Where a small airport has no sun or city fares the
  # bargains take the slots.
  $used = @{}
  function Take($pool, [int] $n) {
    $out = @()
    foreach ($f in @($pool)) { if ($out.Count -ge $n) { break }; if ($used.ContainsKey($f.dest)) { continue }; $used[$f.dest] = 1; $out += $f }
    return $out
  }
  $nSun = [math]::Floor($Rows / 3); $nCity = [math]::Floor($Rows / 3)
  $sunRt  = @($rts | Where-Object { $_.kind -eq "sun" }  | Sort-Object price)
  $sunOw  = @($ows | Where-Object { $_.kind -eq "sun" }  | Sort-Object price)
  $cityRt = @($rts | Where-Object { $_.kind -eq "city" } | Sort-Object price)
  $cityOw = @($ows | Where-Object { $_.kind -eq "city" } | Sort-Object price)
  $sunPicks = @(Take $sunRt 2); $sunPicks += @(Take $sunOw ($nSun - $sunPicks.Count)); $sunPicks += @(Take $sunRt ($nSun - $sunPicks.Count)); $sunPicks = @($sunPicks | Sort-Object price)
  $cityPicks = @(Take $cityRt 2); $cityPicks += @(Take $cityOw ($nCity - $cityPicks.Count)); $cityPicks += @(Take $cityRt ($nCity - $cityPicks.Count)); $cityPicks = @($cityPicks | Sort-Object price)
  $nBar = $Rows - $sunPicks.Count - $cityPicks.Count
  $barPool = @($ows | Sort-Object -Property @{ Expression = "saving"; Descending = $true }, price)
  $barPicks = @(Take $barPool $nBar); $barPicks += @(Take @($rts | Sort-Object price) ($nBar - $barPicks.Count)); $barPicks = @($barPicks | Sort-Object price)
  $picks = @($sunPicks + $cityPicks + $barPicks)
  if ($picks.Count -lt 5) { Write-Host ("{0}: only {1} fares good enough, skipped" -f $a.code, $picks.Count); continue }
  $cheapest = ($picks | Measure-Object price -Minimum).Minimum
  $bestSaving = ($picks | Measure-Object saving -Maximum).Maximum
  $totalSaving = 0; foreach ($p in $picks) { $totalSaving += ($p.typical - $p.price) }
  $returns = @($picks | Where-Object { $_.ret }).Count

  $goTo = "/join-" + $a.slug + "/?intent=trial"
  $goExp = [long][double]::Parse((Get-Date -UFormat %s)) + 21 * 86400
  $goLink = "$Worker/go?u=%%{uuid}%%&k=%%{key}%%&to=" + [uri]::EscapeDataString($goTo) + "&e=$goExp&s=" + (Go-Sign $goTo $goExp)

  $TOTAL_AIRPORTS = 38
  # ---- the email, in the Monday email's clothes ------------------------
  # Same hero (sky gradient, cloud and sun images, white card), the same
  # striped fare rows and stat pills as build-monday.ps1, so the free list
  # sees the family resemblance. Henry, 9 Sep 2026: the first draft looked
  # "bland with no background" next to the Monday emails.
  $CDNA = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/assets/"
  $STRIPES = @("#FF6B4A", "#2ED3A5", "#7C5CFF")
  function Stat([string] $big, [string] $small) {
    return "<td style=`"padding:0 4px;`"><table cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"border-collapse:separate;background:#EAF6FD;border:1px solid #D7EDFA;border-radius:12px;`"><tr><td style=`"padding:8px 12px;text-align:center;$FONT`"><div style=`"font-size:20px;font-weight:900;color:#0E3550;letter-spacing:-.5px;line-height:1;`">$big</div><div style=`"font-size:9.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#46607A;margin-top:3px;`">$small</div></td></tr></table></td>"
  }
  function Row($f, [int] $i) {
    $pl = $PLACES[$f.dest]
    $fc = FlagCode $pl.flag
    $stripe = $STRIPES[$i % 3]
    $link = "$Site/search/?from=$($a.code)&to=" + [uri]::EscapeDataString($pl.name)
    $when = $(if ($f.ret) { (DayShort $f.dep) + " to " + (DayShort $f.ret) + " &middot; return" } else { (Day $f.dep) + " &middot; one way" }) + $(if ($f.stops -eq 0) { " &middot; direct" } else { " &middot; 1 stop" })
    $tag = "<span style=`"display:inline-block;font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;background:#FF6B4A;color:#FFFFFF;border-radius:4px;padding:2px 6px;margin-left:6px;vertical-align:middle;`">$($f.saving)% off</span>"
    $flagCell = if ($fc) { "<img src=`"https://flagcdn.com/w40/$fc.png`" width=`"26`" height=`"20`" alt=`"`" style=`"display:block;border-radius:3px;`">" } else { "<div style=`"width:26px;height:20px;background:#E6EEF5;border-radius:3px;`"></div>" }
    return "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"width:100%;border-collapse:separate;background:#F7FBFE;border-radius:12px;margin-bottom:8px;`"><tr>" +
      "<td style=`"width:6px;background:$stripe;border-radius:12px 0 0 12px;`"></td>" +
      "<td style=`"width:34px;padding:10px 4px 10px 10px;vertical-align:middle;`">$flagCell</td>" +
      "<td style=`"padding:10px 6px;vertical-align:middle;$FONT`"><a href=`"$link`" style=`"text-decoration:none;color:#0E3550;`"><div style=`"font-size:15px;font-weight:800;color:#0E3550;letter-spacing:-.2px;`">$(Esc $pl.name)$tag</div><div style=`"font-size:11.5px;color:#46607A;`">$when</div></a></td>" +
      "<td style=`"padding:10px 10px 10px 6px;text-align:right;vertical-align:middle;white-space:nowrap;$FONT`"><div style=`"font-size:20px;font-weight:900;color:#0E3550;letter-spacing:-.5px;`">$GBP$($f.price)</div><div style=`"font-size:10px;font-weight:600;color:#7A90A5;text-decoration:line-through;`">usually $GBP$($f.typical)</div></td>" +
      "</tr></table>"
  }
  $rowsHtml = ""
  $groups = @(, @("Winter sun", $sunPicks)) + @(, @("City breaks", $cityPicks)) + @(, @("The bargains", $barPicks))
  $i = 0
  foreach ($g in $groups) {
    $list = @($g[1]); if ($list.Count -eq 0) { continue }
    $rowsHtml += "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#7A90A5;margin:16px 0 8px;$FONT`">$($g[0])</div>"
    foreach ($f in $list) { $rowsHtml += (Row $f $i); $i++ }
  }

  $head = "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" bgcolor=`"#1F7FC4`" style=`"width:100%;border-collapse:separate;background:#1F7FC4;background-image:linear-gradient(180deg,#0E6FB6 0%,#3E9BE0 75%,#7CC3F2 100%);border-radius:18px;`">" +
    "<tr><td style=`"padding:12px 14px 0 14px;`"><table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"width:100%;`"><tr><td align=`"left`" style=`"width:60px;`"><img src=`"$($CDNA)email-cloud.png`" width=`"60`" height=`"25`" alt=`"`" style=`"display:block;`"></td><td></td><td align=`"right`" style=`"width:40px;`"><img src=`"$($CDNA)email-sun.png`" width=`"40`" height=`"40`" alt=`"`" style=`"display:block;`"></td></tr></table></td></tr>" +
    "<tr><td style=`"padding:6px 14px 0 14px;`"><table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" bgcolor=`"#FFFFFF`" style=`"width:100%;border-collapse:separate;background:#FFFFFF;border-radius:14px;`"><tr><td style=`"padding:16px 16px 14px 16px;text-align:center;$FONT`">" +
    "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:2.2px;text-transform:uppercase;color:#0E6FB6;`">$(Esc $a.name) &middot; on us this week</div>" +
    "<div style=`"font-size:28px;font-weight:900;letter-spacing:-1px;line-height:1.05;color:#0E3550;margin-top:8px;`">Every fare.<br><span style=`"color:#0E6FB6;`">Nothing hidden.</span></div>" +
    "<div style=`"font-size:13.5px;color:#46607A;margin-top:8px;`">Normally you get three fares on a Monday and the rest blurred out. Today I'm showing you the lot, exactly what members get every week for $($GBP)2.99 a month.</div>" +
    "<table align=`"center`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"margin-top:14px;`"><tr>$(Stat "$($picks.Count)" "places")$(Stat "$GBP$cheapest" "cheapest")$(Stat "$GBP$totalSaving" "under usual")</tr></table>" +
    "</td></tr></table></td></tr>" +
    "<tr><td style=`"padding:8px 14px 12px 14px;`"><table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"width:100%;`"><tr><td></td><td align=`"right`" style=`"width:60px;`"><img src=`"$($CDNA)email-cloud.png`" width=`"60`" height=`"25`" alt=`"`" style=`"display:block;`"></td></tr></table></td></tr></table>"
  $statRow = ""

  $fares = "<div style=`"font-size:13.5px;color:#46607A;margin-top:18px;$FONT`">All from $(Esc $a.name), all checked this morning. The crossed out price is what people usually pay. Tap one and it opens in the search.</div>" + $rowsHtml +
    "<div style=`"margin-top:6px;padding:12px 14px;border-radius:12px;background:#FFF4D1;font-size:13px;color:#5A4210;$FONT`"><b style=`"color:#3A2A08;`">Move quick.</b> Fares like these usually go within a few days. Members get a list like this every Monday and can search every date in between.</div>"

  $bestPick = ($picks | Sort-Object saving -Descending | Select-Object -First 1)
  $price = "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"width:100%;border-collapse:separate;background:#F0F6FB;border-radius:14px;margin-top:18px;`"><tr><td style=`"padding:18px 16px 18px 16px;text-align:center;$FONT`">" +
    "<div style=`"width:38px;height:38px;line-height:38px;border-radius:50%;background:#F5C242;margin:0 auto 6px auto;font-size:18px;text-align:center;`">&#9992;</div>" +
    "<div style=`"font-size:17px;font-weight:800;color:#0E3550;letter-spacing:-.3px;`">What $($GBP)2.99 a month gets you</div>" +
    "<div style=`"font-size:13px;color:#46607A;line-height:1.7;margin:8px 0 4px;text-align:left;`">" +
    "&#10003; Every fare from $(Esc $a.name), every Monday, nothing blurred<br>" +
    "&#10003; Hundreds of pounds of savings a year. This one email has $GBP$totalSaving under the usual prices<br>" +
    "&#10003; The full search: every route, every date, seven months ahead, all $TOTAL_AIRPORTS airports<br>" +
    "&#10003; Book straight through to the airline. We never touch your money<br>" +
    "&#10003; And you back me: 24, building this on my own, no big company behind it</div>" +
    "<div style=`"font-size:12.5px;color:#46607A;margin:8px 0 12px;`">That's less than a coffee. $(Esc $PLACES[$bestPick.dest].name) alone is $GBP$($bestPick.typical - $bestPick.price) under the usual price, so one good fare pays for the whole year.</div>" +
    "<table cellpadding=`"0`" cellspacing=`"0`" border=`"0`" align=`"center`"><tr><td><a href=`"$goLink`" style=`"text-decoration:none;`"><img src=`"$($CDNA)email-try.png`" width=`"224`" height=`"49`" alt=`"Try 40 days free`" style=`"display:block;border:0;width:224px;height:49px;`"></a></td></tr></table>" +
    "<div style=`"font-size:11.5px;color:#7A90A5;margin-top:10px;`">Then $($GBP)2.99 a month or $($GBP)29 a year. Cancel any time, no contract. One tap, no password.</div>" +
    "</td></tr></table>"
  $cta = ""

  $signoff = "<div style=`"margin-top:18px;font-size:13.5px;color:#46607A;$FONT`">Your Monday email still comes either way, this one's just to show you what's behind the blur.<br><br>Speak Monday,<br><b style=`"color:#0E3550;`">Henry</b><br>@henryoscarmoores</div>"

  $html = $head + $statRow + $fares + $price + $cta + $signoff
  $card = @{ type = "html"; version = 1; html = $html }
  $lexical = @{ root = @{ type = "root"; version = 1; direction = "ltr"; format = ""; indent = 0; children = @($card) } } | ConvertTo-Json -Depth 12 -Compress

  $slug = "shower-" + $a.slug + "-" + $stamp
  $existing = @((Call GET "/posts/?limit=5&filter=$([uri]::EscapeDataString("slug:$slug"))").posts)
  if ($existing.Count -gt 0 -and -not $Replace) { Write-Host ("{0}: draft already exists ({1}), skipped" -f $a.code, $slug); continue }
  foreach ($e in $existing) { if ($e.status -eq "draft") { Call DELETE "/posts/$($e.id)/" | Out-Null } }

  # Inbox hook: the three best fares by name and price, no duplicates.
  $hookBits = @(); $hookSeen = @{}
  foreach ($f in @(@($sunPicks | Select-Object -First 1) + @($cityPicks | Select-Object -First 1) + @($picks | Where-Object { $_.ret } | Sort-Object price | Select-Object -First 1) + @($barPicks | Select-Object -First 1))) {
    if (-not $f -or $hookSeen.ContainsKey($f.dest) -or $hookBits.Count -ge 3) { continue }
    $hookSeen[$f.dest] = 1
    $hookBits += ($PLACES[$f.dest].name + " " + $GBP + $f.price + $(if ($f.ret) { " return" } else { "" }))
  }
  $hook = ($hookBits -join ", ") + ". The blur is off, on me."

  $post = @{ posts = @(@{
    title = "Secret access, one week only: every cheap flight from $($a.name)"
    slug = $slug
    lexical = $lexical
    status = "draft"
    visibility = "members"
    custom_excerpt = $hook
    tags = @(@{ name = "#shower-auto" })
  }) }
  $new = (Call POST "/posts/?source=html" $post).posts[0]
  $made++
  Write-Host ("{0}: draft made, {1} fares ({2} returns; sun {3}, city {4}, bargains {5}), cheapest {6}{7}, best saving {8}%, {9}{10} below usual added up -> {11} (preview {12}/p/{13}/)" -f $a.code, $picks.Count, $returns, $sunPicks.Count, $cityPicks.Count, $barPicks.Count, $GBP, $cheapest, $bestSaving, $GBP, $totalSaving, $new.slug, $Site, $new.uuid)
}
Write-Host "Made $made shower drafts. Send with -Send after Henry's yes."
