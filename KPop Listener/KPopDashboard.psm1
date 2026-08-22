# Module: KPopDashboard.psm1
# Round 290 — crash-hardened rewrite.
#
# Live control panel for KPopListener settings. The previous version had
# four crash modes that were intermittently fatal:
#
#   (1) Globals referenced before init. $global:UseRawStream and
#       $global:Stats are read by the CheckBox.Checked setter + the
#       Update-ListenerStatus timer tick. If the dashboard launches
#       before KPopListener boots them, you get NullReferenceException.
#
#   (2) Timer not disposed. The auto-refresh timer keeps a reference
#       to a closed-over form; closing the dashboard window leaves the
#       timer firing into a disposed form, throwing
#       ObjectDisposedException every 2s until the runspace exits.
#
#   (3) ShowDialog() blocks the host runspace. If launched from
#       KPopListener.ps1's main loop synchronously, the pipe listener
#       freezes for the dashboard's entire lifetime. Looks like a
#       hang/crash from outside.
#
#   (4) STA requirement. WinForms ShowDialog requires single-threaded
#       apartment. If the host PowerShell session is MTA (e.g. some
#       Invoke-Command paths), construction is allowed but ShowDialog
#       throws InvalidOperationException at runtime.
#
# All four addressed:
#   - Safe defaults applied before any control reads a global.
#   - Timer disposal on FormClosed.
#   - Show() instead of ShowDialog() — non-modal, returns immediately.
#     Pass -Modal for the old blocking behavior.
#   - STA precondition handled: if MTA, dashboard launches in its own
#     STA runspace so the UI works regardless of host threading.

function _EnsureDashboardGlobals {
    # Safe defaults so the controls don't blow up reading $null.
    if (-not (Get-Variable -Name UseRawStream    -Scope Global -ErrorAction SilentlyContinue)) {
        $Global:UseRawStream = $false
    }
    if (-not (Get-Variable -Name RaiseEventMode  -Scope Global -ErrorAction SilentlyContinue)) {
        $Global:RaiseEventMode = $false
    }
    if (-not (Get-Variable -Name Stats           -Scope Global -ErrorAction SilentlyContinue)) {
        $Global:Stats = @{
            StartTime   = Get-Date
            TotalToasts = 0
            PipeToasts  = 0
            Failures    = 0
        }
    }
    # Ensure individual stats keys exist even if Stats was created
    # earlier without them.
    foreach ($k in "StartTime", "TotalToasts", "PipeToasts", "Failures") {
        if (-not $Global:Stats.ContainsKey($k)) {
            $Global:Stats[$k] = if ($k -eq "StartTime") { Get-Date } else { 0 }
        }
    }
}

function _SafeUpdateListenerStatus {
    # Wrap the call so any defect in Update-ListenerStatus (or its
    # global reads) doesn't take down the timer. Logged but swallowed.
    try {
        if (Get-Command -Name Update-ListenerStatus -ErrorAction SilentlyContinue) {
            Update-ListenerStatus
        }
    } catch {
        Write-Host "[KPopDashboard] Update-ListenerStatus failed: $_" -ForegroundColor DarkYellow
    }
}

function _SafeWriteLog {
    param([string]$Message)
    try {
        if (Get-Command -Name Write-Log -ErrorAction SilentlyContinue) {
            Write-Log $Message
        } else {
            Write-Host $Message
        }
    } catch {
        Write-Host $Message
    }
}

