@echo off
REM START_NODE_Engine.bat - the Node equivalent of START_BUN_Full.bat. Frees :8787,
REM starts the ai-bridge under NODE (no Bun), and launches the KPop Listener
REM (minimized, -NoExit). Selected automatically by the engine's restart / auto-update
REM relaunch when Settings -> Runtime -> "Use Bun on boot" is OFF.
REM
REM v2068 - three changes in this revision:
REM   1. KPop Listener now runs from the STABLE SIBLING folder (..\KPop Listener),
REM      with the bundled copy treated as the update payload: when the bundled
REM      $ScriptVersion differs from the sibling's, kpop-guard.ps1 stops the old
REM      listener and robocopies bundled -> sibling. The listener process therefore
REM      never pins an EngineProject_vNNN folder (its cwd is the sibling folder via
REM      start /D), so autoRemoveOld pruning stops failing on a live cwd.
REM   2. SAME-VERSION SKIP: on an engine auto-update relaunch, if a listener with
REM      the same $ScriptVersion is already heartbeating, we leave it alone
REM      (kpop-guard.ps1 exits 42) -- toasts/pipes flow uninterrupted through the
REM      update instead of spawning a duplicate listener.
REM   3. Deno auto-installs on first run (vendored installers\deno-install.ps1,
REM      official GitHub build, no admin) so the GPU Brain starts without a manual
REM      winget step. Install failure degrades to the old "skipped" behavior.
REM
REM v2068 also fixes a latent bug: KPMIN was set INSIDE the parenthesized if-block
REM that read %KPMIN% -- cmd expands %vars% in a block at PARSE time, so the
REM minimize flag never applied, and the sibling/legacy branches referenced KPMIN
REM without ever setting it. The flag check is now hoisted above the launch line.

cd /d "%~dp0"

if not exist "WebGLEngine\ai-bridge\server.js" (
    echo ERROR: WebGLEngine\ai-bridge\server.js not found. Run from the project root.
    pause
    exit /b 1
)

