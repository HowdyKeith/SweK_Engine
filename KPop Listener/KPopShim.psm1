# =====================================================================
# Module: KPopShim.psm1
# Version: 1.0
# Purpose: Fills in the four functions that KPopListener v26.0 PA8
#          references but no bundled module defines:
#
#              Start-PipeListener       — pipe server (sync runspace)
#              Start-PipeListenerAsync  — pipe server (event/raise mode)
#              Start-FileWatcher        — JSON drop-folder fallback
#              Process-Message          — drain queue, emit toast
#
#          v26 represents a refactor-in-progress that moved pipe
#          handling out of the inline Start-Job (v9.3 had this) into a
#          module that wasn't completed. The main loop's
#              if (Get-Command Start-PipeListener) { ... }
#          guards mean the calls fail silently and no toasts arrive
#          from the engine. This module restores the wiring while
#          leaving all of v26's other improvements (tray icon,
#          dashboard, AppID, protocol registration, RaiseEventMode
#          toggle, RawStream toggle) untouched.
#
# Compatibility: PS 5.1 + PS 7+
#
# Architecture:
#
#   • Pipe runspace shares $global:MessageQueue (ConcurrentQueue) with
#     the main loop. Pipe server reads incoming JSON, enqueues raw
#     strings; main loop dequeues and calls Process-Message which
#     parses + emits.
#   • File watcher uses FileSystemWatcher on $TempDir scanning for
#     *Request*.json drops. Same enqueue path.
#   • Toast emission tries BurntToast first (richest), falls back to
#     WinRT direct, then console.
# =====================================================================

Set-StrictMode -Version Latest

# =====================================================================
# Module state
# =====================================================================

$Script:PipeRunspace   = $null
$Script:PipePowerShell = $null
$Script:PipeHandle     = $null
$Script:FileWatcher    = $null
$Script:SentinelTimer  = $null    # Round 97 — Listener_Alive.txt heartbeat

# PATCH-S1b -- state for the tracked pipe workers. Initialized at module
# scope because Set-StrictMode -Version Latest (above) makes reading a
# never-assigned variable a TERMINATING error, and Stop-KPopPipeWorkers
# reads all four on the very first Start-PipeListener call (its entry
# cleanup runs before anything has been assigned).
$Script:PipeCtl         = $null
$Script:AliasJob        = $null
$Script:PrimaryPipeName = $null
$Script:AliasPipeName   = $null

