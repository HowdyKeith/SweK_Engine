@echo off
REM run_agent.bat - run the roundhouse agent (route -> SweK gate -> escalate ->
REM trace -> replay) without typing node commands. Double-click works.
REM
REM Sits next to runLive.mjs; jumps to WebGLEngine\ so the relative imports
REM resolve, the same way build_wasm.bat cd's to its own crate folder.
REM
REM [1] needs NOTHING: no API key, no network, no npm install. Start there --
REM it exercises the real routing, escalation, tracing and replay against a
REM mock client, so if it works the only untested piece is the network call.
REM
REM [2]-[4] need an Anthropic API key:
REM   setx ANTHROPIC_API_KEY "sk-ant-..."     (new shell after setx)
REM   npm i @anthropic-ai/sdk
REM Claude API billing is SEPARATE from a claude.ai Pro/Max subscription --
REM a chat plan does not include API credits. Key + prepaid credits come from
REM the Anthropic Console. The face-count tasks are tiny, so a bench run costs
REM a trivial amount.
REM
REM WARNING: if ANTHROPIC_API_KEY is set globally, Claude Code will bill to the
REM API instead of your subscription. Prefer setting it per-shell for these
REM runs (set ANTHROPIC_API_KEY=... in one window) over setx.

title roundhouse agent
cd /d "%~dp0\..\.."

where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: node not found on PATH. Install Node.js first.
    pause
    exit /b 1
)

if not exist "tools\roundhouse\runLive.mjs" (
    echo ERROR: tools\roundhouse\runLive.mjs not found.
    echo        Run this from the copy that ships inside WebGLEngine\.
    pause
    exit /b 1
)

:menu
echo.
echo   ROUNDHOUSE AGENT
echo   ----------------
echo   The verifier is a real SweK gate, not a bigger model: a routed answer
echo   is accepted only if it matches truth the engine computes itself.
echo.
echo   [1] Dry run        no key, no network - proves the wiring
echo   [2] One task       route + trace + replay a real model call
echo   [3] Benchmark      12 tasks - REAL cheap-vs-strong savings
echo   [4] Save trace     one task, writes route-trace.json
echo   [5] Quit
echo.
set "PICK="
set /p PICK=Choose [1-5]:
if "%PICK%"=="1" goto dry
if "%PICK%"=="2" goto one
if "%PICK%"=="3" goto bench
if "%PICK%"=="4" goto trace
if "%PICK%"=="5" goto end
echo Pick 1-5.
goto menu

:keycheck
if "%ANTHROPIC_API_KEY%"=="" (
    echo.
    echo   ANTHROPIC_API_KEY is not set in this shell.
    echo   Get a key at https://console.anthropic.com and fund it with prepaid
    echo   credits ^(API billing is separate from a claude.ai subscription^).
    echo   Then, in this window:   set ANTHROPIC_API_KEY=sk-ant-...
    echo.
    echo   Option [1] needs no key - try that first.
    echo.
    pause
    goto menu
)
exit /b 0

:dry
echo.
node tools\roundhouse\runLive.mjs --dry
goto done

:one
call :keycheck
node tools\roundhouse\runLive.mjs
goto done

:bench
call :keycheck
node tools\roundhouse\runLive.mjs --bench 12
goto done

:trace
call :keycheck
node tools\roundhouse\runLive.mjs --save-trace
goto done

:done
echo.
pause
goto menu

:end
