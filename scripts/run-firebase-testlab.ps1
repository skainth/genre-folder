param(
    [string]$AppPath = $env:APP_PATH,
    [string]$Project = $env:FIREBASE_PROJECT,
    [string]$DeviceModel = $env:FTL_DEVICE_MODEL,
    [string]$AndroidVersion = $env:FTL_ANDROID_VERSION,
    [string]$Locale = $env:FTL_LOCALE,
    [string]$Orientation = $env:FTL_ORIENTATION
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($AppPath)) {
    throw 'Missing APP_PATH. Set APP_PATH env var or pass -AppPath.'
}

if (-not (Test-Path $AppPath)) {
    throw "APK path does not exist: $AppPath"
}

if ([string]::IsNullOrWhiteSpace($Project)) {
    throw 'Missing FIREBASE_PROJECT. Set FIREBASE_PROJECT env var or pass -Project.'
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    throw 'gcloud CLI not found. Install Google Cloud CLI and run gcloud auth login first.'
}

$deviceModelResolved = if ([string]::IsNullOrWhiteSpace($DeviceModel)) { 'oriole' } else { $DeviceModel }
$androidVersionResolved = if ([string]::IsNullOrWhiteSpace($AndroidVersion)) { '34' } else { $AndroidVersion }
$localeResolved = if ([string]::IsNullOrWhiteSpace($Locale)) { 'en' } else { $Locale }
$orientationResolved = if ([string]::IsNullOrWhiteSpace($Orientation)) { 'portrait' } else { $Orientation }

Write-Host "Running Firebase Test Lab robo test for: $AppPath"
Write-Host "Project: $Project"
Write-Host "Device: model=$deviceModelResolved,version=$androidVersionResolved,locale=$localeResolved,orientation=$orientationResolved"

$cmdArgs = @(
    'firebase',
    'test',
    'android',
    'run',
    '--type', 'robo',
    '--project', $Project,
    '--app', $AppPath,
    '--device', "model=$deviceModelResolved,version=$androidVersionResolved,locale=$localeResolved,orientation=$orientationResolved"
)

& gcloud @cmdArgs

if ($LASTEXITCODE -ne 0) {
    throw "Firebase Test Lab run failed with exit code $LASTEXITCODE"
}

Write-Host 'Firebase Test Lab run submitted/completed successfully.'
