@echo off
REM WebGLEngine\tools\ship\swek_claim_port.bat  --  called as: call "...\swek_claim_port.bat" [port]
REM Sets PORT_OWNER=none | mine | other  and OWNER_PID=<pid> when another live launcher holds the claim.
REM
REM v3256 -- *** THE PORT HAS AN OWNER AS WELL AS A LISTENER, AND NOTHING KNEW WHICH. ***
REM
REM Keith, with two launchers up: "the new version got the request to exit and the older version thinks it is
REM supposed to keep running?" He was right. v3251 taught the launcher to ASK the server on 8787 to exit -- and
REM asking a server to exit while ANOTHER LAUNCHER IS SUPERVISING IT just tells that launcher to do its restart.
REM The polite half was built without noticing that a listener and a supervisor are different things.
REM
REM A LISTENER IS A SOCKET. AN OWNER IS THE LAUNCHER THAT INTENDS TO KEEP ONE THERE. Killing the socket does not
REM remove the intent, which is why two launchers can fight forever while each behaves correctly on its own.
REM
REM *** THE CLAIM IS VALIDATED BY PID LIVENESS, NOT BY AGE, AND THAT DISTINCTION IS THE v3250 LESSON TAKEN ONE
REM STEP FURTHER. *** A handoff FLAG is an event, so age is the right test for it. OWNERSHIP IS A STATE, and a
REM state's test is whether the thing holding it still exists. %TEMP% survives reboots, so an age-based owner
REM check would hand the port to a launcher that died last Tuesday, or refuse it to one that started a minute ago.

setlocal EnableDelayedExpansion
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8787"
set "CLAIM=%TEMP%\swek_port_%PORT%.owner"
set "RESULT=none"
set "PID="

if not exist "%CLAIM%" goto :take

REM The file holds one line: the owning launcher's PID. Read it, then ask Windows whether that process is alive.
for /f "usebackq delims=" %%A in ("%CLAIM%") do set "PID=%%A"
if "!PID!"=="" goto :take

tasklist /FI "PID eq !PID!" 2>nul | findstr /C:"!PID!" >nul 2>&1
if errorlevel 1 (
    REM *** A CLAIM FROM A DEAD PROCESS IS NOT A CLAIM, AND CLEARING IT IS SAID OUT LOUD. *** A launcher that
    REM crashed leaves its claim behind, and a silent takeover would make "the previous one died" invisible --
    REM which is exactly how the superseded flag hid a broken install for rounds.
    echo [SweK] a port claim from PID !PID! is stale -- that process is gone. Taking the port.
    goto :take
)

if "!PID!"=="%SWEK_LAUNCHER_PID%" ( set "RESULT=mine" & goto :done )
set "RESULT=other"
goto :done

:take
REM OUR OWN PID IS NOT AVAILABLE TO A BATCH FILE, so the caller passes it in SWEK_LAUNCHER_PID -- obtained once,
REM in the launcher, from the title of its own window. Writing a PID we cannot verify later would be a claim
REM nobody can check, which is worse than no claim at all.
if defined SWEK_LAUNCHER_PID (
    > "%CLAIM%" echo %SWEK_LAUNCHER_PID%
    set "RESULT=mine"
) else (
    REM NO PID MEANS NO CLAIM, AND THE LAUNCHER CARRIES ON AS IT DID BEFORE v3256. Refusing to start because a
    REM temp file could not be written would trade a rare collision for a launcher that does not launch.
    set "RESULT=none"
)

:done
endlocal & set "PORT_OWNER=%RESULT%" & set "OWNER_PID=%PID%"
goto :eof
