@echo off
REM FREE_PORT_8787.bat - diagnose AND free port 8787. Shows EXACTLY what process is
REM holding it (name + PID) so we stop guessing, then force-kills any LISTENING owner.
REM Run this, then relaunch START_BUN_Full.bat and open http://127.0.0.1:8787/

echo ==========================================================
echo  What is currently on port 8787 (any state):
echo ==========================================================
netstat -ano | findstr :8787
if errorlevel 1 echo   (nothing - port looks free)
echo.

echo ==========================================================
echo  Identifying + killing any LISTENING owner of 8787:
echo ==========================================================
set "FOUND="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :8787 ^| findstr LISTENING') do (
    set "FOUND=1"
    echo   --- PID %%p ---
    tasklist /FI "PID eq %%p" /NH
    echo   killing PID %%p ...
    taskkill /PID %%p /F
)
if not defined FOUND echo   No LISTENING owner found.
echo.

echo ==========================================================
echo  Re-check:
echo ==========================================================
netstat -ano | findstr :8787 | findstr LISTENING
if errorlevel 1 (
    echo   Port 8787 is now FREE. Relaunch START_BUN_Full.bat
    echo   and open  http://127.0.0.1:8787/  ^(use 127.0.0.1, NOT localhost, under Bun^).
) else (
    echo   STILL held - the owner above may be elevated. Re-run this as Administrator,
    echo   or note the process name above and tell Keith's assistant.
)
echo.
echo If netstat showed lines with state TIME_WAIT (and no killable PID), just wait
echo ~30 seconds and relaunch - those clear on their own.
echo.
pause
