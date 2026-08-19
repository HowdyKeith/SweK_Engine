@echo off
cd /d "C:\VoxelEngine\ai-bridge"
echo Installing dependencies...
call npm install
echo Starting server...
set "QUIET=1"
if /I "%~1"=="verbose" ( set "VERBOSE=1" & set "QUIET=" & echo [verbose logging on] )
node server.js
pause