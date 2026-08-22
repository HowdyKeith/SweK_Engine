@echo off
REM WebGLEngine\tools\ship\swek_flag_fresh.bat  --  called as: call "...\swek_flag_fresh.bat"
REM Sets FRESH=1 when %TEMP%\swek_superseded.flag exists AND was written within the window; 0 otherwise.
REM
REM v3250 -- ONE DEFINITION OF "IS THAT FLAG STILL ABOUT THIS RUN".
REM
REM THREE FILES READ swek_superseded.flag AND ONLY TWO ASKED HOW OLD IT WAS. SweK_Run.bat (line 47) and
REM ai-bridge\server.js (line 1292) both judge it by LastWriteTime / mtime, and both already use 90 SECONDS.
REM swek_exit_report.bat checked `if exist` alone -- and it is the file that decides whether the launcher window
REM PAUSES or vanishes.
REM
REM *** THAT PAIRING IS THE WHOLE BUG: THE LEAST VERIFIABLE SIGNAL SILENCED THE MOST USEFUL OUTPUT. *** %TEMP%
REM survives reboots, so a flag left behind by an update that did not finish its handoff made every launch
REM afterwards announce "the new build is already running", exit 0, and close -- ON EVERY VERSION, because the
REM flag lives in %TEMP% and not in the folder. Going back versions could never have helped.
REM
REM SweK_Run.bat's own comment states the rule this restores: "calling a crash a handoff hides it forever, while
REM calling a handoff a crash only costs a confusing window." A stale flag now costs a window, not a diagnosis.
REM
REM Extracted rather than copied a third time, because batch has no import and `call` is what this tree already
REM uses for shared launcher logic (swek_exit_report.bat, swek_free_port.bat). NO setlocal HERE ON PURPOSE: the
REM caller needs FRESH to survive the call, which is the entire point of the helper.

set "SWEK_FLAG=%TEMP%\swek_superseded.flag"
set "FRESH=0"
if not exist "%SWEK_FLAG%" goto :eof

REM 90 SECONDS, MATCHING THE OTHER TWO READERS. An update handoff takes seconds; anything older is a leftover,
REM and treating a leftover as evidence about THIS run is what closed the window with no message in it.
for /f %%A in ('powershell -NoProfile -Command "if ((Get-Date) - (Get-Item '%SWEK_FLAG%').LastWriteTime -lt [TimeSpan]::FromSeconds(90)) { 1 } else { 0 }" 2^>nul') do set "FRESH=%%A"

REM A POWERSHELL THAT FAILS TO RUN LEAVES FRESH AT 0, WHICH IS THE SAFE DIRECTION: the caller then reports the
REM exit properly instead of assuming a handoff it could not confirm.

REM A STALE FLAG IS CLEARED HERE AND SAID OUT LOUD. Leaving it costs a PowerShell call on every future launch
REM and, worse, leaves the exact artefact that caused this sitting on disk looking current. THE ONE LINE IS THE
REM ONLY EVIDENCE ANYBODY WILL EVER SEE THAT IT WAS THERE.
if "%FRESH%"=="0" (
    echo [SweK] a stale swek_superseded.flag was present and has been cleared -- treating this exit as real.
    del "%SWEK_FLAG%" >nul 2>&1
)
goto :eof
