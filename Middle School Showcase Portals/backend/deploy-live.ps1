param([string]$Description = "Live update $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
$ErrorActionPreference = "Stop"

# The fixed LIVE deployment. Republishing this ID keeps the public /exec URL stable.
$LIVE = "YOUR_LIVE_DEPLOYMENT_ID"
$file = Join-Path $PSScriptRoot "Code.gs"

function Set-IsLive([string]$value) {
  # Read/write without BOM so the .gs file stays clean.
  $content = [System.IO.File]::ReadAllText($file)
  $content = [regex]::Replace($content, 'const IS_LIVE = (true|false);', "const IS_LIVE = $value;")
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($file, $content, $utf8NoBom)
}

Push-Location $PSScriptRoot
try {
  Write-Host "1/3 Switching source to LIVE (IS_LIVE = true)..." -ForegroundColor Cyan
  Set-IsLive 'true'

  Write-Host "2/3 Pushing code..." -ForegroundColor Cyan
  clasp push --force

  Write-Host "3/3 Publishing new version to the LIVE deployment..." -ForegroundColor Cyan
  clasp deploy --deploymentId $LIVE --description $Description
}
finally {
  # Always revert so day-to-day dev (HEAD) keeps using the DEV spreadsheet.
  Write-Host "Reverting source to DEV (IS_LIVE = false)..." -ForegroundColor Cyan
  Set-IsLive 'false'
  clasp push --force
  Pop-Location
  Write-Host "Done. LIVE is updated and source is back in DEV mode." -ForegroundColor Green
  Write-Host "Hard-refresh the live site (Ctrl+Shift+R) and check the LIVE stamp in the Admin Hub." -ForegroundColor Green
}