REM --- v3623: ALL THREE SURFACES IN ONE WINDOWS TERMINAL WINDOW ---------------
REM Keith asked for the engine, the GPU Brain and the KPop Listener to share ONE
REM set of tabs instead of owning three separate console windows. `wt -w swek`
REM NAMES the window, so every later tab JOINS IT rather than opening another --
REM that naming is what makes this one window instead of three tabbed ones.
REM
REM THE ENGINE RUNS IN THE FOREGROUND OF *THIS* WINDOW, so it cannot simply be
REM handed to wt: `wt` returns as soon as it hands off, and this launcher would
REM then read WT`s exit code instead of node`s -- reporting a clean success for a
REM crash, which is exactly the defect v3088 fixed. So the LAUNCHER re-invokes
REM ITSELF inside a tab and the outer window closes; inside the tab it is still
REM cmd -> node, so NODE_RC and swek_exit_report.bat are untouched.
REM
REM SKIPPED when wt is absent (Windows 10 without Terminal, Server), when already
REM inside (or it would recurse forever), and when SWEK_UNATTENDED is set -- an
REM unattended run must not open a window a person was never going to look at.
set "SWEK_WT="
where wt >nul 2>nul
if errorlevel 1 goto wt_done
if defined SWEK_UNATTENDED goto wt_done
REM *** v3739 -- ONE-TERMINAL MODE IS NOW OPT-IN, AND THE DEFAULT IS THE OLD THREE-WINDOW LAUNCH.
REM Keith: Avast does not like the single-terminal construction, and the construction is the suspicious part --
REM THIS LAUNCHER RE-INVOKES ITSELF through a spawned process (start wt.exe ... cmd /k "%~f0") and the outer
REM window then exits. A script that starts a copy of ITSELF and vanishes is the shape heuristic AV scoring
REM reads as drop-and-execute -- the same family v3658 already removed once elsewhere. THE ENGINE, THE GPU
REM BRAIN AND THE KPOP LISTENER IN THREE OWN WINDOWS INVOLVE NO SELF-RELAUNCH AT ALL.
REM
REM NOT CLAIMED: that this satisfies Avast. NOBODY HAS RUN AVAST AGAINST EITHER MODE -- there is no scanner in
REM the sandbox, so this is a change to the shape Keith identified, NOT a measured all-clear. The durable fix
REM is still CODE-SIGNING THE LAUNCHERS. If the quarantine happens again in three-window mode, THE
REM SELF-RELAUNCH WAS NOT THE CAUSE and this default should be revisited rather than defended.
REM
REM The flag is written by server.html's Boot Options (Start PC SweK with 1 Terminal). ABSENT MEANS OFF, so a
REM fresh install and every existing install get the three-window launch WITHOUT anyone touching a setting --
REM which is the point: a default that needs opting OUT of is not a default.
if not exist "WebGLEngine\ai-bridge\swek_one_terminal.flag" goto wt_done
set "SWEK_WT=1"
REM THE RECURSION GUARD IS **WT_SESSION**, WHICH TERMINAL ITSELF SETS IN EVERY PANE IT SPAWNS, and my first
REM version used a variable of my own set just before the launch. THAT WOULD HAVE LOOPED FOREVER THE SECOND
REM TIME: once the named window exists, the new tab is created by THAT ALREADY-RUNNING wt PROCESS, which
REM carries ITS OWN environment and never sees anything this script exported. A guard that rides on
REM inheritance is only a guard while the parent is the one doing the spawning.
if defined WT_SESSION goto wt_done
REM *** v3654 -- THE TRAILING-BACKSLASH QUOTING BUG, AND IT BROKE EVERY BOOT SINCE v3623.
REM %~dp0 ALWAYS ENDS IN A BACKSLASH, so `-d "%~dp0"` expands to  -d "C:\...\SweK_Engine_vNNNN\"  and the
REM BACKSLASH ESCAPES THE CLOSING QUOTE. wt.exe then reads the REST OF THE COMMAND LINE as part of the
REM directory, which is why the error names a "starting directory" with `cmd /k ...` inside it:
REM     Could not access starting directory "C:\Intel\SweK_Engine_v3653" cmd /k C:\...\START_NODE_Engine.bat"
REM The launch then fails, the outer window runs `exit /b 0` and vanishes -- "it opened and then exited".
REM ONE BUG, BOTH SYMPTOMS, AND IT IS NOT A SHORTCUT. Strip the trailing backslash before quoting.
set "SWEK_DIR=%~dp0"
if "%SWEK_DIR:~-1%"=="\" set "SWEK_DIR=%SWEK_DIR:~0,-1%"
start "" wt.exe -w swek new-tab --title "SweK Engine" -d "%SWEK_DIR%" cmd /k "%~f0"
exit /b 0
:wt_done

REM --- Node: ensure present -------------------------------------------------
where node >nul 2>nul
if not errorlevel 1 goto node_ready
echo Node not found on PATH. Installing Node via the vendored official installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "WebGLEngine\ai-bridge\installers\node-install.ps1"
set "PATH=%USERPROFILE%\.node;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
    echo Node still not found after install. Install from https://nodejs.org then re-run.
    pause
    exit /b 1
)
:node_ready

