# WebGLEngine/tools/ship/swek_kpop_tab.ps1 -- v3623
#
# THE KPOP LISTENER'S LAUNCH WRAPPER, EXTRACTED FROM A .bat ONE-LINER FOR ONE MEASURABLE REASON:
# Windows Terminal treats ";" AS A SUBCOMMAND SEPARATOR. The inline version of this carried five of them
# (the poll loop, Start-Sleep, the two Write-Host calls), so handing it to `wt` unescaped would SLICE ONE
# COMMAND INTO SEVERAL MALFORMED TABS. Escaping is not the fix -- the string also nests single and double
# quotes -- so the command becomes ONE TOKEN by living in a file.
#
# The behaviour is UNCHANGED from the v2194 inline form: wait for the bridge's /health (up to 120s), run the
# listener, then explain in yellow if the script returns while the host survives.
$ErrorActionPreference = 'SilentlyContinue'
for ($i = 0; $i -lt 240; $i++) {
    try {
        $r = Invoke-WebRequest 'http://127.0.0.1:8787/health' -TimeoutSec 2 -UseBasicParsing
        if ($r.StatusCode -eq 200) { break }
    } catch { }
    Start-Sleep -Milliseconds 500
}
# v3665 -- THE BANNER USED TO SAY THE SAME THING WHATEVER HAPPENED, AND IT SAID IT IN ALARM YELLOW.
# On every ordinary relaunch Keith saw "listener script ENDED ... If unexpected, check <crash file>" followed by
# "process exited with code 0xffffffff", and had to ask whether something had been killed. NOTHING HAD: the
# listener had exited CLEANLY on the launcher's control-file request, and the -1 belonged to the empty -NoExit
# HOST that kpop-guard then finishes off. TWO INNOCENT FACTS READING AS A CRASH, because the only line printed
# could not tell the cases apart. A banner that cries wolf on the normal path trains you to ignore it on the
# real one.
#
# *** THE DISCRIMINATOR IS THE CRASH FILE'S FRESHNESS, AND THE TWO OBVIOUS ALTERNATIVES BOTH FAIL HERE:
#   $LASTEXITCODE  IS NOT SET BY A SCRIPT THAT FALLS OFF ITS OWN END. `& .\script.ps1` only sets it when the
#                  script calls `exit N`, so it can be $null -- or worse, STALE FROM AN EARLIER COMMAND. It is
#                  consulted, but only as corroboration and never on its own.
#   KPopControl.txt CANNOT BE READ AFTER THE FACT. The listener CONSUMES it -- Remove-Item immediately after
#                  acting on it (KPopListener.ps1 line 623) -- so "was it asked to exit" is unanswerable by the
#                  time this line runs. Checking it would have looked right and been a coin flip.
# The crash file is written BY the listener AS it dies, so a write newer than this run's start means THIS run
# crashed. The timestamp is taken BEFORE the call, because one taken after cannot bound anything. ***
$kpStart = Get-Date
& '.\KPopListener.ps1'
$kpRc = $LASTEXITCODE
$kpCrash = Join-Path $env:TEMP 'KPopLogs\KPop_last_crash.txt'
$kpFresh = $false
try { if (Test-Path $kpCrash) { $kpFresh = ((Get-Item $kpCrash).LastWriteTime -gt $kpStart) } } catch { }
Write-Host ''
if ($kpFresh) {
    Write-Host '[KPop] listener ENDED UNEXPECTEDLY -- a crash report was written by THIS run.' -ForegroundColor Red
    Write-Host ('       ' + $kpCrash) -ForegroundColor Red
    Write-Host '       or open http://localhost:8787/kpop/crash' -ForegroundColor Red
} elseif ($null -ne $kpRc -and $kpRc -ne 0) {
    Write-Host ('[KPop] listener ended with exit code ' + $kpRc + ' and NO crash report from this run.') -ForegroundColor Yellow
    Write-Host '       Probably a controlled stop; check http://localhost:8787/kpop/crash if that surprises you.' -ForegroundColor Yellow
} else {
    Write-Host '[KPop] listener ended cleanly. This is what a relaunch looks like -- nothing crashed.' -ForegroundColor DarkGray
    Write-Host '       The window stays open because of -NoExit; the launcher closes the old one itself.' -ForegroundColor DarkGray
}
