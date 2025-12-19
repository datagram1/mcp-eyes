# ScreenControl Windows Build Script
#
# This script builds ALL Windows components:
# 1. Credential Provider DLL (ScreenControlCP.dll)
# 2. Windows Installer MSI (bundles service + tray + CP)
#
# Prerequisites:
# - Visual Studio 2019+ with C++ Desktop workload
# - WiX Toolset 3.11+ (https://wixtoolset.org/)
# - Service and Tray app already built (in dist/windows-x64/)
#
# Usage:
#   .\build-windows.ps1 [-Arch x64|arm64] [-Config Release|Debug] [-Version 1.2.0]

param(
    [ValidateSet("x64", "arm64")]
    [string]$Arch = "x64",

    [ValidateSet("Release", "Debug")]
    [string]$Config = "Release",

    [string]$Version = "1.2.0",

    [switch]$SkipCredentialProvider,
    [switch]$SkipInstaller,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

# ============================================
# Configuration
# ============================================
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = $ScriptDir
$DistDir = "$ProjectRoot\dist\windows-$Arch"
$CPSourceDir = "$ProjectRoot\service\src\platform\windows\credential_provider"
$InstallerDir = "$ProjectRoot\service\install\windows"

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  ScreenControl Windows Build" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Architecture:  $Arch" -ForegroundColor White
Write-Host "  Configuration: $Config" -ForegroundColor White
Write-Host "  Version:       $Version" -ForegroundColor White
Write-Host "  Project Root:  $ProjectRoot" -ForegroundColor Gray
Write-Host ""

# ============================================
# Clean build if requested
# ============================================
if ($Clean) {
    Write-Host "Cleaning previous builds..." -ForegroundColor Yellow

    if (Test-Path "$CPSourceDir\build") {
        Remove-Item -Recurse -Force "$CPSourceDir\build"
    }
    if (Test-Path "$CPSourceDir\$Config") {
        Remove-Item -Recurse -Force "$CPSourceDir\$Config"
    }
    if (Test-Path "$InstallerDir\output") {
        Remove-Item -Recurse -Force "$InstallerDir\output"
    }

    Write-Host "Clean complete" -ForegroundColor Green
    Write-Host ""
}

# ============================================
# Check prerequisites
# ============================================
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check for Visual Studio / MSBuild
$MSBuild = $null
$VSWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"

if (Test-Path $VSWhere) {
    $VSPath = & $VSWhere -latest -products * -requires Microsoft.Component.MSBuild -find MSBuild\**\Bin\MSBuild.exe | Select-Object -First 1
    if ($VSPath) {
        $MSBuild = $VSPath
    }
}

if (-not $MSBuild) {
    # Try common locations
    $MSBuildLocations = @(
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Enterprise\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Enterprise\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Professional\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Community\MSBuild\Current\Bin\MSBuild.exe"
    )

    foreach ($loc in $MSBuildLocations) {
        if (Test-Path $loc) {
            $MSBuild = $loc
            break
        }
    }
}

if (-not $MSBuild) {
    Write-Error "MSBuild not found. Please install Visual Studio 2019+ with C++ Desktop workload."
    exit 1
}

Write-Host "  MSBuild: $MSBuild" -ForegroundColor Green

# Check for WiX
$WixPath = $null
$WixLocations = @(
    "${env:WIX}bin",
    "C:\Program Files (x86)\WiX Toolset v3.11\bin",
    "C:\Program Files (x86)\WiX Toolset v3.14\bin",
    "C:\Program Files\WiX Toolset v3.11\bin"
)

foreach ($loc in $WixLocations) {
    if (Test-Path "$loc\candle.exe") {
        $WixPath = $loc
        break
    }
}

if (-not $WixPath -and -not $SkipInstaller) {
    Write-Warning "WiX Toolset not found. Installer build will be skipped."
    Write-Warning "Install from: https://wixtoolset.org/"
    $SkipInstaller = $true
} else {
    Write-Host "  WiX: $WixPath" -ForegroundColor Green
}

# Check for existing service and tray binaries
$RequiredFiles = @(
    "$DistDir\ScreenControlService.exe",
    "$DistDir\ScreenControlTray.exe"
)

$MissingPrereqs = @()
foreach ($file in $RequiredFiles) {
    if (-not (Test-Path $file)) {
        $MissingPrereqs += $file
    }
}

if ($MissingPrereqs.Count -gt 0) {
    Write-Error "Missing prerequisite files:"
    foreach ($file in $MissingPrereqs) {
        Write-Error "  - $file"
    }
    Write-Host ""
    Write-Host "Please build the service and tray app first:" -ForegroundColor Yellow
    Write-Host "  - Service: Run ./build-all.sh on macOS/Linux" -ForegroundColor Gray
    Write-Host "  - Tray App: dotnet publish in windows/ScreenControlTray" -ForegroundColor Gray
    exit 1
}

Write-Host "  Service: Found" -ForegroundColor Green
Write-Host "  Tray App: Found" -ForegroundColor Green
Write-Host ""

# ============================================
# Build Credential Provider DLL
# ============================================
if (-not $SkipCredentialProvider) {
    Write-Host "Building Credential Provider DLL..." -ForegroundColor Yellow
    Write-Host ""

    # Check if solution exists
    $SolutionPath = "$CPSourceDir\ScreenControlCP.sln"
    if (-not (Test-Path $SolutionPath)) {
        Write-Error "Credential Provider solution not found: $SolutionPath"
        exit 1
    }

    # Map architecture for MSBuild
    $MSBuildPlatform = switch ($Arch) {
        "x64" { "x64" }
        "arm64" { "ARM64" }
    }

    # Build with MSBuild
    Write-Host "  Building $Config|$MSBuildPlatform..." -ForegroundColor Gray

    $MSBuildArgs = @(
        $SolutionPath,
        "/p:Configuration=$Config",
        "/p:Platform=$MSBuildPlatform",
        "/m",  # Parallel build
        "/v:minimal"
    )

    & $MSBuild $MSBuildArgs

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Credential Provider build failed with exit code $LASTEXITCODE"
        exit 1
    }

    # Verify output
    $CPDllPath = "$DistDir\ScreenControlCP.dll"
    if (Test-Path $CPDllPath) {
        $DllInfo = Get-Item $CPDllPath
        Write-Host "  Output: $CPDllPath ($([math]::Round($DllInfo.Length / 1KB)) KB)" -ForegroundColor Green
    } else {
        Write-Error "Credential Provider DLL not found at expected location: $CPDllPath"
        exit 1
    }

    Write-Host ""
    Write-Host "Credential Provider build complete!" -ForegroundColor Green
    Write-Host ""
}

