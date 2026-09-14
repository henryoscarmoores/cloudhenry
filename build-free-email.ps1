<#
  The free-list email: "Secret access, one week only". Shows free members
  the best fares from their airport in full, nothing blurred, so they want
  to join. Built from build-shower.ps1 (design Henry approved on 9 Sep
  2026) and brought up to date on 14 Sep 2026:

    - the 20 airports on the site, and no trial: members pay 2.99 from day one
    - popular hotspots only (Henry: "we really need to lure customers in with
      popular hotspots for UK travellers"): winter sun from October to March,
      city breaks, and places UK travellers know. No obscure bargains.
    - half returns, half one way in every section
    - "usually" is the middle price the airline itself is asking on that route,
      never the old price list, and it only shows when the saving is real
      (15 per cent or more)
    - a text button in the Monday style, not the old "Try 40 days free" image

  Usage:
    .\build-free-email.ps1 -Airports MAN     draft for one airport
    .\build-free-email.ps1                   drafts for every airport
    .\build-free-email.ps1 -Replace          replace today's drafts
    .\build-free-email.ps1 -Send             send today's drafts to each
                                             airport's free members (Henry's yes first)

  Picks are saved to %TEMP%\ch-free\picks-CODE.json so the fares can be
  checked against the airlines before anything is sent.
  No em dashes in any copy. Never a discount, never "free tier".
#>
[CmdletBinding()]
param(
  [string[]] $Airports,
  [int] $Rows = 12,
  [int] $Horizon = 120,
  [switch] $Replace,
  [switch] $Send,
  [string] $Schedule
)
$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Admin   = "https://cloudhenry.ghost.io/ghost/api/admin"
$Site    = "https://www.cloudhenry.com"
$Worker  = "https://cloudhenry.henryswalk.workers.dev"
$Newsletter = "default-newsletter"
$PickDir = Join-Path $env:TEMP "ch-free"
New-Item -ItemType Directory -Force $PickDir | Out-Null

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
  @{ code="MAN"; name="Manchester";        slug="manchester" },
  @{ code="BHX"; name="Birmingham";        slug="birmingham" },
  @{ code="LBA"; name="Leeds Bradford";    slug="leeds" },
  @{ code="STN"; name="London Stansted";   slug="london-stansted" },
  @{ code="LTN"; name="London Luton";      slug="london-luton" },
  @{ code="BRS"; name="Bristol";           slug="bristol" },
  @{ code="NCL"; name="Newcastle";         slug="newcastle" },
  @{ code="GLA"; name="Glasgow";           slug="glasgow" },
  @{ code="EDI"; name="Edinburgh";         slug="edinburgh" },
  @{ code="LGW"; name="London Gatwick";    slug="london-gatwick" },
  @{ code="LPL"; name="Liverpool";         slug="liverpool" },
  @{ code="BFS"; name="Belfast";           slug="belfast" },
  @{ code="BOH"; name="Bournemouth";       slug="bournemouth" },
  @{ code="CWL"; name="Cardiff";           slug="cardiff" },
  @{ code="EMA"; name="East Midlands";     slug="east-midlands" },
  @{ code="DUB"; name="Dublin";            slug="dublin" },
  @{ code="PIK"; name="Glasgow Prestwick"; slug="prestwick" },
  @{ code="ORK"; name="Cork";              slug="cork" },
  @{ code="SNN"; name="Shannon";           slug="shannon" },
  @{ code="NOC"; name="Knock";             slug="knock" }
)
$TOTAL_AIRPORTS = $LIST.Count
if ($Airports) { $want = @($Airports | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim().ToUpper() } | Where-Object { $_ }); $LIST = @($LIST | Where-Object { $want -contains $_.code }) }

