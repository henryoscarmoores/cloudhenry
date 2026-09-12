<#
  Builds the Monday email drafts, one per airport, from that morning's
  fares, in the approved design (mockups/monday-teaser-v2.html).

  What each draft holds, top to bottom:
    1. Sky header with the pixel clouds and sun, the airport and week,
       and three stat boxes (fares found, cheapest, average saving).
    2. The three best fares in full, with what people usually pay.
    3. For people on the list only (email segment status:free): the next
       fares blurred behind a golden lock and one button, "See all N,
       40 days free". The button goes through the Worker's /go, which
       swaps the member's uuid for a sign-in link and opens the plan
       chooser: one tap, no password.
    4. "Your search, one tap": four prefilled searches for the airport.
    5. Paywall marker, then for members (status:-free) the full list,
       one way then returns, every fare a Book button.
    6. Sign-off.

  Ghost sends the right version to each reader from the one post. Henry
  opens the draft, picks the airport
  label as the audience, and presses Send. Old drafts are not touched;
  these are new drafts, tagged monday-auto. -Replace redoes today's.

  Needs the Ghost Admin key: GHOST_ADMIN_KEY in the environment, or a
  gitignored .ghostkey beside this script.

  Usage:
    .\build-monday.ps1                 all fourteen airports
    .\build-monday.ps1 -OnlyOrigins MAN
    .\build-monday.ps1 -OnlyOrigins MAN -Replace   redo today's draft

  No em dashes in any copy, per Henry.
