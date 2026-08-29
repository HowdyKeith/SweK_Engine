@echo off
REM WebGLEngine\tools\ship\swek_free_port.bat  --  called as: call "...\swek_free_port.bat" [port]
REM
REM v3097 -- ONE DEFINITION OF "FREE THE PORT" (v4134: WHICH port is now an argument).
REM
REM There were SIX copies of this job across five launchers and no two were alike. START_BUN.bat had THREE on
REM its own; START_BUN_Full.bat and run_node_full.bat had one each, differently written; START_NODE_Full.bat
REM had NONE and went straight to binding a port it never tried to clear. Five of the six sent both streams to
REM nul, one line before the server that then could not bind -- so an EADDRINUSE had its cause printed nowhere.
REM
REM Keith hit exactly that: a stale instance held the port, the KPop guard saw its listener still heartbeating
REM and correctly skipped, the engine exited instantly, and A RESTART WAS THE FASTEST WAY TO FIND OUT. Every
REM launcher now asks the same question the same way and says the answer out loud.
REM
REM NO PARENTHESISED BLOCK READS A VARIABLE SET IN THE LOOP ABOVE IT. cmd expands %vars% in a block at PARSE
REM time, so `if defined X ( echo %X% )` prints nothing -- the v2068 KPMIN bug, and the first draft of the
REM v3096 fix walked into it again. gotos throughout.
setlocal

REM v4134 -- THE PORT IS AN ARGUMENT NOW, like swek_claim_port.bat and swek_ask_exit.bat which have taken one
REM all along. This was the only one of the three that could not be told, so START_NODE_Engine.bat could honour
REM PORT for every other guard and still hand this one a hardcoded 8787 -- freeing a port nothing was about to
REM bind, while the one the server actually wanted stayed held. Four other launchers call this with NO argument
REM and must keep working, so absent still means 8787, exactly as before.
REM
REM v4135 -- AND THE MATCH IS BACK TO THE ORIGINAL SHAPE, BECAUSE v4134 CHANGED IT AND COULD NOT RUN IT.
REM v4134 also "tightened" this to findstr /C:":%PORT% " -- correct reasoning (a bare :8787 also matches
REM :87870) and the WRONG PLACE TO ACT ON IT. swek_ask_exit.bat uses that quoted form on a PLAIN command line;
REM here it sits inside for /f ('...'), where nested quotes are fragile. If the loop yields nothing, SWEK_HOLDER
REM never gets set, a genuinely held port is never freed, and the server that follows dies on EADDRINUSE --
REM which closes the launcher window and every console it started. THAT IS EXACTLY WHAT KEITH REPORTED after
REM v4134: "it opened and then all consoles closed."
REM
REM The substring concern is real and PRE-EXISTING; it is not this round's bug and it does not get fixed in a
REM file nothing on this machine can execute. Bundling untestable polish into a fix is what turned one careful
REM change into an outage. The port ARGUMENT -- the actual fix -- stays.
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8787"

set "SWEK_HOLDER="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do set "SWEK_HOLDER=%%p"
if not defined SWEK_HOLDER goto free

echo [SweK] port %PORT% is held by PID %SWEK_HOLDER% -- freeing it.
REM NOT silenced. If this cannot kill the holder, that message IS the diagnosis.
taskkill /F /PID %SWEK_HOLDER%
ping -n 4 127.0.0.1 >nul 2>nul

REM VERIFY rather than assume: a kill can report success and still leave the socket held, and the PID can die
REM and be replaced by something else binding the same port.
set "SWEK_HOLDER="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do set "SWEK_HOLDER=%%p"
if not defined SWEK_HOLDER goto free

echo.
echo ============================================================
echo  [SweK] PORT %PORT% IS STILL HELD by PID %SWEK_HOLDER%.
echo.
echo  The server is about to try to bind it and will fail. THIS
echo  is the reason -- it is not a fault in the engine.
echo.
echo    taskkill /F /PID %SWEK_HOLDER%
echo.
echo  If that will not work the holder belongs to another user or
echo  is protected, and a reboot clears it.
echo ============================================================
echo.
REM v3333 -- BOUNDED, NOT UNCONDITIONAL. Same reason as the port-owner refusal in START_NODE_Engine.bat:
REM this message is worth holding for a person and is a hang for anything unattended, and an unattended
REM launcher stuck on a keypress never reports the failure it is sitting on.
call "%~dp0swek_hold.bat" 60
endlocal
exit /b 1

:free
endlocal
exit /b 0
