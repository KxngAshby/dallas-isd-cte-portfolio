$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
  Write-Host "Pushing latest code to DEV (/dev)..." -ForegroundColor Cyan
  clasp push --force
  Write-Host "Done. Open your /dev link and hard-refresh (Ctrl+Shift+R) to test." -ForegroundColor Green
  Write-Host "Dev uses the DEV spreadsheet, so test data never touches live." -ForegroundColor Green
}
finally {
  Pop-Location
}
