@echo off
REM ============================================================================
REM  LAG BLAME next boot.bat -- v3477
REM
REM  Double-click this INSTEAD of START_NODE_Engine.bat when the box is stalling.
REM
REM  It arms SweK's built-in V8 sampling profiler for ONE boot, starts the engine
REM  normally, then waits and prints THE FUNCTION THAT HELD THE EVENT LOOP.
REM
REM  Why this exists: the [lag] line reports a DURATION AND NOT A FUNCTION. That
REM  has now cost FOUR wrong guesses across the log's history -- a request flood,
REM  slow static serves, the folder delete, and nvidia-smi. Each was a real
REM  blocker. None was THE blocker. A profiler samples INSIDE the engine rather
REM  than from a timer the block would starve, so it can see what a stalled
REM  process is actually doing.
REM
REM  It is a ONE SHOT. The flag is consumed by the next boot, so this never
REM  leaves a profiler running on a box that is already struggling.
REM ============================================================================

cd /d "%~dp0.."

echo.
echo  ============================================================
echo   SweK -- arm lag blame for ONE boot
echo  ============================================================
echo.

REM ---- 1. ARM THE FLAG ------------------------------------------------------
REM  The flag is just a file in %%TEMP%%. The engine deletes it as it reads it,
REM  which is what makes this one-shot rather than a mode you can forget you left on.
set "SWEK_LAG_FLAG=%TEMP%\swek_lag_blame.flag"
echo %DATE% %TIME% > "%SWEK_LAG_FLAG%"
if exist "%SWEK_LAG_FLAG%" (
  echo   [1/3] Armed: %SWEK_LAG_FLAG%
) else (
  echo   [1/3] COULD NOT WRITE THE FLAG FILE. Check that %%TEMP%% is writable.
  pause
  exit /b 1
)

REM  Belt and braces: the environment variable does the same job by a different
REM  route, so if the flag is consumed by some other process first, this still
REM  arms the engine we are about to start.
set SWEK_LAG_BLAME=1

REM ---- 2. START THE ENGINE --------------------------------------------------
if not exist "START_NODE_Engine.bat" (
  echo   [2/3] START_NODE_Engine.bat not found next to this script's parent folder.
  echo         Expected it in: %CD%
  pause
  exit /b 1
)
echo   [2/3] Starting the engine in its own window...
start "SweK Engine (lag blame armed)" cmd /c "START_NODE_Engine.bat"

REM ---- 3. WATCH FOR THE STALL ----------------------------------------------
echo   [3/3] Watching for the first stall over 5 seconds...
echo.
where node >nul 2>&1
if errorlevel 1 (
  echo   node is not on PATH in this window, so this script cannot poll for you.
  echo   The profiler IS still armed. Once the engine has run for a minute, open:
  echo       http://127.0.0.1:8787/sys/lagblame
  echo   and copy the "report" section.
  pause
  exit /b 0
)

node "WebGLEngine\tools\ship\lagBlameWatch.mjs" 8787

echo.
echo  Done. Press any key to close.
pause >nul
