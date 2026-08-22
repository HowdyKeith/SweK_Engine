# FILE: ha/install.ps1
# Drops the HA iframe panel into a Home Assistant instance over Samba
# and (safely) registers it in configuration.yaml.
#
# Usage examples (PowerShell on Windows):
#
#   # Defaults: \\homeassistant\config, bridge at localhost:8787
#   ./install.ps1
#
#   # Custom host or share name
#   ./install.ps1 -HostName "homeassistant.local" -ShareName "config"
#
#   # Bridge running on a different machine on the LAN
#   ./install.ps1 -BridgeUrl "http://192.168.11.42:8787"
#
# Requires: HA Samba share add-on enabled and reachable. (Settings >
# Add-ons > Samba share > Start.) No HA API token needed.

param(
    [string]$HostName    = "homeassistant",
    [string]$ShareName   = "config",
    [string]$PanelFolder = "vba-gl-panel",
    [string]$BridgeUrl   = "http://localhost:8787"
)

$ErrorActionPreference = "Stop"

# ----------------------------------------------------------------
# 1. Verify Samba share is reachable
# ----------------------------------------------------------------
$shareUNC = "\\$HostName\$ShareName"
Write-Host ""
Write-Host "[1/4] Checking Samba share: $shareUNC" -ForegroundColor Cyan

if (-not (Test-Path $shareUNC)) {
    Write-Host ""
    Write-Host "ERROR: Cannot reach $shareUNC." -ForegroundColor Red
    Write-Host "  - Is HA running?"
    Write-Host "  - Is the Samba share add-on enabled? (Settings > Add-ons > Samba share > Start)"
    Write-Host "  - Are you on the same network?"
    Write-Host "  - Try -HostName <ip>  or  -HostName homeassistant.local"
    exit 1
}
Write-Host "  reachable" -ForegroundColor Green

# ----------------------------------------------------------------
# 2. Stage panel.html into config/www/<PanelFolder>/
# ----------------------------------------------------------------
$panelDest = Join-Path $shareUNC "www\$PanelFolder"
Write-Host ""
Write-Host "[2/4] Staging panel files: $panelDest" -ForegroundColor Cyan

if (-not (Test-Path $panelDest)) {
    New-Item -ItemType Directory -Path $panelDest -Force | Out-Null
    Write-Host "  created folder" -ForegroundColor Green
} else {
    Write-Host "  folder exists, overwriting panel.html" -ForegroundColor Yellow
}

$srcPanel = Join-Path $PSScriptRoot "panel.html"
if (-not (Test-Path $srcPanel)) {
    Write-Host "ERROR: panel.html not found next to install.ps1 at $srcPanel" -ForegroundColor Red
    exit 1
}

# Read template, substitute the bridge URL placeholder, write to share.
# Two replacements: the iframe src AND the visible status text both
# point at the bridge URL.
$content = Get-Content $srcPanel -Raw
$content = $content.Replace("BRIDGE_URL_PLACEHOLDER", $BridgeUrl)
$content | Set-Content -Path (Join-Path $panelDest "panel.html") -Encoding UTF8 -NoNewline

Write-Host "  panel.html staged (bridge URL: $BridgeUrl)" -ForegroundColor Green

# ----------------------------------------------------------------
# 3. Register panel in configuration.yaml — SAFELY
# ----------------------------------------------------------------
# Logic:
#   - If vba_gl: already registered under panel_iframe: -> skip
#   - If panel_iframe: exists without vba_gl: -> print the snippet,
#     instruct user to add it manually (we don't try to splice into
#     existing YAML in case there are comments / unusual indent).
#   - If no panel_iframe: at all -> append a fresh block.
$configPath = Join-Path $shareUNC "configuration.yaml"
Write-Host ""
Write-Host "[3/4] Updating configuration.yaml" -ForegroundColor Cyan

if (-not (Test-Path $configPath)) {
    Write-Host "  configuration.yaml not found at $configPath" -ForegroundColor Red
    Write-Host "  Skipping config patch — you'll need to register the panel manually." -ForegroundColor Yellow
    $skippedConfig = $true
} else {
    $config = Get-Content $configPath -Raw

    $newBlock = @"

# vba-gl-panel — registered by install.ps1 from VoxelEngine bundle
panel_iframe:
  vba_gl:
    title: 'Engine Console'
    icon: mdi:gamepad-variant
    url: '/local/$PanelFolder/panel.html'
    require_admin: false
"@

    $snippetOnly = @"

  vba_gl:
    title: 'Engine Console'
    icon: mdi:gamepad-variant
    url: '/local/$PanelFolder/panel.html'
    require_admin: false
"@

    if ($config -match "(?ms)panel_iframe\s*:[^\S\r\n]*\r?\n(?:[ \t]+\S.*\r?\n)*[ \t]+vba_gl\s*:") {
        Write-Host "  panel_iframe.vba_gl already registered — skipping" -ForegroundColor Yellow
        $skippedConfig = $true
    }
    elseif ($config -match "(?m)^panel_iframe\s*:") {
        Write-Host ""
        Write-Host "  An existing panel_iframe: block was found." -ForegroundColor Yellow
        Write-Host "  install.ps1 will NOT auto-patch this — you might have other panels" -ForegroundColor Yellow
        Write-Host "  registered there. Add the following lines under your existing" -ForegroundColor Yellow
        Write-Host "  panel_iframe: block (same indent as your other panels):" -ForegroundColor Yellow
        Write-Host ""
        Write-Host $snippetOnly -ForegroundColor Cyan
        $skippedConfig = $true
    }
    else {
        Add-Content -Path $configPath -Value $newBlock -Encoding UTF8
        Write-Host "  appended panel_iframe block" -ForegroundColor Green
        $skippedConfig = $false
    }
}

# ----------------------------------------------------------------
# 4. Restart instructions
# ----------------------------------------------------------------
Write-Host ""
Write-Host "[4/4] Done." -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Make sure the Node bridge is running on the machine the panel" -ForegroundColor White
Write-Host "     URL points at:    $BridgeUrl" -ForegroundColor Gray
Write-Host "     (cd into VoxelEngine/, run:  node ai-bridge/server.js)" -ForegroundColor Gray
if ($skippedConfig) {
    Write-Host "  2. Edit configuration.yaml to register the panel (see snippet above)" -ForegroundColor White
    Write-Host "  3. Restart Home Assistant: Settings > System > Restart" -ForegroundColor White
} else {
    Write-Host "  2. Restart Home Assistant: Settings > System > Restart" -ForegroundColor White
}
Write-Host "  $(if ($skippedConfig) {'4'} else {'3'}). 'Engine Console' appears in the HA sidebar." -ForegroundColor White
Write-Host ""
