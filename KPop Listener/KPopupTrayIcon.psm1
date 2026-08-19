# File: KPopupTrayIcon.psm1
# Path: KPopupSuite/Modules/KPopupTrayIcon.psm1
#
# Round 117 — Tray icon now runs in a dedicated STA runspace with its
# own WinForms message pump ([Windows.Forms.Application]::Run()).
# Previously the icon was created on the main listener thread, which
# is a console PowerShell host with no message pump, so the menu
# items were drawn but their Click handlers couldn't fire — hence
# the "spinning cursor over the menu" symptom.
#
# Architecture:
#   - Caller invokes Start-KPopupTrayIcon, gets back a controller object
#   - Internally we open a runspace in STA mode (WinForms requires STA)
#   - The runspace script creates the NotifyIcon + menu, then calls
#     Application::Run() — that blocks the runspace thread on a
#     proper message pump, so menu clicks dispatch normally
#   - The main script is unaffected: its pipe-listener loop continues
#     in its own thread
#
# Menu actions all execute inside the runspace's UI thread:
#   - Open Dashboard: imports KPopDashboard.psm1 + calls Show-KPopDashboard
#                     (no-op if a dashboard window is already open;
#                     module is idempotent on import)
#   - Open v1 Folder: Start-Process explorer.exe on the resolved path
#   - Exit: Application::Exit() to unblock the runspace pump,
#           then Stop-Process -Id $PID to terminate the listener
#
# Returns: [PSCustomObject] with Runspace + PowerShell + Sync members
# so the caller can dispose or query state. Sync.Ready becomes $true
# once the icon is visible; Sync.Error captures any startup failure.

Add-Type -AssemblyName System.Windows.Forms, System.Drawing -ErrorAction SilentlyContinue

