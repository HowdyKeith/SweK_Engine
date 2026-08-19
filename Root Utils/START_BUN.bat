@echo off
REM START_BUN.bat - run the ai-bridge, defaulting to Bun (faster startup) with an
REM automatic Node fallback if Bun crashes. QUIET console: only critical errors and
REM the Bun/Node status show (set QUIET handled by the bridge). For the full firehose
REM of bridge output, use START_BUN_Full.bat instead.

cd /d "%~dp0.."

if not exist "WebGLEngine\ai-bridge\server.js" (
    echo ERROR: WebGLEngine\ai-bridge\server.js not found. Run from the project root.
    pause
    exit /b 1
)

REM --- keep the DOS window to critical lines only (errors + Bun crashes still show) ---
set "QUIET=1"


REM --- free :8787 before launch. v1236: ALWAYS free it (not just with the
REM killport arg) so a stale/zombie holder or a TIME_WAIT socket from a prior
REM run self-heals instead of blocking the bind (the "PORT 8787 ALREADY IN USE
REM -> website dead" case). Pass "killport" still works; it's just the default now. ---
echo Freeing port 8787 (killing any prior ai-bridge)...
taskkill /IM bun.exe /F >nul 2>&1
REM v3097 -- was a hand-rolled netstat/taskkill pair that sent both streams to nul one line before the
REM server that then could not bind. There were SIX such copies across five launchers, no two alike, and
REM one launcher with none at all. Extracted to swek_free_port.bat: it NAMES the holding PID, shows the
REM kill's own output, re-checks afterwards, and holds the window if the port is still busy.
call "%~dp0..\\WebGLEngine\tools\ship\swek_free_port.bat"
REM ~3s settle so a just-closed socket leaves TIME_WAIT before we re-bind.
ping -n 4 127.0.0.1 >nul 2>&1
REM --- pick a runtime: default Bun after an 8s timeout; press N for Node ---
echo.
echo   Start the AI bridge with:
echo     [B] Bun   - faster startup ^(default^)
echo     [N] Node  - rock-solid, every feature, no Bun crash
echo.
choice /C BN /N /T 8 /D B /M "  Choose ^(auto-Bun in 8s^): "
if errorlevel 2 goto run_node

REM ============================ BUN PATH ============================
where bun >nul 2>nul
if not errorlevel 1 goto bun_ready
echo Bun not found on PATH. Installing Bun via the vendored official installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "WebGLEngine\ai-bridge\installers\bun-install.ps1"
if defined BUN_INSTALL (set "PATH=%BUN_INSTALL%\bin;%PATH%") else (set "PATH=%USERPROFILE%\.bun\bin;%PATH%")
where bun >nul 2>nul
if errorlevel 1 (
    echo Bun still not found after install - using Node for this run.
    goto run_node
)
:bun_ready

pushd WebGLEngine\ai-bridge
if not exist "node_modules" (
    echo First-run: installing ai-bridge deps with bun...
    call bun install
    if errorlevel 1 ( echo bun install failed - trying npm instead... & call npm install )
)
REM v3097 -- was a hand-rolled netstat/taskkill pair that sent both streams to nul one line before the
REM server that then could not bind. There were SIX such copies across five launchers, no two alike, and
REM one launcher with none at all. Extracted to swek_free_port.bat: it NAMES the holding PID, shows the
REM kill's own output, re-checks afterwards, and holds the window if the port is still busy.
call "%~dp0..\\WebGLEngine\tools\ship\swek_free_port.bat"
echo Starting ai-bridge under Bun on http://127.0.0.1:8787/ ...
start "" http://127.0.0.1:8787/
bun server.js
if errorlevel 1 (
    echo.
    echo Bun crashed - falling back to Node...
    where node >nul 2>nul || (echo Installing Node via the vendored installer... & powershell -NoProfile -ExecutionPolicy Bypass -File "WebGLEngine\ai-bridge\installers\node-install.ps1" & set "PATH=%USERPROFILE%\.node;%PATH%")
    where node >nul 2>nul && (node server.js) || (echo Node still not available. Install Node.js from https://nodejs.org & pause)
)
popd
exit /b 0

REM ============================ NODE PATH ============================
:run_node
where node >nul 2>nul
if not errorlevel 1 goto node_ok
echo Node not found on PATH. Installing Node via the vendored official installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "WebGLEngine\ai-bridge\installers\node-install.ps1"
set "PATH=%USERPROFILE%\.node;%PATH%"
where node >nul 2>nul
if errorlevel 1 ( echo Node still not found after install - install manually from https://nodejs.org & pause & exit /b 1 )
:node_ok
pushd WebGLEngine\ai-bridge
if not exist "node_modules" ( echo First-run: installing deps with npm... & call npm install )
REM v3097 -- was a hand-rolled netstat/taskkill pair that sent both streams to nul one line before the
REM server that then could not bind. There were SIX such copies across five launchers, no two alike, and
REM one launcher with none at all. Extracted to swek_free_port.bat: it NAMES the holding PID, shows the
REM kill's own output, re-checks afterwards, and holds the window if the port is still busy.
call "%~dp0..\\WebGLEngine\tools\ship\swek_free_port.bat"
echo Starting ai-bridge under Node on http://127.0.0.1:8787/ ...
start "" http://127.0.0.1:8787/
REM v3088 -- THIS USED TO `exit /b 0` STRAIGHT AFTER THE FOREGROUND SERVER, WHICH IS NOT MISSING ERROR
REM HANDLING -- IT IS ASSERTING SUCCESS. The exit code was discarded, so a crash and a clean run left the
REM same trace: window gone, zero returned, and every caller (the auto-updater, a scheduled task, a parent
REM script) told the engine ran fine. v3085 fixed the SILENCE in START_NODE_Engine.bat; this fixes the LIE
REM in the rest. The judgement lives in ONE place -- swek_exit_report.bat -- because writing it four times
REM is how the fifth copy gets it subtly wrong.
node server.js
set "NODE_RC=%ERRORLEVEL%"
call "%~dp0..\\WebGLEngine\tools\ship\swek_exit_report.bat" %NODE_RC%
popd
exit /b %NODE_RC%
