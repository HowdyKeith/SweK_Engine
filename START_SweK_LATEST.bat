@echo off
REM START_SweK_LATEST.bat -- v3651
REM
REM WHY THIS EXISTS. START_NODE_Engine.bat is correct and self-locating (it does cd /d "%~dp0"),
REM but it lives INSIDE the versioned folder, so a pinned shortcut carries a "Start in" path of
REM C:\Intel\SweK_Engine_vNNNN -- and that folder stops existing the moment a new build is
REM extracted. Windows then refuses BEFORE the batch file ever runs:
REM     0x8007010b  Could not access starting directory "C:\Intel\SweK_Engine_v3649"
REM THE ERROR IS THE SHORTCUT, NOT THE LAUNCHER. Nothing inside the project can fix it, because
REM the project folder is the thing that moved.
REM
REM COPY THIS ONE FILE UP ONE LEVEL (e.g. to C:\Intel) AND PIN THAT. It sits OUTSIDE the
REM versioned folders, finds the highest-numbered SweK_Engine_v* beside it, and hands off. Then
REM the shortcut never needs touching again.

setlocal enabledelayedexpansion
cd /d "%~dp0"

set "TARGET="
set "BEST=0"
REM /o-n sorts newest-name-first, but that is a STRING sort: v3700 would lose to v380.
REM Compare the numeric tail instead, so the pick is right at every digit count.
for /d %%D in ("SweK_Engine_v*") do (
    set "NAME=%%~nxD"
    set "NUM=!NAME:SweK_Engine_v=!"
    set /a "N=!NUM!" 2>nul
    if !N! GTR !BEST! (
        if exist "%%~fD\START_NODE_Engine.bat" (
            set "BEST=!N!"
            set "TARGET=%%~fD"
        )
    )
)

if not defined TARGET (
    echo.
    echo   No SweK_Engine_v* folder with a START_NODE_Engine.bat was found beside this file.
    echo   This launcher belongs ONE LEVEL ABOVE the versioned folders, e.g.
    echo       C:\Intel\START_SweK_LATEST.bat
    echo       C:\Intel\SweK_Engine_v3651\START_NODE_Engine.bat
    echo   Current directory: %CD%
    echo.
    pause
    exit /b 1
)

echo Starting SweK_Engine_v!BEST!  ^(%TARGET%^)
cd /d "%TARGET%"
call "%TARGET%\START_NODE_Engine.bat" %*
exit /b %ERRORLEVEL%
