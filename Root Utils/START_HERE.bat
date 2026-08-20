@echo off
REM START_HERE.bat -- root entry point for the EngineProject archive.
REM v693 -- audited Excel-detection (round 199 queue work).
REM
REM Order of operations:
REM   1. Port-collision guard: if port 8787 is already bound, just open browser.
REM   2. Look for *Engine*.xlsm at root — IF Excel is installed, launch it.
REM   3. Fall back to WebGLEngine\Start_Everything.bat (Node ai-bridge).
REM
REM The v692-and-earlier version had a bug: it would launch the .xlsm even on
REM machines without Excel, then wait 20 seconds for port 8787 to bind, then
REM "open the browser anyway" against an unbound port — which just shows a
REM connection error. v693 detects Excel availability FIRST and falls through
REM to Node immediately when it's not installed. Also: if the 20s wait times
REM out (Excel IS installed but Workbook_Open never bound the port), v693
REM falls through to Node instead of opening a dead browser tab.

title EngineProject launcher
cd /d "%~dp0.."

echo === EngineProject launcher ===
echo.

REM --- 1. Port-collision guard ----------------------------------------
set PORT_BOUND=0
netstat -ano | findstr /R /C:":8787 .*LISTENING" >nul 2>&1
if not errorlevel 1 set PORT_BOUND=1

if "%PORT_BOUND%"=="1" (
    echo Port 8787 is already in use -- the engine appears to already be hosted.
    echo Opening browser to http://localhost:8787/ instead of starting a second host.
    echo.
    goto OpenBrowser
)

REM --- 2. Detect Excel installation BEFORE looking for .xlsm files ---
REM Three signals, any one is enough:
REM   a) HKLM\SOFTWARE\Classes\Excel.Application registry key (covers Office desktop)
REM   b) excel.exe in PATH (rare but possible on custom installs)
REM   c) Any version of Excel under HKLM\SOFTWARE\Microsoft\Office (16.0/17.0/etc.)
set EXCEL_INSTALLED=0
reg query "HKLM\SOFTWARE\Classes\Excel.Application" >nul 2>&1
if not errorlevel 1 set EXCEL_INSTALLED=1
if "%EXCEL_INSTALLED%"=="0" (
    where excel >nul 2>nul
    if not errorlevel 1 set EXCEL_INSTALLED=1
)
if "%EXCEL_INSTALLED%"=="0" (
    reg query "HKLM\SOFTWARE\Microsoft\Office" /s /f "Excel" /k >nul 2>&1
    if not errorlevel 1 set EXCEL_INSTALLED=1
)

REM --- 3. Look for a demo .xlsm at root, but only if Excel is installed
set DEMO_XLSM=
if "%EXCEL_INSTALLED%"=="1" (
    if exist "EngineDemo.xlsm" set DEMO_XLSM=EngineDemo.xlsm
    if not defined DEMO_XLSM (
        for %%F in (*Engine*.xlsm *Demo*.xlsm) do (
            if not defined DEMO_XLSM set DEMO_XLSM=%%F
        )
    )
)

if defined DEMO_XLSM (
    echo Found demo workbook: %DEMO_XLSM%
    echo Excel is installed -- launching workbook ^(Workbook_Open will start the host^) ...
    echo.
    start "" "%DEMO_XLSM%"
    REM Excel needs a beat to load + run Workbook_Open + bind the port
    echo Waiting up to 20s for VBA host to bind port 8787...
    set BIND_WAIT=0
    :WaitForBind
    timeout /t 1 /nobreak >nul
    set /a BIND_WAIT+=1
    netstat -ano | findstr /R /C:":8787 .*LISTENING" >nul 2>&1
    if not errorlevel 1 goto OpenBrowser
    if %BIND_WAIT% LSS 20 goto WaitForBind
    echo.
    echo Port 8787 didn't bind in 20 seconds.
    echo  - Did you click "Enable Content" on the macro trust banner?
    echo  - Is the Windows Firewall prompt waiting in the background?
    echo  - Or is this a fresh archive without macros enabled yet?
    echo.
    echo Falling through to Node ai-bridge so you don't end up on a dead URL.
    echo.
    goto LaunchNode
)

REM --- 4. Fall back to Node -------------------------------------------
if "%EXCEL_INSTALLED%"=="0" (
    echo Excel not detected on this machine -- skipping .xlsm launch.
    echo ^(EngineDemo.xlsm needs desktop Excel + macros enabled. Excel Online and the
    echo  Mac/Web versions can't run the VBA host since the host uses Win32 networking.^)
    echo.
)

:LaunchNode
if exist "WebGLEngine\Start_Everything.bat" (
    echo Launching the Node ai-bridge ^(WebGLEngine\Start_Everything.bat^)...
    echo.
    call "WebGLEngine\Start_Everything.bat"
    exit /b 0
)

echo.
echo ERROR: no demo workbook AND no WebGLEngine\Start_Everything.bat found.
echo        This .bat must live at the root of the EngineProject archive.
echo.
pause
exit /b 1

:OpenBrowser
where chrome >nul 2>nul
if errorlevel 1 (
    if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
        start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "http://localhost:8787/"
    ) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
        start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "http://localhost:8787/"
    ) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
        start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "http://localhost:8787/"
    ) else (
        start "" "http://localhost:8787/"
    )
) else (
    start "" chrome "http://localhost:8787/"
)
exit /b 0
