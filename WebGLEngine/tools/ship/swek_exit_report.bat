@echo off
REM WebGLEngine\tools\ship\swek_exit_report.bat  --  called as: call "...\swek_exit_report.bat" %ERRORLEVEL%
REM
REM v3088 -- ONE PLACE THAT KNOWS WHAT A DAEMON'S EXIT MEANS.
REM
REM v3085 gave START_NODE_Engine.bat a branch for a clean exit, because a server that stops is an event even
REM when it stops tidily. Writing that message a second time would have been a second definition of the same
REM judgement, and this tree has been bitten by that repeatedly -- three definitions of "a gate exists here"
REM disagreed for 153 versions. So the judgement lives here and every launcher calls it.
REM
REM Takes the server's REAL exit code as %1. Sets nothing the caller needs; the caller propagates %1 itself.
setlocal
set "RC=%~1"
if "%RC%"=="" set "RC=unknown"

REM v3250 -- *** THIS CHECKED `if exist` ALONE, AND IT IS THE ONE BRANCH IN THIS FILE THAT DOES NOT PAUSE. ***
REM %TEMP% survives reboots. A flag left by an update that did not finish its handoff made EVERY launch
REM afterwards announce "the new build is already running", exit 0, and close the window -- taking the real
REM reason with it, ON EVERY VERSION, because the flag lives in %TEMP% and not in the folder.
REM
REM SweK_Run.bat and ai-bridge\server.js BOTH already judged this flag by age, both at 90 seconds. This file
REM did not -- and it is the file that decides whether the window pauses. THE LEAST VERIFIABLE SIGNAL WAS
REM SILENCING THE MOST USEFUL OUTPUT. swek_flag_fresh.bat is now the one definition, and a STALE flag no
REM longer buys silence: "calling a crash a handoff hides it forever, while calling a handoff a crash only
REM costs a confusing window" -- SweK_Run.bat, and it was right.
set "SUPERSEDED=0"
call "%~dp0swek_flag_fresh.bat"
if "%FRESH%"=="1" (
    set "SUPERSEDED=1"
    del "%TEMP%\swek_superseded.flag" >nul 2>nul
)

if "%SUPERSEDED%"=="1" (
    echo.
    echo [SweK] an auto-update replaced this instance. Exit code %RC% is EXPECTED, not a crash.
    echo [SweK] the new build is already running. This window is closing on its own.
    endlocal
    exit /b 0
)

if not "%RC%"=="0" (
    echo.
    echo [SweK] the ai-bridge exited with code %RC%. The reason is above this line.
    echo.
    pause
    endlocal
    exit /b 0
)

echo.
echo ============================================================
echo  [SweK] the ai-bridge STOPPED CLEANLY (exit code 0).
echo.
echo  It started, then chose to stop. That is not a crash, and it
echo  is not success either -- this window should have kept serving.
echo.
echo  The usual causes, most likely first:
echo    1. An auto-update replaced this instance but did not leave
echo       its marker. The NEW build is probably already serving --
echo       check http://127.0.0.1:8787/health before relaunching.
echo    2. Something asked it to stop (a /restart or shutdown route,
echo       or Ctrl+C in this window).
echo    3. It bound the port, then had nothing left keeping it alive.
echo.
echo  Scroll UP: the last lines before this box are the server's own
echo  account of what it did. If port 8787 still answers, you are
echo  looking at case 1 and nothing is wrong.
echo ============================================================
echo.
pause
endlocal
exit /b 0
