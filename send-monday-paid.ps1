<#
  Sends today's Monday drafts to each airport's PAYING members.

  Ghost's publish screen defaults the audience to every subscriber, and
  the Admin API ignores the newsletter and segment when they are passed
  on a POST that is already published. The one shape that works is the
  one build-free-email.ps1 uses: PUT an existing DRAFT to published with
  ?newsletter=...&email_segment=... on the query string.

  It sends the smallest airport first and stops the moment a send reaches
  more people than that airport actually has, so a segment that silently
  falls back to "everyone" costs one small airport, not the whole list.

  Usage:
    .\send-monday-paid.ps1 -WhatIf     show what would go, send nothing
    .\send-monday-paid.ps1             send

  No em dashes in any copy, per Henry.
#>
[CmdletBinding()]
param(
  [switch] $WhatIf,
  [string[]] $OnlySlugs,
  [int] $Tolerance = 3
)
$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Admin = "https://cloudhenry.ghost.io/ghost/api/admin"
$Newsletter = "default-newsletter"
$stamp = Get-Date -Format "yyyy-MM-dd"

$key = $env:GHOST_ADMIN_KEY
if (-not $key -and (Test-Path (Join-Path $RepoDir ".ghostkey"))) { $key = (Get-Content (Join-Path $RepoDir ".ghostkey") -Raw).Trim() }
if (-not $key -or $key -notmatch '^[0-9a-f]+:[0-9a-f]+$') { throw "No Ghost Admin key available." }
$parts = $key.Split(":"); $kid = $parts[0]; $secretHex = $parts[1]
function B64Url([byte[]] $b) { [Convert]::ToBase64String($b).TrimEnd("=").Replace("+","-").Replace("/","_") }
function Token {
  $now = [int][double]::Parse((Get-Date -UFormat %s))
  $h = B64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT","kid":"' + $kid + '"}'))
  $p = B64Url ([Text.Encoding]::UTF8.GetBytes('{"iat":' + $now + ',"exp":' + ($now + 300) + ',"aud":"/admin/"}'))
  $s = New-Object byte[] ($secretHex.Length / 2)
  for ($i = 0; $i -lt $s.Length; $i++) { $s[$i] = [Convert]::ToByte($secretHex.Substring($i * 2, 2), 16) }
  $m = New-Object System.Security.Cryptography.HMACSHA256; $m.Key = $s
  return "$h.$p." + (B64Url ($m.ComputeHash([Text.Encoding]::UTF8.GetBytes("$h.$p"))))
}
function Call([string] $Method, [string] $Path, $Body) {
  $hh = @{ Authorization = "Ghost $(Token)"; "Accept-Version" = "v5.0" }
  if ($Body) {
    $json = $Body | ConvertTo-Json -Depth 14 -Compress
    return Invoke-RestMethod -Method $Method -Uri ($Admin + $Path) -Headers $hh -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($json))
  }
  return Invoke-RestMethod -Method $Method -Uri ($Admin + $Path) -Headers $hh
}

# Smallest audience first, so a mistake is cheap.
$LIST = @('cork','cardiff','dublin','bournemouth','glasgow','east-midlands','london-luton','liverpool',
          'belfast','edinburgh','newcastle','london-stansted','leeds','bristol','london-gatwick',
          'birmingham','manchester')
if ($OnlySlugs) { $LIST = @($LIST | Where-Object { $OnlySlugs -contains $_ }) }

$sent = 0
foreach ($slug in $LIST) {
  $segment = "label:loc-$slug+status:-free"
  $expected = [int](Call GET ("/members/?limit=1&filter=" + [uri]::EscapeDataString($segment))).meta.pagination.total
  if ($expected -lt 1) { Write-Host ("{0}: no paying members, skipped" -f $slug); continue }

  $post = @((Call GET ("/posts/?limit=1&filter=" + [uri]::EscapeDataString("slug:$slug-$stamp"))).posts)
  if (-not $post -or $post[0].status -ne "draft") { Write-Host ("{0}: no draft to send" -f $slug); continue }

  if ($WhatIf) { Write-Host ("{0}: would send to {1} ({2} paying)" -f $slug, $segment, $expected); continue }

  $q = "?newsletter=$Newsletter&email_segment=" + [uri]::EscapeDataString($segment)
  $r = Call PUT ("/posts/" + $post[0].id + "/" + $q) @{ posts = @(@{ status = "published"; updated_at = $post[0].updated_at }) }

  # What Ghost says it actually mailed. If this is wildly more than the
  # airport has, the segment did not apply and we stop before the next one.
  $chk = (Call GET ("/posts/" + $post[0].id + "/?include=email")).posts[0]
  $count = if ($chk.email -and $chk.email.email_count) { [int]$chk.email.email_count } else { -1 }
  $filter = if ($chk.email) { [string]$chk.email.recipient_filter } else { "" }
  Write-Host ("{0}: sent, expected {1}, Ghost says {2}, filter '{3}'" -f $slug, $expected, $count, $filter)
  if ($count -gt ($expected + $Tolerance)) {
    throw "STOPPED. $slug reached $count people but only has $expected paying members. The segment did not apply. Nothing further sent."
  }
  $sent++
  Start-Sleep -Seconds 4
}
Write-Host "Sent $sent paid Monday emails."