# =====================================================================
# Round 97 — Start-KPopShimSentinel  (Listener_Alive.txt writer)
# =====================================================================
# The VoxelEngine ai-bridge's /kpop/status endpoint polls
# $env:TEMP\KPopListener\Listener_Alive.txt and reports running:true
# if the file's mtime is within the last 10 seconds. v9.3 wrote this
# from its main loop; v26 doesn't write it anywhere. Without this
# heartbeat the engine UI shows the bridge as offline even when v26
# is actively up and processing toasts.
#
# Implementation: System.Timers.Timer touches the file every 5
# seconds. Also writes once at module load so the engine sees us
# immediately, no 5-second wait on startup. Timer is auto-reset and
# stored at module scope; the listener cleans up implicitly when the
# PowerShell process exits.
# =====================================================================
function Start-KPopShimSentinel {
    $sentinelDir  = Join-Path $env:TEMP "KPopListener"
    $sentinelPath = Join-Path $sentinelDir "Listener_Alive.txt"
    if (-not (Test-Path $sentinelDir)) {
        New-Item -ItemType Directory -Path $sentinelDir -Force | Out-Null
    }
    # Immediate touch so the bridge sees us right away
    try { (Get-Date).ToString("o") | Out-File $sentinelPath -Force -Encoding UTF8 } catch {}

    $timer = New-Object System.Timers.Timer
    $timer.Interval = 5000
    $timer.AutoReset = $true
    Register-ObjectEvent -InputObject $timer -EventName Elapsed `
        -SourceIdentifier "KPopShimSentinelTick" -Action {
        try {
            $p = Join-Path $env:TEMP "KPopListener\Listener_Alive.txt"
            (Get-Date).ToString("o") | Out-File $p -Force -Encoding UTF8
        } catch {}
    } | Out-Null
    $timer.Start()
    return $timer
}

# =====================================================================
# Start-PipeListener  (sync runspace)
# =====================================================================
# Opens a NamedPipeServerStream in a background runspace. Each accepted
# connection reads the full incoming payload via ReadToEnd() and
# enqueues the raw JSON string onto $global:MessageQueue. The runspace
# loops forever; one connection at a time but accepts are immediate
# back-to-back, which is plenty for toast-rate traffic from the engine.
#
# Returns a handle the caller can store at $global:PipeHandle for
# cleanup. Runspace state is also tracked in this module ($Script:*)
# in case the caller forgets.
#
# Parameters:
#   -PipeName       Pipe name (without \\.\pipe\ prefix)
#   -UseRawStream   Currently a no-op — v9.3-style raw read works for
#                   both modes. Reserved for future framed-protocol
#                   support, which we'd switch on here.
# =====================================================================
# ---- PATCH-S1 helpers -----------------------------------------------------
# Connects briefly to a named pipe to unblock a server thread parked in
# WaitForConnection. Stop-Job / PowerShell.Stop() cannot interrupt that
# native wait; a zero-byte client connect completes it, the loop then sees
# the Stop flag and exits cleanly.
function Send-PipePoke {
    param([string]$Name)
    if (-not $Name) { return }
    $c = $null
    try {
        $c = [System.IO.Pipes.NamedPipeClientStream]::new(".", $Name, [System.IO.Pipes.PipeDirection]::Out)
        $c.Connect(250)
    } catch {} finally {
        if ($c) { try { $c.Dispose() } catch {} }
    }
}

# True while the primary pipe runspace is actually running. Lets the main
# script's Apply-DashboardSettings skip a restart when nothing changed but
# still rebuild after the shim's restart_pipes tears the listener down.
function Test-PipeListenerLive {
    if (-not $Script:PipePowerShell) { return $false }
    try { return ($Script:PipePowerShell.InvocationStateInfo.State -eq 'Running') } catch { return $false }
}

# Single teardown path for BOTH workers. PATCH-S1: the old cleanup disposed
# only the primary runspace; the alias ThreadJob was never remembered, so
# every restart stranded a thread blocked in WaitForConnection holding a
# duplicate pipe handle. Now: raise the shared Stop flag, stop the job,
# poke both pipes to unblock their waits, then dispose everything.
function Stop-KPopPipeWorkers {
    if ($Script:PipeCtl) { try { $Script:PipeCtl.Stop = $true } catch {} }

    if ($Script:AliasJob) {
        try { Stop-Job -Job $Script:AliasJob -ErrorAction SilentlyContinue } catch {}
        Send-PipePoke $Script:AliasPipeName
        try { Remove-Job -Job $Script:AliasJob -Force -ErrorAction SilentlyContinue } catch {}
        $Script:AliasJob = $null
    }

    if ($Script:PipePowerShell) {
        try { $Script:PipePowerShell.Stop() } catch {}
        Send-PipePoke $Script:PrimaryPipeName
        try { $Script:PipePowerShell.Dispose() } catch {}
    }
    if ($Script:PipeRunspace) {
        try { $Script:PipeRunspace.Close()   } catch {}
        try { $Script:PipeRunspace.Dispose() } catch {}
    }
    $Script:PipePowerShell  = $null
    $Script:PipeRunspace    = $null
    $Script:PipeHandle      = $null
    $Script:PipeCtl         = $null
    $Script:PrimaryPipeName = $null
    $Script:AliasPipeName   = $null
}
# ---------------------------------------------------------------------------

function Start-PipeListener {
    param(
        [Parameter(Mandatory)][string]$PipeName,
        [bool]$UseRawStream = $true
    )

    # Already running? Clean up BOTH workers first (PATCH-S1: previously only
    # the primary runspace was disposed; the alias ThreadJob leaked).
    Stop-KPopPipeWorkers

    # v26 derives the pipe name from PID ("KPopListenerPipe_<PID>") so
    # we honor that name as an alias. But the engine bridge / v9.3
    # senders write to the stable "KPopListenerPipe" (no PID), and we
    # want them to reach the listener without needing PID discovery.
    # Round 97 -- canonical name is PRIMARY (blocking in the runspace),
    # PID-suffixed name is the ThreadJob alias, so PS 5.1 (no ThreadJob)
    # always binds the name that matters.
    $primaryName = "KPopListenerPipe"
    $aliasName   = $PipeName        # whatever caller passed (likely PID-suffixed)
    $startAlias  = ($primaryName -ne $aliasName)

    if (-not (Test-Path variable:global:MessageQueue) -or -not $global:MessageQueue) {   # PATCH-S1b: StrictMode-safe existence check
        $global:MessageQueue = [System.Collections.Concurrent.ConcurrentQueue[object]]::new()
    }

    # PATCH-S1: shared cooperative-stop flag; both workers watch it. After a
    # Send-PipePoke unblocks WaitForConnection, the loop re-checks this and
    # exits instead of re-listening forever.
    $ctl = [hashtable]::Synchronized(@{ Stop = $false })

    # One source of truth for the accept-read-enqueue loop. Kept as TEXT and
    # rebuilt with [scriptblock]::Create in each worker, because a scriptblock
    # object is affine to the runspace that created it.
    $loopText = @'
param($Name, $Queue, $Ctl)
while (-not $Ctl.Stop) {
    $pipe   = $null
    $reader = $null
    try {
        $pipe = [System.IO.Pipes.NamedPipeServerStream]::new(
            $Name,
            [System.IO.Pipes.PipeDirection]::In,
            10,
            [System.IO.Pipes.PipeTransmissionMode]::Byte,
            [System.IO.Pipes.PipeOptions]::None,
            8192, 8192)
        $pipe.WaitForConnection()
        if ($Ctl.Stop) { break }

        $reader = [System.IO.StreamReader]::new($pipe)
        $json   = $reader.ReadToEnd()

        if (-not [string]::IsNullOrWhiteSpace($json)) {
            $Queue.Enqueue($json)
        }
    } catch {
        if ($Ctl.Stop) { break }
        Start-Sleep -Milliseconds 200
    } finally {
        if ($reader) { try { $reader.Close()    } catch {} }
        if ($pipe)   {
            try { if ($pipe.IsConnected) { $pipe.Disconnect() } } catch {}
            try { $pipe.Dispose() } catch {}
        }
    }
}
'@

    # PATCH-S1: alias worker is started HERE at function scope (was inside the
    # runspace script, where the job object could never be captured, tracked,
    # or stopped). PS 5.1 without ThreadJob skips the alias exactly as before.
    if ($startAlias) {
        if ($null -ne (Get-Command Start-ThreadJob -ErrorAction SilentlyContinue)) {
            try {
                $Script:AliasJob = Start-ThreadJob -ScriptBlock ([scriptblock]::Create($loopText)) `
                    -ArgumentList $aliasName, $global:MessageQueue, $ctl
            } catch {
                $Script:AliasJob = $null
                # alias skipped -- engine bridge users are unaffected (they
                # target the canonical primary name).
            }
        }
    }

    # Primary listener in a dedicated runspace (blocks it forever -- fine).
    $rs = [runspacefactory]::CreateRunspace()
    $rs.ApartmentState = "STA"
    $rs.ThreadOptions  = "ReuseThread"
    $rs.Open()
    $rs.SessionStateProxy.SetVariable("MQueue",      $global:MessageQueue)
    $rs.SessionStateProxy.SetVariable("PrimaryName", $primaryName)
    $rs.SessionStateProxy.SetVariable("LoopText",    $loopText)
    $rs.SessionStateProxy.SetVariable("Ctl",         $ctl)

    $ps = [powershell]::Create()
    $ps.Runspace = $rs
    $null = $ps.AddScript({
        $loopBody = [scriptblock]::Create($LoopText)
        & $loopBody $PrimaryName $MQueue $Ctl
    })

    $handle = $ps.BeginInvoke()

    $Script:PipeRunspace    = $rs
    $Script:PipePowerShell  = $ps
    $Script:PipeHandle      = $handle
    $Script:PipeCtl         = $ctl
    $Script:PrimaryPipeName = $primaryName
    $Script:AliasPipeName   = $(if ($startAlias) { $aliasName } else { $null })

    return [pscustomobject]@{
        Runspace    = $rs
        PowerShell  = $ps
        Handle      = $handle
        PipeName    = $primaryName
        AliasName   = $Script:AliasPipeName
        Mode        = "Sync"
    }
}

