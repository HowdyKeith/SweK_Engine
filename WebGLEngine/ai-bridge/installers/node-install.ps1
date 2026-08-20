#!/usr/bin/env pwsh
# ---------------------------------------------------------------------------
# node-install.ps1 - vendored, no-admin Node.js installer for the SweK Engine.
#
# Mirrors installers/bun-install.ps1: downloads the OFFICIAL Node.js Windows
# build from https://nodejs.org/dist, extracts it to %USERPROFILE%\.node so
# node.exe + npm sit directly in that folder, and adds it to the user PATH.
# No admin rights, no MSI, nothing system-wide.
#   Docs: https://docs.npmjs.com/downloading-and-installing-node-js-and-npm
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File node-install.ps1
#   ...        -File node-install.ps1 -Version v22.11.0     (pin a version)
#   ...        -File node-install.ps1 -Version latest       (newest, incl. odd)
# Default -Version "lts" installs the newest Long-Term-Support line.
# ---------------------------------------------------------------------------
param(
  [String]$Version = "lts"
)
$ErrorActionPreference = "Stop"

# --- real CPU arch (registry is reliable even under x64 emulation on ARM64) ---
$archRaw = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment').PROCESSOR_ARCHITECTURE
switch ($archRaw) {
  "AMD64" { $arch = "x64" }
  "ARM64" { $arch = "arm64" }
  default { Write-Output "Node install: unsupported architecture '$archRaw' (need AMD64 or ARM64)."; return 1 }
}

# --- resolve the version string (lts / latest / explicit vX.Y.Z) ------------
function Resolve-NodeVersion($v) {
  if ($v -match '^v\d') { return $v }
  try {
    $idx = Invoke-RestMethod -UseBasicParsing -Uri "https://nodejs.org/dist/index.json"
    if ($v -eq "latest") { return $idx[0].version }   # array is newest-first
    foreach ($e in $idx) { if ($e.lts) { return $e.version } }   # first LTS = newest LTS
    return $idx[0].version
  } catch {
    Write-Warning "Could not reach nodejs.org to resolve a version; using a pinned LTS."
    return "v22.11.0"
  }
}
$ver = Resolve-NodeVersion $Version
$pkg = "node-$ver-win-$arch"
$url = "https://nodejs.org/dist/$ver/$pkg.zip"
Write-Output "Installing Node $ver ($arch)"
Write-Output "  from $url"

# --- download + extract to a temp dir --------------------------------------
$tmp = Join-Path $env:TEMP ("node-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zip = Join-Path $tmp "$pkg.zip"
try {
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip
} catch {
  Write-Output "Node download failed: $($_.Exception.Message)"
  try { Remove-Item -Recurse -Force $tmp } catch {}
  return 1
}
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$inner = Join-Path $tmp $pkg
if (-not (Test-Path (Join-Path $inner "node.exe"))) {
  Write-Output "Node install failed: node.exe not found inside the downloaded zip."
  try { Remove-Item -Recurse -Force $tmp } catch {}
  return 1
}

# --- place into %USERPROFILE%\.node (node.exe ends up directly in it) -------
$dest = Join-Path $env:USERPROFILE ".node"
if (Test-Path $dest) { try { Remove-Item -Recurse -Force $dest } catch {} }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Path (Join-Path $inner '*') -Destination $dest -Recurse -Force
try { Remove-Item -Recurse -Force $tmp } catch {}

# --- add to user PATH for FUTURE sessions (idempotent) ----------------------
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $userPath) { $userPath = "" }
$already = $false
foreach ($p in ($userPath -split ';')) { if ($p -and ($p.TrimEnd('\') -ieq $dest.TrimEnd('\'))) { $already = $true } }
if (-not $already) {
  $newPath = if ($userPath.Length -gt 0) { "$dest;$userPath" } else { $dest }
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
}
# ...and for THIS session, so an immediately-following `node` works.
$env:Path = "$dest;$env:Path"

# --- verify -----------------------------------------------------------------
$nodeExe = Join-Path $dest "node.exe"
if (Test-Path $nodeExe) {
  try { $nv = (& $nodeExe --version) } catch { $nv = "?" }
  Write-Output "Node installed: $nv  ->  $dest"
  Write-Output "NODE_INSTALL=$dest"
  return 0
}
Write-Output "Node install failed: node.exe missing after copy."
return 1
