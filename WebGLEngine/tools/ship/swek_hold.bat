@echo off
REM WebGLEngine\tools\ship\swek_hold.bat  --  called as: call "...\swek_hold.bat" <seconds>
REM
REM v3333 -- ONE DEFINITION OF "HOLD THIS WINDOW SO A PERSON CAN READ IT".
REM
REM Keith hit this: an auto-update left a window sitting on "Press any key to continue . . ." forever. The
REM message it was holding was CORRECT -- another launcher already owned port 8787 and this one refused to
REM fight it -- and the refusal is exactly right. The bug is that `pause` waits for a human who is not there.
REM
REM *** A HOLD FOR A READER AND A HOLD FOR A SCRIPT ARE TWO DIFFERENT THINGS WEARING ONE `pause`. *** For a
REM person the hold is the whole point: a window that closes before the message is read is the black-screen-
REM without-a-reason failure. For anything unattended the same line is a hang, and a hang is worse than a
REM failure because nothing downstream ever learns the outcome -- the parent waits on a process that will
REM never exit, so it cannot even report that the launch did not happen.
REM
REM SO THE HOLD IS BOUNDED RATHER THAN REMOVED. A person still reads it and can press a key to skip; an
REM unattended run closes on its own and the caller still gets its exit code. Removing the hold outright
REM would have traded Keith's hang for the failure the hold was added to prevent.
REM
REM `timeout` FAILS WHEN STDIN IS REDIRECTED ("Input redirection is not supported"), and that failure is
REM ITSELF THE ANSWER: redirected stdin means nobody is watching, so falling straight through is correct
REM rather than something to work around. SWEK_UNATTENDED=1 skips the wait outright for a caller that
REM already knows.
setlocal
set "SECS=%~1"
if "%SECS%"=="" set "SECS=60"
if defined SWEK_UNATTENDED goto :done
echo [SweK] holding this window for %SECS%s so it can be read -- press a key to close it now.
timeout /t %SECS%
:done
endlocal
goto :eof