function Show-KPopDashboard {
    param(
        [switch]$AutoRefresh,
        [switch]$Modal
    )

    _EnsureDashboardGlobals

    # v964 — single source of truth for the window title: the guard above and
    # $form.Text below both use this, so they can never drift apart.
    $script:DASH_TITLE = "KPopListener Dashboard · v750"

    # v750 — cross-runspace existing-window check via Win32 FindWindow.
    # The $Global:KPopDashboardForm check below is runspace-local, so it
    # fails when the tray icon (in main runspace) calls this method but
    # the existing dashboard was started in a different STA runspace.
    # FindWindow asks the OS directly, which is process-wide.
    try {
        if (-not ('KPopDash.Win32Util' -as [type])) {
            Add-Type -Namespace KPopDash -Name Win32Util -MemberDefinition @'
                [System.Runtime.InteropServices.DllImport("user32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode)]
                public static extern System.IntPtr FindWindow(string lpClassName, string lpWindowName);
                [System.Runtime.InteropServices.DllImport("user32.dll")]
                public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);
                [System.Runtime.InteropServices.DllImport("user32.dll")]
                public static extern bool SetForegroundWindow(System.IntPtr hWnd);
                [System.Runtime.InteropServices.DllImport("user32.dll")]
                public static extern bool IsIconic(System.IntPtr hWnd);
'@ -ErrorAction SilentlyContinue
        }
        # Look for any existing dashboard window. $script:DASH_TITLE is the
        # single source of truth (same literal sets $form.Text below), so a
        # version bump can't silently break the match; older titles follow as
        # fallbacks. CharSet.Unicode above means the "·" matches on any codepage.
        $titlesToTry = @(
            $script:DASH_TITLE,
            "KPopListener Dashboard · v750",
            "KPopListener Dashboard · v749",
            "KPopListener Dashboard"
        ) | Select-Object -Unique
        foreach ($title in $titlesToTry) {
            $hwnd = [KPopDash.Win32Util]::FindWindow($null, $title)
            if ($hwnd -ne [IntPtr]::Zero) {
                if ([KPopDash.Win32Util]::IsIconic($hwnd)) {
                    [KPopDash.Win32Util]::ShowWindow($hwnd, 9) | Out-Null   # SW_RESTORE
                }
                [KPopDash.Win32Util]::SetForegroundWindow($hwnd) | Out-Null
                return [pscustomobject]@{ Form = $null; Runspace = $null; DispatchedAsync = $false; Reused = $true; Hwnd = $hwnd }
            }
        }
    } catch {
        # If Win32 lookup fails for any reason, fall through to the
        # runspace-local check + new-form path below.
    }

    # Round 295 — idempotent. If a dashboard form is already open, bring
    # it to the front instead of creating a second window. This was the
    # root cause of the user seeing two dashboards: KPopListener.ps1 boot
    # called Start-KPopDashboard, and the tray-icon "Open Dashboard" menu
    # later called Show-KPopDashboard — two separate forms, no check for
    # an existing one. Now both paths funnel through here, and the second
    # call activates the first window.
    try {
        if ($Global:KPopDashboardForm -and -not $Global:KPopDashboardForm.IsDisposed) {
            $Global:KPopDashboardForm.WindowState = "Normal"
            $Global:KPopDashboardForm.Activate()
            $Global:KPopDashboardForm.BringToFront()
            return [pscustomobject]@{ Form = $Global:KPopDashboardForm; Runspace = $null; DispatchedAsync = $false; Reused = $true }
        }
    } catch { $Global:KPopDashboardForm = $null }

    # v966 — ALWAYS run the dashboard in its own dedicated STA runspace with a
    # real (modal/ShowDialog) message pump, so it's fully interactive and
    # decoupled from the listener loop. Previously this only happened on MTA
    # hosts; on an STA host (Windows PowerShell 5.1) the boot fell through to an
    # inline modeless Show(), which depends on the listener loop's DoEvents to
    # pump it — that left the window un-clickable. The recursive call carries
    # -Modal, so inside the runspace we skip this branch and ShowDialog there.
    if (-not $Modal) {
        Write-Host "[KPopDashboard] launching dashboard in a dedicated STA runspace (own message pump)" -ForegroundColor DarkCyan
        $ps = [PowerShell]::Create()
        $ps.Runspace = [runspacefactory]::CreateRunspace()
        $ps.Runspace.ApartmentState = "STA"
        $ps.Runspace.ThreadOptions  = "ReuseThread"
        $ps.Runspace.Open()
        # Re-import this module inside the STA runspace + call again, modal so it
        # runs its own ShowDialog pump on that thread.
        $modulePath = $PSCommandPath
        $null = $ps.AddScript({
            param($mod, $autoRefresh)
            Import-Module $mod -Force
            Show-KPopDashboard -AutoRefresh:$autoRefresh -Modal
        }).AddArgument($modulePath).AddArgument([bool]$AutoRefresh)
        $null = $ps.BeginInvoke()
        return [pscustomobject]@{
            Form            = $null
            Runspace        = $ps.Runspace
            DispatchedAsync = $true
        }
    }

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    # v746 — version stamp in title bar so you can confirm the loaded
    # .psm1 matches the file on disk. PowerShell caches modules per
    # session; if the title shows an older version, run:
    #   Remove-Module KPopDashboard -Force -EA SilentlyContinue
    #   Import-Module ".\KPop Listener\KPopDashboard.psm1" -Force
    $form.Text = $script:DASH_TITLE
    $form.Size = New-Object System.Drawing.Size(560, 760)
    $form.StartPosition = "CenterScreen"
    $form.MinimizeBox = $true
    $form.MaximizeBox = $false

    # Round 295 — track this form globally so a second Show-KPopDashboard
    # call activates this window instead of spawning a duplicate.
    $Global:KPopDashboardForm = $form

    # Round 295 — single ToolTip provider for the whole form. Each control
    # registers its hover text with SetToolTip; Windows handles the popup.
    $tip = New-Object System.Windows.Forms.ToolTip
    $tip.AutoPopDelay = 12000   # 12s — long enough to read multi-sentence descriptions
    $tip.InitialDelay = 400
    $tip.ReshowDelay  = 200
    $tip.ShowAlways   = $true

    # UseRawStream checkbox — guarded read of global
    $script:chkRawStream = New-Object System.Windows.Forms.CheckBox
    $script:chkRawStream.Text = "Use Raw Stream"
    $script:chkRawStream.Location = New-Object System.Drawing.Point(20, 20)
    $script:chkRawStream.Size = New-Object System.Drawing.Size(180, 24)
    try { $script:chkRawStream.Checked = [bool]$Global:UseRawStream } catch { $script:chkRawStream.Checked = $false }
    $script:chkRawStream.Add_CheckedChanged({
        try {
            $Global:UseRawStream = $script:chkRawStream.Checked
            _SafeWriteLog "Dashboard: UseRawStream set to $($Global:UseRawStream)"
            # Round 295 — also drop a file-bridge command so the change
            # propagates across STA runspaces. KPopShim's ControlPoller
            # picks this up and updates the listener's globals.
            try {
                $ctrlDir = Join-Path $env:TEMP "KPopListener"
                if (-not (Test-Path $ctrlDir)) { New-Item -ItemType Directory -Path $ctrlDir -Force | Out-Null }
                $ctrlFile = Join-Path $ctrlDir "KPopShimControl.txt"
                $cmd = if ($script:chkRawStream.Checked) { "rawstream_on" } else { "rawstream_off" }
                $cmd | Out-File $ctrlFile -Force -Encoding UTF8
            } catch {}
            _SafeUpdateListenerStatus
        } catch {
            Write-Host "[KPopDashboard] UseRawStream handler failed: $_" -ForegroundColor DarkYellow
        }
    })
    # Round 295 — tooltip + sub-label so the user knows what this does.
    $tip.SetToolTip($script:chkRawStream, "Use Raw Stream: bypasses the WinRT toast pipeline and writes notifications directly to a raw byte stream (faster, but no native Windows toast UI). Leave OFF for normal toast notifications; turn ON only if you're piping events to another tool that reads the raw stream.")
    $form.Controls.Add($script:chkRawStream)
    $lblRawDesc = New-Object System.Windows.Forms.Label
    $lblRawDesc.Location = New-Object System.Drawing.Point(38, 42)
    $lblRawDesc.Size     = New-Object System.Drawing.Size(280, 14)
    $lblRawDesc.Text     = "Skip native Windows toasts, write raw stream instead"
    $lblRawDesc.ForeColor = [System.Drawing.Color]::Gray
    $lblRawDesc.Font     = New-Object System.Drawing.Font("Segoe UI", 7.5, [System.Drawing.FontStyle]::Italic)
    $form.Controls.Add($lblRawDesc)

    # RaiseEventMode checkbox
    $script:chkRaiseEvent = New-Object System.Windows.Forms.CheckBox
    $script:chkRaiseEvent.Text = "Raise Event Mode"
    $script:chkRaiseEvent.Location = New-Object System.Drawing.Point(20, 62)
    $script:chkRaiseEvent.Size = New-Object System.Drawing.Size(180, 24)
    try { $script:chkRaiseEvent.Checked = [bool]$Global:RaiseEventMode } catch { $script:chkRaiseEvent.Checked = $false }
    $script:chkRaiseEvent.Add_CheckedChanged({
        try {
            $Global:RaiseEventMode = $script:chkRaiseEvent.Checked
            _SafeWriteLog "Dashboard: RaiseEventMode set to $($Global:RaiseEventMode)"
            # Round 295 — file-bridge for cross-runspace propagation (see UseRawStream handler)
            try {
                $ctrlDir = Join-Path $env:TEMP "KPopListener"
                if (-not (Test-Path $ctrlDir)) { New-Item -ItemType Directory -Path $ctrlDir -Force | Out-Null }
                $ctrlFile = Join-Path $ctrlDir "KPopShimControl.txt"
                $cmd = if ($script:chkRaiseEvent.Checked) { "raiseevent_on" } else { "raiseevent_off" }
                $cmd | Out-File $ctrlFile -Force -Encoding UTF8
            } catch {}
            _SafeUpdateListenerStatus
        } catch {
            Write-Host "[KPopDashboard] RaiseEventMode handler failed: $_" -ForegroundColor DarkYellow
        }
    })
    $tip.SetToolTip($script:chkRaiseEvent, "Raise Event Mode: instead of showing toasts directly, the listener raises PowerShell events that other scripts can subscribe to with Register-ObjectEvent. Useful for chaining the listener into a larger automation pipeline. Leave OFF for normal toast behaviour.")
    $form.Controls.Add($script:chkRaiseEvent)
    $lblRaiseDesc = New-Object System.Windows.Forms.Label
    $lblRaiseDesc.Location = New-Object System.Drawing.Point(38, 84)
    $lblRaiseDesc.Size     = New-Object System.Drawing.Size(280, 14)
    $lblRaiseDesc.Text     = "Raise PS events instead of showing toasts directly"
    $lblRaiseDesc.ForeColor = [System.Drawing.Color]::Gray
    $lblRaiseDesc.Font     = New-Object System.Drawing.Font("Segoe UI", 7.5, [System.Drawing.FontStyle]::Italic)
    $form.Controls.Add($lblRaiseDesc)

    # Refresh button
    $btnRefresh = New-Object System.Windows.Forms.Button
    $btnRefresh.Text = "Refresh Status"
    $btnRefresh.Location = New-Object System.Drawing.Point(20, 110)
    $btnRefresh.Size = New-Object System.Drawing.Size(140, 28)
    $btnRefresh.Add_Click({
        _SafeUpdateListenerStatus
        _SafeWriteLog "Dashboard: Status refreshed"
        try {
            $script:lblStatus.Text = "Status: refreshed at $((Get-Date).ToString('HH:mm:ss'))"
        } catch {}
    })
    $tip.SetToolTip($btnRefresh, "Force an immediate status refresh (uptime, toast counts, MQTT state). Auto-refresh fires every 2 seconds; this just doesn't wait.")
    $form.Controls.Add($btnRefresh)

    # Live status label — shows last-action feedback
    $script:lblStatus = New-Object System.Windows.Forms.Label
    $script:lblStatus.Location = New-Object System.Drawing.Point(20, 148)
    $script:lblStatus.Size = New-Object System.Drawing.Size(510, 22)
    $script:lblStatus.Text = "Status: idle"
    $script:lblStatus.ForeColor = [System.Drawing.Color]::DarkSlateGray
    $form.Controls.Add($script:lblStatus)

    # Uptime display (only when stats are valid)
    $script:lblUptime = New-Object System.Windows.Forms.Label
    $script:lblUptime.Location = New-Object System.Drawing.Point(20, 174)
    $script:lblUptime.Size = New-Object System.Drawing.Size(510, 22)
    $script:lblUptime.Text = "Uptime: --:--:--"
    $script:lblUptime.ForeColor = [System.Drawing.Color]::DarkSlateBlue
    $form.Controls.Add($script:lblUptime)

    # Live event console (Q2 — the "received text" feed). Read-only multiline
    # box; the auto-refresh timer tails $global:RecentEvents into it OR reads
    # from the file-tail bridge when the dashboard runs in a separate runspace.
    $script:logBox = New-Object System.Windows.Forms.TextBox
    $script:logBox.Location = New-Object System.Drawing.Point(20, 202)
    $script:logBox.Size = New-Object System.Drawing.Size(510, 350)
    $script:logBox.Multiline = $true
    $script:logBox.ReadOnly = $true
    $script:logBox.ScrollBars = "Vertical"
    $script:logBox.BackColor = [System.Drawing.Color]::FromArgb(16, 16, 24)
    $script:logBox.ForeColor = [System.Drawing.Color]::LightGreen
    $script:logBox.Font = New-Object System.Drawing.Font("Consolas", 8.5)
    $script:logBox.Text = "(waiting for events...)"
    $tip.SetToolTip($script:logBox, "Live feed of every toast/event the listener processes. Each row is timestamped. Round 295: also reads from the file-tail bridge at `$env:TEMP\KPopListener\events.log so events appear here even when the dashboard runs in its own STA runspace.")
    $form.Controls.Add($script:logBox)
    $script:_lastLogCount = -1
    $script:_lastFileSize = -1

    # v750 — standalone-mode detection. If we don't find a WebGLEngine
    # folder nearby (we look at ..\WebGLEngine and ..\..\WebGLEngine
    # from the KPop Listener folder), the user is running the listener
    # by itself and the Engine Quick Launch panel is irrelevant. Skip
    # the panel + shrink the form so the unused space doesn't look like
    # a layout bug. The bridge-detection timer also no-ops in this mode.
    $script:_isStandalone = $true
    $script:_engineFolderPath = $null
    $listenerRoot = $PSScriptRoot
    if (-not $listenerRoot) { $listenerRoot = (Get-Location).Path }
    $candidatePaths = @(
        (Join-Path (Split-Path -Parent $listenerRoot) 'WebGLEngine'),
        (Join-Path (Split-Path -Parent (Split-Path -Parent $listenerRoot)) 'WebGLEngine'),
        (Join-Path $listenerRoot '..\WebGLEngine'),
        'C:\EngineProject\WebGLEngine'
    )
    foreach ($p in $candidatePaths) {
        try {
            if ($p -and (Test-Path (Join-Path $p 'index.html'))) {
                $script:_isStandalone = $false
                $script:_engineFolderPath = (Resolve-Path $p).Path
                break
            }
        } catch {}
    }

    if ($script:_isStandalone) {
        # No engine folder found — listener is running standalone.
        # Shrink form, skip Quick Launch panel + skip detection logic.
        # Form was 760 tall to fit the panel; collapse to 540.
        $form.Size = New-Object System.Drawing.Size(560, 540)
        $script:_qlButtons = @()
        $script:_engineOnline = $false
        $script:_enginePort = 8787
    } else {
        # v744 — Engine Quick Launch panel. Sits below the log box. Pings the
        # bridge every 2s; buttons enable/disable based on detection so the
        # PowerShell dashboard remains useful when the engine isn't running.
        # Each button launches a specific engine UI in the default browser.
        # Bridge port resolution: $Global:BridgePort first, else 8787.
        $script:_enginePort = 8787
        if (Get-Variable -Name BridgePort -Scope Global -ErrorAction SilentlyContinue) {
            $maybe = $Global:BridgePort
            if ($maybe -is [int] -and $maybe -gt 0) { $script:_enginePort = $maybe }
        }
        $script:_engineOnline = $false

        $qlPanel = New-Object System.Windows.Forms.GroupBox
        $qlPanel.Text = "Engine Quick Launch"
        $qlPanel.Location = New-Object System.Drawing.Point(20, 560)
        $qlPanel.Size = New-Object System.Drawing.Size(510, 140)
        $qlPanel.ForeColor = [System.Drawing.Color]::FromArgb(120, 200, 255)
        $form.Controls.Add($qlPanel)

    # Engine-status label (at top of group)
    $script:lblEngineStatus = New-Object System.Windows.Forms.Label
    $script:lblEngineStatus.Location = New-Object System.Drawing.Point(10, 18)
    $script:lblEngineStatus.Size = New-Object System.Drawing.Size(415, 18)
    $script:lblEngineStatus.Text = "Engine: detecting…"
    $script:lblEngineStatus.ForeColor = [System.Drawing.Color]::DarkGray
    $qlPanel.Controls.Add($script:lblEngineStatus)

    # v749 — manual refresh button next to the status label. The 2-second
    # auto-detect usually picks up the engine within ~2s of bridge boot,
    # but if the bridge takes longer than that to bind the port, the
    # initial-ping at dashboard-open can miss it. Click to force-check.
    $script:btnEngineRefresh = New-Object System.Windows.Forms.Button
    $script:btnEngineRefresh.Text = "🔄 Refresh"
    $script:btnEngineRefresh.Location = New-Object System.Drawing.Point(430, 14)
    $script:btnEngineRefresh.Size = New-Object System.Drawing.Size(70, 24)
    $script:btnEngineRefresh.Add_Click({
        try { _PingEngine | Out-Null } catch {}
    })
    $tip.SetToolTip($script:btnEngineRefresh, "Force a check for the engine bridge. Useful if the auto-detect (every 2s) missed it during startup, or after restarting the bridge from outside the dashboard.")
    $qlPanel.Controls.Add($script:btnEngineRefresh)

    # Helper to make a launch button
    $script:_qlButtons = @()
    function _MakeLaunchBtn {
        param([string]$Text, [int]$X, [int]$Y, [int]$W, [string]$PathPart, [string]$ToolTip)
        $b = New-Object System.Windows.Forms.Button
        $b.Text = $Text
        $b.Location = New-Object System.Drawing.Point($X, $Y)
        $b.Size = New-Object System.Drawing.Size($W, 32)
        # v750 — bake the FULL URL into the button's Tag at create-time
        # so the click handler doesn't depend on $script:_enginePort being
        # accessible at click time. The previous version produced URLs
        # like "http://localhost/index.html" (port missing) because
        # $script: scoping broke when WinForms event handlers ran from
        # the message pump in a runspace context that didn't share the
        # module's script scope.
        $b.Tag = "http://localhost:$($script:_enginePort)/$PathPart"
        # v750 — explicit black text + bold so the buttons are readable
        # when enabled (the system-default light blue on grey was illegible)
        $b.ForeColor = [System.Drawing.Color]::Black
        $b.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Bold)
        $b.Add_Click({
            try {
                Start-Process $this.Tag
                $script:lblStatus.Text = "Status: opened $($this.Tag)"
            } catch {
                try { $script:lblStatus.Text = "Status: launch failed: $_" } catch {}
            }
        }.GetNewClosure())
        if ($ToolTip) { $tip.SetToolTip($b, $ToolTip) }
        $qlPanel.Controls.Add($b)
        $script:_qlButtons += $b
        return $b
    }

    # Row 1 — at y=42, 4 buttons of width ~118 with 8px gaps
    _MakeLaunchBtn -Text "🌐 Open Engine"       -X 10  -Y 42 -W 118 -PathPart "index.html"          -ToolTip "Open the main 3D engine (browser). Heavy — best on a desktop."
    _MakeLaunchBtn -Text "📱 Phone Control"     -X 134 -Y 42 -W 118 -PathPart "control.html"        -ToolTip "Open the phone control panel — same URL you'd visit on your phone."
    _MakeLaunchBtn -Text "🧊 Voxel Viewer"      -X 258 -Y 42 -W 118 -PathPart "voxel-viewer.html"   -ToolTip "Phone Gemini voxel viewer + image gen + gallery."
    _MakeLaunchBtn -Text "📺 TV Remote"          -X 382 -Y 42 -W 118 -PathPart "control.html#tab-shield" -ToolTip "TV Remote tab of the phone control panel — Shield/Roku."

    # Row 2 — at y=80, 2 wider buttons + the debug viewer
    _MakeLaunchBtn -Text "🐛 Engine Debug Console" -X 10  -Y 80 -W 244 -PathPart "debug.html" -ToolTip "Unified Engine Debug Console (v742+) — engine console + Shield logcat + Roku/TV Remote events + bridge stdout on one live timeline. v743 — also replays the bridge's 500-line ring buffer on connect."
    _MakeLaunchBtn -Text "♟ RPS Multiplayer"      -X 258 -Y 80 -W 118 -PathPart "rps.html"   -ToolTip "Rock-Paper-Scissors May-Leonard multiplayer (v731+)."
    _MakeLaunchBtn -Text "📊 Benchmark"            -X 382 -Y 80 -W 118 -PathPart "benchmark.html" -ToolTip "WebGL benchmark page (v732+)."

    # Hint line
    $lblHint = New-Object System.Windows.Forms.Label
    $lblHint.Location = New-Object System.Drawing.Point(10, 118)
    $lblHint.Size = New-Object System.Drawing.Size(485, 16)
    $lblHint.Text = "Buttons disable when the engine bridge isn't reachable. Status updates every 2s."
    $lblHint.ForeColor = [System.Drawing.Color]::FromArgb(110, 130, 150)
    $lblHint.Font = New-Object System.Drawing.Font("Segoe UI", 7.5)
    $qlPanel.Controls.Add($lblHint)

    # Engine detection — quick HTTP ping to /clients with 800ms timeout.
    # Called from the existing 2s refresh timer (see below).
    # v749 — TCP-socket-based probe replacing the v744 HttpWebRequest
    # approach. The HTTP probe was blocking the UI thread indefinitely
    # in some configurations because HttpWebRequest.Timeout is per-phase
    # (DNS + connect + send + receive each get their own timeout) and
    # localhost dual-stack IPv6/IPv4 resolution can hang on Win11. The
    # TCP probe uses TcpClient.BeginConnect with a hard WaitOne(150ms)
    # cap — typically completes in <5ms on localhost. Uses 127.0.0.1
    # explicitly to skip DNS entirely.
    function _PingEngine {
        $tcp = $null
        $isOnline = $false
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.ReceiveTimeout = 150
            $tcp.SendTimeout = 150
            $async = $tcp.BeginConnect("127.0.0.1", $script:_enginePort, $null, $null)
            # Hard cap on the wait — UI thread never blocks longer than this
            $connected = $async.AsyncWaitHandle.WaitOne(150, $false)
            if ($connected -and $tcp.Connected) {
                try { $tcp.EndConnect($async) } catch {}
                $isOnline = $true
            }
        } catch {
            # ECONNREFUSED / unreachable — engine isn't running
        } finally {
            if ($tcp) { try { $tcp.Close() } catch {} }
        }
        if ($isOnline) {
            if (-not $script:_engineOnline) {
                $script:_engineOnline = $true
                $script:lblEngineStatus.Text = "Engine: ✓ detected at http://localhost:$($script:_enginePort)"
                $script:lblEngineStatus.ForeColor = [System.Drawing.Color]::FromArgb(120, 220, 140)
                foreach ($b in $script:_qlButtons) { $b.Enabled = $true }
            }
            return $true
        }
        if ($script:_engineOnline) {
            $script:_engineOnline = $false
            $script:lblEngineStatus.Text = "Engine: ✗ offline — start the bridge (port $($script:_enginePort)) to enable these buttons"
            $script:lblEngineStatus.ForeColor = [System.Drawing.Color]::FromArgb(220, 140, 140)
            foreach ($b in $script:_qlButtons) { $b.Enabled = $false }
        } elseif (-not $script:_engineOnline -and $script:lblEngineStatus.Text -eq "Engine: detecting…") {
            # First ping after dashboard open — disable buttons until detected
            $script:lblEngineStatus.Text = "Engine: ✗ offline — start the bridge (port $($script:_enginePort)) to enable these buttons"
            $script:lblEngineStatus.ForeColor = [System.Drawing.Color]::FromArgb(220, 140, 140)
            foreach ($b in $script:_qlButtons) { $b.Enabled = $false }
        }
        return $false
    }
    # Initial ping
    _PingEngine | Out-Null
    }   # end if (-not $script:_isStandalone) for Engine Quick Launch panel

    # Discord-link button (round 290 — surface the new integration)
    $btnDiscord = New-Object System.Windows.Forms.Button
    $btnDiscord.Text = "Test Discord"
    $btnDiscord.Location = New-Object System.Drawing.Point(170, 110)
    $btnDiscord.Size = New-Object System.Drawing.Size(120, 28)
    $btnDiscord.Add_Click({
        try {
            if (Get-Command -Name Invoke-KPopIntegrations -ErrorAction SilentlyContinue) {
                Invoke-KPopIntegrations -Toast @{
                    Title   = "Dashboard test"
                    Message = "Test ping from KPopDashboard at $((Get-Date).ToString('HH:mm:ss'))"
                    Color   = 0x4a90e2
                }
                $script:lblStatus.Text = "Status: test fired to integrations"
            } else {
                $script:lblStatus.Text = "Status: KPopDiscord not loaded — Import-Module KPopDiscord first"
            }
        } catch {
            try { $script:lblStatus.Text = "Status: integration test failed: $_" } catch {}
        }
    })
    $tip.SetToolTip($btnDiscord, "Fire a test integration ping. If Discord is configured (KPopDiscord module loaded + webhook in Credentials.bas), this posts a sample embed to the configured channel. Used to verify the integration is wired correctly without waiting for a real toast.")
    $form.Controls.Add($btnDiscord)

    # MQTT mirror toggle + status (only effective when the listener was
    # launched with -EnableMqtt; otherwise it just reports "not enabled").
    $script:chkMqttMirror = New-Object System.Windows.Forms.CheckBox
    $script:chkMqttMirror.Text = "Mirror to MQTT"
    $script:chkMqttMirror.Location = New-Object System.Drawing.Point(300, 20)
    $script:chkMqttMirror.Size = New-Object System.Drawing.Size(200, 24)
    try { $script:chkMqttMirror.Checked = [bool]($Global:Mqtt -and $Global:Mqtt.Publish) } catch { $script:chkMqttMirror.Checked = $false }
    $script:chkMqttMirror.Add_CheckedChanged({
        try {
            if ($Global:Mqtt) {
                $Global:Mqtt.Publish = $script:chkMqttMirror.Checked
                _SafeWriteLog "Dashboard: MQTT mirror set to $($Global:Mqtt.Publish)"
            }
        } catch {
            Write-Host "[KPopDashboard] MQTT toggle failed: $_" -ForegroundColor DarkYellow
        }
    })
    $tip.SetToolTip($script:chkMqttMirror, "Mirror to MQTT: publish every toast event as a JSON message on the configured MQTT topic. Lets other systems (Home Assistant, Node-RED, custom scripts) react to KPopListener events. Requires the listener to have been launched with -EnableMqtt and broker config; the checkbox is read-only otherwise.")
    $form.Controls.Add($script:chkMqttMirror)
    $lblMqttDesc = New-Object System.Windows.Forms.Label
    $lblMqttDesc.Location = New-Object System.Drawing.Point(318, 42)
    $lblMqttDesc.Size     = New-Object System.Drawing.Size(220, 14)
    $lblMqttDesc.Text     = "Publish every event to an MQTT topic"
    $lblMqttDesc.ForeColor = [System.Drawing.Color]::Gray
    $lblMqttDesc.Font     = New-Object System.Drawing.Font("Segoe UI", 7.5, [System.Drawing.FontStyle]::Italic)
    $form.Controls.Add($lblMqttDesc)

    $script:lblMqtt = New-Object System.Windows.Forms.Label
    $script:lblMqtt.Location = New-Object System.Drawing.Point(300, 62)
    $script:lblMqtt.Size = New-Object System.Drawing.Size(200, 36)
    $script:lblMqtt.Text = "MQTT: not enabled"
    $script:lblMqtt.ForeColor = [System.Drawing.Color]::Gray
    $form.Controls.Add($script:lblMqtt)

    # Round 295 — "How do I set up MQTT?" help button next to the status label.
    # Surfaces the actual launch command + an option to copy it to the clipboard.
    $script:btnMqttHelp = New-Object System.Windows.Forms.Button
    $script:btnMqttHelp.Text = "?  How to set up MQTT"
    $script:btnMqttHelp.Location = New-Object System.Drawing.Point(300, 100)
    $script:btnMqttHelp.Size = New-Object System.Drawing.Size(200, 28)
    $script:btnMqttHelp.Add_Click({
        $defaultBroker = if ($Global:Mqtt -and $Global:Mqtt.Broker) { $Global:Mqtt.Broker } else { "homeassistant.local" }
        $defaultPort   = if ($Global:Mqtt -and $Global:Mqtt.Port)   { $Global:Mqtt.Port   } else { 1883 }
        $defaultPub    = if ($Global:Mqtt -and $Global:Mqtt.PubTopic) { $Global:Mqtt.PubTopic } else { "kpoplistener/events" }
        $defaultSub    = if ($Global:Mqtt -and $Global:Mqtt.SubTopic) { $Global:Mqtt.SubTopic } else { "kpoplistener/commands" }
        $cmd = ".\KPopListener.ps1 -EnableMqtt -MqttBroker $defaultBroker -MqttPort $defaultPort -MqttPubTopic $defaultPub -MqttSubTopic $defaultSub"
        $msg = @"
MQTT is enabled at LISTENER STARTUP, not from the dashboard.
The listener has to know the broker before it boots so it can subscribe.

To enable MQTT:

  1. Close the running KPopListener (right-click the tray icon → Exit,
     or close the PowerShell window the listener is running in).

  2. Re-launch with these arguments:

     $cmd

  3. Once it's running, this dashboard's "Mirror to MQTT" checkbox
     becomes active and you can toggle publish on/off live.

Want to copy the launch command to your clipboard?
(Click Yes — then paste it into your PowerShell window after stopping
the current listener.)
"@
        $result = [System.Windows.Forms.MessageBox]::Show($form, $msg, "Set up MQTT for KPopListener",
            [System.Windows.Forms.MessageBoxButtons]::YesNo,
            [System.Windows.Forms.MessageBoxIcon]::Information)
        if ($result -eq [System.Windows.Forms.DialogResult]::Yes) {
            try {
                [System.Windows.Forms.Clipboard]::SetText($cmd)
                $script:lblStatus.Text = "Status: MQTT launch command copied to clipboard"
            } catch {
                $script:lblStatus.Text = "Status: clipboard copy failed: $_"
            }
        }
    })
    $tip.SetToolTip($script:btnMqttHelp, "Open a popup explaining how to enable MQTT (it's a launch flag, not a runtime toggle). Optionally copies the exact restart command to the clipboard.")
    $form.Controls.Add($script:btnMqttHelp)

    # v750 — Discord help button. Mirrors the MQTT help button layout
    # but for Discord webhook setup. Discord integration works STANDALONE
    # (the listener POSTs to a Discord webhook URL directly via
    # Invoke-RestMethod — no engine dependency) so this button is shown
    # in both engine-attached and standalone modes.
    $script:btnDiscordHelp = New-Object System.Windows.Forms.Button
    $script:btnDiscordHelp.Text = "?  How to set up Discord"
    $script:btnDiscordHelp.Location = New-Object System.Drawing.Point(300, 132)
    $script:btnDiscordHelp.Size = New-Object System.Drawing.Size(200, 28)
    $script:btnDiscordHelp.Add_Click({
        $msg = @"
Discord integration posts toast events to a Discord channel via a webhook URL.
It works STANDALONE — no engine required, no special launch flags.

To set it up:

  1. In Discord: Server Settings → Integrations → Webhooks → New Webhook.
     Pick the channel you want toasts to land in. Copy the webhook URL.

  2. Save the URL to Windows Credential Manager so the listener can
     find it without putting secrets in source control. Open PowerShell
     and run (paste the URL you copied):

     cmdkey /generic:KPopDiscord /user:webhook /pass:"PASTE_URL_HERE"

  3. Restart the listener (or open this dashboard freshly). Discord
     integration auto-loads if the credential is present.

  4. Click "Test Discord" on the dashboard to fire a test embed.

Notes:
  - The webhook URL has the form https://discord.com/api/webhooks/<id>/<token>
  - Don't share it — anyone with the URL can post to the channel.
  - To remove: cmdkey /delete:KPopDiscord
  - Standalone mode: works fully. Engine-attached mode: same, plus the
    engine can POST events via /discord/post to fire structured stat
    embeds (UFO kills, round scores, etc.).

Want to copy the cmdkey template to your clipboard?
"@
        $tmpl = 'cmdkey /generic:KPopDiscord /user:webhook /pass:"PASTE_URL_HERE"'
        $result = [System.Windows.Forms.MessageBox]::Show($form, $msg, "Set up Discord for KPopListener",
            [System.Windows.Forms.MessageBoxButtons]::YesNo,
            [System.Windows.Forms.MessageBoxIcon]::Information)
        if ($result -eq [System.Windows.Forms.DialogResult]::Yes) {
            try {
                [System.Windows.Forms.Clipboard]::SetText($tmpl)
                $script:lblStatus.Text = "Status: cmdkey template copied — replace PASTE_URL_HERE and run"
            } catch {
                $script:lblStatus.Text = "Status: clipboard copy failed: $_"
            }
        }
    })
    $tip.SetToolTip($script:btnDiscordHelp, "Open a popup explaining how to enable Discord integration via a webhook URL stored in Windows Credential Manager. Works standalone — no engine required.")
    $form.Controls.Add($script:btnDiscordHelp)

    # Timer for auto-refresh — disposed cleanly on FormClosed
    $timer = $null
    if ($AutoRefresh) {
        $timer = New-Object System.Windows.Forms.Timer
        $timer.Interval = 2000
        $timer.Add_Tick({
            try {
                _SafeUpdateListenerStatus
                # v744 — engine detection ping; updates lblEngineStatus +
                # enables/disables the Quick Launch buttons. v750 — only
                # run in engine-attached mode (in standalone mode, the
                # _PingEngine function isn't defined since the whole
                # panel is skipped).
                if (-not $script:_isStandalone) {
                    try { _PingEngine | Out-Null } catch {}
                }
                # Tick the uptime label if Stats is alive
                if ($Global:Stats -and $Global:Stats.StartTime) {
                    $up = (Get-Date) - $Global:Stats.StartTime
                    $script:lblUptime.Text = "Uptime: $('{0:D2}:{1:D2}:{2:D2}' -f [int]$up.TotalHours, $up.Minutes, $up.Seconds) · toasts=$($Global:Stats.TotalToasts)"
                }
                # Q2 — tail the shared event ring buffer into the console box.
                # Same-runspace path: $Global:RecentEvents is populated directly.
                $rendered = $false
                if ($Global:RecentEvents -and $Global:RecentEvents.Count -gt 0 -and $script:logBox) {
                    $n = $Global:RecentEvents.Count
                    if ($n -ne $script:_lastLogCount) {
                        $script:_lastLogCount = $n
                        $script:logBox.Text = ($Global:RecentEvents -join "`r`n")
                        $script:logBox.SelectionStart = $script:logBox.Text.Length
                        $script:logBox.ScrollToCaret()
                        $rendered = $true
                    } else {
                        $rendered = $true   # already showing the latest; don't fall through to file
                    }
                }
                # Round 295 — cross-runspace fallback. When the dashboard runs
                # in a separate STA runspace, $Global:RecentEvents is empty
                # because it's a different runspace's globals. KPopListener.ps1
                # round-295 also appends each event to a tail file; we read
                # that file when the in-process ring buffer is empty. Caches
                # last file size to skip re-read on no-change ticks.
                if (-not $rendered -and $script:logBox) {
                    try {
                        $eventLog = Join-Path $env:TEMP "KPopListener\events.log"
                        if (Test-Path $eventLog) {
                            $fi = Get-Item $eventLog
                            if ($fi.Length -ne $script:_lastFileSize) {
                                $script:_lastFileSize = $fi.Length
                                # Tail the last 200 lines so the box stays bounded
                                $tail = Get-Content $eventLog -Tail 200 -Encoding UTF8 -ErrorAction SilentlyContinue
                                if ($tail) {
                                    $script:logBox.Text = ($tail -join "`r`n")
                                    $script:logBox.SelectionStart = $script:logBox.Text.Length
                                    $script:logBox.ScrollToCaret()
                                }
                            }
                        }
                    } catch {
                        # Don't spam the console; the next tick will retry
                    }
                }
                # MQTT status line + help-button visibility
                if ($script:lblMqtt) {
                    if ($Global:Mqtt) {
                        $pub = if ($Global:Mqtt.Publish) { "pub→$($Global:Mqtt.PubTopic)" } else { "pub off" }
                        $sub = if ($Global:Mqtt.Subscribe) { "sub←$($Global:Mqtt.SubTopic)" } else { "sub off" }
                        $script:lblMqtt.Text = "MQTT $($Global:Mqtt.Broker):$($Global:Mqtt.Port)`r`n$pub · $sub"
                        $script:lblMqtt.ForeColor = if ($Global:Mqtt.Publish -or $Global:Mqtt.Subscribe) { [System.Drawing.Color]::DarkGreen } else { [System.Drawing.Color]::Gray }
                        if ($script:chkMqttMirror.Checked -ne [bool]$Global:Mqtt.Publish) { $script:chkMqttMirror.Checked = [bool]$Global:Mqtt.Publish }
                        $script:btnMqttHelp.Visible = $false
                    } else {
                        $script:lblMqtt.Text = "MQTT: not enabled"
                        $script:btnMqttHelp.Visible = $true
                    }
                }
            } catch {
                # Don't let a tick failure kill the timer — log + continue
                Write-Host "[KPopDashboard] timer tick error: $_" -ForegroundColor DarkYellow
            }
        })
        $timer.Start()
    }

    # Lifecycle: kill timer on close, prevent ObjectDisposedException
    # storm. Stash a ref to the timer on the form so the closed handler
    # can find it. Round 295 — also clears $Global:KPopDashboardForm so
    # the next Show-KPopDashboard call builds a fresh form.
    $form.Tag = $timer
    $form.Add_FormClosed({
        try {
            if ($form.Tag) {
                $form.Tag.Stop()
                $form.Tag.Dispose()
                $form.Tag = $null
            }
        } catch {}
        try { $Global:KPopDashboardForm = $null } catch {}
        _SafeWriteLog "Dashboard: closed"
    })

    $form.Topmost = $false   # was $true — fought with other apps
    $form.Add_Shown({ try { $form.Activate() } catch {} })

    # Round 290 — modal vs modeless. Default is modeless: form pops up,
    # caller resumes. Old behavior available via -Modal for blocking
    # scripts.
    if ($Modal) {
        [void]$form.ShowDialog()
        return [pscustomobject]@{ Form = $form; Runspace = $null; DispatchedAsync = $false }
    } else {
        $form.Show()
        return [pscustomobject]@{ Form = $form; Runspace = $null; DispatchedAsync = $false }
    }
}

function Start-KPopDashboard {
    param(
        [switch]$AutoRefresh,
        [switch]$Modal
    )
    Show-KPopDashboard -AutoRefresh:$AutoRefresh -Modal:$Modal
}

Export-ModuleMember -Function Show-KPopDashboard, Start-KPopDashboard
