@echo off
REM START_BUN_Full.bat - Bun start that ALSO launches the KPop Listener, with an
REM automatic Node fallback if Bun can't run the bridge. The Bun equivalent of
REM Start_Everything.bat.

REM v4005 -- MOVED FROM "Root Utils" TO THE PROJECT ROOT, at Keith's request, and A MOVE IS NOT A RENAME.
REM This file located everything relative to its own folder's PARENT (%~dp0..), which was right in
REM "Root Utils" and points ABOVE the project the moment the file moves up one level. Three paths were
REM affected -- this cd, swek_free_port.bat and swek_exit_report.bat -- and all three now resolve from
REM %~dp0 itself, because that IS the project root here. Moving the other Root Utils launchers means
REM doing the same for each: START_BOTH.bat and START_BUN.bat carry the same %~dp0.. assumption.
cd /d "%~dp0"

if not exist "WebGLEngine\ai-bridge\server.js" (
    echo ERROR: WebGLEngine\ai-bridge\server.js not found. Run from the project root.
    pause
    exit /b 1
)

REM --- Bun: auto-install on first run -------------------------------------
where bun >nul 2>nul
if not errorlevel 1 goto bun_ready
echo Bun not found on PATH. Installing Bun via the vendored official installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "WebGLEngine\ai-bridge\installers\bun-install.ps1"
if defined BUN_INSTALL (set "PATH=%BUN_INSTALL%\bin;%PATH%") else (set "PATH=%USERPROFILE%\.bun\bin;%PATH%")
where bun >nul 2>nul
if errorlevel 1 (
    echo Bun still not found after install - will use Node for the bridge.
    set "USE_NODE=1"
)
:bun_ready

REM --- KPop Listener (-NoExit so it persists) --------------------------------------------
REM v1621 — minimized is now OPT-IN: only start /MIN if the control panel wrote the flag
REM (Settings -> KPop Listener -> "Start minimized"). Default = a normal, visible window.
set "KPMIN="
if exist "%TEMP%\KPopListener\kpop_minimize.flag" set "KPMIN=/MIN"
if not defined KPMIN if exist "WebGLEngine\ai-bridge\kpop_minimize.flag" set "KPMIN=/MIN"
REM The bundled folder is "KPop Listener" (with a space). Prefer it; fall back
REM to the legacy "KPopupListener" name only if that's what's on disk.
if exist "KPop Listener\KPopListener.ps1" (
    echo Starting KPopListener from bundled folder...
    start "KPop Listener" %KPMIN% powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -Command "$ErrorActionPreference='SilentlyContinue'; for($i=0;$i -lt 240;$i++){ try{ $r=Invoke-WebRequest 'http://127.0.0.1:8787/health' -TimeoutSec 2 -UseBasicParsing; if($r.StatusCode -eq 200){break} }catch{}; Start-Sleep -Milliseconds 500 }; & 'KPop Listener\KPopListener.ps1'"
) else if exist "..\KPop Listener\KPopListener.ps1" (
    echo Starting KPopListener from sibling folder...
    start "KPop Listener" %KPMIN% powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -Command "$ErrorActionPreference='SilentlyContinue'; for($i=0;$i -lt 240;$i++){ try{ $r=Invoke-WebRequest 'http://127.0.0.1:8787/health' -TimeoutSec 2 -UseBasicParsing; if($r.StatusCode -eq 200){break} }catch{}; Start-Sleep -Milliseconds 500 }; & '..\KPop Listener\KPopListener.ps1'"
) else if exist "KPopupListener\KPopListener.ps1" (
    echo Starting KPopListener from legacy subfolder...
    start "KPop Listener" %KPMIN% powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -Command "$ErrorActionPreference='SilentlyContinue'; for($i=0;$i -lt 240;$i++){ try{ $r=Invoke-WebRequest 'http://127.0.0.1:8787/health' -TimeoutSec 2 -UseBasicParsing; if($r.StatusCode -eq 200){break} }catch{}; Start-Sleep -Milliseconds 500 }; & 'KPopupListener\KPopListener.ps1'"
) else (
    echo NOTE: KPopListener.ps1 not found ^(bundled / sibling / legacy^) - skipping listener.
)

REM --- ai-bridge under Bun (Node fallback) -------------------------------
pushd WebGLEngine\ai-bridge