# =====================================================================
# Start-PipeListenerAsync  (event-mode wrapper)
# =====================================================================
# v26's main script picks this branch when $global:RaiseEventMode is
# true. The .NET NamedPipeServerStream BeginWaitForConnection /
# EndWaitForConnection async pattern works, but in practice the
# blocking-read-in-a-runspace approach has been more reliable and
# the user-visible behavior is identical. So this wraps the same
# implementation and just labels it Async for the dashboard's
# state display.
# =====================================================================
function Start-PipeListenerAsync {
    param(
        [Parameter(Mandatory)][string]$PipeName,
        [bool]$UseRawStream = $true
    )
    $h = Start-PipeListener -PipeName $PipeName -UseRawStream $UseRawStream
    $h.Mode = "Async"
    return $h
}

# =====================================================================
# Start-FileWatcher  (drop-folder fallback)
# =====================================================================
# Watches $TempDir for *Request*.json file drops. This is the fallback
# transport from senders that can't reach the pipe (e.g. VBA writing
# from a sandboxed process). Enqueues parsed JSON onto the same queue
# the pipe uses, so Process-Message handles both uniformly.
#
# Returns the watcher object for the caller to track.
# =====================================================================
function Start-FileWatcher {
    param(
        [string]$Path = $null,
        [string]$Filter = "*Request*.json"
    )

    if (-not $Path) {
        # v26 sets $TempDir at module/script scope to $env:TEMP\KPopListener.
        # Pick it up if present, else fall back to TEMP.
        if (Test-Path Variable:Script:TempDir) {
            $Path = $Script:TempDir
        } else {
            $Path = Join-Path $env:TEMP "KPopListener"
        }
    }
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }

    if (-not $global:MessageQueue) {
        $global:MessageQueue = [System.Collections.Concurrent.ConcurrentQueue[object]]::new()
    }

    $fsw = New-Object System.IO.FileSystemWatcher
    $fsw.Path                  = $Path
    $fsw.Filter                = $Filter
    $fsw.IncludeSubdirectories = $false
    $fsw.NotifyFilter          = [System.IO.NotifyFilters]::FileName -bor [System.IO.NotifyFilters]::LastWrite
    $fsw.EnableRaisingEvents   = $true

    # Capture the queue via a closure-friendly variable so the action
    # block doesn't need to fish it out of $global at fire time.
    $mq = $global:MessageQueue
    $action = {
        param($source, $eventArgs)
        try {
            # Small delay — the file may not be fully written when the
            # Created event fires. 50ms is fine for tiny JSON drops.
            Start-Sleep -Milliseconds 50
            $f = $eventArgs.FullPath
            if (Test-Path $f) {
                $json = Get-Content $f -Raw -ErrorAction Stop
                if (-not [string]::IsNullOrWhiteSpace($json)) {
                    $Event.MessageData.Enqueue($json)
                }
                Remove-Item $f -Force -ErrorAction SilentlyContinue
            }
        } catch {
            # Silent — the next watchdog tick will retry if the file is
            # still there. Spamming errors here is worse than missing
            # the occasional drop.
        }
    }

    Register-ObjectEvent -InputObject $fsw -EventName "Created" -Action $action -MessageData $mq | Out-Null
    Register-ObjectEvent -InputObject $fsw -EventName "Changed" -Action $action -MessageData $mq | Out-Null

    $Script:FileWatcher = $fsw
    return $fsw
}

# =====================================================================
# Process-Message  (dequeue → parse → emit)
# =====================================================================
# Called by the main loop on every queue dequeue. The $msg can be:
#   • a JSON string (from the pipe listener or file watcher), OR
#   • a hashtable / PSCustomObject (from in-process callers)
# Tolerates both.
#
# Recognized fields (all optional except Title for a normal toast):
#   Command   "STOP" → graceful shutdown; sets $global:IsRunning=$false
#   Title     toast title
#   Message   toast body
#   ToastType "Info" | "Success" | "Warning" | "Error" (affects sound)
#   Progress  -1 = no bar, 0..100 = progress
#
# Extra fields pass through to Send-RealToast unchanged — future
# versions can extend (HeroImage, Button1Text, etc.) without modifying
# this function.
# =====================================================================
function Process-Message {
    param($msg)

    if ($null -eq $msg) { return }

    # Normalize input → hashtable-like object
    $data = $null
    try {
        if ($msg -is [string]) {
            if ([string]::IsNullOrWhiteSpace($msg)) { return }
            $data = $msg | ConvertFrom-Json -ErrorAction Stop
        } elseif ($msg -is [hashtable] -or $msg -is [pscustomobject]) {
            $data = $msg
        } else {
            # Unknown type — try ToString and parse
            $data = "$msg" | ConvertFrom-Json -ErrorAction Stop
        }
    } catch {
        if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
            Write-Log "Process-Message: bad JSON ($_)" "ERROR"
        } else {
            Write-Host "Process-Message: bad JSON ($_)" -ForegroundColor Red
        }
        return
    }
    if (-not $data) { return }

    # v1230 — engine authority: if the engine has disabled the listener, go dormant
    # (still alive for heartbeat/policy polling, but process nothing).
    if ($global:KPopEnabled -eq $false) { return }

    # STOP command
    $cmd = $null
    try { $cmd = [string]$data.Command } catch {}
    if ($cmd -and $cmd.ToUpper() -eq "STOP") {
        if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
            Write-Log "Process-Message: STOP command received" "INFO"
        }
        $global:IsRunning = $false
        return
    }

    # Round 100 — Speech payload. Bridge POSTs to /kpop/speak with a
    # payload that has top-level Voice + Text but no Title. Detect and
    # route to Speak-Voiced. If Title is ALSO present (combined toast +
    # speech), we'll speak now and continue to the toast path below.
    $voice = $null
    $speechText = $null
    try { if ($data.Voice) { $voice = [string]$data.Voice } } catch {}
    try { if ($data.Text)  { $speechText = [string]$data.Text } } catch {}
    if ($voice -and $speechText) {
        # v1230 — when the engine asks for quiet (e.g. it's busy / lagging), skip the
        # spoken audio but still process the rest (toast/stats) so nothing is lost.
        if (-not ($global:KPopQuiet -eq $true)) { Speak-Voiced -Voice $voice -Text $speechText }
        # If no Title, this was a pure speech payload — done
        $hasTitle = $false
        try { if ($data.Title) { $hasTitle = $true } } catch {}
        if (-not $hasTitle) {
            try {
                if ($global:Stats) {
                    $global:Stats.TotalToasts = ([int]$global:Stats.TotalToasts) + 1
                }
            } catch {}
            return
        }
    }

    # Field extraction with safe defaults
    $title    = $null
    $message  = ""
    $tType    = "Info"
    $progress = -1
    try { if ($data.Title)     { $title    = [string]$data.Title }    } catch {}
    try { if ($data.Message)   { $message  = [string]$data.Message }  } catch {}
    try { if ($data.ToastType) { $tType    = [string]$data.ToastType }} catch {}
    try {
        if ($null -ne $data.Progress) {
            $p = [int]$data.Progress
            if ($p -ge -1 -and $p -le 100) { $progress = $p }
        }
    } catch {}

    if (-not $title) { $title = "Notification" }

    # Emit. Send-RealToast is the actual emission path — v26's
    # KPopCommon.Send-Toast is stubbed to a stats counter so we don't
    # route through that.
    Send-RealToast -Title $title -Message $message -ToastType $tType -Progress $progress

    # Stats bookkeeping (mirror what v9.3 tracked)
    try {
        if ($global:Stats) {
            $global:Stats.TotalToasts    = ([int]$global:Stats.TotalToasts) + 1
            $global:Stats.PipeToasts     = ([int]$global:Stats.PipeToasts)  + 1
            $global:Stats.LastToastTitle = $title
            $global:Stats.LastToastTime  = Get-Date
        }
    } catch {}

    if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
        Write-Log "Toast emitted: $title [$tType]" "INFO"
    }
}

