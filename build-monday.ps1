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
    4. A paragraph Henry can edit: "Last week members from X booked...".
    5. Paywall marker, then for members (status:-free) the full list,
       one way then returns, every fare a Book button.
    6. Sign-off.

  Ghost sends the right version to each reader from the one post. Henry
  opens the draft, edits the proof line if he likes, picks the airport
  label as the audience, and presses Send. His twelve standing paid-draft
  posts are never touched; these are new drafts, tagged monday-auto.

  Needs the Ghost Admin key: GHOST_ADMIN_KEY in the environment, or a
  gitignored .ghostkey beside this script.

  Usage:
    .\build-monday.ps1                 all twelve airports
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
  @{ code="BFS"; name="Belfast";          slug="belfast" }
)
if ($OnlyOrigins) { $AIRPORTS = @($AIRPORTS | Where-Object { $OnlyOrigins -contains $_.code }) }

$UK = @{ LON=1; MAN=1; BHX=1; LBA=1; STN=1; LTN=1; BRS=1; NCL=1; GLA=1; EDI=1; LGW=1; LPL=1; BFS=1; CWL=1; ILY=1; KOI=1; ABZ=1; INV=1; SOU=1; EXT=1; NQY=1; LDY=1 }
$BOGUS = @{ BSZ=1; DSE=1 }

# Names and flags from places.js.
$PLACES = @{}
$src = Get-Content (Join-Path $RepoDir "places.js") -Raw
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

