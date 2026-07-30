param(
    [string]$AppPath = $env:APP_PATH
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($env:BROWSERSTACK_USERNAME)) {
    throw 'Missing BROWSERSTACK_USERNAME environment variable.'
}

if ([string]::IsNullOrWhiteSpace($env:BROWSERSTACK_ACCESS_KEY)) {
    throw 'Missing BROWSERSTACK_ACCESS_KEY environment variable.'
}

if ([string]::IsNullOrWhiteSpace($AppPath)) {
    throw 'Missing APK path. Set APP_PATH environment variable or pass -AppPath.'
}

if (-not (Test-Path $AppPath)) {
    throw "APK path does not exist: $AppPath"
}

$uploadUri = 'https://api-cloud.browserstack.com/app-automate/upload'
$username = $env:BROWSERSTACK_USERNAME
$accessKey = $env:BROWSERSTACK_ACCESS_KEY
$pair = "${username}:${accessKey}"
$base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$headers = @{ Authorization = "Basic $base64" }

$response = Invoke-RestMethod -Method Post -Uri $uploadUri -Headers $headers -Form @{ file = Get-Item $AppPath }

Write-Host 'Upload successful.'
Write-Host "app_url: $($response.app_url)"