# =====================================================================
# Send-RealToast  (actual emission)
# =====================================================================
# Picks the best available engine in order: BurntToast → WinRT → console.
# Sound for the four ToastType values uses the standard WinRT mappings;
# BurntToast translates the same names.
# =====================================================================
function Send-RealToast {
    param(
        [string]$Title    = "KPop Pop!",
        [string]$Message  = "",
        [string]$ToastType = "Info",
        [int]$Progress    = -1
    )

    # Sound mapping shared by both engines
    $soundUri = switch ($ToastType.ToLower()) {
        "success" { "ms-winsoundevent:Notification.IM" }
        "warning" { "ms-winsoundevent:Notification.Reminder" }
        "error"   { "ms-winsoundevent:Notification.Reminder" }
        default   { "ms-winsoundevent:Notification.Default" }
    }

    # --- Try BurntToast first ----------------------------------------
    if ($global:BurntToastAvailable) {
        try {
            Import-Module BurntToast -ErrorAction Stop
            if ($Progress -ge 0) {
                $bar = New-BTProgressBar -Status "Working" -Value ([math]::Round($Progress / 100.0, 2))
                New-BurntToastNotification -Text $Title, $Message -ProgressBar $bar | Out-Null
            } else {
                New-BurntToastNotification -Text $Title, $Message | Out-Null
            }
            return
        } catch {
            # Fall through to WinRT
        }
    }

    # --- WinRT direct ------------------------------------------------
    if ($global:WinRTAvailable) {
        try {
            $xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
            $progressXml = ""
            if ($Progress -ge 0) {
                $val = [math]::Round($Progress / 100.0, 2)
                $progressXml = "<progress value='$val' status='Working' />"
            }
            $safeTitle   = [System.Security.SecurityElement]::Escape($Title)
            $safeMessage = [System.Security.SecurityElement]::Escape($Message)
            $xml.LoadXml(@"
<toast launch="action=default">
  <visual>
    <binding template="ToastGeneric">
      <text>$safeTitle</text>
      <text>$safeMessage</text>
      $progressXml
    </binding>
  </visual>
  <audio src="$soundUri"/>
</toast>
"@)
            $toast    = [Windows.UI.Notifications.ToastNotification]::new($xml)
            $appId    = if ($global:AppID) { $global:AppID } else { "KPop.Pop" }
            $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)
            $notifier.Show($toast)
            return
        } catch {
            # Fall through to console
        }
    }

    # --- Console fallback --------------------------------------------
    $color = switch ($ToastType.ToLower()) {
        "success" { "Green" }
        "warning" { "Yellow" }
        "error"   { "Red"   }
        default   { "Cyan"  }
    }
    Write-Host "`n[Toast/$ToastType] $Title" -ForegroundColor $color
    if ($Message) { Write-Host "          $Message" -ForegroundColor Gray }
    if ($Progress -ge 0) { Write-Host "          [Progress: $Progress%]" -ForegroundColor Gray }
}

# =====================================================================
# Stop-PipeListener  (graceful cleanup helper)
# =====================================================================
function Stop-PipeListener {
    # PATCH-S1: full teardown of BOTH workers (alias ThreadJob included).
    Stop-KPopPipeWorkers
}

# =====================================================================
# Round 100 — Start-KPopDashboard (NON-BLOCKING REPLACEMENT)
# =====================================================================
# v26's KPopDashboard.psm1 defines Show-KPopDashboard which calls
# $form.ShowDialog() — BLOCKING. Since KPopListener.ps1 invokes
# Start-KPopDashboard -AutoRefresh at line ~217 BEFORE the tray icon
# is set up and BEFORE the startup toasts fire and BEFORE the main
# loop runs, the entire listener hangs on the dashboard's modal
# window. User has to manually close the dashboard for the listener
# to come alive. That's why "Show-KPopDashboard" was in the deferred
# list — it doesn't just look broken, it broke EVERYTHING ELSE.
#
# Fix: this shim re-defines Start-KPopDashboard to spin up the form
# in a dedicated STA runspace via Application.Run(). Main thread
# returns immediately. The runspace's form pumps its own WinForms
# messages independently.
#
# Status display polls $env:TEMP\KPopStatus.json which Update-Listener-
# Status writes every ~5 sec. Checkboxes (UseRawStream / RaiseEventMode)
# are read-only display in this version — the original ones in v26
# wrote $global:* directly, but cross-runspace global writes don't
# propagate. Future round can add control-file plumbing if needed.
# =====================================================================
function Start-KPopDashboard {
    # Round 295 — DEDUPLICATED. This used to build its OWN dashboard (the
    # one with "Restart Pipe Listener" + orange STATUS header + KPopStatus.json
    # polling). KPopDashboard.psm1 ALSO has a Start-KPopDashboard / Show-KPopDashboard
    # that builds a different, fuller dashboard (event log + MQTT mirror + Discord
    # test). The two coexisted because they were imported into different scopes:
    # KPopListener.ps1 boot called this one, and the tray-icon "Open Dashboard"
    # menu item called the OTHER one — so the user got two windows.
    #
    # Fix: this function is now a thin wrapper that delegates to the canonical
    # Show-KPopDashboard in KPopDashboard.psm1. One implementation, no name
    # collision, no duplicate windows. The file-based control bridge that lived
    # here (rawstream_on / raiseevent_on / restart_pipes commands written to
    # KPopShimControl.txt) still works via the dashboard's checkbox handlers in
    # KPopDashboard.psm1 — see the round-295 patch there.
    param([switch]$AutoRefresh)

    # Ensure KPopDashboard.psm1 is imported so Show-KPopDashboard is callable.
    if (-not (Get-Command -Name Show-KPopDashboard -ErrorAction SilentlyContinue)) {
        $modulePath = Join-Path $PSScriptRoot "KPopDashboard.psm1"
        if (Test-Path $modulePath) {
            Import-Module $modulePath -Force -Global
        } else {
            Write-Host "[Shim] KPopDashboard.psm1 not found beside KPopShim.psm1 — dashboard unavailable" -ForegroundColor Red
            return $null
        }
    }
    Show-KPopDashboard -AutoRefresh:$AutoRefresh
}

