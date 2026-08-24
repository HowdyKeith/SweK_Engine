@echo off
REM Start_Everything.bat - VoxelEngine launcher (visible variant).
REM
REM Does, in order:
REM   1. Installs ai-bridge npm deps if missing (first-run only)
REM   2. Kills any stale node.exe bound to port 8787 (Round 62)
REM   3. Starts ai-bridge server (hidden)
REM   4. Starts KPopListener (minimized, -NoExit) if not already running
REM   5. Opens http://localhost:8787/ in your default browser
REM
REM For background / silent run, use Start_Everything.vbs instead.

title VoxelEngine launcher
cd /d "%~dp0"

REM v1174 - quiet console by default (only critical lines). Run with the argument
REM   Start_Everything.bat verbose
REM to surface everything, including missing-asset 404s (kept in debug.log either way).
set "QUIET=1"
if /I "%~1"=="verbose" ( set "VERBOSE=1" & set "QUIET=" & echo [verbose logging on] )

echo === VoxelEngine launcher ===
echo.

REM --- 1. Install deps if first run ---
if not exist "ai-bridge\node_modules" (
    echo First-run: installing ai-bridge dependencies...
    pushd ai-bridge
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed. Is Node.js installed and on PATH?
        echo        Get it from https://nodejs.org
        popd
        pause
        exit /b 1
    )
    popd
    echo Dependencies installed.
    echo.
)

REM --- 2. Check if port 8787 is bound by a stale Node server ---
REM Round 62: previously we "skipped" starting the server when port was
REM already bound. That created a footgun — if the user extracted a new
REM VoxelEngine version, the OLD node.exe kept running with the OLD
REM server.js code, while the browser loaded the NEW frontend. Hours of
REM "why is this 404ing?" debugging ensued. Now we kill any stale node
REM bound to 8787 and always start a fresh server.
set PORT_BOUND=0
netstat -ano | findstr /R /C:":8787 .*LISTENING" >nul 2>&1
if not errorlevel 1 set PORT_BOUND=1

if "%PORT_BOUND%"=="1" (
    REM v2451 -- TELL THE OLD SERVER'S LAUNCHER THIS IS A HANDOFF, NOT A CRASH.
    REM SweK_Run.bat already knows how to close quietly when it is superseded: it looks for this flag and, finding it,
    REM says "handoff -- the new build has the baton" and closes. Nobody was ever setting it here, so every kill looked
    REM like a real crash -- the old window printed "exited with code -1" and sat on a pause forever. That is where the
    REM stale windows come from. Setting the flag BEFORE the kill turns a deliberate handoff back into a quiet one.
    echo.>"%TEMP%\swek_superseded.flag"
    echo Port 8787 in use -- handing off from the existing node.exe (its window will close itself)...
    REM Find PID(s) listening on 8787 and kill them. Done in PowerShell
    REM because cmd.exe doesn't have a clean one-liner for "find by port".
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":8787 .*LISTENING"') do (
        echo   killing PID %%P
        taskkill /F /PID %%P >nul 2>&1
    )
    REM Brief settle so the port releases before we re-bind. v1236: 3s (a
    REM just-closed socket can sit in TIME_WAIT ~1-2s; 1s sometimes lost the race).
    timeout /t 3 /nobreak >nul
)

echo Starting ai-bridge server...
start "" /B cmd.exe /c "cd /d ai-bridge && node server.js"

