@echo off
REM ============================================================================
REM  SweK_Run.bat (v2418) -- ONE window. No ghosts.
REM
REM  WHY THE OLD WINDOWS PILE UP:
REM  On a version update the server launches the NEW build and the new launcher
REM  kills THIS (old) server. That is an EXPECTED handoff -- the exit code (-1)
REM  just means "killed", not "crashed". A launcher that ends in a bare `pause`
REM  then sits forever on "Press any key to continue . . ." waiting for a key
REM  nobody will press -- so every update leaves one dead window behind.
REM
REM  The server ALREADY tells us this happened: since v1507 it drops
REM  %TEMP%\swek_superseded.flag right before handing off (v2418: the flag now
REM  contains the new build's folder). A launcher only has to READ it.
REM
REM  This one knows the difference:
REM    handoff (flag present)      -> close silently; the new build has the baton
REM    clean exit (code 0)         -> close
REM    real crash (nonzero, no flag) -> PAUSE, so you can actually read the error
REM
REM  Point your C:\Intel launcher at this file (or copy the 6 lines after :run).
REM ============================================================================
setlocal
set "FLAG=%TEMP%\swek_superseded.flag"
cd /d "%~dp0"

REM v2514 -- DO NOT DELETE THE FLAG AT STARTUP. That line was a RACE, and it is the reason an auto-update ends in
REM "exited with code -1" and a window sitting on a pause forever:
REM
REM   1. the new build's launcher writes the flag, then kills the old node
REM   2. the new SweK_Run.bat starts and deletes the flag -- THE ONE MEANT FOR THE OLD WINDOW
REM   3. the old SweK_Run.bat wakes up, finds no flag, and reports a real crash
REM
REM It only happens on an auto-update, because that is the only time two launchers overlap. The delete was there to
REM stop a STALE flag masking a genuine crash tomorrow. FRESHNESS does that job without racing anyone: a handoff
REM flag is seconds old, and yesterday's is not.

:run
node ai-bridge\server.js
set "CODE=%ERRORLEVEL%"

REM Is the flag FRESH (under 90s)? PowerShell, because cmd cannot compare file times without pain. If PowerShell is
REM missing or the flag is absent, FRESH stays 0 and this is treated as a real exit -- which is the safe direction:
REM calling a crash a handoff hides it forever, while calling a handoff a crash only costs a confusing window.
set "FRESH=0"
if exist "%FLAG%" (
    for /f %%A in ('powershell -NoProfile -Command "if ((Get-Date) - (Get-Item '%FLAG%').LastWriteTime -lt [TimeSpan]::FromSeconds(90)) { 1 } else { 0 }" 2^>nul') do set "FRESH=%%A"
)

if "%FRESH%"=="1" (
    del "%FLAG%" >nul 2>&1
    echo.
    echo [SweK] handoff -- the new build has the baton. Closing this window.
    exit /b 0
)
if "%CODE%"=="0" exit /b 0

echo.
echo [SweK] the ai-bridge exited with code %CODE%.
if exist "%FLAG%" (
    echo [SweK] A supersede flag exists but is STALE ^(older than 90s^), so this is not a handoff.
    echo [SweK] If an update just ran, the flag was written and nobody consumed it -- worth a look.
) else (
    echo [SweK] No supersede flag, so this was not a handoff. It is a real exit.
)
echo [SweK] Node's own error, if it printed one, is above. If the last lines are just
echo [SweK] [autoPull] chatter, then node was KILLED from outside rather than crashing --
echo [SweK] code -1 on Windows is what taskkill /F leaves behind.
pause
exit /b %CODE%