REM v3850 -- *** THE PORT GUARD RUNS BEFORE ANYTHING IS STARTED, AND IT USED TO RUN AFTER. ***
REM It sat below the KPop Listener and the GPU Brain, so the refusal path started two services and then exited,
REM and the window closing took the Listener down with it -- Keith met exactly that: "it exits, taking KPop
REM Listener down as it goes away." A GUARD THAT COSTS SOMETHING WHEN IT SAYS NO IS NOT A GUARD, it is a
REM partial boot. Deciding whether this launcher may live is now the first thing after Node is present.
REM v2303 -- reap any STALE SweK engine (a node server.js from an OLD version folder) BEFORE launching the
REM new one. Each old server pins its own WebGLEngine\ai-bridge -- that held handle is exactly why the
REM pruneOldVersions pass hit EBUSY and could not delete v2291..v2299. Nothing legit is running yet (the new
REM node starts below), so killing every SweK engine node by command line is safe -- same pattern as the
REM brain reaper above. The match is server.js (this box's node app). Temp .ps1 dodges batch quote/pipe/brace parsing.
REM v3251 -- *** ASK FIRST. *** POST /sys/exit has been routed for hundreds of versions and the launcher
REM never used it: it went straight to matching Name=node.exe with a CommandLine containing server.js and
REM terminating whatever came back. THAT MATCH IS A GUESS ABOUT IDENTITY and a broad one -- any node on the
REM box whose command line mentions server.js is in scope, including another project or a second SweK folder
REM somebody is deliberately running. A shutdown the server ACKNOWLEDGES is a fact about the right process.
REM
REM The reap below still runs when the ask fails, because A HUNG SERVER CANNOT ANSWER. What changed is that
REM killing is no longer the FIRST move and no longer SILENT.
REM v3256 -- *** WHO OWNS THE PORT, NOT JUST WHO IS LISTENING. ***
REM v3251 taught this launcher to ASK the server on 8787 to exit. With TWO launchers up that is not enough:
REM the ask kills the socket, and the OTHER launcher -- still supervising -- puts one back. A LISTENER IS A
REM SOCKET; AN OWNER IS THE LAUNCHER THAT INTENDS TO KEEP ONE THERE, and killing the socket does not remove
REM the intent. Both windows behave correctly on their own and fight forever.
REM
REM Our own PID is not a thing batch can read, so it is fetched ONCE here from the title of this window and
REM handed to the claim helper. If that fails, SWEK_LAUNCHER_PID stays empty, the helper claims nothing, and
REM the launcher behaves exactly as it did before this round -- A LAUNCHER THAT WILL NOT LAUNCH BECAUSE IT
REM COULD NOT WRITE A TEMP FILE would be a worse bug than the one being fixed.
REM A UNIQUE TITLE IS SET AND THEN SEARCHED FOR BY THAT SAME TITLE. My first version set one title and
REM searched for another (%~n0*, the script name) -- so the lookup would have matched nothing, or worse,
REM matched a DIFFERENT SweK window and claimed the port under somebody else's PID. A CLAIM UNDER THE WRONG
REM PID IS WORSE THAN NO CLAIM: it looks valid, it survives liveness checks, and it locks out the launcher
REM that actually owns the port.
set "SWEK_TITLE=SweK Launcher %RANDOM%%RANDOM%"
title %SWEK_TITLE%
set "SWEK_LAUNCHER_PID="
for /f "tokens=2 delims=," %%P in ('tasklist /FI "WINDOWTITLE eq %SWEK_TITLE%" /FO CSV /NH 2^>nul') do set "SWEK_LAUNCHER_PID=%%~P"
REM v3850 -- *** SUPERSEDE IS COMPUTED HERE NOW, BECAUSE THE GUARD BELOW IS THE THING THAT NEEDED IT. ***
REM It used to be worked out fifty lines further down, where its only job was to suppress a duplicate browser
REM tab -- so the port guard, which is the branch that DECIDES WHETHER THIS LAUNCH LIVES, never knew that the
REM running engine had ASKED for it. sysadminBridge.restart() writes swek_superseded.flag, spawns this
REM launcher and exits 900ms later; this launcher claimed the port before that exit, saw the old owner alive,
REM and refused the handover it had been invited into. THE UPDATE THEN NEVER LANDED: the old build kept the
REM port, the new window died, and it took the KPop Listener with it.
REM The age check is swek_flag_fresh.bat and NOT a fourth copy of the ninety seconds -- v3250 and v3273 are
REM both rounds spent on a reader that asked whether the flag EXISTED and not how old it was.
set "SUPERSEDE="
call "%~dp0WebGLEngine\tools\ship\swek_flag_fresh.bat"
if "%FRESH%"=="1" set "SUPERSEDE=1"
call "%~dp0WebGLEngine\tools\ship\swek_claim_port.bat" 8787
REM v3333 -- THIS REFUSAL IS CORRECT AND ITS HOLD WAS NOT. Keith met it as a window stuck on "Press any key
REM to continue . . ." after an auto-update, with nobody there to press one. The block is also un-parenthesised
REM now, per this file's own law two screens up: cmd expands %vars% in a block at PARSE time.
if not "%PORT_OWNER%"=="other" goto :port_not_owned
REM *** AN INVITED LAUNCH WAITS; AN UNINVITED ONE STILL REFUSES. *** The refusal below is correct and stays
REM correct: two launchers that both start a server take turns forever. What it must not do is refuse the ONE
REM case where the other launcher is deliberately standing down, and a fresh swek_superseded.flag is exactly
REM that statement -- written by the engine that spawned this window, seconds ago, and expiring in ninety.
if "%SUPERSEDE%"=="1" goto :port_handover
echo.
echo [SweK] ANOTHER SweK LAUNCHER ^(PID %OWNER_PID%^) ALREADY OWNS PORT 8787.
echo [SweK] Not asking its server to exit and not reaping anything: it would just start another one,
echo [SweK] and the two windows would take turns forever. Close that window first, then run this again.
echo.
call "%~dp0WebGLEngine\tools\ship\swek_hold.bat" 60
exit /b 1

:port_handover
echo.
echo [SweK] the running engine asked for this launch ^(fresh swek_superseded.flag^) and still owns 8787.
echo [SweK] Waiting for it to release the port rather than refusing a handover it started.
set "SWEK_WAITED=0"
:port_handover_loop
call "%~dp0WebGLEngine\tools\ship\swek_claim_port.bat" 8787
if not "%PORT_OWNER%"=="other" goto :port_handover_done
set /a SWEK_WAITED+=1
if %SWEK_WAITED% GEQ 45 goto :port_handover_timeout
timeout /t 1 /nobreak >nul 2>&1
goto :port_handover_loop
:port_handover_timeout
echo.
echo [SweK] waited 45s and PID %OWNER_PID% still owns 8787. REFUSING, exactly as an unasked launch would --
echo [SweK] a flag is a statement of intent and this one was not honoured. Close that window, then run this again.
call "%~dp0WebGLEngine\tools\ship\swek_hold.bat" 60
exit /b 1
:port_handover_done
echo [SweK] the previous launcher released 8787 after %SWEK_WAITED%s -- taking over.
REM THE FLAG IS CONSUMED. It stays fresh for ninety seconds and it authorises exactly ONE handover; leaving it
REM would let a third window take the port from this one on the same invitation.
del "%TEMP%\swek_superseded.flag" >nul 2>&1

:port_not_owned

call "%~dp0WebGLEngine\tools\ship\swek_ask_exit.bat" 8787
REM v3255 -- *** AN UNSET ASKED_OK IS NOT PERMISSION TO KILL. *** The helper had an endlocal inside a for
REM block, so this variable could come back EMPTY even when the ask had worked -- and an empty value fell
REM through to the reap, terminating the server that had just been started politely. The helper is fixed;
REM this line is belt and braces, because THE FAILURE DIRECTION MATTERS: skipping a reap costs one stale
REM process that the next launch asks again, while a wrong reap kills a working engine.
if not defined ASKED_OK (echo [SweK] the exit-ask helper returned nothing -- SKIPPING the reap rather than
echo         killing on an unset value. If a stale server is still holding the port, say so and it will be reaped next run.
goto :engine_reaped)
if "%ASKED_OK%"=="1" goto :engine_reaped

REM v3658 -- a REAL script on disk, not a temp file dropped and deleted. See the header of
REM WebGLEngine\ai-bridge\installers\kill-engine.ps1 for why that sequence had to go.
powershell -NoProfile -ExecutionPolicy Bypass -File "WebGLEngine\ai-bridge\installers\kill-engine.ps1" >nul 2>&1
:engine_reaped

REM --- KPop Listener --------------------------------------------------------
REM v2068 - guard + sync BEFORE choosing the run folder. kpop-guard.ps1 does, in order:
REM   (a) if bundled "KPop Listener\" version differs from sibling "..\KPop Listener\",
REM       gracefully stop any running listener (control-file 'exit', then Stop-Process
REM       on the pid it published -- the -NoExit host lingers otherwise) and refresh
REM       the sibling copy via robocopy;
REM   (b) if a listener with the SAME version as the launch target is still
REM       heartbeating, exit 42 = "skip the relaunch, it's fine";
REM   (c) if a listener with a DIFFERENT/unknown version is alive, stop it and
REM       exit 0 = "launch the new one".
REM Requires the v26.1 listener (publishes Listener_Version.txt + KPopListener.pid,
REM clears its heartbeat on exit). Against an older listener the guard still works,
REM but falls back to a window-title taskkill to clear the zombie -NoExit host.
set "KPMIN="
if exist "%TEMP%\KPopListener\kpop_minimize.flag" set "KPMIN=/MIN"
if not defined KPMIN if exist "WebGLEngine\ai-bridge\kpop_minimize.flag" set "KPMIN=/MIN"

set "KP_SKIP="
if exist "WebGLEngine\ai-bridge\installers\kpop-guard.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "WebGLEngine\ai-bridge\installers\kpop-guard.ps1"
) else (
    echo NOTE: kpop-guard.ps1 missing -- launching listener without the same-version guard.
    cmd /c exit 0
)
REM v3096 -- `if errorlevel 42` IS A THRESHOLD, NOT AN EQUALITY. cmd reads it as "exit code >= 42", so
REM ANY code of 42 or more was read as "a same-version listener is already heartbeating, leave it alone".
REM kpop-guard.ps1 only ever intends 0 or 42, but powershell.exe returns codes of its own when it cannot
REM run the script at all -- and the two are indistinguishable to a >= test. "The guard said skip" and
REM "the guard fell over" wearing one branch is the shape this tree keeps meeting.
if %ERRORLEVEL% EQU 42 set "KP_SKIP=1"
if %ERRORLEVEL% GTR 42 echo NOTE: kpop-guard returned %ERRORLEVEL%, which is not one of its two documented codes ^(0 launch / 42 skip^) -- launching the listener anyway.

