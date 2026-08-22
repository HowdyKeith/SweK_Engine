# =====================================================================
# Test-KPopShim.ps1
# =====================================================================
# Validates that KPopShim.psm1 loads and exposes the four functions
# the v26 main listener expects. Use this to sanity-check the shim
# before launching the full listener.
#
# Usage:
#     pwsh -NoProfile -ExecutionPolicy Bypass -File Test-KPopShim.ps1
# (or "powershell" on PS 5.1)
# =====================================================================

$ErrorActionPreference = "Stop"

Write-Host "=== KPopShim smoke test ===" -ForegroundColor Cyan

# Set up the globals the shim expects to read/write
$global:Stats = @{
    StartTime      = Get-Date
    TotalToasts    = 0
    PipeToasts     = 0
    FileToasts     = 0
    Failures       = 0
    LastToastTitle = "None"
    LastToastTime  = $null
}
$global:MessageQueue = [System.Collections.Concurrent.ConcurrentQueue[object]]::new()
$global:IsRunning = $true
$global:BurntToastAvailable = $false   # don't actually fire toasts during test
$global:WinRTAvailable      = $false   # fall through to console-only emit

# Load the shim
$shim = Join-Path $PSScriptRoot "KPopShim.psm1"
if (-not (Test-Path $shim)) {
    Write-Host "FAIL: KPopShim.psm1 not found at $shim" -ForegroundColor Red
    exit 1
}
Import-Module $shim -Force
Write-Host "PASS: Shim imported" -ForegroundColor Green

# Check all four expected functions exist
$expected = "Start-PipeListener", "Start-PipeListenerAsync", "Start-FileWatcher", "Process-Message"
$missing  = @()
foreach ($f in $expected) {
    if (-not (Get-Command $f -ErrorAction SilentlyContinue)) {
        $missing += $f
    }
}
if ($missing.Count -gt 0) {
    Write-Host "FAIL: missing functions: $($missing -join ', ')" -ForegroundColor Red
    exit 1
}
Write-Host "PASS: All 4 expected functions present" -ForegroundColor Green

# Process-Message with a synthetic payload
Process-Message -msg (@{
    Title     = "Shim test"
    Message   = "If you see this in console output, the shim is working"
    ToastType = "Success"
    Progress  = 42
} | ConvertTo-Json)

if ($global:Stats.TotalToasts -ge 1) {
    Write-Host "PASS: Process-Message incremented stats (TotalToasts = $($global:Stats.TotalToasts))" -ForegroundColor Green
} else {
    Write-Host "FAIL: Stats unchanged after Process-Message" -ForegroundColor Red
    exit 1
}

# Process-Message with a STOP command
$global:IsRunning = $true
Process-Message -msg '{"Command":"STOP"}'
if ($global:IsRunning -eq $false) {
    Write-Host "PASS: STOP command toggled IsRunning to false" -ForegroundColor Green
} else {
    Write-Host "FAIL: STOP command didn't toggle IsRunning" -ForegroundColor Red
    exit 1
}

# Pipe listener smoke — start it, write to the alias pipe, dequeue, verify
$global:IsRunning = $true
$pipeName = "KPopListenerPipe_TESTSHIM"   # primary
$h = Start-PipeListener -PipeName $pipeName -UseRawStream $true
Start-Sleep -Milliseconds 600   # let runspace come up

# Drop a message via the stable alias name (what the engine bridge uses)
$test = '{"Title":"Pipe test","Message":"via alias","ToastType":"Info"}'
try {
    $client = New-Object System.IO.Pipes.NamedPipeClientStream ".", "KPopListenerPipe", "Out"
    $client.Connect(2000)
    $w = New-Object System.IO.StreamWriter $client
    $w.Write($test)
    $w.Flush()
    $w.Close()
    $client.Dispose()
    Write-Host "PASS: Wrote to alias pipe successfully" -ForegroundColor Green
} catch {
    Write-Host "INFO: Alias pipe not reachable (needs Start-ThreadJob, PS 7+ recommended): $_" -ForegroundColor Yellow
    Write-Host "      Engine bridge users on PS 5.1 must point bridge to the PID-suffixed name" -ForegroundColor Yellow
}

# Wait for the queue to receive it
$start = Get-Date
$received = $null
while (((Get-Date) - $start).TotalSeconds -lt 3) {
    if ($global:MessageQueue.TryDequeue([ref]$received)) { break }
    Start-Sleep -Milliseconds 100
}

if ($received) {
    Write-Host "PASS: Message arrived in queue: $($received.Substring(0, [Math]::Min(60, $received.Length)))..." -ForegroundColor Green
    Process-Message -msg $received
    Write-Host "PASS: Process-Message handled the dequeued payload (TotalToasts = $($global:Stats.TotalToasts))" -ForegroundColor Green
} else {
    Write-Host "WARN: No message received in 3s — alias pipe likely not bound (PS 5.1 + no ThreadJob)" -ForegroundColor Yellow
}

# Cleanup
Stop-PipeListener
Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "Stats: $($global:Stats | ConvertTo-Json -Compress)" -ForegroundColor Gray
