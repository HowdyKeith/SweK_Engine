@echo off
REM ===========================================================================
REM  _SETUP.bat — VoxelEngine post-extract one-time setup.
REM
REM  Why this exists: Gmail (and many other mail providers) refuse attachments
REM  that contain .bat / .ps1 / .vbs / .lnk files inside ZIPs because those
REM  extensions are commonly used by malware. So the engine archive ships those
REM  files with a ".txt" suffix appended (e.g. Start_Everything.bat.txt). This
REM  one script renames them all back and strips Windows' Mark-of-the-Web flag
REM  from each file so they can run.
REM
REM  After this runs ONCE, you can launch the engine normally:
REM    - Double-click Start_Voxel_Engine_with_Node.lnk, or
REM    - Run Start_Everything.bat
REM ===========================================================================

setlocal EnableDelayedExpansion
title VoxelEngine setup
cd /d "%~dp0"

echo.
echo =====================================================
echo   VoxelEngine — one-time post-extract setup
echo =====================================================
echo.
echo Working dir: %CD%
echo.

REM ---------- 1. Restore email-safe ".X.txt" files to ".X" -----------------
echo [1/3] Renaming email-safe files back to executable extensions...
echo.

set RENAMED=0
for %%E in (bat cmd ps1 vbs vbe wsf wsh hta lnk exe dll scr com msi js mjs) do (
    for /R %%F in (*.%%E.txt) do (
        ren "%%F" "%%~nF"
        set /a RENAMED+=1
    )
)
REM (TaskerBridge/server.js plus 700+ other .js files in the engine are now
REM  handled by the .js / .mjs entries in the loop above.)

echo   Renamed %RENAMED% files.
echo.

REM ---------- 2. Strip Mark-of-the-Web from downloaded files ---------------
REM Windows tags any file extracted from a ZIP that came from the internet
REM with an alternate-data-stream "Zone.Identifier" — PowerShell refuses to
REM run scripts that have this flag. Unblock-File removes the flag.
echo [2/3] Stripping Mark-of-the-Web (Zone.Identifier) from all files...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Get-ChildItem -Path '.' -Recurse -File | Unblock-File -ErrorAction SilentlyContinue; Write-Host '  Done.'"
echo.

REM ---------- 3. Done ------------------------------------------------------
echo [3/3] Setup complete.
echo.
echo You can now launch the engine by:
echo   - Double-clicking "Root Utils\Start_Voxel_Engine_with_Node.lnk", OR
echo   - Running "Root Utils\Start_Everything.bat"
echo.
echo This _SETUP.bat is not needed again — feel free to delete it.
echo.
pause