if defined KP_SKIP (
    echo KPopListener already running at the same version -- leaving it alone.
    goto listener_done
)

REM Pick the run folder: sibling first (stable, survives engine version bumps),
REM then bundled, then the legacy KPopupListener name.
set "KP_DIR="
if exist "..\KPop Listener\KPopListener.ps1"  set "KP_DIR=..\KPop Listener"
if not defined KP_DIR if exist "KPop Listener\KPopListener.ps1"  set "KP_DIR=KPop Listener"
if not defined KP_DIR if exist "KPopupListener\KPopListener.ps1" set "KP_DIR=KPopupListener"

if not defined KP_DIR (
    echo NOTE: KPopListener.ps1 not found ^(sibling / bundled / legacy^) - skipping listener.
    goto listener_done
)

echo Starting KPopListener from: %KP_DIR%
REM start /D sets the child's cwd to the listener folder itself, NOT this engine
REM version folder -- so the powershell host never blocks old-folder pruning.
REM The wrapper waits for the bridge's /health before invoking the script, same as before.
REM v2194 -- end-of-script marker: with -NoExit the window ONLY closes if the PROCESS dies (a
REM foreign-thread .NET crash, taskkill, or an explicit exit). If you instead see the yellow
REM "script ENDED" line, the script returned but the host survived. Either way the crash file
REM (now written by a thread-safe compiled hook, v2194) has the real reason.
REM v3623 -- the -Command one-liner became tools\ship\swek_kpop_tab.ps1, because wt reads ";" as a
REM SUBCOMMAND SEPARATOR and that string carried five of them. A file is one token; escaping is not enough.
set "KP_PS1=%~dp0WebGLEngine\tools\ship\swek_kpop_tab.ps1"
if not defined SWEK_WT goto kpop_plain
wt.exe -w swek new-tab --title "KPop Listener" -d "%KP_DIR%" powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File "%KP_PS1%"
goto listener_done
:kpop_plain
start "KPop Listener" %KPMIN% /D "%KP_DIR%" powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File "%KP_PS1%"
:listener_done

