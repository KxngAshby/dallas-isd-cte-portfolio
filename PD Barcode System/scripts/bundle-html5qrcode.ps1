# Downloads the html5-qrcode minified library and wraps it in <script> tags
# so Apps Script can serve it via HtmlService.createHtmlOutputFromFile.
#
# Run once after a fresh checkout (or whenever bumping the library version)
# to regenerate html5qrcode.html. The .min.js file is intentionally excluded
# by .claspignore so only the bundled .html ends up in the deployment.

$ErrorActionPreference = 'Stop'

$lib = 'html5-qrcode.min.js'
$out = 'html5qrcode.html'
$url = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'

Write-Output "Downloading $url ..."
Invoke-WebRequest -Uri $url -OutFile $lib -UseBasicParsing

$content = Get-Content -Path $lib -Raw
$wrapped = "<script>`n" + $content + "`n</script>"
[System.IO.File]::WriteAllText((Resolve-Path '.').Path + '\' + $out, $wrapped)

Write-Output ("Wrote {0} ({1:N0} bytes)" -f $out, (Get-Item $out).Length)
