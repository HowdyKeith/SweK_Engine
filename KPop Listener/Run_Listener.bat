@echo off
REM Run_Listener.bat -- v748 -- start the KPopListener standalone.
REM
REM Double-click this file to launch the listener without the engine.
REM Keeps a visible PowerShell window so you can see the startup log
REM (toast templates, pipe state, AppID registration) and any errors.
REM
REM Once it says "[KPopListener] Tray icon started" you're good to go.
REM A system tray icon appears (right-click for menu + Open Dashboard).
REM
REM To stop: right-click the tray icon -> Quit, OR just close this window.

REM v985: add -Verbose for the full startup log (QUIET is now the default --
REM only warnings/errors print). For clipboard auto-save, run
REM Run_Listener_ClipSaver.bat  (or add -ClipSaver to the line below).
title KPopListener (standalone)
cd /d "%~dp0"

echo === KPopListener standalone launcher ===
echo Folder: %CD%
echo.

if not exist "KPopListener.ps1" (
    echo ERROR: KPopListener.ps1 not found in this folder.
    echo This batch should live alongside KPopListener.ps1 + KPopDashboard.psm1.
    pause
    exit /b 1
)

echo Starting KPopListener.ps1...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "KPopListener.ps1"

echo.
echo === Listener exited.  Press any key to close this window. ===
pause >nul
