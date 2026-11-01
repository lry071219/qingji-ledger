param([string]$ToolsRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) '.android-local/tools'))
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null
$ToolsRoot = (Resolve-Path -LiteralPath $ToolsRoot).Path
$ProgressPreference = 'SilentlyContinue'

function Get-CheckedArchive($Url, $Destination, $Algorithm, $Checksum) {
  if ((Test-Path -LiteralPath $Destination) -and (Get-FileHash -LiteralPath $Destination -Algorithm $Algorithm).Hash -eq $Checksum) {return}
  $partial = $Destination + '.partial'
  & curl.exe --fail --location --retry 2 --retry-all-errors --retry-delay 3 --connect-timeout 20 --max-time 300 --silent --show-error --output $partial $Url
  if ($LASTEXITCODE -ne 0) {throw "Official tool download failed: $Url"}
  if ((Get-FileHash -LiteralPath $partial -Algorithm $Algorithm).Hash -ne $Checksum) {throw "Checksum mismatch: $partial"}
  Move-Item -LiteralPath $partial -Destination $Destination -Force
}

if (!(Test-Path -LiteralPath (Join-Path $ToolsRoot 'jdk/bin/java.exe'))) {
  $assets = Invoke-RestMethod -Uri 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
  $package = $assets[0].binary.package
  $archive = Join-Path $ToolsRoot 'jdk.zip'
  Get-CheckedArchive $package.link $archive 'SHA256' $package.checksum
  $expanded = Join-Path $ToolsRoot 'jdk-extracted'
  Expand-Archive -LiteralPath $archive -DestinationPath $expanded -Force
  $jdk = Get-ChildItem -LiteralPath $expanded -Directory | Where-Object {Test-Path -LiteralPath (Join-Path $_.FullName 'bin/java.exe')} | Select-Object -First 1
  if (!$jdk) {throw 'JDK archive did not contain bin/java.exe'}
  # Copy only; no global installation, PATH or user settings changes.
  Copy-Item -LiteralPath $jdk.FullName -Destination (Join-Path $ToolsRoot 'jdk') -Recurse
  Write-Output 'Portable JDK 21 ready.'
}

$repositoryFile = Join-Path (Split-Path -Parent $ToolsRoot) 'repository.xml'
if (!(Test-Path -LiteralPath $repositoryFile)) {Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/repository2-3.xml' -OutFile $repositoryFile -TimeoutSec 60}
[xml]$repository = Get-Content -Raw -LiteralPath $repositoryFile
foreach ($spec in @(@{Id='platforms;android-37.0';Folder='platform-37'},@{Id='build-tools;37.0.0';Folder='build-tools-37'})) {
  $destination = Join-Path $ToolsRoot $spec.Folder
  if (Test-Path -LiteralPath $destination) {continue}
  $package = @($repository.SelectNodes("//*[local-name()='remotePackage']")) | Where-Object {$_.path -eq $spec.Id} | Select-Object -First 1
  if (!$package) {throw "Android repository package missing: $($spec.Id)"}
  $archiveInfo = @($package.archives.archive) | Where-Object {!$_.'host-os' -or $_.'host-os' -eq 'windows'} | Select-Object -First 1
  $archive = Join-Path $ToolsRoot ($spec.Folder + '.zip')
  try {
    Get-CheckedArchive ('https://dl-ssl.google.com/android/repository/' + $archiveInfo.complete.url) $archive 'SHA1' $archiveInfo.complete.checksum.InnerText
  } catch {
    if ($spec.Id -eq 'build-tools;37.0.0' -and (Test-Path -LiteralPath (Join-Path $ToolsRoot 'build-tools/aapt2.exe'))) {
      Write-Warning 'Build Tools 37 download is unavailable. Retaining existing verified Build Tools 36 with API 37 platform.'
      continue
    }
    throw
  }
  $expanded = Join-Path $ToolsRoot ($spec.Folder + '-extracted')
  Expand-Archive -LiteralPath $archive -DestinationPath $expanded -Force
  $folder = Get-ChildItem -LiteralPath $expanded -Directory | Select-Object -First 1
  Copy-Item -LiteralPath $folder.FullName -Destination $destination -Recurse
  # Keep Google's included license/notice files with the tools.
  Write-Output "Android $($spec.Id) ready."
}
& (Join-Path $ToolsRoot 'jdk/bin/java.exe') -version
Write-Output "Local Android build tools: $ToolsRoot"
