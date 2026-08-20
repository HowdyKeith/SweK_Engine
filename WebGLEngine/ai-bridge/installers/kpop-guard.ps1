#!/usr/bin/env pwsh
# ---------------------------------------------------------------------------
# kpop-guard.ps1 - KPop Listener same-version guard + bundled->sibling sync.
# Called by START_NODE_Engine.bat / START_BUN_Full.bat BEFORE the listener
# launch line, with the engine project root as the working directory.
#
# Does, in order:
#   1. SYNC   - the engine zip's bundled "KPop Listener\" is the update payload.
#               If its $ScriptVersion differs from the stable sibling copy at
#               "..\KPop Listener\", stop any running listener and robocopy
#               bundled -> sibling. The launcher then runs the SIBLING copy, so
#               the listener process never pins an EngineProject_vNNN folder.
#   2. DECIDE - if a listener is heartbeating AND its published version matches
#               the version we are about to launch: exit 42 ("skip relaunch").
#               If a listener is alive at a different/unknown version: stop it,
#               exit 0 ("launch the new one"). Otherwise just exit 0.
#
# Exit codes:  42 = same-version listener already running, skip the launch
#               0 = proceed with the launch (any needed stop/sync already done)
#
# Plumbing it relies on (all in $env:TEMP\KPopListener):
#   Listener_Alive.txt   - heartbeat, touched every 5s by KPopShim's sentinel
#   Listener_Version.txt - $ScriptVersion, written at startup   (v26.1+)
#   KPopListener.pid     - the listener's $PID, written at startup (v26.1+)
#   KPopControl.txt      - control file; the main loop honors 'exit'
#
# Backward compat: a pre-v26.1 listener never writes the pid/version files and
# its sentinel timer keeps zombie-touching the heartbeat under -NoExit even
# after a control-file 'exit'. For that one-time migration case we fall back
# to killing by the console title the launcher set ("KPop Listener"), filtered
# to powershell.exe so nothing else is touched.
# ---------------------------------------------------------------------------
param(
    [string]$BundledDir = "KPop Listener",
    [string]$SiblingDir = "..\KPop Listener",
    [string]$LegacyDir  = "KPopupListener"
)
$ErrorActionPreference = 'SilentlyContinue'

# $ScriptVersion = "26.0 PA8"  <- the line we parse; \x22 avoids quote-escaping pain
$rx = '\$ScriptVersion\s*=\s*[\x22]([^\x22]+)[\x22]'
function Get-ListenerVersion([string]$dir) {
    $p = Join-Path $dir 'KPopListener.ps1'
    if (-not (Test-Path -LiteralPath $p)) { return '' }
    try {
        $m = Select-String -LiteralPath $p -Pattern $rx | Select-Object -First 1
        if ($m) { return $m.Matches[0].Groups[1].Value.Trim() }
    } catch {}
    return ''
}

$td        = Join-Path $env:TEMP 'KPopListener'
$aliveFile = Join-Path $td 'Listener_Alive.txt'
$verFile   = Join-Path $td 'Listener_Version.txt'
$pidFile   = Join-Path $td 'KPopListener.pid'
$ctlFile   = Join-Path $td 'KPopControl.txt'

function Test-ListenerAlive {
    if (-not (Test-Path $aliveFile)) { return $false }
    # sentinel touches every 5s; 12s of silence = dead (matches /kpop/status's spirit)
    try { return (((Get-Date) - (Get-Item $aliveFile).LastWriteTime).TotalSeconds -lt 12) } catch { return $false }
}