function Start-KPopupTrayIcon {
    param(
        [string]$Tooltip = 'KPopup',
        [switch]$EnableMenu
    )

    # Shared state — the runspace writes Ready/Error; the caller polls.
    $sync = [hashtable]::Synchronized(@{
        Ready = $false
        Error = $null
        ExitRequested = $false
    })

    # STA + ReuseThread is mandatory for WinForms inside a runspace.
    # Default is MTA which throws on NotifyIcon access.
    $rs = [runspacefactory]::CreateRunspace()
    $rs.ApartmentState = 'STA'
    $rs.ThreadOptions = 'ReuseThread'
    $rs.Open()
    $rs.SessionStateProxy.SetVariable('sync', $sync)
    $rs.SessionStateProxy.SetVariable('tooltip', $Tooltip)
    $rs.SessionStateProxy.SetVariable('enableMenu', [bool]$EnableMenu)
    $rs.SessionStateProxy.SetVariable('scriptRoot', $PSScriptRoot)
    $rs.SessionStateProxy.SetVariable('parentPid', $PID)

    $ps = [powershell]::Create()
    $ps.Runspace = $rs
    [void]$ps.AddScript({
        try {
            Add-Type -AssemblyName System.Windows.Forms
            Add-Type -AssemblyName System.Drawing

            # v1602 — keep the message pump ALIVE through dispatch exceptions instead of letting one
            # (e.g. a WinForms internal throw when the console window minimizes) terminate the whole
            # listener process. Must be set BEFORE the first window/handle exists. Swallow + log so a
            # transient pump error degrades to a log line rather than "tray flashed then gone".
            try { [System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException) } catch {}
            try {
                [System.Windows.Forms.Application]::add_ThreadException({
                    param($s, $e)
                    try {
                        $cd = Join-Path $env:TEMP 'KPopLogs'
                        if (-not (Test-Path $cd)) { New-Item -ItemType Directory -Force -Path $cd | Out-Null }
                        $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
                        Add-Content -Path (Join-Path $cd ('KPop_crashes_' + (Get-Date -Format 'yyyyMMdd') + '.log')) -Value ("[$stamp] tray ThreadException (survived): " + $e.Exception.Message + "`r`n") -Encoding UTF8 -ErrorAction SilentlyContinue
                    } catch {}
                })
            } catch {}

            $ni = New-Object System.Windows.Forms.NotifyIcon
            $bmp = [System.Drawing.Bitmap]::new(32, 32)
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.Clear([System.Drawing.Color]::Transparent)
            $g.FillEllipse(
                [System.Drawing.SolidBrush]::new(
                    [System.Drawing.Color]::FromArgb(180, 30, 140, 60)
                ),
                4, 4, 24, 24
            )
            $g.Dispose()
            $ni.Icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
            $ni.Visible = $true
            $ni.Text = $tooltip

            if ($enableMenu) {
                $menu = New-Object System.Windows.Forms.ContextMenuStrip

                # Open Dashboard — try to import + call. Caught so that
                # a missing/broken dashboard module doesn't kill the
                # message pump.
                $m1 = $menu.Items.Add('Open Dashboard')
                $m1.add_Click({
                    try {
                        $dashPath = Join-Path $scriptRoot 'KPopDashboard.psm1'
                        if (Test-Path $dashPath) {
                            Import-Module $dashPath -Force -ErrorAction SilentlyContinue
                            if (Get-Command Show-KPopDashboard -ErrorAction SilentlyContinue) {
                                Show-KPopDashboard
                            } elseif (Get-Command Start-KPopDashboard -ErrorAction SilentlyContinue) {
                                Start-KPopDashboard -AutoRefresh
                            }
                        }
                    } catch {
                        [System.Windows.Forms.MessageBox]::Show(
                            "Dashboard failed: $_",
                            'KPopup Tray',
                            'OK', 'Warning'
                        ) | Out-Null
                    }
                })

                # Open v1 Folder — Start-Process is always safe from
                # any thread (it shells out to the OS).
                $m2 = $menu.Items.Add('Open v1 Folder')
                $m2.add_Click({
                    try {
                        $target = Join-Path (Split-Path -Parent $scriptRoot) 'v1'
                        if (Test-Path $target) {
                            Start-Process explorer.exe -ArgumentList $target
                        } else {
                            Start-Process explorer.exe -ArgumentList (Split-Path -Parent $scriptRoot)
                        }
                    } catch {}
                })

                # Open Engine -> submenu of engine web pages. Start-Process is
                # thread-safe (shells out to the OS / default browser). Each tool's
                # .html page doubles as its own install panel (maigret/scrapling have
                # Install buttons), so "open the page" also triggers/shows install.
                $engineMenu = New-Object System.Windows.Forms.ToolStripMenuItem
                $engineMenu.Text = 'Open Engine'
                $base = 'http://localhost:8787/'
                $pages = @(
                    @{ L = 'Main Engine';        U = $base },
                    @{ L = 'Control';            U = $base + 'control.html' },
                    @{ L = 'Settings';           U = $base + 'settings.html' },
                    @{ SEP = $true },
                    @{ L = 'Pip-Boy (Fallout)';  U = $base + 'fallout.html' },
                    @{ L = 'Starfield';          U = $base + 'starfield.html' },
                    @{ L = 'Solar';              U = $base + 'solar.html' },
                    @{ L = 'Trading Floor';      U = $base + 'tradingfloor.html' },
                    @{ L = 'Agenda';             U = $base + 'agenda.html' },
                    @{ L = 'Weather';            U = $base + 'weather.html' },
                    @{ L = 'Health';             U = $base + 'health.html' },
                    @{ L = 'Spectator';          U = $base + 'spectator.html' },
                    @{ L = 'AI Brain';           U = $base + 'aibrain.html' },
                    @{ L = 'PetFBI';             U = $base + 'petfbi.html' },
                    @{ L = 'Doc Skills';         U = $base + 'doc.html' },
                    @{ L = 'Maigret (install)';  U = $base + 'maigret.html' },
                    @{ L = 'Scrapling (install)';U = $base + 'scrapling.html' },
                    @{ L = 'Hosting / LAN';      U = $base + 'hosting.html' },
                    @{ SEP = $true },
                    @{ L = 'Discord';            U = 'https://discord.com/channels/@me' },
                    @{ L = 'Twitter / X';        U = 'https://x.com' }
                )
                # v1087 — let an external JSON config override the link list so
                # Keith can edit Discord/Twitter (and any engine page) without touching
                # code. engine-links.json sits next to this module:
                #   { "base": "http://localhost:8787/",
                #     "links": [ {"label":"Control","path":"control.html"},
                #                {"sep":true},
                #                {"label":"Discord","url":"https://..."} ] }
                # Missing/broken file -> the built-in $pages defaults above are used.
                $linksPath = Join-Path $scriptRoot 'engine-links.json'
                if (Test-Path $linksPath) {
                    try {
                        $cfg = Get-Content -Path $linksPath -Raw -Encoding UTF8 | ConvertFrom-Json
                        if ($cfg -and $cfg.links) {
                            $cfgBase = if ($cfg.base) { [string]$cfg.base } else { $base }
                            $pages = @()
                            foreach ($lnk in $cfg.links) {
                                if ($lnk.sep) { $pages += @{ SEP = $true }; continue }
                                $u = if ($lnk.url) { [string]$lnk.url } else { $cfgBase + [string]$lnk.path }
                                $pages += @{ L = [string]$lnk.label; U = $u }
                            }
                            Write-Host "[tray] loaded $($pages.Count) link(s) from engine-links.json" -ForegroundColor DarkGray
                        }
                    } catch {
                        Write-Host "[tray] engine-links.json unreadable, using defaults: $_" -ForegroundColor Yellow
                    }
                }
                foreach ($p in $pages) {
                    if ($p.SEP) {
                        $engineMenu.DropDownItems.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
                        continue
                    }
                    $item = New-Object System.Windows.Forms.ToolStripMenuItem
                    $item.Text = $p.L
                    $item.Tag  = $p.U
                    # Use the sender's .Tag (param $s) so each item keeps its own URL
                    # rather than capturing the loop variable's final value.
                    $item.add_Click({ param($s, $e) try { Start-Process $s.Tag } catch {} })
                    $engineMenu.DropDownItems.Add($item) | Out-Null
                }
                $menu.Items.Add($engineMenu) | Out-Null

                # Engine status -> PowerShell debug console. Pings the bridge and
                # writes the result to this listener's console (the stdout the
                # engine also streams as ps_log events).
                $mStat = $menu.Items.Add('Engine status (console)')
                $mStat.add_Click({
                    try {
                        $r = Invoke-WebRequest -Uri 'http://localhost:8787/kpop/status' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
                        Write-Host ("[tray] engine bridge OK -> " + $r.Content) -ForegroundColor Green
                    } catch {
                        Write-Host '[tray] engine bridge NOT reachable on http://localhost:8787 - start the engine/bridge first.' -ForegroundColor Yellow
                    }
                })

                # Exit — stop the message pump (unblocks Application::Run
                # below), then kill the parent process so the listener
                # quits cleanly. Without Application::Exit() first, the
                # Stop-Process from inside the click handler would still
                # leave the icon in the tray briefly.
                $m3 = $menu.Items.Add('Exit')
                $m3.add_Click({
                    $sync.ExitRequested = $true
                    $ni.Visible = $false
                    [System.Windows.Forms.Application]::Exit()
                    try {
                        Stop-Process -Id $parentPid -Force -ErrorAction SilentlyContinue
                    } catch {}
                })

                $ni.ContextMenuStrip = $menu
            }

            $sync.Ready = $true
            # Blocks the runspace thread on a real WinForms message
            # pump. Returns when Application::Exit() is called.
            [System.Windows.Forms.Application]::Run()

            try { $ni.Visible = $false; $ni.Dispose() } catch {}
        } catch {
            $sync.Error = $_.Exception.Message
            $sync.Ready = $true
        }
    })

    # Fire-and-forget: the runspace runs until Application::Exit()
    [void]$ps.BeginInvoke()

    # Wait up to 2s for Ready / Error
    $waitMs = 0
    while (-not $sync.Ready -and $waitMs -lt 2000) {
        Start-Sleep -Milliseconds 50
        $waitMs += 50
    }
    if ($sync.Error) {
        try { $ps.Dispose(); $rs.Dispose() } catch {}
        throw "tray icon runspace failed: $($sync.Error)"
    }

    return [PSCustomObject]@{
        Sync       = $sync
        Runspace   = $rs
        PowerShell = $ps
    }
}

Export-ModuleMember -Function Start-KPopupTrayIcon