$UK = @{ ABZ=1; ACI=1; BEB=1; BFS=1; BHD=1; BHX=1; BOH=1; BRR=1; BRS=1; CAL=1; CWL=1; DND=1; EDI=1; EMA=1; EXT=1; GLA=1; HUY=1; ILY=1; INV=1; ISC=1; KOI=1; LBA=1; LDY=1; LEQ=1; LGW=1; LHR=1; LON=1; LPL=1; LSI=1; LTN=1; MAN=1; MME=1; NCL=1; NQT=1; NQY=1; NWI=1; PIK=1; PPW=1; SDZ=1; SEN=1; SOU=1; STN=1; SYY=1; TRE=1; WIC=1; WRY=1 }
$IE = @{ CFN=1; DUB=1; GWY=1; KIR=1; NOC=1; ORK=1; SNN=1; WAT=1 }
$CD = @{ GCI=1; IOM=1; JER=1 }
$BOGUS = @{ BSZ=1; DSE=1 }
# The places UK travellers actually go. Winter sun is the search's own list
# and only counts October to March; city breaks are the shower email's list;
# hotspots are the Monday email's list of places people recognise.
$WINTER_SUN = @{}; foreach ($c in "ACE LPA TCI TFS TFN FUE AGA RAK SSH HRG CAI DXB MLA PFO LCA AGP ALC FAO MIR TUN NBE AYT DLM FNC".Split(" ")) { $WINTER_SUN[$c] = 1 }
$CITY_BREAK = @{}; foreach ($c in ("BCN LIS OPO FCO CIA MXP BGY LIN VCE TSF NAP PRG BUD VIE CPH AMS ATH IBZ PMI SVQ VLC MAD NCE MRS BER KRK CDG ORY BVA GVA SZG INN SPU DBV ZAD PSA FLR BLQ VRN TRN MUC HAM STR DUS CGN FRA BRU ARN OSL HEL KEF IST SAW RVN TOS BGO RIX TLL VNO WAW WMI GDN LJU ZAG TIA SOF OTP BOD LYS TLS NTE BIO BJV ADB TIV PUY BRI CTA PMO OLB CAG CFU RHO HER SKG").Split(" ")) { $CITY_BREAK[$c] = 1 }
$HOTSPOT = @{}; foreach ($c in "DUB AMS PAR CDG ORY BCN MAD VLC SVQ LIS OPO FCO ROM MIL MXP BGY VCE NAP PSA FLR BLQ CTA PMO PMI IBZ ALC AGP FAO TFS TCI LPA ACE FUE PRG KRK BUD VIE BER CPH OSL ARN HEL NCE MRS ATH SKG CFU HER RHO SOF BEG SPU DBV ZAD TIA MLA PFO LCA IST SAW AYT DLM BJV RAK AGA DXB NYC JFK BOS BRU GVA ZRH MUC FRA HAM DUS CGN STR SZG INN WAW GDN RIX VNO TLL BOJ VAR BOD TLS LYS NTE OLB CAG BRI TRN VRN".Split(" ")) { $HOTSPOT[$c] = 1 }
# Anything inside the British Isles is a hop, not a holiday. Same rule as the search.
function Domestic([string] $d) { return ($UK.ContainsKey($d) -or $IE.ContainsKey($d) -or $CD.ContainsKey($d)) }
function Median($nums) { $s = @(@($nums) | Sort-Object); if ($s.Count -eq 0) { return 0 }; return [int]$s[[int][math]::Floor(($s.Count - 1) / 2)] }

$PLACES = @{}
$src = Get-Content (Join-Path $RepoDir "places.js") -Raw -Encoding UTF8
foreach ($m in [regex]::Matches($src, '([A-Z]{3}):\["([^"]*)","([^"]*)","([^"]*)"\]')) {
  $PLACES[$m.Groups[1].Value] = @{ name = $m.Groups[2].Value; country = $m.Groups[3].Value; flag = $m.Groups[4].Value }
}
function FlagCode([string] $emoji) {
  if (-not $emoji -or $emoji.Length -lt 4) { return "" }
  $x = [char]::ConvertToUtf32($emoji, 0); $y = [char]::ConvertToUtf32($emoji, 2)
  if ($x -lt 0x1F1E6 -or $x -gt 0x1F1FF) { return "" }
  return ([string][char](65 + ($x - 0x1F1E6)) + [string][char](65 + ($y - 0x1F1E6))).ToLower()
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
    $slug = "free-" + $a.slug + "-" + $stamp
    $d = @((Call GET "/posts/?limit=1&filter=$([uri]::EscapeDataString("slug:$slug"))").posts)
    if (-not $d -or $d[0].status -ne "draft") { Write-Host ("{0}: no draft to send ({1})" -f $a.code, $slug); continue }
    $segment = "label:loc-" + $a.slug + "+status:free"
    $q = "?newsletter=$Newsletter&email_segment=" + [uri]::EscapeDataString($segment)
    $body = if ($Schedule) { @{ status = "scheduled"; published_at = $Schedule; updated_at = $d[0].updated_at } } else { @{ status = "published"; updated_at = $d[0].updated_at } }
    $r = Call PUT ("/posts/" + $d[0].id + "/" + $q) @{ posts = @($body) }
    Write-Host ("{0}: {1} to {2} ({3})" -f $a.code, $(if ($Schedule) { "scheduled" } else { "sent" }), $segment, $r.posts[0].status)
    $sent++
  }
  Write-Host "Sent $sent free-list emails."
  exit 0
}