function Stop-Listener {
    # Capture the PID BEFORE asking it to exit -- the v26.1 listener deletes its
    # pid file during cleanup, and we still need the pid afterward: the -NoExit
    # host outlives the script and pins its cwd (blocks old-folder pruning).
    $lpid = 0
    try { if (Test-Path $pidFile) { $lpid = [int]((Get-Content $pidFile -Raw).Trim()) } } catch {}

    try { Set-Content -Path $ctlFile -Value 'exit' -Encoding ASCII -Force } catch {}
    # main loop polls the control file every ~200ms; give cleanup up to 8s
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 400
        if (-not (Test-ListenerAlive)) { break }
    }

    if ($lpid -gt 0) {
        # finish off the lingering -NoExit host -- but only if that pid is
        # actually a PowerShell process (guards against pid reuse).
        try {
            $p = Get-Process -Id $lpid
            if ($p -and $p.ProcessName -match '^(powershell|pwsh)$') { Stop-Process -Id $lpid -Force }
        } catch {}
    } elseif (Test-ListenerAlive) {
        # legacy listener: no pid file, zombie sentinel still heartbeating.
        # Fall back to the console title set by the launcher's `start "KPop Listener"`.
        try { taskkill /F /FI "WINDOWTITLE eq KPop Listener*" /IM powershell.exe 2>$null | Out-Null } catch {}
        try { taskkill /F /FI "WINDOWTITLE eq KPop Listener*" /IM pwsh.exe       2>$null | Out-Null } catch {}
    }

    # clear the markers ourselves so /kpop/status and re-entry see the truth
    try { Remove-Item $aliveFile -Force } catch {}
    try { Remove-Item $verFile   -Force } catch {}
    try { Remove-Item $pidFile   -Force } catch {}
}

$vBundled = Get-ListenerVersion $BundledDir
$vSibling = Get-ListenerVersion $SiblingDir

# ---- 1. SYNC: bundled copy is authoritative when it differs from the sibling
# v2194 — sync on CONTENT DRIFT too, not only on a $ScriptVersion change. The version string sat
# at "26.0 PA8" across many engine releases while the bundled MODULES kept evolving, so the sibling
# accumulated a version-skewed mix (new KPopListener.ps1 expectations, old .psm1 implementations) —
# a classic silent-crash-at-startup recipe that the old gate could never repair. robocopy /L /FFT
# is a dry-run: exit bit 1 means real file differences exist (FFT = 2s FAT-time tolerance, so zip
# timestamp granularity doesn't false-positive every boot).
$syncReason = ''
if ($vBundled -and ($vBundled -ne $vSibling)) { $syncReason = "version '$vSibling' -> '$vBundled'" }
elseif ($vBundled -and $vSibling -and (Test-Path -LiteralPath $SiblingDir)) {
    robocopy $BundledDir $SiblingDir /E /L /FFT /NFL /NDL /NJH /NJS /NC /NS | Out-Null
    if ($LASTEXITCODE -band 1) { $syncReason = "content drift at same version '$vBundled'" }
}
if ($syncReason) {
    Write-Output "kpop-guard: syncing listener bundled -> sibling ($syncReason)"
    if (Test-ListenerAlive) { Stop-Listener }
     robocopy $BundledDir $SiblingDir /E /FFT /NFL /NDL /NJH /NJS /NC /NS /MT:8 | Out-Null
    if ($LASTEXITCODE -ge 8) {
        # robocopy 0-7 = success flavors; >=8 = real failure. Leave the sibling
        # alone and let the launcher fall back to running the bundled copy.
        Write-Output "kpop-guard: robocopy failed (code $LASTEXITCODE) -- launcher will use the bundled copy"
    } else {
        $vSibling = Get-ListenerVersion $SiblingDir
    }
}

# ---- 2. DECIDE: same-version skip, or stop-and-replace
$vTarget = if ($vSibling) { $vSibling } elseif ($vBundled) { $vBundled } else { Get-ListenerVersion $LegacyDir }

if (Test-ListenerAlive) {
    $vRunning = ''
    try { if (Test-Path $verFile) { $vRunning = ((Get-Content $verFile -Raw).Trim()) } } catch {}
    if ($vTarget -and ($vRunning -eq $vTarget)) {
        Write-Output "kpop-guard: listener v$vRunning already alive -- skipping relaunch"
        exit 42
    }
    Write-Output "kpop-guard: replacing running listener (running='$vRunning', target='$vTarget')"
    Stop-Listener
}
exit 0
