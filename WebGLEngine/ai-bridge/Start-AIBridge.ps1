# Start-AIBridge.ps1
#
# Wraps `node server.js` with a clean status UI. By default, suppresses
# 404 noise (asset-not-found requests are normal during world startup
# and aren't actionable). The spinner shows the bridge is alive and
# the last meaningful event.
#
# Usage:
#   .\Start-AIBridge.ps1                # quiet mode — spinner + key events only
#   .\Start-AIBridge.ps1 -Verbose       # full bridge output, no filtering
#   .\Start-AIBridge.ps1 -Port 8787     # override default port
#   .\Start-AIBridge.ps1 -WadFile C:\wads\freedoom1.wad
#
# Press Ctrl+C to stop the bridge. The wrapper kills the child node
# process cleanly.

[CmdletBinding()]
param(
    [switch]$Verbose,
    [int]$Port = 8787,
    [string]$WadFile = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- Lines we suppress in quiet mode -----------------------------------
# Each entry is a regex; if it matches a stderr/stdout line we either
# update the spinner status or drop the line entirely. Tuned to filter
# the high-volume but uninteresting messages while keeping useful ones.
$quietDropPatterns = @(
    '404 \(Not Found\)',                     # asset not yet on disk
    'Ollama returned no OBJ',                # graceful fallback
    'HEAD http://.*/GPU_Assets/.*\.glb',     # asset probe noise
    'HEAD http://.*/GPU_Assets/.*\.obj',
    'POST http://localhost:11434/api/generate.*404'
)
$quietHighlightPatterns = @(
    '\[wad\] loaded',
    '\[wad\] using fallback',
    '\[wad\] textures',
    '\[relay\] HTTP\+WS',
    '\[multiplayer\]',
    '\[OGRE\]',
    '\[error\]'
)

# --- Build environment for the node child ------------------------------
$env:PORT = $Port
if ($WadFile -ne "") { $env:WAD_PATH = $WadFile }

# --- Locate node + the server script -----------------------------------
$serverJs = Join-Path $scriptDir "server.js"
if (-not (Test-Path $serverJs)) {
    Write-Host "[bridge] cannot find $serverJs" -ForegroundColor Red
    exit 1
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "[bridge] node.exe not on PATH — install Node.js first" -ForegroundColor Red
    exit 1
}

# --- Banner ------------------------------------------------------------
Clear-Host
$mode = if ($Verbose) { "verbose" } else { "quiet" }
Write-Host ""
Write-Host "  AI Bridge" -ForegroundColor Cyan -NoNewline
Write-Host "  ·  " -NoNewline
Write-Host "port $Port" -ForegroundColor Yellow -NoNewline
Write-Host "  ·  " -NoNewline
Write-Host "$mode mode" -ForegroundColor DarkGray
if ($WadFile -ne "") {
    Write-Host "  WAD:  $WadFile" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "  Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

# --- Spinner state -----------------------------------------------------
$script:spinnerFrames = @('|', '/', '-', '\')
$script:spinnerIdx = 0
$script:lastStatus = "starting node..."
$script:lastStatusColor = "DarkGray"
$script:droppedCount = 0
$script:eventCount   = 0

function Write-Spinner {
    $f = $script:spinnerFrames[$script:spinnerIdx % $script:spinnerFrames.Length]
    $script:spinnerIdx++
    $pad = " " * 6
    $line = "  $f  $($script:lastStatus)$pad"
    # Truncate to console width to avoid wrap
    $w = [Console]::WindowWidth - 2
    if ($line.Length -gt $w) { $line = $line.Substring(0, $w) }
    # Carriage return back to start of line, overwrite
    [Console]::Write("`r$line")
}

function Set-Status($text, [string]$color = "Gray") {
    $script:lastStatus = $text
    $script:lastStatusColor = $color
    $script:eventCount++
}

function Test-DropLine($line) {
    foreach ($p in $quietDropPatterns) {
        if ($line -match $p) { return $true }
    }
    return $false
}

function Test-HighlightLine($line) {
    foreach ($p in $quietHighlightPatterns) {
        if ($line -match $p) { return $true }
    }
    return $false
}

# --- Start the child process -------------------------------------------
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName  = "node"
$psi.Arguments = "`"$serverJs`""
$psi.WorkingDirectory   = $scriptDir
$psi.UseShellExecute    = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError  = $true
$psi.CreateNoWindow         = $true

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi

# Pump stdout + stderr into our processor. Use BeginOutputReadLine so we
# don't block — the spinner needs to keep ticking.
$lineHandler = {
    param($sender, $eventArgs)
    if ($null -eq $eventArgs.Data) { return }
    $line = $eventArgs.Data
    if ($Verbose) {
        Write-Host ""
        Write-Host $line
        return
    }
    if (Test-DropLine $line) {
        $script:droppedCount++
        Set-Status "(filtered $script:droppedCount non-actionable lines)" "DarkGray"
        return
    }
    if (Test-HighlightLine $line) {
        # Print highlight lines in full above the spinner
        Write-Host ""
        Write-Host "  $line" -ForegroundColor Cyan
        Set-Status $line "Cyan"
    } else {
        # Brief status update only
        $short = if ($line.Length -gt 80) { $line.Substring(0,77) + "..." } else { $line }
        Set-Status $short "Gray"
    }
}

Register-ObjectEvent -InputObject $proc -EventName "OutputDataReceived" -Action $lineHandler | Out-Null
Register-ObjectEvent -InputObject $proc -EventName "ErrorDataReceived"  -Action $lineHandler | Out-Null

[void]$proc.Start()
$proc.BeginOutputReadLine()
$proc.BeginErrorReadLine()

# --- Spinner loop ------------------------------------------------------
try {
    while (-not $proc.HasExited) {
        Write-Spinner
        Start-Sleep -Milliseconds 120
    }
} finally {
    Write-Host ""
    Write-Host ""
    if (-not $proc.HasExited) {
        Write-Host "  Stopping bridge..." -ForegroundColor Yellow
        try { $proc.Kill() } catch {}
        $proc.WaitForExit(2000)
    }
    Write-Host "  Bridge exited (events=$($script:eventCount), filtered=$($script:droppedCount))" -ForegroundColor DarkGray
    Write-Host ""
}