REM --- GPU Brain (v2064; optional, needs Deno) ------------------------------
REM The brain is a POLLER by design: it retries the bridge mailbox on its
REM own, so starting it before the bridge binds is safe -- it connects the
REM moment :8787 answers. Placed BEFORE the foreground `node server.js`
REM below, because nothing after that line runs until shutdown.
REM v2068 - Deno now auto-installs on first run via the vendored installer
REM (official GitHub build -> %USERPROFILE%\.deno\bin, no admin, ~35MB one-time
REM download). The PATH prepend is required because the installer can only
REM update the USER env var, not this already-running session.
where deno >nul 2>nul
if not errorlevel 1 goto deno_ready
echo Deno not found - installing via the vendored official installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "WebGLEngine\ai-bridge\installers\deno-install.ps1"
set "PATH=%USERPROFILE%\.deno\bin;%PATH%"
where deno >nul 2>nul
if errorlevel 1 (
    echo NOTE: Deno install failed - GPU Brain skipped. Manual: winget install DenoLand.Deno
    goto brain_done
)
:deno_ready
echo Starting GPU Brain ^(Deno, own window^)...
REM v2089 -- clear any STALE brain first. On a version update the launcher used
REM to `start` a NEW brain window while the OLD brain (old code) kept polling
REM the new bridge = two windows + version skew. v2088 made the brain itself
REM notice a sibling and retire in-band; this is the belt-and-suspenders layer
REM for a wedged brain that can't self-report. Match deno by command line
REM (brain.js) so only OUR brain dies. The match runs from a temp .ps1 because
REM inline PowerShell with quotes/pipes/braces is a batch parsing footgun.
REM v3658 -- a REAL script on disk, not a temp file dropped and deleted. See the header of
REM WebGLEngine\ai-bridge\installers\kill-brain.ps1 for why that sequence had to go.
powershell -NoProfile -ExecutionPolicy Bypass -File "WebGLEngine\ai-bridge\installers\kill-brain.ps1" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq SweK GPU Brain" >nul 2>&1
REM v3623 -- joins the same named window when Terminal is available.
if not defined SWEK_WT goto brain_plain
wt.exe -w swek new-tab --title "SweK GPU Brain" -d "%~dp0WebGLEngine\brain" cmd /k "START_BRAIN.bat"
goto brain_done
:brain_plain
start "SweK GPU Brain" cmd /c "cd /d %~dp0WebGLEngine\brain && START_BRAIN.bat"
:brain_done


