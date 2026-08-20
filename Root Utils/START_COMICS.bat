@echo off
REM START_COMICS.bat - "comics reader mode": start the ai-bridge and open the standalone
REM comic reader (comics.html) in its own window.
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

start "" http://127.0.0.1:8787/comics.html
where bun >nul 2>nul && ( bun server.js ) || ( node server.js )
popd
exit /b 0
