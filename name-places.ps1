<#
  Names any destination the fare files hold that places.js does not know.

  The search hides a destination it cannot name, because a card reading
  "BSZ" beside a blank flag looks broken. Now that the feed asks for every
  destination the cache holds, dozens of codes turn up that nobody typed a
  name for. Travelpayouts publishes its own city and country lists, no
  token needed, so this looks each unknown code up there and appends it.

  Appends only. Anything already in places.js is left exactly as it is,
  so hand-written names (Kraków, Málaga, Türkiye) survive.
#>
$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Places  = Join-Path $RepoDir "places.js"

$src = Get-Content $Places -Raw -Encoding UTF8
$known = @{}
foreach ($m in [regex]::Matches($src, '([A-Z]{3}):\[')) { $known[$m.Groups[1].Value] = 1 }

# Every destination code in every fare file.
$codes = @{}
foreach ($f in (Get-ChildItem (Join-Path $RepoDir "fares*.json"))) {
  try { $j = Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json } catch { continue }
  foreach ($r in @($j.fares)) { if ($r.destination) { $codes[[string]$r.destination] = 1 } }
}
$missing = @($codes.Keys | Where-Object { -not $known.ContainsKey($_) } | Sort-Object)
Write-Host "known: $($known.Count), in feed: $($codes.Count), unnamed: $($missing.Count)"
if ($missing.Count -eq 0) { exit 0 }

$cities    = Invoke-RestMethod -Uri "https://api.travelpayouts.com/data/en/cities.json" -TimeoutSec 120
$countries = Invoke-RestMethod -Uri "https://api.travelpayouts.com/data/en/countries.json" -TimeoutSec 120
$cityBy = @{}; foreach ($c in $cities) { $cityBy[$c.code] = $c }
$countryBy = @{}; foreach ($c in $countries) { $countryBy[$c.code] = $c.name }

# A country code becomes its flag by shifting each letter into the
# regional indicator block. That is all a flag emoji is.
function Flag([string] $cc) {
  if (-not $cc -or $cc.Length -ne 2) { return "" }
  $s = ""
  foreach ($ch in $cc.ToUpper().ToCharArray()) { $s += [char]::ConvertFromUtf32(0x1F1E6 + ([int]$ch - [int][char]'A')) }
  return $s
}

# The site's own spellings for a few countries, matching what is already
# in places.js so the country filter and the Inspire me lists line up.
$rename = @{ "Turkey" = "Türkiye"; "United States" = "USA"; "United Arab Emirates" = "UAE"; "Czech Republic" = "Czechia";
             "Russian Federation" = "Russia"; "Republic of Moldova" = "Moldova"; "North Macedonia" = "Macedonia" }

$lines = @()
$named = 0
foreach ($code in $missing) {
  if (-not $cityBy.ContainsKey($code)) { Write-Host "  no city record for $code"; continue }
  $c = $cityBy[$code]
  $name = [string]$c.name
  if (-not $name) { continue }
  $cc = [string]$c.country_code
  $country = if ($countryBy.ContainsKey($cc)) { $countryBy[$cc] } else { "" }
  if ($rename.ContainsKey($country)) { $country = $rename[$country] }
  $flag = Flag $cc
  $name = $name.Replace('"', '')
  $country = $country.Replace('"', '')
  $lines += ('    {0}:["{1}","{2}","{3}"]' -f $code, $name, $country, $flag)
  $named++
}
if ($named -eq 0) { Write-Host "nothing could be named"; exit 0 }

# Append before the closing brace of the object. The last existing entry
# has no trailing comma, so add one.
$idx = $src.LastIndexOf("};")
if ($idx -lt 0) { throw "places.js: closing brace not found" }
$head = $src.Substring(0, $idx).TrimEnd()
if (-not $head.EndsWith(",")) { $head += "," }
$out = $head + "`n" + ($lines -join ",`n") + "`n" + $src.Substring($idx)
[System.IO.File]::WriteAllText($Places, $out, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "named $named new destinations in places.js"