REM --- ai-bridge under Node ------------------------------------------------
pushd WebGLEngine\ai-bridge

if not exist "node_modules" (
    echo node_modules missing - checking for a sibling build to reuse first...
REM v3204 -- THE GLOB WAS THE OLD FOLDER PREFIX. Wrapper folders became SweK_Engine_vNNNN at v2282 and this
REM rescue still globbed EngineProject_v*, so it matched NOTHING and fell straight through to `npm install`.
REM That matters precisely when it is needed: the shipped zip STRIPS node_modules, so a fresh extract whose
REM copy-from-the-old-folder step did not happen has no deps, the ai-bridge does not bind, and BOTH the KPop
REM listener (which waits up to 120s on /health) and the GPU Brain (a poller) come up against a dead bridge.
REM A RENAME IS NOT DONE UNTIL EVERY GLOB OF THE OLD NAME IS FOUND -- buildName.js parses both prefixes and
REM its gate proves it; these two launchers were the ones nothing checked. Both names now, legacy last.
    for /d %%D in ("..\..\..\SweK_Engine_v*" "..\..\..\EngineProject_v*") do if exist "%%D\WebGLEngine\ai-bridge\node_modules\ws\package.json" if not exist "node_modules\ws\package.json" robocopy "%%D\WebGLEngine\ai-bridge\node_modules" "node_modules" /E /NFL /NDL /NJH /NJS /NC /NS /MT:8 >nul
    if not exist "node_modules\ws\package.json" (
        echo First-run: installing ai-bridge deps...
        call npm install
    )
)

REM free port 8787: kill only the PID LISTENING on :8787 (not every node.exe), then
REM settle ~3s for TIME_WAIT before re-binding. Honor the superseded flag so an
REM update relaunch doesn't pop a duplicate browser tab.
REM v3273 -- *** v3250 FIXED THIS EXACT BUG IN swek_exit_report.bat AND THIS LINE NEVER GOT CONVERTED. ***
REM It was a bare `if exist`, with no idea how old the flag was -- so a leftover from any past update made
REM EVERY later launch believe a machine had asked for it, and server.js then refused to open a tab:
REM   "[open] no browser tab after ~40s (update/restart) -- NOT opening one. A machine asked for this boot."
REM Keith double-clicked the launcher and got no page at all. THE SAME MISTAKE, IN THE FILE I DID NOT CHECK
REM WHEN I FIXED THE OTHER ONE -- and swek_flag_fresh.bat existed the whole time as the one definition.
REM v3850 -- SUPERSEDE IS ALREADY SET, up at the port guard, which is the branch that actually needed it.
REM Calling swek_flag_fresh.bat a second time here would be harmless and pointless -- and the helper CLEARS a
REM stale flag, so the one call that does the clearing should be the FIRST thing that asks, not the last.
REM v3097 -- v3096 wrote this check INLINE here. It is now shared with the other four launchers as
REM swek_free_port.bat, because two definitions of one judgement is precisely what keeps costing this
REM tree rounds. The behaviour is unchanged; the owner moved.
call "%~dp0WebGLEngine\tools\ship\swek_free_port.bat"

