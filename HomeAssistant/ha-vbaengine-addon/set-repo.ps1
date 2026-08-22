# set-repo.ps1 — point this add-on repository at YOUR GitHub before publishing.
#
# Replaces the YOURNAME placeholder (and, if you renamed it, the repo name) across
# repository.yaml, README.md (the install badge), vbaengine_panel/config.yaml, and
# the VBA installer module if it's in the usual spot. Then follow PUBLISHING.md.
#
#   .\set-repo.ps1 -User yourname
#   .\set-repo.ps1 -User yourname -Repo my-engine-addon
param(
  [Parameter(Mandatory = $true)][string]$User,
  [string]$Repo = "ha-vbaengine-addon"
)

$root = $PSScriptRoot
$targets = @(
  (Join-Path $root "repository.yaml"),
  (Join-Path $root "README.md"),
  (Join-Path $root "vbaengine_panel\config.yaml")
)
# also fix the VBA installer module if it lives one level up (the delivery layout)
$mod = Join-Path $root "..\modHAInstall.bas"
if (Test-Path $mod) { $targets += $mod }

foreach ($f in $targets) {
  if (Test-Path $f) {
    $text = (Get-Content -Raw $f) -replace 'YOURNAME', $User
    if ($Repo -ne 'ha-vbaengine-addon') { $text = $text -replace 'ha-vbaengine-addon', $Repo }
    Set-Content -NoNewline -Path $f -Value $text
    Write-Host "  updated $($f)"
  }
}

Write-Host ""
Write-Host "Stamped repo: https://github.com/$User/$Repo" -ForegroundColor Green
Write-Host "Now push it (from this folder):"
Write-Host "  git init; git add .; git commit -m 'VBA Engine Panel add-on'; git branch -M main"
Write-Host "  git remote add origin https://github.com/$User/$Repo.git"
Write-Host "  git push -u origin main"
Write-Host ""
Write-Host "Then the install badge in README.md becomes a working one-click button." -ForegroundColor Cyan
