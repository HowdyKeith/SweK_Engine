#!/usr/bin/env pwsh
# ---------------------------------------------------------------------------
# deno-install.ps1 - vendored, no-admin Deno installer for the SweK Engine.
#
# Mirrors installers/node-install.ps1: downloads the OFFICIAL Deno Windows
# build from GitHub releases, extracts deno.exe to %USERPROFILE%\.deno\bin,
# and adds that folder to the user PATH. No admin rights, nothing system-wide.
# The launcher must ALSO prepend %USERPROFILE%\.deno\bin to its own session
# PATH after calling this (env-var writes don't reach a running cmd session).
#
# Why not `irm https://deno.land/install.ps1 | iex`? That works too, but this
# keeps the same vendored/pinnable pattern as node-install.ps1 and avoids
# executing a remote script. Why not winget? It can stall on first-use source
# agreement prompts and is absent on LTSC/Server images -- bad for unattended.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File deno-install.ps1
#   ...        -File deno-install.ps1 -Version v2.3.1     (pin a release tag)
# Default -Version "latest" uses GitHub's /releases/latest redirect (no API,
# no rate limit, no token needed).
#
# LAN-only machines: this needs github.com once. On an offline peer, copy
# %USERPROFILE%\.deno from a machine that has it -- deno.exe is standalone.
# ---------------------------------------------------------------------------
param(
    [String]$Version = "latest"
)
$ErrorActionPreference = "Stop"

# --- real CPU arch (registry is reliable even under x64 emulation on ARM64) ---
$archRaw = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment').PROCESSOR_ARCHITECTURE
switch ($archRaw) {
    "AMD64" { $triple = "x86_64-pc-windows-msvc" }
    "ARM64" { $triple = "aarch64-pc-windows-msvc" }
    default { Write-Output "Deno install: unsupported architecture '$archRaw' (need AMD64 or ARM64)."; exit 1 }
}

$pkg = "deno-$triple.zip"
if ($Version -eq "latest") {
    $url = "https://github.com/denoland/deno/releases/latest/download/$pkg"
} else {
    $url = "https://github.com/denoland/deno/releases/download/$Version/$pkg"
}
Write-Output "Installing Deno ($Version, $triple)"
Write-Output "  from $url"

# --- download + extract to a temp dir --------------------------------------
$tmp = Join-Path $env:TEMP ("deno-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$zip = Join-Path $tmp $pkg
try {
    # TLS1.2 for Windows PowerShell 5.1 boxes that still default lower
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip
} catch {
    Write-Output "Deno install: download failed - $($_.Exception.Message)"
    Write-Output "  (offline/LAN-only box? copy %USERPROFILE%\.deno from a peer instead)"
    exit 1
}
Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force

$exe = Join-Path $tmp "deno.exe"
if (-not (Test-Path $exe)) { Write-Output "Deno install: deno.exe missing from the archive."; exit 1 }

# --- land it in %USERPROFILE%\.deno\bin -------------------------------------
$binDir = Join-Path $env:USERPROFILE ".deno\bin"
New-Item -ItemType Directory -Path $binDir -Force | Out-Null
Copy-Item -LiteralPath $exe -Destination (Join-Path $binDir "deno.exe") -Force
Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue

# --- user PATH (persistent, future sessions; launcher handles THIS session) --
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $userPath) { $userPath = "" }
if (($userPath -split ';') -notcontains $binDir) {
    [Environment]::SetEnvironmentVariable("Path", ($binDir + ";" + $userPath).TrimEnd(';'), "User")
    Write-Output "  added $binDir to user PATH"
}

$v = & (Join-Path $binDir "deno.exe") --version 2>$null | Select-Object -First 1
Write-Output "  installed: $v"
Write-Output "Deno install complete."
exit 0
