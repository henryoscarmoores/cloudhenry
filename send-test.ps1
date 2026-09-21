<#
  Sends a copy of a draft to Henry only, so he can see the real email
  before it goes to members.

  Ghost has no working preview endpoint for us (the Admin API's
  email_previews route is blocked by Fastly), so the way that works is to
  copy the draft's lexical into a separate email-only post and send that
  to the member label test-henry, which is only henryswalk@gmail.com.

  The copy is tagged #test-send so it never shows on the site and is easy
  to find and delete later. The original draft is not touched.

  Usage:
    .\send-test.ps1 -Slug manchester-2026-09-21

  No em dashes in any copy, per Henry.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $Slug,
  [string] $Segment = "label:test-henry"
)
$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Admin   = "https://cloudhenry.ghost.io/ghost/api/admin"

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
  $h = @{ Authorization = "Ghost $(Token)"; "Accept-Version" = "v5.0" }
  if ($Body) {
    $json = $Body | ConvertTo-Json -Depth 14 -Compress
    return Invoke-RestMethod -Method $Method -Uri ($Admin + $Path) -Headers $h -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($json))
  }
  return Invoke-RestMethod -Method $Method -Uri ($Admin + $Path) -Headers $h
}

# How many people the test segment actually reaches. If this is not 1,
# stop: a mistake here mails the whole list.
$seg = [uri]::EscapeDataString($Segment)
$who = Call GET "/members/?filter=$seg&limit=5&fields=id,email"
$n = @($who.members).Count
if ($n -ne 1) { throw "Segment '$Segment' matches $n members, expected exactly 1. Refusing to send." }
Write-Host "Test goes to: $($who.members[0].email)"

$src = (Call GET "/posts/slug/$Slug/?formats=lexical").posts[0]
if (-not $src) { throw "No post with slug $Slug" }

$nl = (Call GET "/newsletters/?limit=5&fields=id,slug,name,status").newsletters | Where-Object { $_.status -eq "active" } | Select-Object -First 1
if (-not $nl) { throw "No active newsletter" }

$stamp = Get-Date -Format "HHmm"
$body = @{ posts = @(@{
  title         = "[TEST] " + $src.title
  slug          = "test-$Slug-$stamp"
  lexical       = $src.lexical
  status        = "published"
  email_only    = $true
  visibility    = "public"
  tags          = @(@{ name = "#test-send" })
  custom_excerpt = $src.custom_excerpt
  email_subject = "[TEST] " + $src.email_subject
}) }
$sent = Call POST "/posts/?newsletter=$($nl.slug)&email_segment=$seg" $body
Write-Host ("Sent: {0}  (email id {1}, status {2})" -f $sent.posts[0].slug, $sent.posts[0].email.id, $sent.posts[0].email.status)
