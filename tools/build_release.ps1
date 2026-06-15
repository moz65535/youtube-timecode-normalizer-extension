$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$extension = Join-Path $root "extension"
$dist = Join-Path $root "dist"
$release = Join-Path $dist "release"
$chrome = Join-Path $release "chrome"
$firefox = Join-Path $release "firefox"
$distFull = [IO.Path]::GetFullPath($dist)
$releaseFull = [IO.Path]::GetFullPath($release)

if (
  -not $releaseFull.StartsWith("$distFull$([IO.Path]::DirectorySeparatorChar)") -or
  [IO.Path]::GetFileName($releaseFull) -ne "release"
) {
  throw "Unexpected release output path: $releaseFull"
}

if (Test-Path $release) {
  Remove-Item -LiteralPath $release -Recurse -Force
}

New-Item -ItemType Directory -Path $chrome -Force | Out-Null
Copy-Item -Path (Join-Path $extension "*") -Destination $chrome -Recurse -Force
Remove-Item -LiteralPath (Join-Path $chrome "manifest.firefox.json") -Force
Copy-Item -LiteralPath (Join-Path $root "PRIVACY.md") -Destination $chrome -Force
Copy-Item -LiteralPath (Join-Path $root "CHANGELOG.md") -Destination $chrome -Force

& node (Join-Path $PSScriptRoot "build_firefox.js")
Copy-Item -Path (Join-Path $dist "firefox") -Destination $firefox -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root "PRIVACY.md") -Destination $firefox -Force
Copy-Item -LiteralPath (Join-Path $root "CHANGELOG.md") -Destination $firefox -Force

$version = (Get-Content (Join-Path $extension "manifest.json") -Raw | ConvertFrom-Json).version
$chromeZip = Join-Path $release "youtube-timecode-normalizer-$version-chrome.zip"
$firefoxZip = Join-Path $release "youtube-timecode-normalizer-$version-firefox.zip"

Compress-Archive -Path (Join-Path $chrome "*") -DestinationPath $chromeZip -Force
Compress-Archive -Path (Join-Path $firefox "*") -DestinationPath $firefoxZip -Force

function Get-Sha256([string]$path) {
  $stream = [IO.File]::OpenRead($path)
  try {
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
      return ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

@($chromeZip, $firefoxZip) |
  ForEach-Object { "$(Get-Sha256 $_)  $([IO.Path]::GetFileName($_))" } |
  Set-Content -LiteralPath (Join-Path $release "SHA256SUMS.txt") -Encoding ascii

Write-Output "Chrome: $chromeZip"
Write-Output "Firefox: $firefoxZip"
