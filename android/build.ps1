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

$buildRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'build'))
if (!$buildRoot.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to clean a build path outside this project.'
}
if (Test-Path -LiteralPath $buildRoot) {Remove-Item -LiteralPath $buildRoot -Recurse -Force}
$assetRoot = Join-Path $buildRoot 'assets/web'
$classes = Join-Path $buildRoot 'classes'
$dex = Join-Path $buildRoot 'dex'
New-Item -ItemType Directory -Force -Path $assetRoot,$classes,$dex,(Join-Path $buildRoot 'generated') | Out-Null
# Avoid recursively packaging an earlier downloadable APK into the next APK.
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'dist') | Where-Object {$_.Name -ne 'downloads'} | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $assetRoot -Recurse
}
$resources = Join-Path $buildRoot 'resources.zip'
Invoke-Checked $aapt @('compile','--dir',(Join-Path $PSScriptRoot 'res'),'-o',$resources)
$unsigned = Join-Path $buildRoot 'unsigned.apk'
Invoke-Checked $aapt @('link','-o',$unsigned,'--manifest',(Join-Path $PSScriptRoot 'AndroidManifest.xml'),'-I',$platform,'--java',(Join-Path $buildRoot 'generated'),$resources)
$sources = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'src') -Recurse -Filter '*.java' | ForEach-Object {$_.FullName})
Invoke-Checked $javac (@('-encoding','UTF-8','--release','8','-classpath',$platform,'-d',$classes) + $sources)
$classJar = Join-Path $buildRoot 'classes.jar'
Invoke-Checked $jar @('--create','--file',$classJar,'-C',$classes,'.')
Invoke-Checked $java @('-cp',(Join-Path $ToolsRoot "$buildTools/lib/d8.jar"),'com.android.tools.r8.D8','--min-api','24','--lib',$platform,'--output',$dex,$classJar)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($unsigned, [System.IO.Compression.ZipArchiveMode]::Update)
try {
  # Add web assets with ZIP-standard forward slashes. Windows aapt2 -A can
  # otherwise emit backslash asset names that Android AssetManager cannot open.
  foreach ($file in @(Get-ChildItem -LiteralPath $assetRoot -Recurse -File)) {
    $entryName = 'assets/web/' + [System.IO.Path]::GetRelativePath($assetRoot,$file.FullName).Replace('\','/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$entryName,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
  foreach ($file in @(Get-ChildItem -LiteralPath $dex -Filter '*.dex')) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$file.Name,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {$archive.Dispose()}
$aligned = Join-Path $buildRoot 'aligned.apk'
Invoke-Checked $zipalign @('-f','-p','4',$unsigned,$aligned)

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
  $apk = Join-Path $downloadRoot 'qingji-1.2.0-universal.apk'
  Invoke-Checked $java @('-jar',(Join-Path $ToolsRoot "$buildTools/lib/apksigner.jar"),'sign','--ks',$keystore,'--ks-key-alias','qingji','--ks-pass','env:QINGJI_SIGNING_PASSWORD','--key-pass','env:QINGJI_SIGNING_PASSWORD','--v1-signing-enabled','true','--v2-signing-enabled','true','--v3-signing-enabled','true','--out',$apk,$aligned)
} finally {Remove-Item Env:QINGJI_SIGNING_PASSWORD -ErrorAction SilentlyContinue}
Invoke-Checked $java @('-jar',(Join-Path $ToolsRoot "$buildTools/lib/apksigner.jar"),'verify','--verbose','--print-certs',$apk)
Invoke-Checked $zipalign @('-c','-p','4',$apk)
Invoke-Checked $aapt @('dump','badging',$apk)

$archive = [System.IO.Compression.ZipFile]::OpenRead($apk)
try {
  if (@($archive.Entries | Where-Object {$_.FullName.StartsWith('lib/')} ).Count -ne 0) {throw 'Unexpected native library: audit 64-bit ABIs before shipping.'}
  if (@($archive.Entries | Where-Object {$_.FullName.Contains('\') -or $_.FullName -match '(?i)\.jks$|\.keystore$|password\.dpapi|^assets/web/downloads/'}).Count -ne 0) {throw 'APK contains an unsafe asset path or signing/recursive download artifact.'}
  foreach ($name in @('classes.dex','assets/web/index.html','assets/web/app.js','assets/web/native.js','assets/web/ocr.js','assets/web/ocr-image.js','assets/web/ocr-pipeline.js','assets/web/privacy.html','assets/web/privacy.js','assets/web/vendor/OPEN-SOURCE-NOTICES.txt','assets/web/vendor/worker.min.js','assets/web/vendor/tesseract.min.js','assets/web/vendor/lang/chi_sim.traineddata.gz','assets/web/vendor/core/tesseract-core-lstm.wasm.js','assets/web/vendor/core/tesseract-core-simd-lstm.wasm.js','assets/web/vendor/core/tesseract-core-relaxedsimd-lstm.wasm.js')) {
    if (!$archive.GetEntry($name)) {throw "APK is missing required file: $name"}
  }
} finally {$archive.Dispose()}
$checksum = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
"$checksum  qingji-1.2.0-universal.apk" | Set-Content -LiteralPath (Join-Path $downloadRoot 'qingji-1.2.0-universal.apk.sha256') -Encoding utf8
@{version='1.2.0';versionCode=3;packageId='com.qingji.ledger';minAndroid='7.0';minSdk=24;targetSdk=37;compileSdk=37;buildTools=$buildTools;architecture='universal';supportsArm64=$true;nativeLibraries=0;channel='release-candidate';publicationReady=$false;pending=@('developer identity','support email','physical device acceptance');size=(Get-Item -LiteralPath $apk).Length;sha256=$checksum;builtAt=[DateTimeOffset]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $downloadRoot 'release.json') -Encoding utf8
Write-Output "APK ready: $apk"
Write-Output "SHA-256: $checksum"
