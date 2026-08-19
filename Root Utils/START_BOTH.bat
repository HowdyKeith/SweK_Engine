@echo off
REM START_BOTH.bat - run BOTH bridges at once for A/B testing:
REM     Bun  on http://127.0.0.1:8787/   (the listener + phone + Shield all talk to THIS one)
REM     Node on http://127.0.0.1:8788/   (an isolated 2nd instance for comparison)
REM ONE shared KPop Listener is started here (NOT one per bridge). Each bridge opens
REM in its own window so you can watch both; close a window to stop that bridge.
REM Node must be installed for the 8788 half (https://nodejs.org); if it's missing the
REM Bun bridge still starts and the Node half is skipped with a note.

cd /d "%~dp0.."
if not exist "WebGLEngine\ai-bridge\server.js" (
    echo ERROR: WebGLEngine\ai-bridge\server.js not found. Run from the project root.
    pause
    exit /b 1
)

REM --- Bun present? (auto-install via the vendored installer) ---
where bun >nul 2>nul
if errorlevel 1 (
    echo Bun not found - installing...
    powershell -NoProfile -ExecutionPolicy Bypass -File "WebGLEngine\ai-bridge\installers\bun-install.ps1"
    if defined BUN_INSTALL (set "PATH=%BUN_INSTALL%\bin;%PATH%") else (set "PATH=%USERPROFILE%\.bun\bin;%PATH%")
)

REM --- free both ports (kill any prior bun + any PID on 8787/8788), then settle ---
echo Freeing ports 8787 + 8788...
taskkill /IM bun.exe /F >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8787" ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8788" ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>nul
ping -n 4 127.0.0.1 >nul 2>nul

REM --- start the KPop Listener ONCE (shared by whatever's on 8787) ---
if exist "KPop Listener\KPopListener.ps1" (
    echo Starting KPopListener ^(shared^)...
set "KPMIN="
if exist "%TEMP%\KPopListener\kpop_minimize.flag" set "KPMIN=/MIN"
if not defined KPMIN if exist "WebGLEngine\ai-bridge\kpop_minimize.flag" set "KPMIN=/MIN"
    start "KPop Listener" %KPMIN% powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -Command "$ErrorActionPreference='SilentlyContinue'; for($i=0;$i -lt 240;$i++){ try{ $r=Invoke-WebRequest 'http://127.0.0.1:8787/health' -TimeoutSec 2 -UseBasicParsing; if($r.StatusCode -eq 200){break} }catch{}; Start-Sleep -Milliseconds 500 }; & 'KPop Listener\KPopListener.ps1'"
) else if exist "..\KPop Listener\KPopListener.ps1" (
    echo Starting KPopListener from sibling folder ^(shared^)...
    start "KPop Listener" %KPMIN% powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -Command "$ErrorActionPreference='SilentlyContinue'; for($i=0;$i -lt 240;$i++){ try{ $r=Invoke-WebRequest 'http://127.0.0.1:8787/health' -TimeoutSec 2 -UseBasicParsing; if($r.StatusCode -eq 200){break} }catch{}; Start-Sleep -Milliseconds 500 }; & '..\KPop Listener\KPopListener.ps1'"
) else if exist "KPopupListener\KPopListener.ps1" (
    echo Starting KPopListener from legacy folder ^(shared^)...
    start "KPop Listener" %KPMIN% powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -Command "$ErrorActionPreference='SilentlyContinue'; for($i=0;$i -lt 240;$i++){ try{ $r=Invoke-WebRequest 'http://127.0.0.1:8787/health' -TimeoutSec 2 -UseBasicParsing; if($r.StatusCode -eq 200){break} }catch{}; Start-Sleep -Milliseconds 500 }; & 'KPopupListener\KPopListener.ps1'"
) else (
    echo NOTE: KPopListener.ps1 not found - skipping listener.
)

REM --- deps on first run ---
pushd WebGLEngine\ai-bridge
if not exist "node_modules" (
    echo First-run: installing ai-bridge deps...
    call bun install || call npm install
)
popd

REM --- Bun bridge on 8787 in its own window ---
echo Starting Bun bridge on http://127.0.0.1:8787/ ...
start "ai-bridge BUN :8787" cmd /k "cd /d WebGLEngine\ai-bridge && bun server.js"

REM --- Node bridge on 8788 in its own window (only if Node is installed) ---
where node >nul 2>nul
if errorlevel 1 (
    echo Node not found on PATH - skipping the Node:8788 bridge. Install Node.js from https://nodejs.org to enable it.
) else (
    echo Starting Node bridge on http://127.0.0.1:8788/ ...
    start "ai-bridge NODE :8788" cmd /k "cd /d WebGLEngine\ai-bridge && set PORT=8788 && node server.js"
)

REM --- open the page(s) once the servers have had a moment to bind ---
ping -n 3 127.0.0.1 >nul 2>nul
start "" http://127.0.0.1:8787/
where node >nul 2>nul && start "" http://127.0.0.1:8788/

echo.
echo ==========================================================
echo  Bun:  http://127.0.0.1:8787/   ^(listener + phone + Shield use THIS one^)
echo  Node: http://127.0.0.1:8788/   ^(isolated 2nd instance for comparison^)
echo  One shared KPop Listener is running. Close a bridge window to stop that bridge.
echo ==========================================================
exit /b 0