# ============================================
# Build Windows Installer
# ============================================
if (-not $SkipInstaller) {
    Write-Host "Building Windows Installer..." -ForegroundColor Yellow
    Write-Host ""

    # Check all files exist
    $InstallerFiles = @(
        "$DistDir\ScreenControlService.exe",
        "$DistDir\ScreenControlTray.exe",
        "$DistDir\ScreenControlCP.dll"
    )

    foreach ($file in $InstallerFiles) {
        if (-not (Test-Path $file)) {
            Write-Error "Missing file for installer: $file"
            exit 1
        }
    }

    # Create output directory
    $InstallerOutput = "$InstallerDir\output"
    if (-not (Test-Path $InstallerOutput)) {
        New-Item -ItemType Directory -Path $InstallerOutput | Out-Null
    }

    # Format version (1.2.0 -> 1.2.0.0)
    $VersionParts = $Version.Split('.')
    while ($VersionParts.Count -lt 4) {
        $VersionParts += "0"
    }
    $FullVersion = $VersionParts -join '.'

    # Compile WiX source
    Write-Host "  Compiling WiX source..." -ForegroundColor Gray
    $WixObj = "$InstallerOutput\Product.wixobj"

    $CandleArgs = @(
        "$InstallerDir\Product.wxs",
        "-arch", $Arch,
        "-dDistDir=$DistDir",
        "-dVersion=$FullVersion",
        "-out", $WixObj
    )

    & "$WixPath\candle.exe" $CandleArgs

    if ($LASTEXITCODE -ne 0) {
        Write-Error "WiX candle failed"
        exit 1
    }

    # Link MSI
    Write-Host "  Linking MSI package..." -ForegroundColor Gray
    $MsiName = "ScreenControl-$Version-$Arch.msi"
    $MsiPath = "$InstallerOutput\$MsiName"

    $LightArgs = @(
        $WixObj,
        "-ext", "WixUIExtension",
        "-cultures:en-us",
        "-out", $MsiPath
    )

    & "$WixPath\light.exe" $LightArgs

    if ($LASTEXITCODE -ne 0) {
        Write-Error "WiX light failed"
        exit 1
    }

    # Clean up
    Remove-Item $WixObj -ErrorAction SilentlyContinue
    Remove-Item "$InstallerOutput\Product.wixpdb" -ErrorAction SilentlyContinue

    $MsiInfo = Get-Item $MsiPath
    Write-Host "  Output: $MsiPath ($([math]::Round($MsiInfo.Length / 1MB, 1)) MB)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Installer build complete!" -ForegroundColor Green
    Write-Host ""
}

# ============================================
# Summary
# ============================================
Write-Host "======================================================" -ForegroundColor Green
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Output files in: $DistDir" -ForegroundColor Cyan
Write-Host ""

$OutputFiles = @(
    @{ Name = "Service"; File = "ScreenControlService.exe" },
    @{ Name = "Tray App"; File = "ScreenControlTray.exe" },
    @{ Name = "Credential Provider"; File = "ScreenControlCP.dll" }
)

foreach ($item in $OutputFiles) {
    $path = "$DistDir\$($item.File)"
    if (Test-Path $path) {
        $info = Get-Item $path
        $size = if ($info.Length -gt 1MB) { "$([math]::Round($info.Length / 1MB, 1)) MB" } else { "$([math]::Round($info.Length / 1KB)) KB" }
        Write-Host "  [OK] $($item.Name): $($item.File) ($size)" -ForegroundColor Green
    } else {
        Write-Host "  [--] $($item.Name): Not built" -ForegroundColor Gray
    }
}

if (-not $SkipInstaller) {
    $MsiPath = "$InstallerDir\output\ScreenControl-$Version-$Arch.msi"
    if (Test-Path $MsiPath) {
        $info = Get-Item $MsiPath
        Write-Host "  [OK] Installer: ScreenControl-$Version-$Arch.msi ($([math]::Round($info.Length / 1MB, 1)) MB)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Installation:" -ForegroundColor Yellow
Write-Host "  GUI:    msiexec /i `"$InstallerDir\output\ScreenControl-$Version-$Arch.msi`"" -ForegroundColor White
Write-Host "  Silent: msiexec /i `"$InstallerDir\output\ScreenControl-$Version-$Arch.msi`" /qn" -ForegroundColor White
Write-Host ""