# =====================================================================
# Round 101 — Start-ShimControlPoller (dashboard → main runspace bridge)
# =====================================================================
# The non-blocking dashboard runs in its own STA runspace, so its
# checkbox handlers can't directly mutate $global:UseRawStream /
# $global:RaiseEventMode in the main runspace — cross-runspace
# global writes don't propagate. The dashboard writes commands to
# $env:TEMP\KPopListener\KPopShimControl.txt; this poller (running
# as a Timer in the MAIN runspace) reads the file every second,
# applies the change to the relevant global, and deletes the file.
#
# Recognized commands (one per line):
#   rawstream_on      → $global:UseRawStream = $true
#   rawstream_off     → $global:UseRawStream = $false
#   raiseevent_on     → $global:RaiseEventMode = $true
#   raiseevent_off    → $global:RaiseEventMode = $false
#   restart_pipes     → Stop-PipeListener + Apply-DashboardSettings
#
# This is a SEPARATE control file from v26's $TempDir\KPopControl.txt
# (which the main loop reads for pause/resume/exit). Keeping them
# separate avoids race conditions where both pollers fight over the
# same file.
# =====================================================================
$Script:ShimControlTimer = $null

function Start-ShimControlPoller {
    $ctrlDir  = Join-Path $env:TEMP "KPopListener"
    $ctrlFile = Join-Path $ctrlDir "KPopShimControl.txt"
    if (-not (Test-Path $ctrlDir)) {
        New-Item -ItemType Directory -Path $ctrlDir -Force | Out-Null
    }

    $timer = New-Object System.Timers.Timer
    $timer.Interval = 1000
    $timer.AutoReset = $true
    Register-ObjectEvent -InputObject $timer -EventName Elapsed `
        -SourceIdentifier "KPopShimControlTick" -Action {
        $cf = Join-Path $env:TEMP "KPopListener\KPopShimControl.txt"
        if (-not (Test-Path $cf)) { return }
        try {
            $rawAll = (Get-Content $cf -Raw -Encoding UTF8).Trim()
            try { Remove-Item $cf -Force -ErrorAction SilentlyContinue } catch {}
            # v1231 — protocol is "verb" or "verb:arg". Verb matched case-insensitively;
            # arg keeps its original case (voice names have caps + spaces).
            $verb = $rawAll; $arg = ""
            $ci = $rawAll.IndexOf(':')
            if ($ci -ge 0) { $verb = $rawAll.Substring(0, $ci); $arg = $rawAll.Substring($ci + 1).Trim() }
            $verb = $verb.ToLower()
            switch ($verb) {
                'rawstream_on' {
                    $global:UseRawStream = $true
                    Write-Host "[Shim] UseRawStream=true (via dashboard)" -ForegroundColor DarkCyan
                }
                'rawstream_off' {
                    $global:UseRawStream = $false
                    Write-Host "[Shim] UseRawStream=false (via dashboard)" -ForegroundColor DarkCyan
                }
                'raiseevent_on' {
                    $global:RaiseEventMode = $true
                    Write-Host "[Shim] RaiseEventMode=true (via dashboard)" -ForegroundColor DarkCyan
                }
                'raiseevent_off' {
                    $global:RaiseEventMode = $false
                    Write-Host "[Shim] RaiseEventMode=false (via dashboard)" -ForegroundColor DarkCyan
                }
                'restart_pipes' {
                    Write-Host "[Shim] Restart pipe listener requested" -ForegroundColor Yellow
                    if (Get-Command Stop-PipeListener -ErrorAction SilentlyContinue) {
                        Stop-PipeListener
                    }
                    Start-Sleep -Milliseconds 200
                    # Re-call Apply-DashboardSettings from the main script
                    # — it'll pick the right Start-PipeListener[Async]
                    # branch based on $global:RaiseEventMode.
                    if (Get-Command Apply-DashboardSettings -ErrorAction SilentlyContinue) {
                        Apply-DashboardSettings
                    } else {
                        # Apply-DashboardSettings lives in KPopListener.ps1
                        # script scope, not exported. Fall back: just
                        # restart Start-PipeListener directly.
                        if (Get-Command Start-PipeListener -ErrorAction SilentlyContinue) {
                            $name = if ($global:BasePipeName) { $global:BasePipeName } else { "KPopListenerPipe" }
                            $global:PipeHandle = Start-PipeListener -PipeName $name -UseRawStream:$global:UseRawStream
                        }
                    }
                    Write-Host "[Shim] Pipe listener restarted" -ForegroundColor Green
                }
                'speak-test' {
                    # v1231 — verify TTS audio end-to-end. Optional arg = custom phrase.
                    $t = if ($arg) { $arg } else { "K-pop listener voice test. Engine link is live." }
                    if (Get-Command Speak-Voiced -ErrorAction SilentlyContinue) {
                        Speak-Voiced -Voice "M1" -Text $t
                        Write-Host "[Shim] speak-test spoken" -ForegroundColor DarkCyan
                    } else { Write-Host "[Shim] speak-test: Speak-Voiced unavailable" -ForegroundColor Yellow }
                }
                'set-voice' {
                    # v1231 — hot-swap the primary (M1) voice by exact installed name.
                    if ($arg -and (Get-Command Set-KPopVoice -ErrorAction SilentlyContinue)) {
                        $okv = Set-KPopVoice $arg
                        Write-Host "[Shim] set-voice '$arg' -> $okv" -ForegroundColor DarkCyan
                    } else { Write-Host "[Shim] set-voice: missing arg or Set-KPopVoice" -ForegroundColor Yellow }
                }
                'reload-config' {
                    # v1231 — re-apply listener runtime settings (rawstream/raiseevent) +
                    # re-read the selected voice on next speak (Speak-Voiced syncs it).
                    if (Get-Command Apply-DashboardSettings -ErrorAction SilentlyContinue) {
                        Apply-DashboardSettings
                        Write-Host "[Shim] reload-config: settings re-applied" -ForegroundColor DarkCyan
                    } else { Write-Host "[Shim] reload-config: Apply-DashboardSettings unavailable" -ForegroundColor Yellow }
                }
                default {
                    if ($rawAll) {
                        Write-Host "[Shim] Unknown control command: '$rawAll'" -ForegroundColor Yellow
                    }
                }
            }
            # Update the status JSON so the dashboard's live display
            # reflects the new flag values within ~2s
            if (Get-Command Update-ListenerStatus -ErrorAction SilentlyContinue) {
                Update-ListenerStatus
            }
        } catch {
            Write-Host "[Shim] Control poller error: $_" -ForegroundColor Red
        }
    } | Out-Null
    $timer.Start()
    return $timer
}

# =====================================================================
# Round 100 — Speak-Voiced (System.Speech with two cached synthesizers)
# =====================================================================
# Two characters in the PalChat dialogue system, each with a distinct
# voice. M1 = female (Zira on most Win10/11 installs), M2 = male
# (David). Voice selection uses gender hints first, falls back to
# whatever the first two distinct voices are if hints fail.
#
# Both synthesizers are cached at module scope so we don't recreate
# them per call. SpeakAsync is used so the listener's main loop isn't
# blocked while the synth talks (Speak would block for the full
# duration of the utterance — bad for ~10-second sentences).
#
# Voice param: "M1" | "M2" | exact-voice-name. Anything not recognized
# defaults to M1.
# =====================================================================
$Script:M1Synth = $null
$Script:M2Synth = $null

# v987 — honor the voice picked in KPopupTTS.ps1 (launched via the listener's
# -TTS switch). That picker writes %APPDATA%\KPopupTTS\SelectedVoice.json =
#   { "SelectedVoice": "<voice name>" }. We apply it to M1 (the primary voice)
# and re-read whenever the file changes, so picking a voice hot-swaps the
# listener's voice with no restart. Silent unless -Verbose.
$Script:SelVoicePath  = $null
$Script:SelVoiceMtime = $null
function Sync-SelectedVoice {
    if (-not $Script:M1Synth) { return }
    if (-not $Script:SelVoicePath) {
        try { $Script:SelVoicePath = Join-Path $env:APPDATA "KPopupTTS\SelectedVoice.json" } catch { return }
    }
    try {
        if (-not (Test-Path $Script:SelVoicePath)) { return }
        $mt = (Get-Item $Script:SelVoicePath).LastWriteTimeUtc
        if ($mt -eq $Script:SelVoiceMtime) { return }
        $Script:SelVoiceMtime = $mt
        $name = (Get-Content $Script:SelVoicePath -Raw | ConvertFrom-Json).SelectedVoice
        if ($name) {
            $Script:M1Synth.SelectVoice($name)
            Write-Verbose "[Shim] Voice hot-swapped to $name (KPopupTTS)"
        }
    } catch {}
}

function Initialize-VoiceSynths {
    if ($Script:M1Synth -and $Script:M2Synth) { return }
    try {
        Add-Type -AssemblyName System.Speech -ErrorAction Stop
    } catch {
        Write-Host "[Shim] System.Speech unavailable — voiced speech disabled" -ForegroundColor Yellow
        return
    }

    $Script:M1Synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $Script:M2Synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

    # Try gender hints first
    try {
        $Script:M1Synth.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::Female)
    } catch {}
    try {
        $Script:M2Synth.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::Male)
    } catch {}

    # If both ended up on the same voice, pick the second installed voice
    # for M2 to enforce distinction
    try {
        if ($Script:M1Synth.Voice.Name -eq $Script:M2Synth.Voice.Name) {
            $voices = $Script:M2Synth.GetInstalledVoices() | Where-Object { $_.Enabled }
            foreach ($v in $voices) {
                if ($v.VoiceInfo.Name -ne $Script:M1Synth.Voice.Name) {
                    $Script:M2Synth.SelectVoice($v.VoiceInfo.Name)
                    break
                }
            }
        }
    } catch {}

    # Slight pitch / rate differentiation so even identical voices feel
    # distinct. M2 is slightly faster + higher-pitched (dog-like).
    try { $Script:M1Synth.Rate = 0 }   catch {}
    try { $Script:M2Synth.Rate = 2 }   catch {}

    # v715 — SpeakCompleted hooks. Each synth fires this event when its
    # SpeakAsync prompt finishes. We POST to the bridge so the avatar can
    # early-release its head-focus lock + ease the camera back out (the
    # avatar already has a `kpop:speak:end` postMessage handler from the
    # earlier round). Fire-and-forget — speech latency is what matters,
    # not the network roundtrip.
    $bridgeUrl = $env:KPOP_BRIDGE_URL
    if ([string]::IsNullOrWhiteSpace($bridgeUrl)) { $bridgeUrl = "http://localhost:8787" }
    $speakEndUrl = "$bridgeUrl/kpop/speak-end"
    $makeHandler = {
        param($voiceLabel)
        # Returns a script block closing over $voiceLabel + $speakEndUrl
        $vl = $voiceLabel
        $url = $speakEndUrl
        return {
            param($sender, $eventArgs)
            try {
                # PowerShell 5.1 doesn't have async/await; use a runspace
                # job (preferred) or fall through to background Invoke-
                # RestMethod via Start-ThreadJob/Start-Job (slower but
                # compatible).
                $payload = @{ Voice = $vl; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Compress
                if (Get-Command Start-ThreadJob -ErrorAction SilentlyContinue) {
                    Start-ThreadJob -ScriptBlock {
                        param($u, $b)
                        try { Invoke-RestMethod -Uri $u -Method Post -Body $b -ContentType "application/json" -TimeoutSec 2 | Out-Null } catch {}
                    } -ArgumentList $url, $payload | Out-Null
                } else {
                    Start-Job -ScriptBlock {
                        param($u, $b)
                        try { Invoke-RestMethod -Uri $u -Method Post -Body $b -ContentType "application/json" -TimeoutSec 2 | Out-Null } catch {}
                    } -ArgumentList $url, $payload | Out-Null
                }
            } catch {}
        }.GetNewClosure()
    }
    try {
        $h1 = & $makeHandler "M1"
        $h2 = & $makeHandler "M2"
        $Script:M1Synth.add_SpeakCompleted($h1)
        $Script:M2Synth.add_SpeakCompleted($h2)
        Write-Host "[Shim] SpeakCompleted → $speakEndUrl wired" -ForegroundColor DarkCyan
    } catch {
        Write-Host "[Shim] failed to wire SpeakCompleted: $_" -ForegroundColor Yellow
    }

    Write-Host "[Shim] Voiced speech: M1='$($Script:M1Synth.Voice.Name)' M2='$($Script:M2Synth.Voice.Name)'" -ForegroundColor Cyan
}

function Speak-Voiced {
    param(
        [string]$Voice = "M1",
        [string]$Text  = ""
    )
    if ([string]::IsNullOrWhiteSpace($Text)) { return }
    Initialize-VoiceSynths
    Sync-SelectedVoice
    if (-not $Script:M1Synth -or -not $Script:M2Synth) { return }

    $target = switch ($Voice.ToUpper()) {
        "M1"   { $Script:M1Synth }
        "M2"   { $Script:M2Synth }
        default { $Script:M1Synth }
    }

    try {
        # SpeakAsync returns a Prompt object; we don't wait on it. The
        # synth will queue if a previous prompt is still playing.
        $null = $target.SpeakAsync($Text)
    } catch {
        Write-Host "[Shim] Speak failed: $_" -ForegroundColor Red
    }
}

# v1231 — hot-swap the primary (M1) voice by exact installed voice name. Persists
# to %APPDATA%\KPopupTTS\SelectedVoice.json so it survives a restart and matches
# the TTS picker's own format. Returns $true on success.
function Set-KPopVoice {
    param([string]$Name)
    if ([string]::IsNullOrWhiteSpace($Name)) { return $false }
    Initialize-VoiceSynths
    if (-not $Script:M1Synth) { return $false }
    try {
        $Script:M1Synth.SelectVoice($Name)
        $global:KPopVoiceName = $Name
        try {
            $dir = Join-Path $env:APPDATA "KPopupTTS"
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
            @{ SelectedVoice = $Name } | ConvertTo-Json | Set-Content -Path (Join-Path $dir "SelectedVoice.json") -Encoding UTF8 -Force
        } catch {}
        return $true
    } catch {
        Write-Host "[Shim] Set-KPopVoice failed for '$Name': $_" -ForegroundColor Yellow
        return $false
    }
}

# Round 272 — Speak-Voiced-ToWav: same as Speak-Voiced but redirects
# synth output to a WAV file instead of the audio device. Used by the
# bridge's /kpop/speak-wav endpoint to make the spoken audio available
# to the browser for AudioAnalyser-driven (Path C) lip-sync. Returns
# the path to the written WAV on success, $null on failure.
#
# Implementation notes:
#   * Each call creates a DEDICATED SpeechSynthesizer because changing
#     SetOutputToWaveFile on the cached M1/M2 synths would interfere
#     with their concurrent speech output for the audio-device path.
#   * Speak (not SpeakAsync) — we must block until the WAV is fully
#     written before returning.
#   * Caller is responsible for cleanup (deleting old WAVs); the
#     bridge will sweep stale entries on a timer.
function Speak-Voiced-ToWav {
    param(
        [string]$Voice = "M1",
        [string]$Text  = "",
        [string]$OutputPath
    )
    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
    if ([string]::IsNullOrWhiteSpace($OutputPath)) { return $null }
    Initialize-VoiceSynths
    if (-not $Script:M1Synth -or -not $Script:M2Synth) { return $null }

    # Mirror voice + rate from whichever cached synth corresponds
    $sample = switch ($Voice.ToUpper()) {
        "M1"   { $Script:M1Synth }
        "M2"   { $Script:M2Synth }
        default { $Script:M1Synth }
    }

    try {
        $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
        try { $synth.SelectVoice($sample.Voice.Name) } catch {}
        $synth.Rate = $sample.Rate
        # Ensure parent dir exists
        $dir = Split-Path $OutputPath -Parent
        if ($dir -and -not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        $synth.SetOutputToWaveFile($OutputPath)
        $synth.Speak($Text)              # blocking — writes file then returns
        $synth.SetOutputToNull()         # release file handle
        $synth.Dispose()
        return $OutputPath
    } catch {
        Write-Host "[Shim] Speak-Voiced-ToWav failed: $_" -ForegroundColor Red
        return $null
    }
}

# Module load-time wiring (existing — extended below)
# =====================================================================
# Boot the sentinel writer immediately. KPopListener.ps1's main loop
# calls Apply-DashboardSettings + Start-FileWatcher right after this
# import returns; their Get-Command guards now find Start-PipeListener,
# Start-PipeListenerAsync, Start-FileWatcher, and Process-Message in
# the exported set.
$Script:SentinelTimer = Start-KPopShimSentinel
$Script:ShimControlTimer = Start-ShimControlPoller
Write-Host "[KPopShim] loaded — pipe/file/process functions live, sentinel + control poller active" -ForegroundColor Magenta

# ===================== v1224 — avatar mood / quips / moose drive =====================
# Push the avatar's mood, fire a Talking-Moose quip, or nudge the tamagotchi moose
# from PowerShell. All POST the bridge's /avatar/mood bus; every avatar surface
# (engine, face window, phone, Shield) picks it up on its next poll.
function Get-KPopBridgeUrl {
    $u = $env:KPOP_BRIDGE_URL
    if ([string]::IsNullOrWhiteSpace($u)) { $u = "http://localhost:8787" }
    return $u.TrimEnd('/')
}

# ===================== v1230 — engine-authority listener policy =====================
# The engine is in ultimate control. The listener polls GET /kpop/policy and obeys:
#   enabled=false -> go dormant (process nothing); quiet=true -> suppress spoken audio;
#   features.{mqtt,discord,websocket} -> engine owns these, so the listener stops them
#   if it has them running. When the engine is UNREACHABLE we clear the policy so the
#   listener runs on its own launch switches (standalone is never broken).
$global:KPopPolicy  = $null      # $null = no engine / standalone
$global:KPopEnabled = $true
$global:KPopQuiet   = $false
$global:_KPopPolicyTs = -1

function Test-KPopAllowed {
    param([string]$Feature)
    $p = $global:KPopPolicy
    if ($null -eq $p) { return $true }            # standalone: no engine -> allow
    if ($p.enabled -eq $false) { return $false }  # engine disabled the listener entirely
    if ([string]::IsNullOrWhiteSpace($Feature)) { return $true }
    $f = $p.features
    if ($null -ne $f -and ($f.PSObject.Properties.Name -contains $Feature)) { return [bool]$f.$Feature }
    return $true
}

function Start-KPopPolicyPoller {
    # PATCH-S3: exponential backoff when the engine is unreachable. The old
    # poller retried every 3s forever, so a standalone machine (no engine on
    # :8787) paid a connect-fail every 3 seconds for the life of the process.
    # Now: 3s while healthy, doubling to a 30s ceiling while down, snapping
    # back to 3s on the first successful poll.
    $timer = New-Object System.Timers.Timer
    $timer.Interval = 3000; $timer.AutoReset = $true
    Register-ObjectEvent -InputObject $timer -EventName Elapsed -SourceIdentifier "KPopPolicyTick" -MessageData $timer -Action {
        $t = $Event.MessageData
        try {
            $u = $env:KPOP_BRIDGE_URL; if ([string]::IsNullOrWhiteSpace($u)) { $u = "http://localhost:8787" }
            $r = Invoke-RestMethod -Uri "$($u.TrimEnd('/'))/kpop/policy" -TimeoutSec 2 -ErrorAction Stop
            if ($t -and $t.Interval -ne 3000) { $t.Interval = 3000 }   # engine back: full cadence
            if ($r -and $r.policy) {
                $global:KPopPolicy  = $r.policy
                $global:KPopEnabled = ($r.policy.enabled -ne $false)
                $global:KPopQuiet   = ($r.policy.quiet -eq $true)
                # Only act on a policy CHANGE (avoid stopping the same feature every tick).
                if ($r.policy.ts -ne $global:_KPopPolicyTs) {
                    $global:_KPopPolicyTs = $r.policy.ts
                    $f = $r.policy.features
                    if ($f -and ($f.mqtt -eq $false) -and (Get-Command Stop-KPopMqtt -ErrorAction SilentlyContinue)) { try { Stop-KPopMqtt } catch {} }
                    if ($f -and ($f.websocket -eq $false) -and (Get-Command Stop-KPopWebSocketServer -ErrorAction SilentlyContinue)) { try { Stop-KPopWebSocketServer } catch {} }
                }
            }
        } catch {
            # engine unreachable -> standalone: clear policy, run on own switches, back off
            $global:KPopPolicy = $null; $global:KPopEnabled = $true; $global:KPopQuiet = $false; $global:_KPopPolicyTs = -1
            if ($t) { $t.Interval = [Math]::Min(30000, [Math]::Max(3000, $t.Interval) * 2) }
        }
    } | Out-Null
    $timer.Start(); return $timer
}
$Script:PolicyTimer = Start-KPopPolicyPoller

function Set-AvatarMood {
    # Set-AvatarMood support|souring|alarm [-Reason "..."] [-Score 0..1] [-Quip "..."] [-Style classic|fluffy|spiky|star|streamer|sparkler]
    param(
        [Parameter(Mandatory=$true)][ValidateSet("support","souring","alarm")][string]$Mood,
        [string]$Reason = "powershell",
        [double]$Score = -1,
        [string]$Quip,
        [string]$Style
    )
    $body = @{ mood = $Mood; reason = $Reason }
    if ($Score -ge 0) { $body.score = $Score }
    if ($Quip)  { $body.quip  = $Quip }
    if ($Style) { $body.style = $Style }
    $json = $body | ConvertTo-Json -Compress
    try { Invoke-RestMethod -Uri "$(Get-KPopBridgeUrl)/avatar/mood" -Method Post -Body $json -ContentType "application/json" -TimeoutSec 3 | Out-Null }
    catch { Write-Host "[KPopShim] Set-AvatarMood failed: $($_.Exception.Message)" -ForegroundColor Yellow }
}
function Send-AvatarQuip {
    # Send-AvatarQuip "line the avatar will say" — Talking-Moose style. Omit -Text for a random mood line.
    param([string]$Text)
    $body = @{ }
    if ($Text) { $body.quip = $Text } else { $body.quip = "" }
    # empty quip = let the avatar pick its own mood-flavored line
    if (-not $Text) { try { Invoke-RestMethod -Uri "$(Get-KPopBridgeUrl)/avatar/mood" -Method Post -Body (@{ quip="__gen__"; reason="ps quip" } | ConvertTo-Json -Compress) -ContentType "application/json" -TimeoutSec 3 | Out-Null } catch {}; return }
    $json = $body | ConvertTo-Json -Compress
    try { Invoke-RestMethod -Uri "$(Get-KPopBridgeUrl)/avatar/mood" -Method Post -Body $json -ContentType "application/json" -TimeoutSec 3 | Out-Null }
    catch { Write-Host "[KPopShim] Send-AvatarQuip failed: $($_.Exception.Message)" -ForegroundColor Yellow }
}
function Set-MooseMood {
    # Nudge the tamagotchi moose: deltas (-100..100) applied to hunger/happiness/energy.
    param([double]$Hunger = 0, [double]$Happiness = 0, [double]$Energy = 0)
    $json = @{ tama = @{ hunger = $Hunger; happiness = $Happiness; energy = $Energy } } | ConvertTo-Json -Compress
    try { Invoke-RestMethod -Uri "$(Get-KPopBridgeUrl)/avatar/mood" -Method Post -Body $json -ContentType "application/json" -TimeoutSec 3 | Out-Null }
    catch { Write-Host "[KPopShim] Set-MooseMood failed: $($_.Exception.Message)" -ForegroundColor Yellow }
}
# ====================================================================================

Export-ModuleMember -Function `
    Test-PipeListenerLive, `
    Start-PipeListener, `
    Start-PipeListenerAsync, `
    Stop-PipeListener, `
    Start-FileWatcher, `
    Process-Message, `
    Send-RealToast, `
    Start-KPopShimSentinel, `
    Start-KPopDashboard, `
    Set-AvatarMood, `
    Send-AvatarQuip, `
    Set-MooseMood, `
    Get-KPopBridgeUrl, `
    Speak-Voiced, `
    Speak-Voiced-ToWav, `
    Initialize-VoiceSynths, `
    Start-ShimControlPoller, `
    Start-KPopPolicyPoller, `
    Test-KPopAllowed, `
    Set-KPopVoice
