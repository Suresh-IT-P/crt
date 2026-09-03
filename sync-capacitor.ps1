# Sync public files to all Capacitor app www directories and run cap sync android
$ErrorActionPreference = "Continue"
$RootDir = $PSScriptRoot
$PublicDir = Join-Path $RootDir "public"
$FreshApksDir = Join-Path $RootDir "fresh-apks"

$Apps = @("customer", "driver", "vendor", "admin", "association")

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Syncing Public Assets to Capacitor Apps  " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

foreach ($app in $Apps) {
    $appDir = Join-Path $FreshApksDir $app
    $wwwDir = Join-Path $appDir "www"

    if (Test-Path $appDir) {
        Write-Host "`n---> Syncing [$app] app in: $appDir" -ForegroundColor Yellow

        if (-not (Test-Path $wwwDir)) {
            New-Item -ItemType Directory -Force -Path $wwwDir | Out-Null
        }

        # Copy web assets
        Write-Host "     Copying public/ assets to $wwwDir..." -NoNewline
        Copy-Item -Path "$PublicDir\*" -Destination $wwwDir -Recurse -Force
        Write-Host " Done." -ForegroundColor Green

        # Run npx cap sync android inside app folder if android platform exists
        $androidDir = Join-Path $appDir "android"
        if (Test-Path $androidDir) {
            Write-Host "     Running npx cap sync android..." -NoNewline
            Push-Location $appDir
            try {
                npx cap sync android
                Write-Host " Done." -ForegroundColor Green
            } catch {
                Write-Host " Warning: cap sync encountered an issue: $_" -ForegroundColor Red
            }
            Pop-Location
        } else {
            Write-Host "     (Note: android folder not added yet in $appDir. Run npx cap add android if needed.)" -ForegroundColor Gray
        }
    } else {
        Write-Host "Skip: $appDir does not exist." -ForegroundColor Gray
    }
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host " Capacitor Sync Completed Successfully!  " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
