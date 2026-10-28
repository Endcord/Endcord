# Endcord Installer Build + Self-Test + Sign Script (Endcord-main2)
# -NoSite builds, tests and signs without copying the installer into the site folder
param([switch]$NoSite)
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$outExe = Join-Path $repoRoot "EndcordInstaller.exe"
# The installer copy and the site folder sit next to this repo
$workDir = Split-Path -Parent $repoRoot
$desktopExe = Join-Path $workDir "EndcordInstaller.exe"
$siteDir = Join-Path $workDir "Endcord-site"
$distInstallerDir = Join-Path $repoRoot "dist\Installer"

try {
    Get-Process -Name "EndcordInstaller" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 200
} catch { }

Write-Host "[1/6] Ensuring dist payload files exist..." -ForegroundColor Cyan
$distDir = Join-Path $repoRoot "dist"
$distCompressedDir = Join-Path $repoRoot "dist_compressed"
if (!(Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}

$payloadNames = @("patcher.js", "preload.js", "renderer.js", "renderer.css")
foreach ($pName in $payloadNames) {
    $rawFile = Join-Path $distDir $pName
    $gzFile = Join-Path $distCompressedDir ($pName + ".gz")
    if ((!(Test-Path $rawFile)) -and (Test-Path $gzFile)) {
        $inStream = [System.IO.File]::OpenRead($gzFile)
        $gzStream = New-Object System.IO.Compression.GZipStream($inStream, [System.IO.Compression.CompressionMode]::Decompress)
        $outStream = [System.IO.File]::Create($rawFile)
        $gzStream.CopyTo($outStream)
        $outStream.Close()
        $gzStream.Close()
        $inStream.Close()
        Write-Host "  -> Unpacked $pName from dist_compressed" -ForegroundColor DarkGray
    }
}

Write-Host "[2/6] Collecting installer C# sources..." -ForegroundColor Cyan
$csFiles = @()
$csFiles += (Join-Path $repoRoot "InstallerGUI.cs")
$csFiles += Get-ChildItem -Path (Join-Path $repoRoot "installer") -Recurse -Filter "*.cs" | Select-Object -ExpandProperty FullName

Write-Host ("  -> Found " + $csFiles.Count + " source files.") -ForegroundColor Gray

$cscArgs = @(
    "/target:winexe",
    "/optimize+",
    "/utf8output",
    "/out:$outExe",
    "/win32icon:`"$(Join-Path $repoRoot 'app_icon.ico')`"",
    "/win32manifest:`"$(Join-Path $repoRoot 'app.manifest')`"",
    "/resource:`"$(Join-Path $repoRoot 'dist\patcher.js')`",patcher.js",
    "/resource:`"$(Join-Path $repoRoot 'dist\preload.js')`",preload.js",
    "/resource:`"$(Join-Path $repoRoot 'dist\renderer.js')`",renderer.js",
    "/resource:`"$(Join-Path $repoRoot 'dist\renderer.css')`",renderer.css",
    "/resource:`"$(Join-Path $repoRoot 'app_logo.png')`",app_logo.png",
    "/r:System.dll",
    "/r:System.Core.dll",
    "/r:System.Drawing.dll",
    "/r:System.Windows.Forms.dll",
    "/r:System.Web.Extensions.dll",
    "/r:System.Xaml.dll",
    "/r:WPF\WindowsBase.dll",
    "/r:WPF\PresentationCore.dll",
    "/r:WPF\PresentationFramework.dll"
)
$cscArgs += $csFiles

Write-Host "[3/6] Compiling EndcordInstaller.exe..." -ForegroundColor Cyan
& $cscPath $cscArgs

if ($LASTEXITCODE -ne 0) {
    Write-Error "Compilation failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Write-Host "  -> Compiled successfully: $outExe" -ForegroundColor Green

Write-Host "[4/6] Running Automated Installer Self-Tests (--self-test)..." -ForegroundColor Cyan
$testReport = Join-Path $repoRoot "installer-selftest.log"
if (Test-Path $testReport) { Remove-Item $testReport -Force }
$env:ENDCORD_TEST_REPORT = $testReport
$proc = Start-Process -FilePath $outExe -ArgumentList "--self-test" -Wait -PassThru -NoNewWindow
if (Test-Path $testReport) {
    Get-Content $testReport | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
}
if ($proc.ExitCode -ne 0) {
    Write-Error "Automated self-tests failed with exit code $($proc.ExitCode)"
    exit $proc.ExitCode
}
Write-Host "  -> All self-tests passed!" -ForegroundColor Green

Write-Host "[5/6] Signing EndcordInstaller.exe..." -ForegroundColor Cyan
$certName = "CN=Endcord Open Source Developer, O=Endcord, C=US"
$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -eq $certName } | Select-Object -First 1

if (-not $cert) {
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $certName `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -HashAlgorithm SHA256 `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -NotAfter (Get-Date).AddYears(5)

    try {
        $rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "CurrentUser")
        $rootStore.Open("ReadWrite")
        $rootStore.Add($cert)
        $rootStore.Close()
    } catch { }
}

try {
    Get-Process -Name "EndcordInstaller" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 200
} catch { }

$null = Set-AuthenticodeSignature -FilePath $outExe -Certificate $cert -HashAlgorithm SHA256

Write-Host "[6/6] Publishing artifacts..." -ForegroundColor Cyan
if (!(Test-Path $distInstallerDir)) {
    New-Item -ItemType Directory -Path $distInstallerDir -Force | Out-Null
}
Copy-Item -Path $outExe -Destination (Join-Path $distInstallerDir "EndcordInstaller.exe") -Force
Copy-Item -Path $outExe -Destination $desktopExe -Force

if ((-not $NoSite) -and (Test-Path $siteDir)) {
    Copy-Item -Path $outExe -Destination (Join-Path $siteDir "EndcordInstaller.exe") -Force
    $zipPath = Join-Path $siteDir "EndcordInstaller.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path $outExe -DestinationPath $zipPath -Force
}

Write-Host "Build, Test & Sign complete!" -ForegroundColor Green
