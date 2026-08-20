@echo off
REM START_SERVER.bat - minimal "server mode": start the ai-bridge and open the lean
REM server console (server.html, with live debug) instead of the full engine render.
REM The bridge still serves everything; this just lands you on the lightweight page.

cd /d "%~dp0.."

if not exist "WebGLEngine\ai-bridge\server.js" (
    echo ERROR: WebGLEngine\ai-bridge\server.js not found. Run from the project root.
    pause
    exit /b 1
)

pushd WebGLEngine\ai-bridge

REM deps on first run (Bun preferred, Node fallback)
if not exist "node_modules" (
    where bun >nul 2>nul && ( call bun install ) || ( call npm install )
)

REM free port 8787: kill any prior bun bridge + LISTENING owner, settle for TIME_WAIT
taskkill /IM bun.exe /F >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :8787 ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>nul
ping -n 4 127.0.0.1 >nul 2>nul

REM --- KPop Listener (v1536): server mode now starts it too, MINIMIZED + persistent
REM (-NoExit) so it's visible in the taskbar and doesn't silently vanish on error.
set "KP=%~dp0..\\KPop Listener\KPopListener.ps1"
if not exist "%KP%" set "KP=%~dp0..\KPop Listener\KPopListener.ps1"
if exist "%KP%" (
    echo Starting KPopListener ^(minimized^)...
set "KPMIN="
if exist "%TEMP%\KPopListener\kpop_minimize.flag" set "KPMIN=/MIN"
if not defined KPMIN if exist "WebGLEngine\ai-bridge\kpop_minimize.flag" set "KPMIN=/MIN"
    start "KPop Listener" %KPMIN% powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File "%KP%"
) else (
    echo KPopListener.ps1 not found -- server mode running without it.
)

start "" http://127.0.0.1:8787/server.html
where bun >nul 2>nul && ( bun server.js ) || ( node server.js )
popd
exit /b 0
