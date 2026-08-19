@echo off
REM START_BRAIN_CPU.bat -- SweK CPU Fields Brain (Phase A)
REM
REM A brain that solves the flow field on the CPU (exact Dijkstra) and
REM needs NO GPU. Run it on a box with no usable GPU, or alongside a GPU
REM brain to ABSORB the low-priority navigation work so the GPU is freed
REM for policy / high-value solving. It joins the same fleet scoreboard
REM (/ai/brain/fleet) and self-identifies as a CPU backend.
REM
REM Deno is still the runtime (same code path as the GPU brain), but NO
REM --unstable-webgpu / WGPU_BACKEND is needed -- there is no GPU to pin.
setlocal
cd /d "%~dp0"

where deno >nul 2>nul
if errorlevel 1 (
    echo [brain-cpu] Deno not found. Install with ONE of:
    echo    winget install DenoLand.Deno
    echo    irm https://deno.land/install.ps1 ^| iex
    echo then re-run this script.
    pause
    exit /b 1
)

REM CPU backend forces fields-only (policy is a GPU MLP). Override the
REM bridge to point at the machine hosting the engine + GPU brain, e.g.:
REM   set BRAIN_BRIDGE=http://192.168.10.57:8787
set BRAIN_BACKEND=cpu
if "%BRAIN_BRIDGE%"=="" set BRAIN_BRIDGE=http://127.0.0.1:8787
echo [brain-cpu] CPU fields brain starting against %BRAIN_BRIDGE% (Ctrl+C to stop)
deno run --allow-net --allow-env --allow-read --allow-write brain.js
REM v2093 -- close on clean exit (retired sibling), pause only on a crash
REM so the window does not linger at "Press any key" after the brain exits.
if errorlevel 1 (
    echo.
    echo [brain-cpu] exited with an error ^(code %errorlevel%^) -- window left open.
    pause
)
