@echo off
REM Run_Listener_TTS.bat -- v987 -- start the listener WITH the TTS voice picker.
REM
REM Opens KPopupTTS.ps1 (interactive voice explorer) in its own window. Preview
REM the installed Windows voices, pick one, and it writes SelectedVoice.json --
REM the listener hot-swaps to your pick as the speaking voice, no restart needed.
REM Add -Verbose for the full startup log. Combine with ClipSaver via -ClipSaver.

title KPopListener + TTS picker
cd /d "%~dp0"
if not exist "KPopListener.ps1" ( echo ERROR: KPopListener.ps1 not found. & pause & exit /b 1 )
echo Starting KPopListener.ps1 with the TTS voice picker...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "KPopListener.ps1" -TTS -Greet
echo.
echo === Listener exited.  Press any key to close this window. ===
pause >nul
