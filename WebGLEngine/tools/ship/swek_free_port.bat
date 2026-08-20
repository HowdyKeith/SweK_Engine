@echo off
REM WebGLEngine\tools\ship\swek_free_port.bat  --  called as: call "...\swek_free_port.bat"
REM
REM v3097 -- ONE DEFINITION OF "FREE PORT 8787".
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

set "SWEK_HOLDER="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :8787 ^| findstr LISTENING') do set "SWEK_HOLDER=%%p"
if not defined SWEK_HOLDER goto free

echo [SweK] port 8787 is held by PID %SWEK_HOLDER% -- freeing it.
REM NOT silenced. If this cannot kill the holder, that message IS the diagnosis.
taskkill /F /PID %SWEK_HOLDER%
ping -n 4 127.0.0.1 >nul 2>nul

REM VERIFY rather than assume: a kill can report success and still leave the socket held, and the PID can die
REM and be replaced by something else binding the same port.
set "SWEK_HOLDER="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :8787 ^| findstr LISTENING') do set "SWEK_HOLDER=%%p"
if not defined SWEK_HOLDER goto free

echo.
echo ============================================================
echo  [SweK] PORT 8787 IS STILL HELD by PID %SWEK_HOLDER%.
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
