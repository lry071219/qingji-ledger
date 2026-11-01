param([string]$ToolsRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) '.android-local/tools'))
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$ToolsRoot = (Resolve-Path -LiteralPath $ToolsRoot).Path
$java = Join-Path $ToolsRoot 'jdk/bin/java.exe'
$javac = Join-Path $ToolsRoot 'jdk/bin/javac.exe'
$jar = Join-Path $ToolsRoot 'jdk/bin/jar.exe'
$keytool = Join-Path $ToolsRoot 'jdk/bin/keytool.exe'
$buildTools = if (Test-Path -LiteralPath (Join-Path $ToolsRoot 'build-tools-37/aapt2.exe')) {'build-tools-37'} else {'build-tools'}
$aapt = Join-Path $ToolsRoot "$buildTools/aapt2.exe"
$zipalign = Join-Path $ToolsRoot "$buildTools/zipalign.exe"
$platform = Join-Path $ToolsRoot 'platform-37/android.jar'
foreach ($tool in @($java,$javac,$jar,$keytool,$aapt,$zipalign,$platform)) {
  if (!(Test-Path -LiteralPath $tool)) {throw "Missing tool: $tool. Run android/setup-tools.ps1 first."}
}
function Invoke-Checked($Executable, [string[]]$Arguments) {
  # Some Windows Android command-line tools cannot open non-ASCII argv paths.
  # Run within the Unicode checkout, passing only relative ASCII project paths.
  $relativeArguments = foreach ($argument in $Arguments) {
    if ($argument.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      [System.IO.Path]::GetRelativePath($projectRoot, $argument).Replace('\','/')
    } else {$argument}
  }
  Push-Location -LiteralPath $projectRoot
  try {
    & $Executable @relativeArguments
    if ($LASTEXITCODE -ne 0) {throw "Build command failed: $Executable (exit $LASTEXITCODE)"}
  } finally {Pop-Location}
}

# ASCII staging avoids Windows aapt2 problems with non-ASCII checkout paths.
$stage = Join-Path ([IO.Path]::GetTempPath()) 'qingji-native-build-6ae6eff2'
$sdk = Join-Path $stage 'sdk'
$gradleProject = Join-Path $stage 'project'
New-Item -ItemType Directory -Force -Path $sdk,$gradleProject | Out-Null
foreach ($spec in @(@{From='platform-37';To='platforms/android-37.0'},@{From='build-tools';To='build-tools/36.0.0'})) {
  $destination = Join-Path $sdk $spec.To
  if (!(Test-Path -LiteralPath (Join-Path $destination 'source.properties'))) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath (Join-Path $ToolsRoot $spec.From) -Destination $destination -Recurse
  }
}
if (!(Test-Path -LiteralPath (Join-Path $sdk 'platform-tools/adb.exe'))) {
  Copy-Item -LiteralPath (Join-Path $ToolsRoot 'platform-tools') -Destination $sdk -Recurse
}
# Use the SDK terms shipped by Google's repository, not a fabricated license hash.
[xml]$repository = Get-Content -Raw -LiteralPath (Join-Path $projectRoot '.android-local/repository.xml')
$license = $repository.SelectSingleNode("//*[local-name()='license' and @id='android-sdk-license']")
if (!$license) {throw 'Official Android SDK license is missing.'}
$licenseRoot = Join-Path $sdk 'licenses'
New-Item -ItemType Directory -Force -Path $licenseRoot | Out-Null
$licenseHash = [Convert]::ToHexString([Security.Cryptography.SHA1]::HashData([Text.Encoding]::UTF8.GetBytes($license.InnerText))).ToLowerInvariant()
$licenseHash | Set-Content -LiteralPath (Join-Path $licenseRoot 'android-sdk-license') -Encoding ascii
# New API 37 uses major.minor versions that legacy source.properties discovery
# does not recognize. Retain the official repository's platform type metadata.
$platformMetadata = $repository.SelectSingleNode("//*[local-name()='remotePackage' and @path='platforms;android-37.0']")
$type = $platformMetadata.SelectSingleNode("*[local-name()='type-details']").OuterXml
$revision = $platformMetadata.SelectSingleNode("*[local-name()='revision']").OuterXml
$metadata = '<common:repository xmlns:common="http://schemas.android.com/repository/android/common/02" xmlns:sdk="http://schemas.android.com/sdk/android/repo/repository2/03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' + $license.OuterXml + '<localPackage path="platforms;android-37.0" obsolete="false">' + $type + $revision + '<display-name>Android SDK Platform 37.0</display-name><uses-license ref="android-sdk-license"/></localPackage></common:repository>'
$metadata | Set-Content -LiteralPath (Join-Path $sdk 'platforms/android-37.0/package.xml') -Encoding utf8
$assetRoot = Join-Path $gradleProject 'assets/web'
if (Test-Path -LiteralPath $assetRoot) {
  $resolvedAsset = (Resolve-Path -LiteralPath $assetRoot).Path
  if (!$resolvedAsset.StartsWith($stage + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {throw 'Unsafe staging path'}
  Remove-Item -LiteralPath $resolvedAsset -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null
foreach ($name in @('settings.gradle','build.gradle','gradle.properties','AndroidManifest.xml','src','res')) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $gradleProject -Recurse -Force
}
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'dist') | Where-Object {$_.Name -notin @('downloads','vendor')} | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $assetRoot -Recurse -Force
}
$noticeRoot = Join-Path $assetRoot 'vendor'
New-Item -ItemType Directory -Force -Path $noticeRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist/vendor/OPEN-SOURCE-NOTICES.txt') -Destination $noticeRoot
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'dist/vendor') -Recurse -File | Where-Object {$_.Name -match '(?i)license|licence|notice|copying'} | ForEach-Object {
  $noticePath = Join-Path $noticeRoot ([IO.Path]::GetRelativePath((Join-Path $projectRoot 'dist/vendor'),$_.FullName))
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $noticePath) | Out-Null
  Copy-Item -LiteralPath $_.FullName -Destination $noticePath -Force
}
$sdkProperty = $sdk.Replace('\','/').Replace(':','\:')
"sdk.dir=$sdkProperty" | Set-Content -LiteralPath (Join-Path $gradleProject 'local.properties') -Encoding utf8
$env:JAVA_HOME = Join-Path $ToolsRoot 'jdk'
$env:GRADLE_USER_HOME = Join-Path $stage 'gradle-cache'
$gradle = Join-Path $ToolsRoot 'gradle-9.3.1/bin/gradle.bat'
if (!(Test-Path -LiteralPath $gradle)) {throw 'Run android/setup-gradle.ps1 first.'}
& $gradle --no-daemon --console=plain -p $gradleProject assembleRelease
if ($LASTEXITCODE -ne 0) {throw 'Native Android build failed.'}
$noticeResult = & node (Join-Path $PSScriptRoot 'collect-native-notices.mjs') $stage
if ($LASTEXITCODE -ne 0) {throw 'Native dependency license inventory failed.'}
if (($noticeResult | ConvertFrom-Json).changed) {
  & $gradle --no-daemon --console=plain -p $gradleProject assembleRelease
  if ($LASTEXITCODE -ne 0) {throw 'Repackaging dependency notices failed.'}
}
$unsigned = (Get-ChildItem -LiteralPath (Join-Path $gradleProject 'build/outputs/apk/release') -Filter '*-unsigned.apk' | Select-Object -First 1).FullName
if (!$unsigned) {throw 'Unsigned APK was not produced.'}
$aligned = Join-Path $stage 'aligned.apk'
Invoke-Checked $zipalign @('-f','-P','16','4',$unsigned,$aligned)

$signingRoot = Join-Path $projectRoot '.android-local/signing'
New-Item -ItemType Directory -Force -Path $signingRoot | Out-Null
$keystore = Join-Path $signingRoot 'qingji-release.jks'
$protectedPassword = Join-Path $signingRoot 'password.dpapi'
if (!(Test-Path -LiteralPath $protectedPassword)) {
  if (Test-Path -LiteralPath $keystore) {throw 'Signing password is missing. Preserve the existing keystore; do not replace it.'}
  $password = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  $secure = ConvertTo-SecureString -String $password -AsPlainText -Force
  ConvertFrom-SecureString -SecureString $secure | Set-Content -LiteralPath $protectedPassword -NoNewline
  $password = $null
}
$secure = ConvertTo-SecureString (Get-Content -Raw -LiteralPath $protectedPassword)
$env:QINGJI_SIGNING_PASSWORD = [PSCredential]::new('qingji',$secure).GetNetworkCredential().Password
try {
  if (!(Test-Path -LiteralPath $keystore)) {
    Invoke-Checked $keytool @('-genkeypair','-keystore',$keystore,'-storetype','JKS','-storepass:env','QINGJI_SIGNING_PASSWORD','-keypass:env','QINGJI_SIGNING_PASSWORD','-alias','qingji','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Qingji Local App, O=Qingji, C=CN')
  }
  $downloadRoot = Join-Path $projectRoot 'dist/downloads'
  New-Item -ItemType Directory -Force -Path $downloadRoot | Out-Null
  $apk = Join-Path $downloadRoot 'qingji-1.3.0-arm64.apk'
  Invoke-Checked $java @('-jar',(Join-Path $ToolsRoot "$buildTools/lib/apksigner.jar"),'sign','--ks',$keystore,'--ks-key-alias','qingji','--ks-pass','env:QINGJI_SIGNING_PASSWORD','--key-pass','env:QINGJI_SIGNING_PASSWORD','--v1-signing-enabled','true','--v2-signing-enabled','true','--v3-signing-enabled','true','--out',$apk,$aligned)
} finally {Remove-Item Env:QINGJI_SIGNING_PASSWORD -ErrorAction SilentlyContinue}
Invoke-Checked $java @('-jar',(Join-Path $ToolsRoot "$buildTools/lib/apksigner.jar"),'verify','--verbose','--print-certs',$apk)
Invoke-Checked $zipalign @('-c','-P','16','4',$apk)
Invoke-Checked $aapt @('dump','badging',$apk)

$permissions = & $aapt dump permissions $apk
if ($LASTEXITCODE -ne 0 -or ($permissions -join "`n") -match 'android.permission.INTERNET|AD_ID') {throw 'Offline APK unexpectedly declares Internet or advertising permission.'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($apk)
try {
  $nativeLibraries = @($archive.Entries | Where-Object {$_.FullName.StartsWith('lib/')})
  if (!$nativeLibraries.Count -or @($nativeLibraries | Where-Object {!$_.FullName.StartsWith('lib/arm64-v8a/')}).Count) {throw 'Expected ARM64-only native libraries.'}
  foreach ($library in $nativeLibraries) {
    $stream = $library.Open(); $memory = [IO.MemoryStream]::new()
    try {$stream.CopyTo($memory);$elf=$memory.ToArray()} finally {$stream.Dispose();$memory.Dispose()}
    if ($elf.Length -lt 64 -or $elf[4] -ne 2 -or $elf[5] -ne 1 -or [BitConverter]::ToUInt16($elf,18) -ne 183) {throw 'Expected little-endian ELF64 AArch64 library.'}
    $phoff = [BitConverter]::ToUInt64($elf,32);$phsize=[BitConverter]::ToUInt16($elf,54);$phnum=[BitConverter]::ToUInt16($elf,56)
    for ($i=0;$i -lt $phnum;$i++) {
      $offset=[int]($phoff+$i*$phsize)
      if ([BitConverter]::ToUInt32($elf,$offset) -eq 1 -and [BitConverter]::ToUInt64($elf,$offset+48) -lt 16384) {throw "Native library lacks 16KB ELF alignment: $($library.FullName)"}
    }
  }
  if (!@($archive.Entries | Where-Object {$_.FullName -match 'chinese|ocr.*model'}).Count) {throw 'Bundled Chinese model is missing.'}
  if (@($archive.Entries | Where-Object {$_.FullName.Contains('\') -or $_.FullName -match '(?i)\.jks$|\.keystore$|password\.dpapi|^assets/web/downloads/'}).Count -ne 0) {throw 'APK contains an unsafe asset path or signing/recursive download artifact.'}
  foreach ($name in @('classes.dex','assets/web/index.html','assets/web/app.js','assets/web/native.js','assets/web/ocr.js','assets/web/ocr-native.js','assets/web/ocr-image.js','assets/web/ocr-pipeline.js','assets/web/privacy.html','assets/web/privacy.js','assets/web/vendor/OPEN-SOURCE-NOTICES.txt')) {
    if (!$archive.GetEntry($name)) {throw "APK is missing required file: $name"}
  }
} finally {$archive.Dispose()}
$checksum = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
"$checksum  qingji-1.3.0-arm64.apk" | Set-Content -LiteralPath (Join-Path $downloadRoot 'qingji-1.3.0-arm64.apk.sha256') -Encoding utf8
@{version='1.3.0';versionCode=4;packageId='com.qingji.ledger';minAndroid='7.0';minSdk=24;targetSdk=37;compileSdk=37;buildTools=$buildTools;architecture='arm64-v8a';supportsArm64=$true;nativeLibraries=$nativeLibraries.Count;ocrEngine='mlkit-chinese-bundled';networkPermission=$false;channel='release-candidate';publicationReady=$false;pending=@('developer identity','support email','physical device acceptance');size=(Get-Item -LiteralPath $apk).Length;sha256=$checksum;builtAt=[DateTimeOffset]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $downloadRoot 'release.json') -Encoding utf8
Write-Output "APK ready: $apk"
Write-Output "SHA-256: $checksum"
