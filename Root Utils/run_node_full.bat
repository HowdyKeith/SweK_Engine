@echo off
REM run_node_full.bat - run the ai-bridge directly under NODE with the FULL output
REM firehose (no QUIET). No Bun, no runtime prompt - rock-solid, every feature, every
REM log line. Frees port 8787 first. Use this when you want to watch everything the
REM bridge prints (debugging). For the quiet Bun-default launcher use START_BUN.bat.

cd /d "%~dp0.."

if not exist "WebGLEngine\ai-bridge\server.js" (
    echo ERROR: WebGLEngine\ai-bridge\server.js not found. Run from the project root.
    pause
    exit /b 1
)

REM --- FULL output: do NOT set QUIET (leave the firehose on) ---
set "QUIET="

REM --- free :8787 before launch so a stale instance can't block the port ---
echo Freeing port 8787 if in use...
REM v3097 -- was a hand-rolled netstat/taskkill pair that sent both streams to nul one line before the
REM server that then could not bind. There were SIX such copies across five launchers, no two alike, and
REM one launcher with none at all. Extracted to swek_free_port.bat: it NAMES the holding PID, shows the
REM kill's own output, re-checks afterwards, and holds the window if the port is still busy.
call "%~dp0..\\WebGLEngine\tools\ship\swek_free_port.bat"
ping -n 2 127.0.0.1 >nul 2>&1

where node >nul 2>nul
if errorlevel 1 (
    echo Node not found on PATH. Install Node.js from https://nodejs.org
    pause
    exit /b 1
)

pushd WebGLEngine\ai-bridge
if not exist "node_modules" (
    echo First-run: installing ai-bridge deps with npm...
    call npm install
)
echo.
echo Starting ai-bridge under Node ^(FULL output^) on http://127.0.0.1:8787/ ...
echo Press Ctrl+C to stop.
echo.
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
