@echo off
REM Run_Listener_Full.bat -- v987 -- listener + ClipSaver + TTS picker, all on.
REM
REM ClipSaver: copy code with a "# File:" / "# Path: vNN\name.ext" header and it
REM auto-saves + version-tracks it. TTS: pick a voice; it hot-swaps the voice the
REM listener speaks with. Each helper opens in its own window.

title KPopListener (full: ClipSaver + TTS)
cd /d "%~dp0"
if not exist "KPopListener.ps1" ( echo ERROR: KPopListener.ps1 not found. & pause & exit /b 1 )
echo Starting KPopListener.ps1 -ClipSaver -TTS ...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "KPopListener.ps1" -ClipSaver -TTS -Greet
echo.
echo === Listener exited.  Press any key to close this window. ===
pause >nul