REM --- 3. KPopListener (user's full archive — KPopListener.ps1 is the main entry) ---
REM v748 — folder naming inconsistency fix. The archive's canonical name
REM is "KPop Listener" (with space). Older installs used "KPopupListener"
REM (no space). We now check both names in both locations (sibling +
REM child) and prefer the new name. We also detect the stale-legacy case
REM where BOTH exist (user updated but forgot to delete the old folder),
REM since that's been a real source of "why is the dashboard still old?".
set "LISTENER_PATH="
set "LEGACY_FOUND=0"
set "NEW_FOUND=0"
if exist "..\KPop Listener\KPopListener.ps1"     set "NEW_FOUND=1"
if exist "KPop Listener\KPopListener.ps1"        set "NEW_FOUND=1"
if exist "..\KPopupListener\KPopListener.ps1"    set "LEGACY_FOUND=1"
if exist "KPopupListener\KPopListener.ps1"       set "LEGACY_FOUND=1"

if "%NEW_FOUND%"=="1" if "%LEGACY_FOUND%"=="1" (
    echo.
    echo *** WARNING: both "KPop Listener" and "KPopupListener" folders exist.
    echo     The legacy "KPopupListener" folder is probably stale -- it may
    echo     contain an old KPopDashboard.psm1 that will hide your updates.
    echo     If the dashboard layout looks wrong, delete the "KPopupListener"
    echo     folder and re-run this batch.
    echo.
)

if exist "..\KPop Listener\KPopListener.ps1" (
    set "LISTENER_PATH=..\KPop Listener\KPopListener.ps1"
) else if exist "KPop Listener\KPopListener.ps1" (
    set "LISTENER_PATH=KPop Listener\KPopListener.ps1"
) else if exist "..\KPopupListener\KPopListener.ps1" (
    set "LISTENER_PATH=..\KPopupListener\KPopListener.ps1"
) else if exist "KPopupListener\KPopListener.ps1" (
    set "LISTENER_PATH=KPopupListener\KPopListener.ps1"
)

if defined LISTENER_PATH (
    echo Starting KPopListener from: %LISTENER_PATH%
    REM v1536 - launch MINIMIZED (visible in the taskbar so you can tell it's running)
    REM and -NoExit so the window persists even if the script returns/errors instead of
    REM silently vanishing. Restore the window to read the startup log / any error.
    start "KPop Listener" /MIN powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File "%LISTENER_PATH%"
) else (
    echo KPopListener not found -- skipped. ^(Looked for ..\KPop Listener, ..\KPopupListener, and child paths.^)
)

REM --- 4. Wait for server + open browser ---
REM Round 62: we always start a fresh server now, so always wait for bind.
echo Waiting for server to bind...
timeout /t 2 /nobreak >nul

echo Opening browser to localhost (server.html)...
REM v1530 opened the 192.x LAN address instead of localhost. *** v3981 REVERSES THAT,
REM   BECAUSE IT SILENTLY DISABLED WebGPU ON EVERY PAGE THIS LAUNCHER OPENS. WebGPU is
REM   gated on a SECURE CONTEXT: https qualifies, localhost qualifies, and
REM   http://<lan-ip>:8787 is NEITHER -- the browser does not define navigator.gpu there
REM   at all. So the machine holding the GPU was being launched onto the one origin that
REM   cannot use it. Keith hit it on ising-bench, euler-gpu-check and lbm3d-gpu in a row
REM   and asked "not sure why server.html is opening with ip, if localhost is needed?".
REM   NOTHING DEPENDED ON THE BROWSER BEING AT THE LAN ADDRESS: connect.html, hub.html,
REM   presence.html, macrodroid.html and phoneConnectQR all fetch /net/info for the LAN
REM   URL rather than reading location, and the QR helper has special-cased a localhost
REM   origin since v637 precisely so this direction would work. ***
REM   The port comes from /net/info (.port) so a non-default port is followed; 8787 is
REM   only the bootstrap probe and the fallback. All logic is in ONE powershell line on
REM   purpose: a batch if() block would premature-close on the parens inside powershell.
powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; $pt=8787; try{$i=Invoke-RestMethod -Uri 'http://localhost:8787/net/info' -TimeoutSec 5; if($i -and $i.port){$pt=$i.port}}catch{}; $b='http://localhost:'+$pt; $pg='/server.html'; try{$bm=Invoke-RestMethod -Uri ($b+'/boot/mode') -TimeoutSec 4; if($bm -and $bm.url){$pg=$bm.url}}catch{}; $u=$b+$pg; $c=(Get-Command chrome -ErrorAction SilentlyContinue).Source; if(-not $c){ foreach($p in @($env:ProgramFiles+'\Google\Chrome\Application\chrome.exe', ${env:ProgramFiles(x86)}+'\Google\Chrome\Application\chrome.exe', $env:LocalAppData+'\Google\Chrome\Application\chrome.exe')){ if(Test-Path $p){$c=$p; break} } }; Write-Host ('opening ' + $u); if($c){ Start-Process $c $u } else { Start-Process $u }"

REM v2909 -- BRAIN MOVED ABOVE THE PAUSE. It used to sit AFTER `pause >nul`, three lines below an echo that
REM tells the user to close the window -- so the launcher's own instructions guaranteed the GPU Brain never
REM started. The identical block in START_NODE_Engine.bat has been correctly placed since v2064, with the
REM comment "nothing after that line runs until shutdown"; the lesson was learned in one launcher and never
REM back-ported to this one. tools/ship/launcherLint.mjs now enforces it across all 25 .bat files.

REM v2064 -- GPU Brain (optional; needs Deno). The brain shares the
REM engine bridge on :8787 -- START it AFTER the bridge is up.
where deno >nul 2>nul
if errorlevel 1 (
    echo [brain] Deno not found -- GPU Brain skipped. winget install DenoLand.Deno to enable.
) else (
    REM v2086 -- kill any STALE brain first. Same footgun as the node server
    REM above: on a version update the launcher used to start a NEW brain
    REM window while the OLD brain (old code) kept polling the new bridge, so
    REM you ended up with two windows and version skew. We match the deno
    REM process by command line (brain.js) so only OUR brain is killed. The
    REM matching runs from a temp .ps1 file rather than inline, because inline
    REM PowerShell with quotes/pipes/braces inside a batch (...) block is a
    REM notorious parsing footgun.
    echo [brain] clearing any stale GPU Brain process...
    REM v3658 -- a REAL script on disk, not a temp file dropped and deleted. See that file
    REM for why the drop-execute-delete sequence had to go.
    powershell -NoProfile -ExecutionPolicy Bypass -File "ai-bridge\installers\kill-brain.ps1" >nul 2>&1
    taskkill /F /FI "WINDOWTITLE eq SweK GPU Brain" >nul 2>&1
    timeout /t 1 /nobreak >nul
    start "SweK GPU Brain" cmd /c "cd /d %~dp0brain && START_BRAIN.bat"
)

echo.
echo Engine running. Close this window to leave it running in the background.
echo (Use Task Manager to end node.exe / powershell.exe processes to stop.)
pause >nul
