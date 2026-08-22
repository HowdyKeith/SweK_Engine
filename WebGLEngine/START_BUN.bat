@echo off
REM START_BUN.bat - launch the ai-bridge under Bun, primed by a one-shot Node pass.
REM
REM Bun-on-Windows can't do dgram/UDP, so the engine skips UDP discovery (mDNS,
REM ONVIF cameras) under Bun. This launcher first runs bun-prime.js ON NODE to do
REM that discovery and cache it (discovery-cache.json), then starts the engine
REM under Bun, which reads the cache. Node does the part Bun can't, then exits.
REM
REM   START_BUN.bat           quiet console (critical lines only)
REM   START_BUN.bat verbose   full logs
REM
REM Falls back to Node if Bun isn't installed or exits with an error.

title VoxelEngine (Bun, Node-primed)
cd /d "%~dp0"
set "QUIET=1"
if /I "%~1"=="verbose" ( set "VERBOSE=1" & set "QUIET=" & echo [verbose logging on] )

REM --- free :8787 before launch. v1237: ALWAYS free it (was gated behind the
REM "killport" arg). Kills any prior bun.exe bridge (bun is the only bridge runtime
REM here when Node isn't installed) AND any PID still holding :8787, then waits ~3s
REM so a just-closed / TIME_WAIT socket releases before we re-bind. This is the
REM "PORT 8787 ALREADY IN USE -> dead site" self-heal. "killport" arg still accepted. ---
echo Freeing port 8787 (killing any prior ai-bridge)...
taskkill /IM bun.exe /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :8787 ^| findstr LISTENING') do (
    echo   killing PID %%p holding :8787
    taskkill /PID %%p /F >nul 2>&1
)
ping -n 4 127.0.0.1 >nul 2>&1

REM --- 1) Node primer: UDP discovery Bun panics on -> discovery-cache.json ---
where node >nul 2>&1
if %errorlevel%==0 (
    echo Priming discovery on Node ^(cameras + mDNS^)...
    pushd ai-bridge
    node bun-prime.js
    popd
) else (
    echo Node not found - skipping prime ^(Bun will RTSP-scan only^).
)

REM --- 2) Launch under Bun; fall back to Node if Bun is missing or crashes ---
where bun >nul 2>&1
if %errorlevel%==0 (
    echo Starting ai-bridge under Bun on http://127.0.0.1:8787/ ...
    pushd ai-bridge
    bun server.js
    if errorlevel 1 (
        echo Bun exited with an error - falling back to Node...
        node server.js
    )
    popd
) else (
    echo Bun not found - starting under Node...
    pushd ai-bridge
    node server.js
    popd
)

pause
