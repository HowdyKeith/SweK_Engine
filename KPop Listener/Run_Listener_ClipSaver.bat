@echo off
REM Run_Listener_ClipSaver.bat -- v985 -- start the listener WITH ClipSaver.
REM
REM Same as Run_Listener.bat, but also launches the clipboard auto-saver in its
REM own window. Copy code with a header comment like:
REM     # File: MyModule.psm1        (or)   # Path: v42\MyModule.psm1
REM and it auto-saves + version-tracks it (Modules\ for .psm1), backing up any
REM existing copy. Watch the ClipSaver window for "Saved:" confirmations.
REM
REM Set a custom destination by editing the line below (-ClipSaverFolder "..."),
REM or set the VOXEL_CLIPSAVE_DIR env var. Add -Verbose for the full debug stream.

title KPopListener + ClipSaver
cd /d "%~dp0"

if not exist "KPopListener.ps1" (
    echo ERROR: KPopListener.ps1 not found in this folder.
    pause
    exit /b 1
)

echo Starting KPopListener.ps1 with ClipSaver...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "KPopListener.ps1" -ClipSaver

echo.
echo === Listener exited.  Press any key to close this window. ===
pause >nul
