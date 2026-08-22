@echo off
REM ===========================================================================
REM MAKE_GMAIL_SAFE.bat - produce a Gmail-friendly .zip of this project.
REM
REM Windows counterpart to make_gmail_safe.sh. Run from the project root
REM (the folder that contains WebGLEngine\, "KPop Listener"\, etc.).
REM
REM Output: ..\EngineProject_GmailSafe_<version>.zip
REM
REM What it does:
REM   1. Reads ENGINE_VERSION from WebGLEngine\main.js for the output name.
REM   2. xcopy's the project to ..\EngineProject_GmailSafe_<ver>\
REM      (excludes node_modules, .git, prior build outputs, this script).
REM   3. Recursively renames every Gmail-blocked extension (.bat .ps1 .vbs
REM      .lnk .js .mjs etc.) to <name>.<ext>.txt via PowerShell.
REM   4. Zips the result via Compress-Archive.
REM   5. Verifies the zip contains zero blocked extensions.
REM
REM Recipient then runs _SETUP.bat to rename everything back.
REM
REM Requires: Windows 10 or newer (for built-in PowerShell + Compress-Archive).
REM ===========================================================================

setlocal EnableDelayedExpansion
title MAKE_GMAIL_SAFE
cd /d "%~dp0"
set "PROJECT_DIR=%CD%"

REM ---------- determine version from main.js (fallback to today's date) ----------
set "VERSION="
if exist "WebGLEngine\main.js" (
    for /f "tokens=*" %%V in ('powershell -NoProfile -Command "(Select-String -Path 'WebGLEngine\main.js' -Pattern 'ENGINE_VERSION\s*=\s*\"v[0-9]+\"' | Select-Object -First 1).Matches.Value -replace '.*\"(v[0-9]+)\".*','$1'"') do (
        set "VERSION=%%V"
    )
)
if "%VERSION%"=="" (
    for /f "tokens=2 delims==" %%D in ('wmic os get LocalDateTime /value 2^>nul ^| find "="') do set "VERSION=%%D"
    set "VERSION=!VERSION:~0,8!"
)

set "FOLDERNAME=EngineProject_GmailSafe_%VERSION%"
set "OUTZIP=%FOLDERNAME%.zip"
set "PARENT_DIR=%PROJECT_DIR%\.."
for %%I in ("%PARENT_DIR%") do set "PARENT_DIR=%%~fI"
set "DEST_DIR=%PARENT_DIR%\%FOLDERNAME%"
set "OUT_PATH=%PARENT_DIR%\%OUTZIP%"

echo.
echo ====================================================
echo  MAKE_GMAIL_SAFE - build Gmail-friendly archive
echo ====================================================
echo  Source   : %PROJECT_DIR%
echo  Version  : %VERSION%
echo  Output   : %OUT_PATH%
echo.

REM ---------- clean previous runs ----------
if exist "%DEST_DIR%" rmdir /s /q "%DEST_DIR%"
if exist "%OUT_PATH%" del "%OUT_PATH%"

REM ---------- [1/4] copy with xcopy, exclude unwanted ----------
echo [1/4] Copying project to %DEST_DIR%\ ...

REM xcopy /EXCLUDE takes a file listing strings; any path containing one of
REM the listed strings is excluded. Create that file in a temp location so it
REM doesn't end up in the output.
set "EXCL=%TEMP%\_make_gmail_safe_exclude.txt"
> "%EXCL%" echo \node_modules\
>> "%EXCL%" echo \.git\
>> "%EXCL%" echo .zip
>> "%EXCL%" echo MAKE_GMAIL_SAFE.bat
>> "%EXCL%" echo make_gmail_safe.sh
>> "%EXCL%" echo _SETUP.sh
>> "%EXCL%" echo .DS_Store
>> "%EXCL%" echo Thumbs.db
>> "%EXCL%" echo \EngineProject_GmailSafe_
>> "%EXCL%" echo \_EngineProject_GmailSafe_
>> "%EXCL%" echo \__pycache__\

xcopy /E /I /Q /Y /H /EXCLUDE:%EXCL% "%PROJECT_DIR%" "%DEST_DIR%\" >nul
del "%EXCL%"

for /f %%C in ('dir /s /b /a-d "%DEST_DIR%" 2^>nul ^| find /c /v ""') do set "COPIED=%%C"
echo       copied %COPIED% files.

REM ---------- [2/4] rename blocked extensions to .X.txt ----------
echo [2/4] Renaming Gmail-blocked extensions to .X.txt ...
echo       (700+ files - this takes a few seconds)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ext = @('bat','cmd','ps1','vbs','vbe','wsf','wsh','hta','lnk','exe','dll','scr','com','msi','js','mjs','jse','sct','shb','wsc');" ^
  "$n = 0;" ^
  "Get-ChildItem -LiteralPath '%DEST_DIR%' -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $ext -contains $_.Extension.TrimStart('.').ToLower() } | ForEach-Object { Rename-Item -LiteralPath $_.FullName -NewName ($_.Name + '.txt') -ErrorAction SilentlyContinue; $n++ };" ^
  "Write-Host \"      renamed $n files.\""

REM ---------- [3/4] zip ----------
echo [3/4] Creating %OUT_PATH% ...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Compress-Archive -Path '%DEST_DIR%' -DestinationPath '%OUT_PATH%' -CompressionLevel Optimal -Force"

if not exist "%OUT_PATH%" (
    echo       ERROR - zip not created!
    pause
    exit /b 1
)

for %%I in ("%OUT_PATH%") do set "ZSIZE=%%~zI"
set /a ZSIZE_MB=%ZSIZE% / 1048576
echo       created %OUTZIP% (~%ZSIZE_MB% MB).

REM ---------- [4/4] verify zip is clean ----------
echo [4/4] Verifying zip contains zero blocked extensions ...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$blocked = @('bat','cmd','ps1','vbs','vbe','wsf','wsh','hta','lnk','exe','dll','scr','com','msi','js','mjs','jse','sct','shb','wsc');" ^
  "Add-Type -AssemblyName System.IO.Compression.FileSystem;" ^
  "$zip = [System.IO.Compression.ZipFile]::OpenRead('%OUT_PATH%');" ^
  "$bad = @($zip.Entries | Where-Object { if ($_.Name -match '\.([^.]+)$') { $blocked -contains $matches[1].ToLower() } else { $false } } | ForEach-Object { $_.FullName });" ^
  "$zip.Dispose();" ^
  "if ($bad.Count) { Write-Host '      WARNING - blocked extensions still in zip:'; $bad | ForEach-Object { Write-Host (\"        \" + $_) } } else { Write-Host '      OK - clean, zero blocked extensions.' }"

REM ---------- cleanup prompt ----------
echo.
choice /M "Delete temp folder %FOLDERNAME%"
if errorlevel 2 (
    echo       kept %DEST_DIR% for inspection.
) else (
    rmdir /s /q "%DEST_DIR%"
    echo       deleted.
)

echo.
echo ====================================================
echo  DONE. Email this:
echo    %OUT_PATH%
echo ====================================================
pause
