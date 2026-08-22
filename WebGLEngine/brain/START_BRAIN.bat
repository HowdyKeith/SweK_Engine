@echo off
REM START_BRAIN.bat -- SweK GPU Brain v1 (Deno headless WebGPU)
REM Verified against Deno docs (June 2026): WebGPU still requires the
REM --unstable-webgpu flag. WGPU_BACKEND=vulkan pins the Pascal-friendly
REM backend (Deno 2.0.0 on Windows shipped a panic when wgpu picked the
REM GL backend -- denoland/deno #26144).
setlocal
cd /d "%~dp0"

where deno >nul 2>nul
if errorlevel 1 (
    echo [brain] Deno not found. Install with ONE of:
    echo    winget install DenoLand.Deno
    echo    irm https://deno.land/install.ps1 ^| iex
    echo then re-run this script.
    pause
    exit /b 1
)

set WGPU_BACKEND=vulkan
REM v5: split-brain roles -- set BRAIN_ROLE=fields on the nav machine and
REM BRAIN_ROLE=policy (+ BRAIN_BRIDGE=http://<nav-machine>:8787) on the other.
if "%BRAIN_ROLE%"=="" set BRAIN_ROLE=all
REM v8 knobs: BRAIN_CIVDEF_TAU (hit-prob needed to fire, default 0.35),
REM BRAIN_IPS_CAP (counterfactual weight clip, default 3, 1 disables)
if "%BRAIN_BRIDGE%"=="" set BRAIN_BRIDGE=http://127.0.0.1:8787
echo [brain] starting against %BRAIN_BRIDGE% (Ctrl+C to stop)
REM v4: --allow-read/--allow-write cover weights_attack.json persistence
deno run --unstable-webgpu --allow-net --allow-env --allow-read --allow-write brain.js
REM v2093 -- the brain used to `pause` unconditionally here, so when it EXITED
REM (sibling handshake told it to retire, a clean stop, OR a crash) the window
REM sat forever at "Press any key to continue" -- that's the "3 brain windows
REM that won't close" symptom. Now: a CLEAN exit (0) closes the window so a
REM retired sibling disappears on its own; a NON-ZERO exit pauses so a crash
REM stays readable. errorlevel is checked high-to-low (batch quirk).
if errorlevel 1 (
    echo.
    echo [brain] exited with an error ^(code %errorlevel%^) -- leaving this window open so you can read it.
    pause
)
endlocal