$today = (Get-Date).ToString("yyyy-MM-dd")
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
  $book = if (-not $blur -and $f.book) { "<a href=`"$($f.book)`" style=`"display:inline-block;background:#F5C242;color:#12384F;font-weight:800;font-size:11px;padding:6px 10px;border-radius:999px;text-decoration:none;$FONT`">Book</a>" } else { "" }
  $bookHtml = if ($book) { "<div style=`"margin-top:4px;`">$book</div>" } else { "" }
  return "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"border-collapse:separate;background:#F7FBFE;border-radius:12px;margin-bottom:8px;`"><tr>" +
    "<td style=`"width:6px;background:$stripe;border-radius:12px 0 0 12px;`"></td>" +
    "<td style=`"width:34px;padding:10px 4px 10px 10px;vertical-align:middle;`">$flagCell</td>" +
    "<td style=`"padding:10px 6px;vertical-align:middle;$FONT`"><div style=`"font-size:15px;font-weight:800;color:$textColor;letter-spacing:-.2px;`">$(Esc $name)$(if (-not $blur) { $tag })</div><div style=`"font-size:11.5px;color:$subColor;`">$when</div></td>" +
    "<td style=`"padding:10px 10px 10px 6px;text-align:right;vertical-align:middle;white-space:nowrap;$FONT`"><div style=`"font-size:20px;font-weight:900;color:$textColor;letter-spacing:-.5px;`">$([char]0xA3)$($f.price)</div>$usualHtml$bookHtml</td>" +
    "</tr></table>"
}

function Stat([string] $big, [string] $small) {
  return "<td style=`"padding:0 4px;`"><table cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"border-collapse:separate;background:rgba(255,255,255,0.16);border:1px solid rgba(255,255,255,0.35);border-radius:12px;`"><tr><td style=`"padding:8px 12px;text-align:center;$FONT`"><div style=`"font-size:20px;font-weight:900;color:#FFFFFF;letter-spacing:-.5px;line-height:1;`">$big</div><div style=`"font-size:9.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#D7EDFA;margin-top:3px;`">$small</div></td></tr></table></td>"
}

$created = 0; $skipped = 0
foreach ($a in $AIRPORTS) {
  $file = Join-Path $RepoDir ("fares-" + $a.code + ".json")
  if (-not (Test-Path $file)) { Write-Host "$($a.code): no fare file, skipped"; $skipped++; continue }
  $data = Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json

  # Cheapest option per destination departing within the horizon.
  $best = @{}
  foreach ($r in $data.fares) {
    if ($UK.ContainsKey($r.destination) -or $BOGUS.ContainsKey($r.destination) -or -not $PLACES.ContainsKey($r.destination)) { continue }
    foreach ($o in @($r.options)) {
      if (-not $o.p -or -not $o.d -or $o.d -lt $today -or $o.d -gt $limit) { continue }
      $isRet = [bool]$o.r
      $typ = if (-not $isRet -and $r.typical) { [int]$r.typical } else { 0 }
      $ddmm = { param($iso) $d = [datetime]::ParseExact($iso, "yyyy-MM-dd", $null); $d.ToString("ddMM") }
      $url = "https://www.aviasales.com/search/" + $a.code + (& $ddmm $o.d) + $r.destination + $(if ($isRet) { & $ddmm $o.r } else { "" }) + "1"
      $book = "https://tp.media/r?marker=764584&trs=562291&p=4114&u=" + [uri]::EscapeDataString($url)
      $cand = [pscustomobject]@{ dest = $r.destination; price = [int]$o.p; dep = [string]$o.d; ret = $(if ($isRet) { [string]$o.r } else { "" }); typical = $typ; book = $book }
      if (-not $best.ContainsKey($r.destination) -or $cand.price -lt $best[$r.destination].price) { $best[$r.destination] = $cand }
    }
  }
  $fares = @($best.Values | Sort-Object price)
  if ($fares.Count -lt 6) { Write-Host "$($a.code): only $($fares.Count) fares in the window, skipped"; $skipped++; continue }

  $n = $fares.Count
  $cheapest = $fares[0].price
  $withTyp = @($fares | Where-Object { $_.typical -gt 0 -and $_.typical -gt $_.price })
  $avgSave = if ($withTyp.Count) { [math]::Round((($withTyp | ForEach-Object { 1 - $_.price / $_.typical } | Measure-Object -Average).Average) * 100) } else { 0 }
  $returnsUnder50 = @($fares | Where-Object { $_.ret -and $_.price -le 50 }).Count
  $top = @($fares | Select-Object -First 3)
  $locked = @($fares | Select-Object -Skip 3 -First 4)
  $rest = $n - 3

  $title = "$($a.name): $n fares this week, from $([char]0xA3)$cheapest"
  $slugBase = ($a.slug + "-" + $dateTag)

  # Already made today (unless -Replace)?
  $existing = (Call GET "/posts/?filter=$([uri]::EscapeDataString("tag:monday-auto+slug:~'" + $slugBase + "'"))&fields=id,slug,status,updated_at").posts
  if ($existing -and $existing.Count -gt 0) {
    if (-not $Replace) { Write-Host "$($a.code): draft already exists ($($existing[0].slug)), skipped"; $skipped++; continue }
    foreach ($e in $existing) { if ($e.status -eq "draft") { Call DELETE "/posts/$($e.id)/" | Out-Null } }
  }

  $goLink = "$Worker/go?u=%%{uuid}%%&to=" + [uri]::EscapeDataString("/join-" + $a.slug + "/?intent=trial")

  # 1 + 2: header and top three, for everyone.
  $hero = "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"border-collapse:separate;background:#0E6FB6;background-image:linear-gradient(180deg,#0E6FB6 0%,#3E9BE0 75%,#7CC3F2 100%);border-radius:18px;`">" +
    "<tr><td style=`"padding:14px 16px 0 16px;`"><table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`"><tr><td style=`"width:60px;`">$(PixelCloud 'left')</td><td></td><td style=`"width:44px;`">$(PixelSun)</td></tr></table></td></tr>" +
    "<tr><td style=`"padding:6px 18px 0 18px;text-align:center;$FONT`"><div style=`"font-size:10.5px;font-weight:800;letter-spacing:2.2px;text-transform:uppercase;color:#FFE071;`">$(Esc $a.name) · week of $weekLabel</div>" +
    "<div style=`"font-size:30px;font-weight:900;letter-spacing:-1px;line-height:1.05;color:#FFFFFF;margin-top:8px;`">$n cheap fares.<br><span style=`"color:#FFE071;`">Checked this morning.</span></div>" +
    "<div style=`"font-size:13.5px;color:#D7EDFA;margin-top:8px;`">Every one with what people usually pay beside it.</div></td></tr>" +
    "<tr><td style=`"padding:14px 12px 18px 12px;`"><table align=`"center`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`"><tr>$(Stat "$n" "fares found")$(Stat "$([char]0xA3)$cheapest" "cheapest")$(Stat "$avgSave%" "avg saving")</tr></table></td></tr>" +
    "<tr><td style=`"padding:0 12px 6px 12px;`">$(PixelCloud 'right')</td></tr></table>"

  $topHtml = "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#7A90A5;margin:18px 0 8px;$FONT`">This week's best from $(Esc $a.name)</div>"
  for ($i = 0; $i -lt $top.Count; $i++) { $topHtml += FareRow $top[$i] $i $false }

  # 3: the locked list and the button, list members only, email only.
  $lockedHtml = ""
  for ($i = 0; $i -lt $locked.Count; $i++) { $lockedHtml += FareRow $locked[$i] ($i + 3) $true }
  $tease = "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" style=`"border-collapse:separate;background:#F0F6FB;border-radius:14px;margin-top:6px;`"><tr><td style=`"padding:8px 8px 0 8px;`">$lockedHtml</td></tr>" +
    "<tr><td style=`"padding:4px 16px 18px 16px;text-align:center;$FONT`">" +
    "<div style=`"width:38px;height:38px;line-height:38px;border-radius:50%;background:#F5C242;margin:0 auto 6px auto;font-size:18px;text-align:center;`">&#128274;</div>" +
    "<div style=`"font-size:17px;font-weight:800;color:#0E3550;letter-spacing:-.3px;`">$rest more fares from $(Esc $a.name)</div>" +
    "<div style=`"font-size:13px;color:#46607A;margin:2px 0 12px;`">$(if ($returnsUnder50) { "Including $returnsUnder50 returns under $([char]0xA3)50." } else { "One way and return, with the exact dates." })</div>" +
    "<a href=`"$goLink`" style=`"display:inline-block;background:#F5C242;color:#12384F;font-weight:900;font-size:15px;padding:13px 24px;border-radius:999px;text-decoration:none;$FONT`">See all $n, 40 days free &rarr;</a>" +
    "<div style=`"font-size:11.5px;color:#7A90A5;margin-top:10px;`">Then $([char]0xA3)2.99 a month. Cancel any time, no contract. One tap, no password.</div>" +
    "</td></tr></table>"

  # 5: everything, members only.
  $ows = @($fares | Where-Object { -not $_.ret }); $rts = @($fares | Where-Object { $_.ret })
  $full = ""
  # Gmail clips anything over about 100KB, so the email carries the best sixteen after the top three and links to the rest.
  $ows = @($ows | Select-Object -First 10); $rts = @($rts | Select-Object -First 6)
  if ($ows.Count) { $full += "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#7A90A5;margin:16px 0 8px;$FONT`">One way</div>"; $i = 0; foreach ($f in $ows) { $full += FareRow $f $i $false; $i++ } }
  if ($rts.Count) { $full += "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#7A90A5;margin:16px 0 8px;$FONT`">Returns</div>"; $i = 0; foreach ($f in $rts) { $full += FareRow $f $i $false; $i++ } }
  $full += "<div style=`"text-align:center;margin-top:14px;$FONT`"><a href=`"$Site/search/?from=$($a.code)`" style=`"display:inline-block;background:#0E6FB6;color:#FFFFFF;font-weight:800;font-size:14px;padding:12px 22px;border-radius:999px;text-decoration:none;`">All $n fares from $(Esc $a.name), searchable &rarr;</a></div>"
  $full += "<div style=`"margin-top:14px;padding:12px 14px;border-radius:12px;background:#FFF4D1;font-size:13px;color:#5A4210;$FONT`"><b style=`"color:#3A2A08;`">Book fast.</b> The cheapest fares here are the kind that go within three days. Every price was checked this morning; airlines change them without warning.</div>"

  $signoff = "<div style=`"margin-top:16px;font-size:13.5px;color:#46607A;$FONT`">See you Monday,<br><b style=`"color:#0E3550;`">Henry</b><br>@henryoscarmoores</div>"

  # Cards. HTML cards carry visibility so Ghost sends the right version.
  $cardAll   = @{ type = "html"; version = 1; html = ($hero + $topHtml) }
  $cardTease = @{ type = "html"; version = 1; html = $tease; visibility = @{ web = @{ nonMember = $false; memberSegment = "" }; email = @{ memberSegment = "status:free" } } }
  $proofPara = @{ type = "paragraph"; version = 1; direction = "ltr"; format = ""; indent = 0; children = @(@{ type = "extended-text"; version = 1; detail = 0; format = 0; mode = "normal"; style = ""; text = "Last week members from $($a.name) booked: (Henry, add one or two real ones here, or delete this line)." }) }
  $paywall   = @{ type = "paywall"; version = 1 }
  $cardFull  = @{ type = "html"; version = 1; html = $full }
  $cardSign  = @{ type = "html"; version = 1; html = $signoff }
  $lexical = @{ root = @{ type = "root"; version = 1; direction = "ltr"; format = ""; indent = 0; children = @($cardAll, $cardTease, $proofPara, $paywall, $cardFull, $cardSign) } } | ConvertTo-Json -Depth 12 -Compress

  $post = @{ posts = @(@{
    title = $title; slug = $slugBase; lexical = $lexical; status = "draft"; visibility = "paid"
    tags = @(@{ name = "paid-draft" }, @{ name = "monday-auto" })
    custom_excerpt = "$n cheap fares from $($a.name) this week, checked this morning, from $([char]0xA3)$cheapest."
    email_subject = "$($a.name): $n fares this week, from $([char]0xA3)$cheapest"
  }) }
  $made = Call POST "/posts/" $post
  Write-Host ("{0}: draft made, {1} fares, cheapest $([char]0xA3){2}, avg saving {3}%  -> {4}" -f $a.code, $n, $cheapest, $avgSave, $made.posts[0].slug)
  $created++
}
Write-Host "Done: $created drafts made, $skipped skipped."