REM v1574 - open server.html only AFTER the bridge is actually LISTENING. node runs in the
REM foreground below, so a minimized background waiter polls /health, then opens the best LAN
REM URL + the boot-mode page (server.html). The old code opened the browser here BEFORE node
REM bound the port, so it hit a dead :8787 (connection refused) and server.html never showed.
REM Skipped on an update relaunch (SUPERSEDE) so we don't pop a duplicate tab - server.js
REM reopens server.html itself if no tab reconnects.
if not defined SUPERSEDE start "SweK opener" /MIN powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $ok=$false; for($i=0;$i -lt 60;$i++){ try{ $r=Invoke-WebRequest -Uri 'http://127.0.0.1:8787/health' -TimeoutSec 2 -UseBasicParsing; if($r.StatusCode -eq 200){$ok=$true; break} }catch{}; Start-Sleep -Milliseconds 500 }; if(-not $ok){ return }; try{$ni=Invoke-RestMethod -Uri 'http://localhost:8787/net/info' -TimeoutSec 5; $u=$ni.recommended}catch{}; if([string]::IsNullOrWhiteSpace($u)){$u='http://localhost:8787/'}; $b=$u.TrimEnd('/'); $pg='/server.html'; try{$bm=Invoke-RestMethod -Uri ($b+'/boot/mode') -TimeoutSec 4; if($bm -and $bm.url){$pg=$bm.url}}catch{}; Start-Process ($b+$pg)"
REM --- v2212: the bridge cannot start without its deps, and the window must not vanish -------
REM `node_modules` is NOT in the shipped zip. If the reuse-a-sibling loop above found nothing and
REM `npm install` did not run, `require("ws")` throws MODULE_NOT_FOUND, node exits, and this window
REM closes with the message still in it -- leaving only the GPU Brain, which is Deno and needs none of
REM this. That is exactly what "the engine exits immediately" looked like. Say so, here, before we try.
if not exist "node_modules\ws\package.json" (
    echo.
    echo ============================================================
    echo  CANNOT START: ai-bridge dependencies are missing.
    echo  node_modules is not shipped in the zip.
    echo.
    echo  Fix it from this folder:
    echo      cd WebGLEngine\ai-bridge
    echo      npm install
    echo.
    echo  No network? Copy node_modules from an older EngineProject_v* folder.
    echo ============================================================
    echo.
    pause
    popd
    exit /b 1
)

echo Starting ai-bridge under Node on http://127.0.0.1:8787/ ...
echo (server.html opens in your browser as soon as the bridge is listening...)
node server.js
set "NODE_RC=%ERRORLEVEL%"
REM v2609 -- READ THE FLAG BEFORE DELETING IT. Keith: "these are still happening on a auto-update. i am
REM pretty sure there is not error, and the only error is that the dos window did not exit without
REM pressing a key." HE IS RIGHT. This flag exists to say "the nonzero exit was an auto-update replacing
REM this instance, not a crash" -- AND THIS LINE DELETED IT ONE LINE BEFORE THE CHECK THAT NEEDED IT.
REM It is written in five places and was READ IN NONE.
REM v3088 -- was an INLINE copy of the three-way message. Extracted to swek_exit_report.bat so the
REM judgement has ONE definition; four copies is how the fifth gets it wrong.
call "%~dp0WebGLEngine\tools\ship\swek_exit_report.bat" %NODE_RC%
popd

REM v3903 -- *** THE END-OF-SCRIPT MARKER, WHICH discovery-selfcheck HAS ASKED FOR AND NOT HAD. ***
REM A launcher window that CLOSED and a launcher window that RAN TO THE END look identical after the fact,
REM and this file's own v2609 note is Keith reporting exactly that confusion: "the only error is that the
REM dos window did not exit without pressing a key". Every branch above that can leave prints WHY it left;
REM the ordinary path printed nothing at all, so "it finished" was the one outcome with no evidence.
REM The marker is the last line executed, so seeing it means every section above ran to completion.
echo [SweK] listener script ENDED (rc=%NODE_RC%) -- this line is the proof the launcher reached its end.
goto :eof
