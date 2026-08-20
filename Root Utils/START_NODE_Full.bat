@echo off
REM START_NODE_Full.bat - run the ai-bridge under NODE with the FULL output firehose.
REM
REM Optional port argument (default 8787):
REM     START_NODE_Full.bat            -> Node bridge on 8787 (normal)
REM     START_NODE_Full.bat 8788       -> Node bridge on 8788, so it can sit ALONGSIDE
REM                                       a Bun bridge on 8787 for A/B testing.
REM
REM NOTE: a second bridge on a different port is a SEPARATE instance with its own
REM state + WebSocket clients. The phone/Shield/KPop Listener all talk to 8787, so
REM 8788 is for side-by-side comparison (Bun vs Node behavior), not normal dual use.
REM This launcher does NOT start the KPop Listener (it's shared; START_BUN_Full or
REM Start_Everything already launches it). Node must be installed: https://nodejs.org

cd /d "%~dp0.."

if not exist "WebGLEngine\ai-bridge\server.js" (
    echo ERROR: WebGLEngine\ai-bridge\server.js not found. Run from the project root.
    pause
    exit /b 1
)

REM --- target port (arg 1, default 8787). The bridge honors the PORT env var. ---
set "PORT=8787"
if not "%~1"=="" set "PORT=%~1"

REM --- FULL output: leave QUIET unset (firehose on) ---
set "QUIET="

where node >nul 2>nul
if not errorlevel 1 goto node_ready
echo Node not found on PATH. Installing Node via the vendored official installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "WebGLEngine\ai-bridge\installers\node-install.ps1"
set "PATH=%USERPROFILE%\.node;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
    echo Node still not found after install. Install manually from https://nodejs.org then re-run.
    pause
    exit /b 1
)
:node_ready

echo Freeing port %PORT% (killing any node.exe holding it)...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do (
    echo   killing PID %%p holding :%PORT%
    taskkill /PID %%p /F >nul 2>&1
)
REM ~3s settle so a just-closed socket leaves TIME_WAIT before we re-bind.
ping -n 4 127.0.0.1 >nul 2>&1

pushd WebGLEngine\ai-bridge
if not exist "node_modules" (
    echo First-run: installing ai-bridge deps with npm...
    call npm install
)
echo.
echo Starting ai-bridge under Node ^(FULL output^) on http://127.0.0.1:%PORT%/ ...
echo Press Ctrl+C to stop.
echo.
start "" http://127.0.0.1:%PORT%/
REM v3088 -- THIS USED TO `exit /b 0` STRAIGHT AFTER THE FOREGROUND SERVER, WHICH IS NOT MISSING ERROR
REM HANDLING -- IT IS ASSERTING SUCCESS. The exit code was discarded, so a crash and a clean run left the
REM same trace: window gone, zero returned, and every caller (the auto-updater, a scheduled task, a parent
REM script) told the engine ran fine. v3085 fixed the SILENCE in START_NODE_Engine.bat; this fixes the LIE
REM in the rest. The judgement lives in ONE place -- swek_exit_report.bat -- because writing it four times
REM is how the fifth copy gets it subtly wrong.
REM v3097 -- this launcher NEVER tried to free :8787 and went straight to binding it, so a stale
REM instance meant an instant exit with nothing said. Same shared check as the other four.
call "%~dp0..\\WebGLEngine\tools\ship\swek_free_port.bat"
node server.js
set "NODE_RC=%ERRORLEVEL%"
call "%~dp0..\\WebGLEngine\tools\ship\swek_exit_report.bat" %NODE_RC%
popd
exit /b %NODE_RC%