if not exist "node_modules" (
    echo node_modules missing - checking for a sibling build to reuse first...
REM v3204 -- THE GLOB WAS THE OLD FOLDER PREFIX. Wrapper folders became SweK_Engine_vNNNN at v2282 and this
REM rescue still globbed EngineProject_v*, so it matched NOTHING and fell straight through to `npm install`.
REM That matters precisely when it is needed: the shipped zip STRIPS node_modules, so a fresh extract whose
REM copy-from-the-old-folder step did not happen has no deps, the ai-bridge does not bind, and BOTH the KPop
REM listener (which waits up to 120s on /health) and the GPU Brain (a poller) come up against a dead bridge.
REM A RENAME IS NOT DONE UNTIL EVERY GLOB OF THE OLD NAME IS FOUND -- buildName.js parses both prefixes and
REM its gate proves it; these two launchers were the ones nothing checked. Both names now, legacy last.
    for /d %%D in ("..\..\..\SweK_Engine_v*" "..\..\..\EngineProject_v*") do if exist "%%D\WebGLEngine\ai-bridge\node_modules\ws\package.json" if not exist "node_modules\ws\package.json" robocopy "%%D\WebGLEngine\ai-bridge\node_modules" "node_modules" /E /NFL /NDL /NJH /NJS /NC /NS /MT:8 >nul
    if not exist "node_modules\ws\package.json" (
        echo First-run: installing ai-bridge deps...
        if defined USE_NODE ( call npm install ) else ( call bun install || call npm install )
    )
)

REM free port 8787: v1238 — kill any prior bun.exe bridge (the catch-all that the
REM LISTENING-only netstat kill was missing, so a zombie survived and blocked the
REM bind) + any PID on :8787, then settle ~3s for TIME_WAIT before re-binding.
set "SUPERSEDE="
if exist "%TEMP%\swek_superseded.flag" set "SUPERSEDE=1"
taskkill /IM bun.exe /F >nul 2>nul
REM v3097 -- one of six hand-rolled copies of this job; extracted to swek_free_port.bat.
call "%~dp0WebGLEngine\tools\ship\swek_free_port.bat"
ping -n 4 127.0.0.1 >nul 2>nul

REM v1574 - open server.html only AFTER the bridge is LISTENING (was opening before bind -> dead :8787).
if not defined SUPERSEDE start "SweK opener" /MIN powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $ok=$false; for($i=0;$i -lt 60;$i++){ try{ $r=Invoke-WebRequest -Uri 'http://127.0.0.1:8787/health' -TimeoutSec 2 -UseBasicParsing; if($r.StatusCode -eq 200){$ok=$true; break} }catch{}; Start-Sleep -Milliseconds 500 }; if(-not $ok){ return }; try{$ni=Invoke-RestMethod -Uri 'http://localhost:8787/net/info' -TimeoutSec 5; $u=$ni.recommended}catch{}; if([string]::IsNullOrWhiteSpace($u)){$u='http://localhost:8787/'}; $b=$u.TrimEnd('/'); $pg='/server.html'; try{$bm=Invoke-RestMethod -Uri ($b+'/boot/mode') -TimeoutSec 4; if($bm -and $bm.url){$pg=$bm.url}}catch{}; Start-Process ($b+$pg)"
if defined USE_NODE (
    echo Starting ai-bridge under Node on http://127.0.0.1:8787/ ...
    node server.js
) else (
    echo Starting ai-bridge under Bun on http://127.0.0.1:8787/ ...
    bun server.js
    if errorlevel 1 (
        if exist "%TEMP%\swek_superseded.flag" goto _swek_superseded
        echo.
        echo Bun exited with an error - falling back to Node...
        where node >nul 2>nul && (node server.js) || (echo Node not found either. Install Node.js from https://nodejs.org & pause)
    )
)
REM v3088 -- the two runners above sit inside an if/else and the tail just did popd/goto :eof, so BOTH a
REM clean stop and a crash closed the window with nothing said. The `exit /b 0` below is on the SUPERSEDE
REM label and is correct there -- an auto-update really did succeed. This is the other path.
set "NODE_RC=%ERRORLEVEL%"
call "%~dp0WebGLEngine\tools\ship\swek_exit_report.bat" %NODE_RC%
popd
exit /b %NODE_RC%
:_swek_superseded
del "%TEMP%\swek_superseded.flag" >nul 2>nul
exit /b 0
