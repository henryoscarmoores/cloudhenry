<#
  Sends a copy of a draft to Henry only, so he can see the real email
  before it goes to members.

  Ghost has no preview endpoint we can use (the Admin API's
  email_previews route is blocked by Fastly), so the way that works is to
  copy the draft's lexical into a separate email-only post and send that
  to the member label test-henry, which is only henryswalk@gmail.com.

  Why it is written so defensively: creating the copy already published,
  with the newsletter and segment passed only on the query string, does
  not work. Ghost ignores them, stores email_segment as "all", and a
  version of that mistake which did attach a newsletter would mail every
  member. So the copy is made as a draft first, the stored segment is
  read back and checked, and only then is it published to send.

  The copy is tagged #test-send so it never shows on the site and is easy
  to find later. The original draft is not touched.

  Usage:
    .\send-test.ps1 -Slug manchester-2026-09-21

  No em dashes in any copy, per Henry.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $Slug,
  [string] $Segment = "label:test-henry",
  [int]    $MaxRecipients = 1
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

# 1. How many people the test segment actually reaches. If this is not
#    exactly one, stop: a mistake here mails the whole list.
$segEnc = [uri]::EscapeDataString($Segment)
$who = Call GET "/members/?filter=$segEnc&limit=5&fields=id,email"
$n = @($who.members).Count
if ($n -lt 1 -or $n -gt $MaxRecipients) { throw "Segment '$Segment' matches $n members, expected $MaxRecipients. Refusing to send." }
Write-Host "Test goes to: $(@($who.members | ForEach-Object { $_.email }) -join ', ')"

$src = (Call GET "/posts/slug/$Slug/?formats=lexical").posts[0]
if (-not $src) { throw "No post with slug $Slug" }

$nl = (Call GET "/newsletters/?limit=10&fields=id,slug,name,status").newsletters | Where-Object { $_.status -eq "active" } | Select-Object -First 1
if (-not $nl) { throw "No active newsletter" }

# 2. Make the copy as a DRAFT, carrying the segment as a stored field.
$stamp = Get-Date -Format "HHmmss"
$body = @{ posts = @(@{
  title          = "[TEST] " + $src.title
  slug           = "test-$Slug-$stamp"
  lexical        = $src.lexical
  status         = "draft"
  email_only     = $true
  visibility     = "public"
  tags           = @(@{ name = "#test-send" })
  custom_excerpt = $src.custom_excerpt
  email_subject  = "[TEST] " + $src.email_subject
  email_segment  = $Segment
}) }
$draft = (Call POST "/posts/?newsletter=$($nl.slug)&email_segment=$segEnc" $body).posts[0]

# 3. Read the stored segment back before anything is sent.
$check = (Call GET "/posts/$($draft.id)/?include=email_segment").posts[0]
if ($check.email_segment -ne $Segment) {
  Call DELETE "/posts/$($draft.id)/" | Out-Null
  throw "Ghost stored email_segment as '$($check.email_segment)', not '$Segment'. Copy deleted, nothing sent."
}
Write-Host "Segment stored correctly as '$($check.email_segment)'. Publishing to send."

# 4. Publish, which is what actually sends.
$pub = @{ posts = @(@{ status = "published"; email_segment = $Segment; updated_at = $check.updated_at }) }
$sent = (Call PUT "/posts/$($draft.id)/?newsletter=$($nl.slug)&email_segment=$segEnc" $pub).posts[0]
Write-Host ("Sent: {0}  status={1}  segment={2}" -f $sent.slug, $sent.status, $sent.email_segment)
