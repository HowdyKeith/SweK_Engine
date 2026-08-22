@echo off
REM Start_Everything_Python.bat — v751 — alternate Windows launcher.
REM
REM Same flow as Start_Everything.bat but uses the Python KPopListener
REM instead of the PowerShell version. Useful when you'd rather not
REM debug PowerShell module loading, or want to mirror the macOS setup
REM on Windows for consistency.
REM
REM Order of operations:
REM   1. Install ai-bridge npm deps if missing (first-run only)
REM   2. Kill any stale Node bound to port 8787
REM   3. Launch Python listener with --launch-bridge so the Node bridge
REM      spawns as a detached child of the listener (one process tree)
REM   4. Wait for port 8787 to bind
REM   5. Open Chrome to http://localhost:8787/
REM
REM Requirements:
REM   * Python 3 installed and on PATH (https://www.python.org/downloads/)
REM   * Node.js installed (https://nodejs.org)
REM   * First-run only: pip install windows-toasts pywin32  (optional but recommended)

title VoxelEngine launcher (Python listener variant)
cd /d "%~dp0.."

echo === VoxelEngine launcher (Python listener) ===
echo Project root: %CD%
echo.

REM Sanity check
if not exist "WebGLEngine\ai-bridge\server.js" (
    echo ERROR: WebGLEngine\ai-bridge\server.js not found.
    echo Are you running this from the EngineProject root folder?
    pause
    exit /b 1
)

REM --- 1. Install npm deps if first run ---
if not exist "WebGLEngine\ai-bridge\node_modules" (
    echo First-run: installing ai-bridge npm deps...
    pushd WebGLEngine\ai-bridge
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed. Is Node.js installed and on PATH?
        echo Get it from https://nodejs.org
        popd
        pause
        exit /b 1
    )
    popd
    echo Deps installed.
    echo.
)

REM --- 2. Kill stale Node on 8787 ---
set PORT_BOUND=0
netstat -ano | findstr /R /C:":8787 .*LISTENING" >nul 2>&1
if not errorlevel 1 set PORT_BOUND=1

if "%PORT_BOUND%"=="1" (
    echo Port 8787 in use -- killing existing node.exe...
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":8787 .*LISTENING"') do (
        echo   killing PID %%P
        taskkill /F /PID %%P >nul 2>&1
    )
    timeout /t 1 /nobreak >nul
)

REM --- 3. Find Python ---
set PYTHON=
where python >nul 2>nul
if not errorlevel 1 set PYTHON=python
if not defined PYTHON (
    where py >nul 2>nul
    if not errorlevel 1 set PYTHON=py
)
if not defined PYTHON (
    echo ERROR: Python 3 not found on PATH. Install from https://www.python.org/downloads/
    echo Make sure to check "Add python.exe to PATH" during installation.
    pause
    exit /b 1
)

REM --- 4. Find Python listener ---
set LISTENER=KPop Listener\KPopListener.py
if not exist "%LISTENER%" (
    set LISTENER=KPopupListener\KPopListener.py
)
if not exist "%LISTENER%" (
    echo ERROR: KPopListener.py not found in "KPop Listener\" or "KPopupListener\".
    pause
    exit /b 1
)

echo Found: %LISTENER%
echo.
echo Starting Python listener with bridge auto-launch...
echo (Listener will spawn the Node.js bridge as a detached child process.)
echo.

REM --- 5. Launch listener with --launch-bridge ---
REM /B keeps it attached to this console window so you see startup output.
%PYTHON% "%LISTENER%" --launch-bridge --bridge-path "%CD%\WebGLEngine\ai-bridge"

echo.
echo === Listener exited. Press any key to close this window. ===
pause >nul
