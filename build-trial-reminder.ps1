<#
  Builds the trial reminder: one draft per trial end date, telling each
  member the day their first payment comes out and how to stop it.

  Why it exists: the terms page has always promised "we email you a
  reminder before the trial ends, telling you the date the first payment
  will be taken and how to cancel", and nothing was sending it. On
  16 October 2026 the 157 members still on a 40 day trial began reaching
  the end of it, 112 of them over one weekend, with no warning at all.

  This is a one off, not a standing job. The trial was removed on
  13 September 2026, so nobody has started one since and the last of them
  ends on 23 October 2026. After that this script has nothing to find and
  says so. Do not wire it to a schedule.

  Ghost segments know nothing about Stripe, so there is no way to target
  "trial ends Sunday" directly. The build step writes a trial-ends-<date>
  label onto each member, and the send step uses that label as the
  segment. One small send per date, each with its own real date in the
  copy.

  Usage:
    .\build-trial-reminder.ps1              label members, build drafts
    .\build-trial-reminder.ps1 -WhatIf      show the dates and counts only
    .\build-trial-reminder.ps1 -Replace     rebuild today's drafts
    .\build-trial-reminder.ps1 -Date 2026-10-18   one date only

  Sending is a separate, deliberate step (Henry's yes first):
    .\build-trial-reminder.ps1 -Send        publish each draft to its label

  The send goes soonest date first and stops the whole run if a send
  reaches more people than that date actually has, so a segment that
  silently falls back to "everyone" costs one small date, not all 157.

  No em dashes in any copy, per Henry. Never a discount, never "free tier".
#>
[CmdletBinding()]
param(
  [switch] $WhatIf,
  [switch] $Replace,
  [switch] $Send,
  [string] $Date,
  [int] $Tolerance = 3
)
$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Admin   = "https://cloudhenry.ghost.io/ghost/api/admin"
$Site    = "https://www.cloudhenry.com"
$Newsletter = "default-newsletter"

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
# Ghost 6 answers limit=all with the first hundred only, so walk the pages.
function AllMembers([string] $Include) {
  $all = @(); $page = 1
  while ($true) {
    $r = Call GET "/members/?limit=100&page=$page&include=$Include"
    $batch = @($r.members)
    $all += $batch
    if ($batch.Count -lt 100) { break }
    $page++
  }
  $all
}
function Esc([string] $s) { if ($null -eq $s) { return "" }; $s.Replace("&","&amp;").Replace("<","&lt;").Replace(">","&gt;") }
# "Sunday 18 October", the way a person says a date out loud.
function LongDay([datetime] $d) { return $d.ToString("dddd d MMMM", [Globalization.CultureInfo]::GetCultureInfo("en-GB")) }
function ShortDay([datetime] $d) { return $d.ToString("d MMM", [Globalization.CultureInfo]::GetCultureInfo("en-GB")) }

# ---- who is still on a trial, and when does it end ------------------------
Write-Host "Reading members..."
$members = @(AllMembers "labels,subscriptions")
$pending = @()
foreach ($m in $members) {
  $t = @($m.subscriptions | Where-Object { $_.status -eq "trialing" -and $_.trial_end_at })
  if (-not $t.Count) { continue }
  $end = ([datetime]::Parse([string]$t[0].trial_end_at)).ToLocalTime().Date
  $pending += [pscustomobject]@{ id = $m.id; labels = @($m.labels | ForEach-Object { $_.name }); end = $end }
}
if (-not $pending.Count) {
  Write-Host "No members are on a trial. Nothing to remind anyone about."
  exit 0
}
$groups = @($pending | Group-Object { $_.end.ToString("yyyy-MM-dd") } | Sort-Object Name)
if ($Date) { $groups = @($groups | Where-Object { $_.Name -eq $Date }) }
$today = (Get-Date).Date

Write-Host ("{0} members on a trial, across {1} end dates:" -f $pending.Count, $groups.Count)
foreach ($g in $groups) {
  $d = [datetime]::ParseExact($g.Name, "yyyy-MM-dd", $null)
  $when = if ($d -lt $today) { "already passed" } elseif ($d -eq $today) { "today" } else { "in " + ($d - $today).Days + " days" }
  Write-Host ("  {0}  {1,4} members  ({2})" -f (LongDay $d), $g.Count, $when)
}
if ($WhatIf) { Write-Host "WhatIf: nothing written."; exit 0 }

# ---- send mode: publish each date's draft to its own label ----------------
if ($Send) {
  $sent = 0
  foreach ($g in $groups) {
    $d = [datetime]::ParseExact($g.Name, "yyyy-MM-dd", $null)
    if ($d -lt $today) { Write-Host ("{0}: trial already ended, not sending a warning after the fact" -f $g.Name); continue }
    $slug = "trial-reminder-" + $g.Name
    $draft = @((Call GET "/posts/?limit=1&filter=$([uri]::EscapeDataString("slug:$slug"))").posts)
    if (-not $draft -or $draft[0].status -ne "draft") { Write-Host ("{0}: no draft to send" -f $g.Name); continue }
    $segment = "label:trial-ends-" + $g.Name
    $q = "?newsletter=$Newsletter&email_segment=" + [uri]::EscapeDataString($segment)
    Call PUT ("/posts/" + $draft[0].id + "/" + $q) @{ posts = @(@{ status = "published"; updated_at = $draft[0].updated_at }) } | Out-Null
    $chk = (Call GET ("/posts/" + $draft[0].id + "/?include=email,email_segment")).posts[0]
    $reached = if ($chk.email) { [int]$chk.email.email_count } else { 0 }
    Write-Host ("{0}: sent to '{1}', {2} recipients (expected {3})" -f $g.Name, $segment, $reached, $g.Count)
    # A segment that silently falls back to everyone is the one mistake
    # that cannot be taken back, so the run stops rather than repeat it.
    if ($reached -gt ($g.Count + $Tolerance)) {
      Write-Host ("STOP: that send reached {0} people but the date only has {1}. The segment is not filtering. Nothing else sent." -f $reached, $g.Count)
      exit 1
    }
    $sent++
  }
  Write-Host "Sent $sent trial reminders."
  exit 0
}

# ---- label each member with their trial end date --------------------------
$tagged = 0
foreach ($p in $pending) {
  $want = "trial-ends-" + $p.end.ToString("yyyy-MM-dd")
  if ($p.labels -contains $want) { continue }
  # Any older trial-ends label is wrong now, so it comes off as this goes on.
  $keep = @($p.labels | Where-Object { $_ -notlike "trial-ends-*" } | ForEach-Object { @{ name = $_ } })
  $keep += @{ name = $want }
  Call PUT "/members/$($p.id)/" @{ members = @(@{ labels = $keep }) } | Out-Null
  $tagged++
}
Write-Host "Labelled $tagged members."

# ---- the email ------------------------------------------------------------
$FONT = "font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"
$GBP  = [char]0xA3

function Build([datetime] $End) {
  $long  = LongDay $End
  $short = ShortDay $End

  $head = "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"0`" border=`"0`" bgcolor=`"#0E6FB6`" style=`"width:100%;background:#0E6FB6;border-radius:18px;`"><tr><td style=`"padding:26px 22px 22px;text-align:center;$FONT`">" +
    "<div style=`"font-size:10.5px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:#BEE3F8;`">Your free trial</div>" +
    "<div style=`"font-size:27px;font-weight:900;color:#FFFFFF;line-height:1.15;margin:8px 0 6px;letter-spacing:-.5px;`">It ends on $long.</div>" +
    "<div style=`"font-size:14.5px;color:#D7EDFA;line-height:1.5;max-width:34em;margin:0 auto;`">Your first payment comes out that day. Here is exactly what happens, and how to stop it if you would rather.</div>" +
    "</td></tr></table>"

  $stats = "<table width=`"100%`" cellpadding=`"0`" cellspacing=`"8`" border=`"0`" style=`"width:100%;border-collapse:separate;margin-top:12px;`"><tr>" +
    "<td width=`"33%`" bgcolor=`"#F0F6FB`" style=`"background:#F0F6FB;border-radius:12px;padding:12px 8px;text-align:center;$FONT`"><div style=`"font-size:19px;font-weight:900;color:#0E3550;`">$short</div><div style=`"font-size:11px;color:#5B7387;`">first payment</div></td>" +
    "<td width=`"33%`" bgcolor=`"#F0F6FB`" style=`"background:#F0F6FB;border-radius:12px;padding:12px 8px;text-align:center;$FONT`"><div style=`"font-size:19px;font-weight:900;color:#0E3550;`">2 clicks</div><div style=`"font-size:11px;color:#5B7387;`">to cancel</div></td>" +
    "<td width=`"33%`" bgcolor=`"#F0F6FB`" style=`"background:#F0F6FB;border-radius:12px;padding:12px 8px;text-align:center;$FONT`"><div style=`"font-size:19px;font-weight:900;color:#0E3550;`">14 days</div><div style=`"font-size:11px;color:#5B7387;`">to change your mind</div></td>" +
    "</tr></table>"

  $what = "<div style=`"margin-top:22px;padding:16px 18px;border-radius:14px;background:#F0F6FB;$FONT`">" +
    "<div style=`"font-size:15px;font-weight:800;color:#0E3550;margin-bottom:8px;`">What happens on $short</div>" +
    "<div style=`"font-size:14px;color:#46607A;line-height:1.6;`">" +
    "Your 40 days are up and the plan you chose when you joined starts, either $($GBP)2.99 a month or $($GBP)29 for the year. Your account page shows which one and the exact amount.<br><br>" +
    "We email you a receipt the moment it goes through. Nothing else changes, the fares keep landing every week.</div></div>"

  $out = "<div style=`"margin-top:12px;padding:16px 18px;border-radius:14px;border:1px solid #E3EEF6;$FONT`">" +
    "<div style=`"font-size:15px;font-weight:800;color:#0E3550;margin-bottom:8px;`">If you would rather not</div>" +
    "<div style=`"font-size:14px;color:#46607A;line-height:1.6;`">" +
    "Cancel before $short and you will not be charged a penny. Two clicks from your account page. No phone call, no notice period, no one trying to talk you out of it.</div></div>"

  $cta = "<div style=`"text-align:center;margin-top:20px;$FONT`">" +
    "<table cellpadding=`"0`" cellspacing=`"0`" border=`"0`" align=`"center`"><tr><td bgcolor=`"#F5C242`" style=`"background:#F5C242;border-radius:999px;`">" +
    "<a href=`"$Site/my-cloudhenry/`" style=`"display:inline-block;color:#12384F;font-weight:900;font-size:17px;padding:15px 30px;text-decoration:none;$FONT`">My CloudHenry &rarr;</a>" +
    "</td></tr></table>" +
    "<div style=`"font-size:12px;color:#7A90A5;margin-top:10px;`">See your plan, change it, or cancel. All in the same place.</div></div>"

  $refund = "<div style=`"margin-top:20px;padding:12px 14px;border-radius:12px;background:#FFF4D1;font-size:13px;color:#5A4210;$FONT`">" +
    "<b style=`"color:#3A2A08;`">Changed your mind after the fact?</b> Email us within 14 days of the payment and we refund the lot. We would rather you were happy than stuck.</div>"

  $signoff = "<div style=`"margin-top:20px;font-size:13.5px;color:#46607A;$FONT`">Thanks for giving it a go,<br><b style=`"color:#0E3550;`">Henry</b><br>@henryoscarmoores</div>"

  return $head + $stats + $what + $out + $cta + $refund + $signoff
}

$made = 0
foreach ($g in $groups) {
  $end = [datetime]::ParseExact($g.Name, "yyyy-MM-dd", $null)
  if ($end -lt $today) { Write-Host ("{0}: trial already ended, no draft" -f $g.Name); continue }
  $slug = "trial-reminder-" + $g.Name
  $existing = @((Call GET "/posts/?limit=1&filter=$([uri]::EscapeDataString("slug:$slug"))").posts)
  if ($existing -and $existing.Count -gt 0) {
    if (-not $Replace) { Write-Host ("{0}: draft already exists, skipped" -f $g.Name); continue }
    foreach ($e in $existing) { if ($e.status -eq "draft") { Call DELETE "/posts/$($e.id)/" | Out-Null } }
  }

  $card = @{ type = "html"; version = 1; html = (Build $end) }
  $lexical = @{ root = @{ type = "root"; version = 1; direction = "ltr"; format = ""; indent = 0; children = @($card) } } | ConvertTo-Json -Depth 12 -Compress

  $post = @{ posts = @(@{
    title = "Your free trial ends on " + (LongDay $end)
    slug = $slug
    lexical = $lexical
    status = "draft"
    visibility = "members"
    custom_excerpt = "Your first payment comes out on " + (ShortDay $end) + ". Here is what happens, and how to cancel if you would rather."
    email_subject = "Your free trial ends on " + (ShortDay $end)
    tags = @(@{ name = "#trial-reminder" })
  }) }
  Call POST "/posts/?source=html" $post | Out-Null
  $made++
  Write-Host ("{0}: draft made for {1} members" -f $g.Name, $g.Count)
}
Write-Host "Made $made trial reminder drafts. Send with -Send after Henry's yes."