#>
[CmdletBinding()]
param(
  [string[]] $OnlyOrigins,
  [switch]   $Replace,
  [int]      $Horizon = 60
)
$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Admin   = "https://cloudhenry.ghost.io/ghost/api/admin"
$Site    = "https://www.cloudhenry.com"
$Worker  = "https://cloudhenry.henryswalk.workers.dev"

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
# Signs the Monday button's destination and expiry with the secret half of
# the Ghost key, which the Worker also holds. The Worker's one-tap sign-in
# only honours links carrying this signature, and only for three weeks.
# The member's own uuid and key are Ghost's %%{uuid}%% and %%{key}%%,
# filled in at send time and checked back with Ghost by the Worker.
function Go-Sign([string] $To, [long] $Exp) {
  $secret = New-Object byte[] ($secretHex.Length / 2)
  for ($i = 0; $i -lt $secret.Length; $i++) { $secret[$i] = [Convert]::ToByte($secretHex.Substring($i * 2, 2), 16) }
  $hmac = New-Object System.Security.Cryptography.HMACSHA256; $hmac.Key = $secret
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

$AIRPORTS = @(
  @{ code="MAN"; name="Manchester";       slug="manchester" },
  @{ code="BHX"; name="Birmingham";       slug="birmingham" },
  @{ code="LBA"; name="Leeds Bradford";   slug="leeds" },
  @{ code="STN"; name="London Stansted";  slug="london-stansted" },
  @{ code="LTN"; name="London Luton";     slug="london-luton" },
  @{ code="BRS"; name="Bristol";          slug="bristol" },
  @{ code="NCL"; name="Newcastle";        slug="newcastle" },
  @{ code="GLA"; name="Glasgow";          slug="glasgow" },
  @{ code="EDI"; name="Edinburgh";        slug="edinburgh" },
  @{ code="LGW"; name="London Gatwick";   slug="london-gatwick" },
  @{ code="LPL"; name="Liverpool";        slug="liverpool" },
  @{ code="BFS"; name="Belfast";          slug="belfast" },
  @{ code="BOH"; name="Bournemouth";      slug="bournemouth" },
  @{ code="CWL"; name="Cardiff";          slug="cardiff" },
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
if ($OnlyOrigins) {
  $want = @($OnlyOrigins | ForEach-Object { $_ -split "," } | Where-Object { $_ } | ForEach-Object { $_.Trim().ToUpper() })   # -File hands a comma list over as one string
  $AIRPORTS = @($AIRPORTS | Where-Object { $want -contains $_.code })
}

$UK = @{ ABZ=1; ACI=1; BEB=1; BFS=1; BHD=1; BHX=1; BOH=1; BRR=1; BRS=1; CAL=1; CWL=1; DND=1; EDI=1; EMA=1; EXT=1; GLA=1; HUY=1; ILY=1; INV=1; ISC=1; KOI=1; LBA=1; LDY=1; LEQ=1; LGW=1; LHR=1; LON=1; LPL=1; LSI=1; LTN=1; MAN=1; MME=1; NCL=1; NQT=1; NQY=1; NWI=1; PIK=1; PPW=1; SDZ=1; SEN=1; SOU=1; STN=1; SYY=1; TRE=1; WIC=1; WRY=1 }
$BOGUS = @{ BSZ=1; DSE=1 }
# Henry, 7 Sep 2026: "we don't want UK users being spammed with England to
# Ireland flights". Anywhere in the British Isles is a hop, not a getaway,
# whichever of the 38 airports you start from, so the whole group is
# kept out of the email. Members can still search for it by name.
$IE = @{ CFN=1; DUB=1; GWY=1; KIR=1; NOC=1; ORK=1; SNN=1; WAT=1 }
$CD = @{ GCI=1; IOM=1; JER=1 }
# A hop inside your own country is never in the email.
function SameCountry([string] $Origin, [string] $Dest) {
  if ($IE.ContainsKey($Origin)) { return $IE.ContainsKey($Dest) }
  return ($UK.ContainsKey($Dest) -and -not $IE.ContainsKey($Dest))
}
function Isles([string] $Dest) { return ($UK.ContainsKey($Dest) -or $IE.ContainsKey($Dest) -or $CD.ContainsKey($Dest)) }
# Ireland from a UK airport, and the UK from Dublin, are real trips, so a
# couple stay in. Cheapest first in, so the couple kept are the best.
function Limit-Isles($Rows, [int] $Max) {
  $n = 0
  $out = New-Object System.Collections.Generic.List[object]
  foreach ($r in @($Rows)) {
    if (Isles $r.dest) { $n++; if ($n -gt $Max) { continue } }
    $out.Add($r)
  }
  $out.ToArray()
}
# Places a reader recognises at a glance. Used to choose the headline
# fares in each email; everything else is still in the full list.
$POPULAR = @{}
foreach ($c in "DUB AMS PAR CDG ORY BCN MAD VLC SVQ LIS OPO FCO ROM MIL MXP BGY VCE NAP PSA FLR BLQ CTA PMO PMI IBZ ALC AGP FAO TFS TCI LPA ACE FUE PRG KRK BUD VIE BER CPH OSL ARN HEL NCE MRS ATH SKG CFU HER RHO SOF BEG SPU DBV ZAD TIA MLA PFO LCA IST SAW AYT DLM BJV RAK AGA DXB NYC JFK BOS BRU GVA ZRH MUC FRA HAM DUS CGN STR SZG INN WAW GDN RIX VNO TLL BOJ VAR MRS BOD TLS LYS NTE OLB CAG BRI TRN VRN".Split(" ")) { $POPULAR[$c] = 1 }

# Names and flags from places.js.
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

# Nothing sooner than two days after the send. A fare dated the day the
# email lands is not one a reader can take (Henry, 8 Sep 2026).
$today = (Get-Date).AddDays(2).ToString("yyyy-MM-dd")
$limit = (Get-Date).AddDays($Horizon).ToString("yyyy-MM-dd")
$monday = (Get-Date)
while ($monday.DayOfWeek -ne 'Monday') { $monday = $monday.AddDays(1) }
if ((Get-Date).DayOfWeek -eq 'Monday') { $monday = Get-Date }
$weekLabel = $monday.ToString("d MMMM")
$dateTag = $monday.ToString("yyyy-MM-dd")

# ---- email building blocks (tables and inline styles: this is email) --

$FONT = "font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"
$STRIPES = @("#FF6B4A", "#2ED3A5", "#7C5CFF")

function PixelCloud([string] $align) {
  # three rows of white cells: the site's pixel cloud
  $c = "background:#FFFFFF;"
  return "<table cellpadding=`"0`" cellspacing=`"0`" border=`"0`" align=`"$align`" style=`"border-collapse:collapse;`">" +
    "<tr><td style=`"width:8px;height:8px;`"></td><td style=`"width:40px;height:8px;$c`"></td><td style=`"width:8px;height:8px;`"></td></tr>" +
    "<tr><td colspan=`"3`" style=`"width:56px;height:10px;$c`"></td></tr>" +
    "<tr><td style=`"width:8px;height:8px;`"></td><td style=`"width:40px;height:8px;$c`"></td><td style=`"width:8px;height:8px;`"></td></tr></table>"
}
function PixelSun() {
  $y = "background:#F5C242;"
  return "<table cellpadding=`"0`" cellspacing=`"0`" border=`"0`" align=`"right`" style=`"border-collapse:collapse;`">" +
    "<tr><td style=`"width:10px;height:10px;`"></td><td style=`"width:20px;height:10px;$y`"></td><td style=`"width:10px;height:10px;`"></td></tr>" +
    "<tr><td colspan=`"3`" style=`"width:40px;height:20px;$y`"></td></tr>" +
    "<tr><td style=`"width:10px;height:10px;`"></td><td style=`"width:20px;height:10px;$y`"></td><td style=`"width:10px;height:10px;`"></td></tr></table>"
}

function FareRow($f, [int] $i, [bool] $blur) {
  $p = $PLACES[$f.dest]
  $name = if ($p) { $p.name } else { $f.dest }
  $fc = if ($p) { FlagCode $p.flag } else { "" }
  $stripe = $STRIPES[$i % 3]
  $when = if ($f.ret) { (DayShort $f.dep) + " to " + (DayShort $f.ret) + " · return" } else { (Day $f.dep) + " · one way" }
  $tag = ""
  if ($f.typical -and $f.typical -gt $f.price * 1.15) {
    $pct = [math]::Round((1 - $f.price / $f.typical) * 100)
    $tag = "<span style=`"display:inline-block;font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;background:#FF6B4A;color:#FFFFFF;border-radius:4px;padding:2px 6px;margin-left:6px;vertical-align:middle;`">$pct% off</span>"
  } elseif ($f.ret) {
    $tag = "<span style=`"display:inline-block;font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;background:#7C5CFF;color:#FFFFFF;border-radius:4px;padding:2px 6px;margin-left:6px;vertical-align:middle;`">return</span>"
  }
  $usual = if ($f.typical -and $f.typical -gt $f.price * 1.15) { "<div style=`"font-size:10px;font-weight:600;color:#7A90A5;text-decoration:line-through;`">usually $([char]0xA3)$($f.typical)</div>" } else { "" }
  $textColor = if ($blur) { "#C9D6E2" } else { "#0E3550" }
  $subColor  = if ($blur) { "#D9E3EC" } else { "#46607A" }
  $flagCell = if ($fc -and -not $blur) { "<img src=`"https://flagcdn.com/w40/$fc.png`" width=`"26`" height=`"20`" alt=`"`" style=`"display:block;border-radius:3px;`">" } else { "<div style=`"width:26px;height:20px;background:#E6EEF5;border-radius:3px;`"></div>" }
  $usualHtml = if ($blur) { "" } else { $usual }
  # Its own fixed-width column beside the price. Ghost's phone stylesheet forces links to 16px and lets them wrap between letters, so the size and nowrap are inline with !important. Colour on the anchor and again on an inner span, which is what stops Gmail restyling it as a blue link in dark mode.
  # The button is a picture. Gmail on phones recolours and underlines any text link in dark mode and squeezes a fixed column into the price; an image keeps its yellow and its size everywhere.
  $book = if (-not $blur -and $f.book) { "<a href=`"$($f.book)`" style=`"text-decoration:none;`"><img src=`"https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/assets/email-book.png`" width=`"66`" height=`"30`" alt=`"Book`" style=`"border:0;display:inline-block;vertical-align:middle;width:66px;height:30px;`"></a>" } else { "" }
  $bookHtml = if ($book) { "<div style=`"margin-top:6px;text-align:right;`">$book</div>" } else { "" }
  return "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"width:100%;border-collapse:separate;background:#F7FBFE;border-radius:12px;margin-bottom:8px;`"><tr>" +
    "<td style=`"width:6px;background:$stripe;border-radius:12px 0 0 12px;`"></td>" +
    "<td style=`"width:34px;padding:10px 4px 10px 10px;vertical-align:middle;`">$flagCell</td>" +
    "<td style=`"padding:10px 6px;vertical-align:middle;$FONT`"><div style=`"font-size:15px;font-weight:800;color:$textColor;letter-spacing:-.2px;`">$(Esc $name)$(if (-not $blur) { $tag })</div><div style=`"font-size:11.5px;color:$subColor;`">$when</div></td>" +
    "<td style=`"padding:10px 10px 10px 6px;text-align:right;vertical-align:middle;white-space:nowrap;$FONT`"><div style=`"font-size:20px;font-weight:900;color:$textColor;letter-spacing:-.5px;`">$([char]0xA3)$($f.price)</div>$usualHtml$bookHtml</td>" +
    "</tr></table>"
}

function Stat([string] $big, [string] $small) {
  return "<td style=`"padding:0 4px;`"><table cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"border-collapse:separate;background:#EAF6FD;border:1px solid #D7EDFA;border-radius:12px;`"><tr><td style=`"padding:8px 12px;text-align:center;$FONT`"><div style=`"font-size:20px;font-weight:900;color:#0E3550;letter-spacing:-.5px;line-height:1;`">$big</div><div style=`"font-size:9.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#46607A;margin-top:3px;`">$small</div></td></tr></table></td>"
}

$created = 0; $skipped = 0
foreach ($a in $AIRPORTS) {
  $file = Join-Path $RepoDir ("fares-" + $a.code + ".json")
  if (-not (Test-Path $file)) { Write-Host "$($a.code): no fare file, skipped"; $skipped++; continue }
  $data = Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json

  # Cheapest option per destination departing within the horizon.
  $best = @{}; $bestRet = @{}
  foreach ($r in $data.fares) {
    if ((SameCountry $a.code $r.destination) -or $BOGUS.ContainsKey($r.destination) -or -not $PLACES.ContainsKey($r.destination)) { continue }
    foreach ($o in @($r.options)) {
      if (-not $o.p -or -not $o.d -or $o.d -lt $today -or $o.d -gt $limit) { continue }
      # Three changes of plane is an itinerary, not a flight deal, and it
      # has no place in an email that leads with a direct Ryanair fare.
      if ($o.PSObject.Properties['s'] -and $o.s -and [int]$o.s -gt 2) { continue }
      $isRet = [bool]$o.r
      $typ = if (-not $isRet -and $r.typical) { [int]$r.typical } else { 0 }
      $ddmm = { param($iso) $d = [datetime]::ParseExact($iso, "yyyy-MM-dd", $null); $d.ToString("ddMM") }
      # currency=gbp or Aviasales serves the landing page in dollars, which
      # reads higher than the pound fare the email just advertised.
      $url = "https://www.aviasales.com/search/" + $a.code + (& $ddmm $o.d) + $r.destination + $(if ($isRet) { & $ddmm $o.r } else { "" }) + "1?currency=gbp"
      $book = "https://tp.media/r?marker=764584&trs=562291&p=4114&u=" + [uri]::EscapeDataString($url)
      # Fares from the Ryanair feed link straight to Ryanair, same as the search does.
      $air = if ($o.PSObject.Properties['a']) { [string]$o.a } else { "" }
      if ($air) {
        $rin = $(if ($isRet) { [string]$o.r } else { "" })
        if ($air -eq 'FR') { $book = "https://www.ryanair.com/gb/en/trip/flights/select?adults=1&teens=0&children=0&infants=0&dateOut=$($o.d)&dateIn=$rin&isReturn=$(if ($isRet) { 'true' } else { 'false' })&originIata=$($a.code)&destinationIata=$($r.destination)" }
        elseif ($air -eq 'W6') { $book = "https://wizzair.com/en-gb/booking/select-flight/$($a.code)/$($r.destination)/$($o.d)/$(if ($isRet) { $rin } else { 'null' })/1/0/0/null" }
        elseif ($air -eq 'DY') { $book = "https://www.norwegian.com/uk/booking/flight-tickets/select-flight/?AdultCount=1&D_City=$($a.code)&A_City=$($r.destination)&D_Day=$($o.d.Substring(8,2))&D_Month=$($o.d.Substring(0,4))$($o.d.Substring(5,2))&CurrencyCode=GBP" + $(if ($isRet) { "&TripType=2&R_Day=$($rin.Substring(8,2))&R_Month=$($rin.Substring(0,4))$($rin.Substring(5,2))" } else { "&TripType=1" }) }
      }
      $cand = [pscustomobject]@{ dest = $r.destination; price = [int]$o.p; dep = [string]$o.d; ret = $(if ($isRet) { [string]$o.r } else { "" }); typical = $typ; book = $book }
      if (-not $best.ContainsKey($r.destination) -or $cand.price -lt $best[$r.destination].price) { $best[$r.destination] = $cand }
      # Returns kept on their own too: a destination's cheapest fare is nearly
      # always a one-way, so without this the "cheapest return" slot was left
      # with whatever oddity happened to be cheaper as a return than a single.
      if ($isRet -and (-not $bestRet.ContainsKey($r.destination) -or $cand.price -lt $bestRet[$r.destination].price)) { $bestRet[$r.destination] = $cand }
    }
  }
  $fares = @(Limit-Isles (@($best.Values | Sort-Object price)) 2)
  if ($fares.Count -lt 6) { Write-Host "$($a.code): only $($fares.Count) fares in the window, skipped"; $skipped++; continue }

  $n = $fares.Count
  $cheapest = $fares[0].price
  $withTyp = @($fares | Where-Object { $_.typical -gt 0 -and $_.typical -gt $_.price })
  $avgSave = if ($withTyp.Count) { [math]::Round((($withTyp | ForEach-Object { 1 - $_.price / $_.typical } | Measure-Object -Average).Average) * 100) } else { 0 }
  $returnsUnder50 = @($fares | Where-Object { $_.ret -and $_.price -le 50 }).Count
  # A mix, not just the three cheapest singles: the cheapest one-way, the
  # cheapest return, then the biggest saving. The blurred four: two of each.
  $owAll = @($fares | Where-Object { -not $_.ret }); $rtAll = @(Limit-Isles (@($bestRet.Values | Sort-Object price)) 1)
  $bySave = @($fares | Where-Object { $_.typical -gt 0 } | Sort-Object { $_.price / $_.typical })
  # The headline three favour places people recognise. Cheapest-of-all
  # from Stansted came out as Klagenfurt, Iasi and Szymany, which nobody
  # opens an email for; the obscure bargains stay in the full list.
  $owPop = @($owAll | Where-Object { $POPULAR.ContainsKey($_.dest) }); $rtPop = @($rtAll | Where-Object { $POPULAR.ContainsKey($_.dest) })
  $bySavePop = @($bySave | Where-Object { $POPULAR.ContainsKey($_.dest) })
  $top = @()
  if ($owPop.Count) { $top += $owPop[0] } elseif ($owAll.Count) { $top += $owAll[0] }
  if ($rtPop.Count) { $top += $rtPop[0] } elseif ($rtAll.Count) { $top += $rtAll[0] }
  foreach ($c in ($bySavePop + $bySave + $fares)) { if ($top.Count -ge 3) { break }; if (-not ($top | Where-Object { $_.dest -eq $c.dest })) { $top += $c } }
  $used = @{}; foreach ($c in $top) { $used[$c.dest] = 1 }
  $locked = @()
  $locked += @(($owPop + $owAll) | Where-Object { -not $used.ContainsKey($_.dest) } | Select-Object -First 2)
  foreach ($c in $locked) { $used[$c.dest] = 1 }
  $locked += @(($rtPop + $rtAll) | Where-Object { -not $used.ContainsKey($_.dest) } | Select-Object -First 2)
  if ($locked.Count -lt 4) { $locked += @($fares | Where-Object { -not $used.ContainsKey($_.dest) -and -not ($locked | Where-Object { $_.dest -eq $_.dest }) } | Select-Object -First (4 - $locked.Count)) }
  $rest = $n - 3

  $title = "$($a.name): $n fares this week, from $([char]0xA3)$cheapest"
  $slugBase = ($a.slug + "-" + $dateTag)

  # Already made today (unless -Replace)?
  $existing = (Call GET "/posts/?filter=$([uri]::EscapeDataString("tag:monday-auto+slug:~'" + $slugBase + "'"))&fields=id,slug,status,updated_at").posts
  if ($existing -and $existing.Count -gt 0) {
    if (-not $Replace) { Write-Host "$($a.code): draft already exists ($($existing[0].slug)), skipped"; $skipped++; continue }
    foreach ($e in $existing) { if ($e.status -eq "draft") { Call DELETE "/posts/$($e.id)/" | Out-Null } }
  }

  $goTo = "/join-" + $a.slug + "/?intent=trial"
  $goExp = [long][double]::Parse((Get-Date -UFormat %s)) + 21 * 86400
  $goLink = "$Worker/go?u=%%{uuid}%%&k=%%{key}%%&to=" + [uri]::EscapeDataString($goTo) + "&e=$goExp&s=" + (Go-Sign $goTo $goExp)

  # 1 + 2: header and top three, for everyone.
  # The header. Phone mail apps in dark mode darken light colours, so the
  # words sit in a white card inside the sky: inverted, that becomes light
  # text on a dark card and still reads. The cloud and sun are images,
  # which dark mode leaves alone.
  $CDNA = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/assets/"
  $hero = "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" bgcolor=`"#1F7FC4`" style=`"width:100%;border-collapse:separate;background:#1F7FC4;background-image:linear-gradient(180deg,#0E6FB6 0%,#3E9BE0 75%,#7CC3F2 100%);border-radius:18px;`">" +
    "<tr><td style=`"padding:12px 14px 0 14px;`"><table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"width:100%;`"><tr><td align=`"left`" style=`"width:60px;`"><img src=`"$($CDNA)email-cloud.png`" width=`"60`" height=`"25`" alt=`"`" style=`"display:block;`"></td><td></td><td align=`"right`" style=`"width:40px;`"><img src=`"$($CDNA)email-sun.png`" width=`"40`" height=`"40`" alt=`"`" style=`"display:block;`"></td></tr></table></td></tr>" +
    "<tr><td style=`"padding:6px 14px 0 14px;`"><table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" bgcolor=`"#FFFFFF`" style=`"width:100%;border-collapse:separate;background:#FFFFFF;border-radius:14px;`"><tr><td style=`"padding:16px 16px 14px 16px;text-align:center;$FONT`">" +
    "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:2.2px;text-transform:uppercase;color:#0E6FB6;`">$(Esc $a.name) · week of $weekLabel</div>" +
    "<div style=`"font-size:28px;font-weight:900;letter-spacing:-1px;line-height:1.05;color:#0E3550;margin-top:8px;`">$n cheap fares.<br><span style=`"color:#0E6FB6;`">Checked this morning.</span></div>" +
    "<div style=`"font-size:13.5px;color:#46607A;margin-top:8px;`">Every one with what people usually pay beside it.</div>" +
    "<table align=`"center`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"margin-top:14px;`"><tr>$(Stat "$n" "fares found")$(Stat "$([char]0xA3)$cheapest" "cheapest")$(Stat "$avgSave%" "avg saving")</tr></table>" +
    "</td></tr></table></td></tr>" +
    "<tr><td style=`"padding:8px 14px 12px 14px;`"><table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"width:100%;`"><tr><td></td><td align=`"right`" style=`"width:60px;`"><img src=`"$($CDNA)email-cloud.png`" width=`"60`" height=`"25`" alt=`"`" style=`"display:block;`"></td></tr></table></td></tr></table>"

  $topHtml = "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#7A90A5;margin:18px 0 8px;$FONT`">This week's best from $(Esc $a.name)</div>"
  for ($i = 0; $i -lt $top.Count; $i++) { $topHtml += FareRow $top[$i] $i $false }

  # 3: the locked list and the button, list members only, email only.
  $lockedHtml = ""
  for ($i = 0; $i -lt $locked.Count; $i++) { $lockedHtml += FareRow $locked[$i] ($i + 3) $true }
  $nudge = "<div style=`"text-align:center;margin:4px 0 12px;$FONT`"><span style=`"font-size:13.5px;color:#46607A;`">That is 3 of <b style=`"color:#0E3550;`">$n fares</b> from $(Esc $a.name) this week. </span><a href=`"$goLink`" style=`"font-size:13.5px;font-weight:800;color:#0E6FB6;text-decoration:none;border-bottom:2px solid #F5C242;`">See them all, 40 days free &rarr;</a></div>"
  $tease = $nudge + "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"width:100%;border-collapse:separate;background:#F0F6FB;border-radius:14px;margin-top:6px;`"><tr><td style=`"padding:8px 8px 0 8px;`">$lockedHtml</td></tr>" +
    "<tr><td style=`"padding:4px 16px 18px 16px;text-align:center;$FONT`">" +
    "<div style=`"width:38px;height:38px;line-height:38px;border-radius:50%;background:#F5C242;margin:0 auto 6px auto;font-size:18px;text-align:center;`">&#128274;</div>" +
    "<div style=`"font-size:17px;font-weight:800;color:#0E3550;letter-spacing:-.3px;`">$rest more fares from $(Esc $a.name)</div>" +
    "<div style=`"font-size:13px;color:#46607A;margin:2px 0 4px;`">$(if ($returnsUnder50) { "Including $returnsUnder50 returns under $([char]0xA3)50." } else { "One way and return, with the exact dates." })</div>" +
    "<div style=`"font-size:12.5px;color:#46607A;margin:0 0 12px;`">Plus the search: every fare from $(Esc $a.name), every date, five months ahead. Weekends, day trips, Christmas markets.</div>" +
    "<table cellpadding=`"0`" cellspacing=`"0`" border=`"0`" align=`"center`"><tr><td bgcolor=`"#F5C242`" style=`"background:#F5C242;border-radius:999px;`"><a href=`"$goLink`" style=`"display:inline-block;color:#12384F;font-weight:900;font-size:17px;padding:16px 32px;text-decoration:none;$FONT`">See all $n, 40 days free &rarr;</a></td></tr></table>" +
    "<div style=`"font-size:11.5px;color:#7A90A5;margin-top:10px;`">Then $([char]0xA3)2.99 a month. Cancel any time, no contract. One tap, no password.</div>" +
    "</td></tr></table>"

  # 5: everything, members only.
  $ows = @($fares | Where-Object { -not $_.ret }); $rts = @($fares | Where-Object { $_.ret })
  # The search is half the membership and most members never open it.
  # Four tappable searches, prefilled for their airport, sit under the
  # fare list every week (Henry, 6 Sep 2026: "encourage usage of our
  # amazing search flights feature").
  $nextMonth = (Get-Date).AddMonths(1); $mk = $nextMonth.ToString("yyyy-MM"); $mn = $nextMonth.ToString("MMMM")
  # Each chip is a table cell, not a styled link: Ghost's phone CSS and
  # Gmail's dark mode strip the styling off links and ran the four pills
  # together as one blue sentence (Henry's screenshot, 7 Sep 2026).
  $chip = { param($label, $qs) "<td width=`"50%`" bgcolor=`"#FFFFFF`" style=`"background:#FFFFFF;border:1px solid #CFE0EE;border-radius:12px;padding:11px 8px;text-align:center;$FONT`"><a href=`"$Site/search/?from=$($a.code)&$qs`" style=`"color:#0E3550;font-weight:800;font-size:14px;text-decoration:none;display:block;`">$label &rarr;</a></td>" }
  $searchStrip = "<div style=`"margin-top:18px;padding:14px 10px 12px;border-radius:14px;background:#F0F6FB;text-align:center;$FONT`">" +
    "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#7A90A5;margin-bottom:6px;`">Your search, one tap</div>" +
    "<div style=`"font-size:13.5px;color:#46607A;margin-bottom:10px;`">Every fare from $(Esc $a.name), every date, five months ahead. Try one:</div>" +
    "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"6`" border=`"0`" style=`"width:100%;border-collapse:separate;`">" +
    "<tr>" + (& $chip "Weekend breaks in $mn" "trip=weekend&month=$mk") + (& $chip "Extreme day trips" "trip=daytrip") + "</tr>" +
    "<tr>" + (& $chip "Christmas markets" "trip=xmas") + (& $chip "Sun under &pound;40" "theme=sun&max=40") + "</tr>" +
    "</table></div>"

  $full = ""
  # Gmail clips anything over about 100KB, so the email carries the best thirteen after the top three and links to the rest.
  $ows = @($ows | Select-Object -First 8); $rts = @($rts | Select-Object -First 5)
  if ($ows.Count) { $full += "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#7A90A5;margin:16px 0 8px;$FONT`">One way</div>"; $i = 0; foreach ($f in $ows) { $full += FareRow $f $i $false; $i++ } }
  if ($rts.Count) { $full += "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#7A90A5;margin:16px 0 8px;$FONT`">Returns</div>"; $i = 0; foreach ($f in $rts) { $full += FareRow $f $i $false; $i++ } }
  $full += "<div style=`"text-align:center;margin-top:14px;$FONT`"><a href=`"$Site/search/?from=$($a.code)`" style=`"display:inline-block;background:#0E6FB6;color:#FFFFFF;font-weight:800;font-size:14px;padding:12px 22px;border-radius:999px;text-decoration:none;`">All $n fares from $(Esc $a.name), searchable &rarr;</a></div>"
  $full += $searchStrip
  $full += "<div style=`"margin-top:14px;padding:12px 14px;border-radius:12px;background:#FFF4D1;font-size:13px;color:#5A4210;$FONT`"><b style=`"color:#3A2A08;`">Book fast.</b> The cheapest fares here are the kind that go within three days. Every price was checked this morning; airlines change them without warning.</div>"

  $signoff = "<div style=`"margin-top:16px;font-size:13.5px;color:#46607A;$FONT`">Have a good day,<br><b style=`"color:#0E3550;`">Henry</b><br>@henryoscarmoores</div>"

  # Cards. HTML cards carry visibility so Ghost sends the right version.
  $cardAll   = @{ type = "html"; version = 1; html = ($hero + $topHtml) }
  $cardTease = @{ type = "html"; version = 1; html = $tease; visibility = @{ web = @{ nonMember = $false; memberSegment = "" }; email = @{ memberSegment = "status:free" } } }
  # The web version of the same tease, for visitors and Freemium members
  # reading the post on the site: the one-tap sign-in link only works in
  # email, so the button opens the plan chooser instead. This is what
  # makes the post a public teaser rather than a wall.
  $teaseWeb = $tease.Replace($goLink, "#/portal/signup")
  $cardTeaseWeb = @{ type = "html"; version = 1; html = $teaseWeb; visibility = @{ web = @{ nonMember = $true; memberSegment = "status:free" }; email = @{ memberSegment = "" } } }
  $paywall   = @{ type = "paywall"; version = 1 }
  $cardFull  = @{ type = "html"; version = 1; html = $full; visibility = @{ web = @{ nonMember = $false; memberSegment = "status:-free" }; email = @{ memberSegment = "status:-free" } } }
  $cardSign  = @{ type = "html"; version = 1; html = $signoff }
  $lexical = @{ root = @{ type = "root"; version = 1; direction = "ltr"; format = ""; indent = 0; children = @($cardAll, $cardTease, $cardTeaseWeb, $cardFull, $cardSign) } } | ConvertTo-Json -Depth 12 -Compress

  $post = @{ posts = @(@{
    title = $title; slug = $slugBase; lexical = $lexical; status = "draft"; visibility = "public"
    tags = @(@{ name = "#paid-draft" }, @{ name = "#monday-auto" })   # internal tags (leading hash), so they never print on the page
    custom_excerpt = "$n cheap fares from $($a.name) this week, checked this morning, from $([char]0xA3)$cheapest."
    email_subject = "$($a.name): $n fares this week, from $([char]0xA3)$cheapest"
  }) }
  $made = Call POST "/posts/" $post
  Write-Host ("{0}: draft made, {1} fares, cheapest $([char]0xA3){2}, avg saving {3}%  -> {4}" -f $a.code, $n, $cheapest, $avgSave, $made.posts[0].slug)
  $created++
}
Write-Host "Done: $created drafts made, $skipped skipped."