# ---- build mode -------------------------------------------------------------
$made = 0
foreach ($a in $LIST) {
  $file = Join-Path $RepoDir ("fares-" + $a.code + ".json")
  if (-not (Test-Path $file)) { Write-Host ("{0}: no fare file, skipped" -f $a.code); continue }
  $data = Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json

  # Per destination: its cheapest one way and its cheapest return (two nights
  # or more) inside the window, with the airline's own middle price on that
  # route as "usually". Only places UK travellers want to go.
  $ows = @(); $rts = @()
  foreach ($r in $data.fares) {
    $d = [string]$r.destination
    if ((Domestic $d) -or $BOGUS.ContainsKey($d) -or -not $PLACES.ContainsKey($d)) { continue }
    $air = @($r.options | Where-Object { $_.p -and $_.PSObject.Properties['a'] -and $_.a })
    $owMid = if (@($air | Where-Object { -not $_.r }).Count -ge 8) { Median @($air | Where-Object { -not $_.r } | ForEach-Object { [int]$_.p }) } else { 0 }
    $rtMid = if (@($air | Where-Object { $_.r }).Count -ge 3) { Median @($air | Where-Object { $_.r } | ForEach-Object { [int]$_.p }) } else { 0 }
    $bo = $null; $br = $null
    foreach ($o in $air) {
      if (-not $o.d -or $o.d -lt $today -or $o.d -gt $limit) { continue }
      if ($o.s -and [int]$o.s -gt 1) { continue }
      if ($o.r -and (([datetime]$o.r) - ([datetime]$o.d)).Days -lt 2) { continue }
      $row = [pscustomobject]@{ dest = $d; price = [int]$o.p; typical = 0; dep = [string]$o.d; ret = [string]$o.r; stops = [int]($(if ($o.s) { $o.s } else { 0 })); saving = 0; kind = ""; air = [string]$o.a }
      if ($o.r) { if (-not $br -or $row.price -lt $br.price) { $br = $row } }
      else      { if (-not $bo -or $row.price -lt $bo.price) { $bo = $row } }
    }
    foreach ($b in @($bo, $br)) {
      if (-not $b) { continue }
      $mid = if ($b.ret) { $rtMid } else { $owMid }
      if ($mid -gt 0 -and $b.price -le $mid * 0.85) { $b.typical = $mid; $b.saving = [int][math]::Floor((1 - ($b.price / $mid)) * 100) }
      $mo = [int]$b.dep.Substring(5, 2)
      $b.kind = if ($WINTER_SUN.ContainsKey($d) -and ($mo -ge 10 -or $mo -le 3)) { "sun" } elseif ($CITY_BREAK.ContainsKey($d)) { "city" } elseif ($HOTSPOT.ContainsKey($d)) { "hot" } else { "" }
      if (-not $b.kind) { continue }
      if ($b.ret) { $rts += $b } else { $ows += $b }
    }
  }

  # Half returns, half one way, spread across winter sun, city breaks and
  # hotspots. Returns are chosen first, taking turns between the three kinds
  # and cheapest first, then one ways the same way. One row per place.
  $used = @{}
  function RoundRobin($pool, [int] $n) {
    $byKind = @{}; $at = @{}
    foreach ($k in @("sun", "city", "hot")) { $byKind[$k] = @(@($pool) | Where-Object { $_.kind -eq $k } | Sort-Object price); $at[$k] = 0 }
    $out = @()
    while ($out.Count -lt $n) {
      $progress = $false
      foreach ($k in @("sun", "city", "hot")) {
        if ($out.Count -ge $n) { break }
        $list = $byKind[$k]
        while ($at[$k] -lt $list.Count -and $used.ContainsKey($list[$at[$k]].dest)) { $at[$k] = $at[$k] + 1 }
        if ($at[$k] -lt $list.Count) { $pick = $list[$at[$k]]; $at[$k] = $at[$k] + 1; $used[$pick.dest] = 1; $out += $pick; $progress = $true }
      }
      if (-not $progress) { break }
    }
    return $out
  }
  $retPicks = @(RoundRobin $rts ([math]::Floor($Rows / 2)))
  $owPicks  = @(RoundRobin $ows ($Rows - $retPicks.Count))
  $picks = @($retPicks + $owPicks)
  $sunPicks  = @($picks | Where-Object { $_.kind -eq "sun" } | Sort-Object price)
  $cityPicks = @($picks | Where-Object { $_.kind -eq "city" } | Sort-Object price)
  $hotPicks  = @($picks | Where-Object { $_.kind -eq "hot" } | Sort-Object price)
  $picks = @($sunPicks + $cityPicks + $hotPicks)
  if ($picks.Count -lt 5) { Write-Host ("{0}: only {1} good fares, skipped" -f $a.code, $picks.Count); continue }
  $cheapest = ($picks | Measure-Object price -Minimum).Minimum
  $returns = @($picks | Where-Object { $_.ret }).Count
  $totalSaving = 0; foreach ($p in $picks) { if ($p.saving -gt 0) { $totalSaving += ($p.typical - $p.price) } }
  $picks | ConvertTo-Json -Depth 3 | Set-Content -Encoding utf8 (Join-Path $PickDir ("picks-" + $a.code + ".json"))

  $goTo = "/join-" + $a.slug + "/?intent=trial"
  $goExp = [long][double]::Parse((Get-Date -UFormat %s)) + 21 * 86400
  $goLink = "$Worker/go?u=%%{uuid}%%&k=%%{key}%%&to=" + [uri]::EscapeDataString($goTo) + "&e=$goExp&s=" + (Go-Sign $goTo $goExp)

  # ---- the email, in the Monday email's clothes ------------------------
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
    $tag = if ($f.saving -gt 0) { "<span style=`"display:inline-block;font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;background:#FF6B4A;color:#FFFFFF;border-radius:4px;padding:2px 6px;margin-left:6px;vertical-align:middle;`">$($f.saving)% off</span>" } elseif ($f.ret) { "<span style=`"display:inline-block;font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;background:#7C5CFF;color:#FFFFFF;border-radius:4px;padding:2px 6px;margin-left:6px;vertical-align:middle;`">return</span>" } else { "" }
    $usual = if ($f.saving -gt 0) { "<div style=`"font-size:10px;font-weight:600;color:#7A90A5;text-decoration:line-through;`">usually $GBP$($f.typical)</div>" } else { "" }
    $flagCell = if ($fc) { "<img src=`"https://flagcdn.com/w40/$fc.png`" width=`"26`" height=`"20`" alt=`"`" style=`"display:block;border-radius:3px;`">" } else { "<div style=`"width:26px;height:20px;background:#E6EEF5;border-radius:3px;`"></div>" }
    return "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"width:100%;border-collapse:separate;background:#F7FBFE;border-radius:12px;margin-bottom:8px;`"><tr>" +
      "<td style=`"width:6px;background:$stripe;border-radius:12px 0 0 12px;`"></td>" +
      "<td style=`"width:34px;padding:10px 4px 10px 10px;vertical-align:middle;`">$flagCell</td>" +
      "<td style=`"padding:10px 6px;vertical-align:middle;$FONT`"><a href=`"$link`" style=`"text-decoration:none;color:#0E3550;`"><div style=`"font-size:15px;font-weight:800;color:#0E3550;letter-spacing:-.2px;`">$(Esc $pl.name)$tag</div><div style=`"font-size:11.5px;color:#46607A;`">$when</div></a></td>" +
      "<td style=`"padding:10px 10px 10px 6px;text-align:right;vertical-align:middle;white-space:nowrap;$FONT`"><div style=`"font-size:20px;font-weight:900;color:#0E3550;letter-spacing:-.5px;`">$GBP$($f.price)</div>$usual</td>" +
      "</tr></table>"
  }
  $rowsHtml = ""
  $groups = @(, @("Winter sun", $sunPicks)) + @(, @("City breaks", $cityPicks)) + @(, @("Hotspots", $hotPicks))
  $i = 0
  foreach ($g in $groups) {
    $list = @($g[1]); if ($list.Count -eq 0) { continue }
    $rowsHtml += "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#7A90A5;margin:16px 0 8px;$FONT`">$($g[0])</div>"
    foreach ($f in $list) { $rowsHtml += (Row $f $i); $i++ }
  }

  $third = if ($totalSaving -gt 0) { Stat "$GBP$totalSaving" "under usual" } else { Stat "$returns" "returns" }
  $head = "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" bgcolor=`"#1F7FC4`" style=`"width:100%;border-collapse:separate;background:#1F7FC4;background-image:linear-gradient(180deg,#0E6FB6 0%,#3E9BE0 75%,#7CC3F2 100%);border-radius:18px;`">" +
    "<tr><td style=`"padding:12px 14px 0 14px;`"><table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"width:100%;`"><tr><td align=`"left`" style=`"width:60px;`"><img src=`"$($CDNA)email-cloud.png`" width=`"60`" height=`"25`" alt=`"`" style=`"display:block;`"></td><td></td><td align=`"right`" style=`"width:40px;`"><img src=`"$($CDNA)email-sun.png`" width=`"40`" height=`"40`" alt=`"`" style=`"display:block;`"></td></tr></table></td></tr>" +
    "<tr><td style=`"padding:6px 14px 0 14px;`"><table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" bgcolor=`"#FFFFFF`" style=`"width:100%;border-collapse:separate;background:#FFFFFF;border-radius:14px;`"><tr><td style=`"padding:16px 16px 14px 16px;text-align:center;$FONT`">" +
    "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:2.2px;text-transform:uppercase;color:#0E6FB6;`">$(Esc $a.name) &middot; on us this week</div>" +
    "<div style=`"font-size:28px;font-weight:900;letter-spacing:-1px;line-height:1.05;color:#0E3550;margin-top:8px;`">Every fare.<br><span style=`"color:#0E6FB6;`">Nothing hidden.</span></div>" +
    "<div style=`"font-size:13.5px;color:#46607A;margin-top:8px;`">Normally you get three fares on a Monday and the rest blurred out. Today I'm showing you the lot, exactly what members get every week for $($GBP)2.99 a month.</div>" +
    "<table align=`"center`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"margin-top:14px;`"><tr>$(Stat "$($picks.Count)" "places")$(Stat "$GBP$cheapest" "cheapest")$third</tr></table>" +
    "</td></tr></table></td></tr>" +
    "<tr><td style=`"padding:8px 14px 12px 14px;`"><table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"width:100%;`"><tr><td></td><td align=`"right`" style=`"width:60px;`"><img src=`"$($CDNA)email-cloud.png`" width=`"60`" height=`"25`" alt=`"`" style=`"display:block;`"></td></tr></table></td></tr></table>"

  $fares = "<div style=`"font-size:13.5px;color:#46607A;margin-top:18px;$FONT`">All from $(Esc $a.name), straight from the airlines this morning. A crossed out price is the usual price on that route. Tap any fare to see it in the search.</div>" + $rowsHtml +
    "<div style=`"margin-top:6px;padding:12px 14px;border-radius:12px;background:#FFF4D1;font-size:13px;color:#5A4210;$FONT`"><b style=`"color:#3A2A08;`">Move quick.</b> Cheap seats sell out and airlines change prices without warning. Members get a list like this every Monday and can search every date in between.</div>"

  $bestPick = ($picks | Where-Object { $_.saving -gt 0 } | Sort-Object { $_.typical - $_.price } -Descending | Select-Object -First 1)
  $pays = if ($bestPick -and ($bestPick.typical - $bestPick.price) -ge 29) { "That's less than a coffee. $(Esc $PLACES[$bestPick.dest].name) alone is $GBP$($bestPick.typical - $bestPick.price) under the usual price, so one good fare pays for the whole year." } else { "That's less than a coffee a month, and one good fare covers it." }
  $savingLine = if ($totalSaving -gt 0) { "&#10003; This one email has $GBP$totalSaving under the usual prices<br>" } else { "" }
  $price = "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"width:100%;border-collapse:separate;background:#F0F6FB;border-radius:14px;margin-top:18px;`"><tr><td style=`"padding:18px 16px 18px 16px;text-align:center;$FONT`">" +
    "<div style=`"width:38px;height:38px;line-height:38px;border-radius:50%;background:#F5C242;margin:0 auto 6px auto;font-size:18px;text-align:center;`">&#9992;&#65039;</div>" +
    "<div style=`"font-size:17px;font-weight:800;color:#0E3550;letter-spacing:-.3px;`">What $($GBP)2.99 a month gets you</div>" +
    "<div style=`"font-size:13px;color:#46607A;line-height:1.7;margin:8px 0 4px;text-align:left;`">" +
    "&#10003; Every fare from $(Esc $a.name), every Monday, nothing blurred<br>" +
    $savingLine +
    "&#10003; The full search: every route, every date, months ahead, all $TOTAL_AIRPORTS airports<br>" +
    "&#10003; Book straight with the airline. We never touch your money<br>" +
    "&#10003; And you back me: 24, building this on my own, no big company behind it</div>" +
    "<div style=`"font-size:12.5px;color:#46607A;margin:8px 0 14px;`">$pays</div>" +
    "<table cellpadding=`"0`" cellspacing=`"0`" border=`"0`" align=`"center`"><tr><td bgcolor=`"#F5C242`" style=`"background:#F5C242;border-radius:999px;`"><a href=`"$goLink`" style=`"display:inline-block;color:#12384F;font-weight:900;font-size:17px;padding:16px 32px;text-decoration:none;$FONT`">Join for $($GBP)2.99 &rarr;</a></td></tr></table>" +
    "<div style=`"font-size:11.5px;color:#7A90A5;margin-top:10px;`">$($GBP)2.99 a month or $($GBP)29 a year. Cancel any time, no contract. One tap, no password.</div>" +
    "</td></tr></table>"

  $signoff = "<div style=`"margin-top:18px;font-size:13.5px;color:#46607A;$FONT`">Your Monday email still comes either way, this one's just to show you what's behind the blur.<br><br>Speak Monday,<br><b style=`"color:#0E3550;`">Henry</b><br>@henryoscarmoores</div>"

  $html = $head + $fares + $price + $signoff
  if ($html -match '[^\x00-\x7F]' -and ($html -replace [string][char]0xA3, '') -match '[^\x00-\x7F]') {
    # Only the pound sign is allowed through; place names are HTML-encoded.
    $bad = ([regex]::Matches(($html -replace [string][char]0xA3, ''), '[^\x00-\x7F]') | Select-Object -First 3 | ForEach-Object { $_.Value }) -join ' '
    Write-Host "$($a.code): unexpected characters in the email ($bad)"
  }
  $card = @{ type = "html"; version = 1; html = $html }
  $lexical = @{ root = @{ type = "root"; version = 1; direction = "ltr"; format = ""; indent = 0; children = @($card) } } | ConvertTo-Json -Depth 12 -Compress

  $slug = "free-" + $a.slug + "-" + $stamp
  $existing = @((Call GET "/posts/?limit=5&filter=$([uri]::EscapeDataString("slug:$slug"))").posts)
  if ($existing.Count -gt 0 -and -not $Replace) { Write-Host ("{0}: draft already exists ({1}), skipped" -f $a.code, $slug); continue }
  foreach ($e in $existing) { if ($e.status -in @("draft", "scheduled")) { Call DELETE "/posts/$($e.id)/" | Out-Null } }

  # Inbox preview line: three of the best by name and price.
  $hookBits = @(); $hookSeen = @{}
  foreach ($f in @(@($sunPicks | Select-Object -First 1) + @($cityPicks | Where-Object { $_.ret } | Select-Object -First 1) + @($hotPicks | Select-Object -First 1) + @($picks | Sort-Object price))) {
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
    visibility = "public"
    email_only = $true
    custom_excerpt = $hook
    tags = @(@{ name = "#free-auto" })
  }) }
  $new = (Call POST "/posts/" $post).posts[0]
  $made++
  Write-Host ("{0}: draft made, {1} fares ({2} returns; sun {3}, city {4}, hotspots {5}), cheapest {6}{7}, {8}{9} under usual -> {10}" -f $a.code, $picks.Count, $returns, $sunPicks.Count, $cityPicks.Count, $hotPicks.Count, $GBP, $cheapest, $GBP, $totalSaving, $new.slug)
}
Write-Host "Made $made free-list drafts. Send with -Send after Henry's yes."
