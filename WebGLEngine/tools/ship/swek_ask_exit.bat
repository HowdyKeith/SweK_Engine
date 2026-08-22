@echo off
REM WebGLEngine\tools\ship\swek_ask_exit.bat  --  called as: call "...\swek_ask_exit.bat" [port]
REM Asks a running SweK engine to shut itself down, then waits for the port to go quiet.
REM Sets ASKED_OK=1 when the port went quiet on request; 0 when it did not (caller then reaps).
REM
REM v3251 -- ASK BEFORE KILLING, AND RECORD WHICH ONE HAPPENED.
REM
REM Keith: "i still would think we could just write a json telling the old process to close, it would happily
REM see the exit request json and exit... i dont mind terminating processes smartly."
REM
REM *** THE ASK ALREADY EXISTED AND THE LAUNCHER NEVER USED IT. *** POST /sys/exit has been routed since at
REM least v1499 and calls sysadminBridge.exitNow() -- a 250ms grace, then process.exit(0). The launcher instead
REM reaped by matching `Name='node.exe'` with a CommandLine containing 'server.js' and terminating whatever came
REM back.
REM
REM THAT MATCH IS A GUESS ABOUT IDENTITY, AND IT IS A BROAD ONE. Any node process on the box whose command line
REM mentions server.js is in scope -- another project, an editor's task runner, a second SweK folder somebody is
REM deliberately running. A shutdown the server ACKNOWLEDGES is a fact about the right process; a pattern match
REM is a hope about it.
REM
REM *** THE KILL IS STILL HERE AS A FALLBACK, BECAUSE A HUNG SERVER CANNOT ANSWER. *** What changes is that
REM killing stops being the FIRST move and stops being SILENT: when the ask works, the caller says so; when it
REM does not, the caller says that too. "It needed killing" becomes visible instead of routine -- and a box that
REM needs killing every single launch is telling you something that a taskkill nobody sees never could.

setlocal EnableDelayedExpansion
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8787"

REM Nothing listening: there is nothing to ask and nothing to kill. Say so rather than running a reap over an
REM empty box, which is where "we kill the old process that might not be running" came from.
netstat -ano | findstr /R /C:"LISTENING" | findstr /C:":%PORT% " >nul 2>&1
if errorlevel 1 (
    echo [SweK] port %PORT% is already free -- nothing to ask, nothing to reap.
    set "GONE=1"
    goto :done
)

echo [SweK] a server is listening on %PORT% -- ASKING it to exit before reaching for taskkill.
REM curl ships with Windows 10 1803+. A failure here is not fatal: we fall through to the wait, find the port
REM still held, and let the caller reap -- WHICH IS THE OLD BEHAVIOUR, reached honestly.
curl -s -m 5 -X POST "http://127.0.0.1:%PORT%/sys/exit" >nul 2>&1

REM UP TO SIX SECONDS, CHECKED EVERY SECOND. exitNow() waits 250ms and exits, so a healthy server is gone almost
REM at once; the rest of the budget is for a server mid-write. Longer would make every launch feel broken, and
REM shorter would reap a server that was about to comply.
set "GONE=0"
for /L %%i in (1,1,6) do (
    if "!GONE!"=="0" (
        timeout /t 1 /nobreak >nul 2>&1
        netstat -ano | findstr /R /C:"LISTENING" | findstr /C:":%PORT% " >nul 2>&1
        if errorlevel 1 (
            echo [SweK] it exited on request after about %%i second^(s^) -- no processes were terminated.
            set "GONE=1"
        )
    )
)

if "!GONE!"=="0" echo [SweK] it did NOT exit on request within 6s -- falling back to terminating it. That is worth noticing.

:done
REM *** EVERY endlocal IN THIS FILE IS AT THE TOP LEVEL, AND THAT IS THE POINT OF THE :done LABEL. ***
REM v3251 put `endlocal & set` inside a for/if block; a parenthesised block is parsed as ONE command, so it ran
REM mid-block and the value it handed back was unreliable. An EMPTY ASKED_OK then fell through the caller's
REM equality test and ran the taskkill -- REAPING node.exe RIGHT AFTER THE ASK HAD SUCCEEDED.
REM
REM AND MY FIRST FIX ONLY MOVED ONE OF THEM. I annotated the early-exit endlocal as "fine, it is at the top
REM level" -- IT WAS INSIDE AN if BLOCK TOO, and the gate said so while my comment said otherwise. The branches
REM set a plain flag now and jump here; the ONE endlocal happens once, unnested, where batch does what it reads
REM like.
endlocal & set "ASKED_OK=%GONE%"
goto :eof
