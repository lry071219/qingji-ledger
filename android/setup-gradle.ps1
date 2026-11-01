param([string]$ToolsRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) '.android-local/tools'))
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null
$archive = Join-Path $ToolsRoot 'gradle-9.3.1-bin.zip'
$base = 'https://downloads.gradle.org/distributions/gradle-9.3.1-bin.zip'
$response = (Invoke-WebRequest -Uri ($base + '.sha256') -TimeoutSec 60).Content
$checksum = $(if ($response -is [byte[]]) {[Text.Encoding]::UTF8.GetString($response)} else {[string]$response}).Trim()
if ($checksum -notmatch '^[a-f0-9]{64}$') {throw 'Invalid official Gradle checksum'}
if (!(Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $checksum) {
  Invoke-WebRequest -Uri $base -OutFile ($archive + '.partial') -TimeoutSec 180
  if ((Get-FileHash -LiteralPath ($archive + '.partial') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $checksum) {throw 'Gradle checksum mismatch'}
  Move-Item -LiteralPath ($archive + '.partial') -Destination $archive -Force
}
if (!(Test-Path -LiteralPath (Join-Path $ToolsRoot 'gradle-9.3.1/bin/gradle.bat'))) {Expand-Archive -LiteralPath $archive -DestinationPath $ToolsRoot}
Write-Output "Gradle 9.3.1 verified: $checksum"
