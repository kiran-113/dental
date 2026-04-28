# Save this as build-healthcare.ps1 in D:\Helath_Care_project
$AppName = "HealthCareApp.exe"

Write-Host "--- Packaging Health Care Project ---" -ForegroundColor Cyan

# 1. Install pkg locally if not present
if (!(Test-Path "node_modules\pkg")) {
    Write-Host "[*] Installing pkg utility..." -ForegroundColor Yellow
    npm install pkg --save-dev
}

# 2. Update package.json settings for the build
# This tells pkg to include your frontend files and .env inside the EXE
$packageJson = Get-Content "package.json" | ConvertFrom-Json
$packageJson | Add-Member -NotePropertyName "bin" -NotePropertyValue "server.js" -Force
$pkgConfig = @{
    assets = @("index.html", "styles.css", "script.js", ".env")
}
$packageJson | Add-Member -NotePropertyName "pkg" -NotePropertyValue $pkgConfig -Force
$packageJson | ConvertTo-Json -Depth 10 | Out-File "package.json" -Encoding utf8

# 3. Run the Build
Write-Host "[*] Compiling into a single EXE..." -ForegroundColor Green
npx pkg . --targets node20-win-x64 --output $AppName

# 4. Final Verification
if (Test-Path $AppName) {
    Write-Host "`n[SUCCESS] Build Complete: $AppName" -ForegroundColor Green
    Write-Host "You can now move this EXE anywhere and run it!"
} else {
    Write-Host "`n[ERROR] Build Failed. Please check the output above for details." -ForegroundColor Red
}