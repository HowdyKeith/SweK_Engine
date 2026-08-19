@echo off
REM Start_Everything.bat (root) - VoxelEngine launcher.
REM
REM ai-bridge lives in WebGLEngine\ai-bridge, not at the project root, so this
REM root launcher just delegates to WebGLEngine\Start_Everything.bat (the one
REM that actually knows the right paths + listener location). The previous root
REM version looked for "ai-bridge\server.js" at the root and silently failed.
cd /d "%~dp0.."
if not exist "WebGLEngine\Start_Everything.bat" (
    echo ERROR: WebGLEngine\Start_Everything.bat not found.
    echo        Run this from the EngineProject root folder.
    pause
    exit /b 1
)
call "WebGLEngine\Start_Everything.bat"
