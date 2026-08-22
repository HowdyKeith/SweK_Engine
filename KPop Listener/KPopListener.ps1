<#
.SYNOPSIS
KPopListener.ps1 v26.0 PA8 — PS5.1 + PS7.5+ FULLY COMPATIBLE

.DESCRIPTION
- Named pipe (byte-mode with ACK / optional raw stream)
- RaiseEventMode support (async event-based pipe listener)
- File watcher fallback
- WinRT native toasts + BurntToast fallback
- BurntToast used for startup progress & Ready link toast
- HTTP dashboard with live controls for UseRawStream & RaiseEventMode
- Custom URI protocol registration (kpop:) for callback buttons
#>

[CmdletBinding()]
param(
[switch]$Background,
[switch]$NoStartupToast,
[switch]$NoDashboard,
[int]$Port = 0,
[int]$WebSocketPort = 8080,
[switch]$EnableWebSocket,
[switch]$EnableMqtt,
[string]$MqttBroker = "localhost",
[int]$MqttPort = 1883,
[string]$MqttPubTopic = "kpop/events",
[string]$MqttSubTopic = "kpop/in",
[string]$MqttUser = "",
[string]$MqttPass = "",
[switch]$MqttTls,
[string]$MqttCaFile = "",
[switch]$MqttInsecure,
[switch]$RegisterProtocol,
# v985 — restore ClipSaver: launch the clipboard auto-save watcher alongside
# the listener. -ClipSaverFolder overrides where versioned files land.
[switch]$ClipSaver,
[string]$ClipSaverFolder = "",
# v986 — speech offload: the listener owns the voice synths and speaks
# asynchronously for any caller (Excel/VBA, etc.), so they never block on it.
[switch]$TTS,
[switch]$NoVoice,
[switch]$Greet,
[string]$GreetText = "Kay-Pop listener online. Voice offload is ready."
)

# v1554 — write any uncaught/terminating error to a crash file so the SweK Engine server
# view can show it (GET /kpop/crash) even when this window is minimized. The launcher runs
# with -NoExit so the window also stays up showing the error; 'continue' keeps the listener
# alive through a transient error instead of letting it exit silently.
trap {
    try {
        $crashDir = Join-Path $env:TEMP 'KPopLogs'
        if (-not (Test-Path $crashDir)) { New-Item -ItemType Directory -Force -Path $crashDir | Out-Null }
        $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        $detail = ''
        try { $detail = ($_ | Out-String) } catch {}
        $stk = ''
        try { $stk = [string]$_.ScriptStackTrace } catch {}
        $body = "[$stamp] KPopListener FATAL`r`n$detail`r`n$stk`r`n"
        Set-Content -Path (Join-Path $crashDir 'KPop_last_crash.txt') -Value $body -Encoding UTF8 -ErrorAction SilentlyContinue
        Add-Content -Path (Join-Path $crashDir ('KPop_crashes_' + (Get-Date -Format 'yyyyMMdd') + '.log')) -Value $body -Encoding UTF8 -ErrorAction SilentlyContinue
        Write-Host $body -ForegroundColor Red
    } catch {}
    continue
}

# v1602 — the trap above only catches PowerShell terminating errors on THIS thread. A crash on a
# background/STA thread (e.g. the tray icon's WinForms message pump when the window minimizes) terminates
# the process with NO PowerShell error, which is why "tray flashed then gone" left no crash log.
# v2194 — the v1602 hook was a POWERSHELL SCRIPTBLOCK registered as the AppDomain handler. .NET invokes
# that delegate ON THE CRASHING THREAD, which has no runspace — so the scriptblock itself threw
# "There is no Runspace available to run scripts in this thread", the crash file was NEVER written,
# and the process still died with nothing in KPopLogs. The hook is now a small compiled C# class:
# pure .NET file IO, safe from ANY thread, no runspace needed. GET /kpop/crash finally shows the truth.
try {
    if (-not ('KPopCrashHook' -as [type])) {
        Add-Type -ErrorAction SilentlyContinue -TypeDefinition @"
using System;
using System.IO;
public static class KPopCrashHook {
    public static void Install() {
        AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs e) {
            try {
                string dir = Path.Combine(Path.GetTempPath(), "KPopLogs");
                Directory.CreateDirectory(dir);
                string stamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                string what = (e.ExceptionObject == null) ? "(null exception object)" : e.ExceptionObject.ToString();
                string body = "[" + stamp + "] KPopListener UNHANDLED (AppDomain, thread-safe hook)" +
                              (e.IsTerminating ? " [TERMINATING]" : "") + "\r\n" + what + "\r\n";
                File.WriteAllText(Path.Combine(dir, "KPop_last_crash.txt"), body);
                File.AppendAllText(Path.Combine(dir, "KPop_crashes_" + DateTime.Now.ToString("yyyyMMdd") + ".log"), body);
            } catch {}
        };
    }
}
"@
    }
    [KPopCrashHook]::Install()
} catch {
    Write-Host "[KPopListener] crash-hook install failed (continuing): $_" -ForegroundColor Yellow
}

# ---- Constants (can be overridden by dashboard) ----

$global:UseRawStream = $true
$global:RaiseEventMode = $false

# ---- v985 -- quiet / verbose output ----------------------------------------
# QUIET by default: only warnings/errors and a few intentional confirmations
# print. Pass -Verbose to see the full module-load / status stream that used to
# print every run. Write-Info mirrors Write-Host's common params so an info line
# can be gated with a one-word swap (Write-Host -> Write-Info).
$Script:KpopVerbose = ($VerbosePreference -eq 'Continue')
function Write-Info {
    param([Parameter(Position=0)][string]$Object = '',
          [System.ConsoleColor]$ForegroundColor = [System.ConsoleColor]::Gray,
          [switch]$NoNewline)
    if ($Script:KpopVerbose) { Write-Host $Object -ForegroundColor $ForegroundColor -NoNewline:$NoNewline }
}

# ---- v1277 / PATCH-1 -- mirror listener chatter to the ai-bridge live debug console
# Every full Write-Host line is also POSTed to http://127.0.0.1:8787/sys/logs so it
# shows in server.html alongside the bridge's own debug. Fire-and-forget via a shared
# HttpClient (never awaited) so the listener NEVER blocks on the bridge being up/down.
# Progress spinners (-NoNewline) are skipped to keep the web console clean.
#
# PATCH-1 (brace fix): this entire block previously sat INSIDE Write-Info's body --
# a merge landed it one brace too deep. Consequences: the Write-Host shadow and
# Send-BridgeLog were scoped to each Write-Info CALL and vanished on return (bridge
# mirroring never actually ran), and every Write-Info call allocated a fresh,
# undisposed HttpClient (handle churn). Now at script scope: ONE HttpClient, the
# shadow persists, mirroring works.
$Script:BridgeLogUrl = "http://127.0.0.1:8787/sys/logs"
$Script:BridgeHttp = $null
try { $Script:BridgeHttp = New-Object System.Net.Http.HttpClient; $Script:BridgeHttp.Timeout = [TimeSpan]::FromSeconds(2) } catch { }
function Send-BridgeLog {
    param([string]$Text, [string]$Level = "log")
    if (-not $Text -or -not $Script:BridgeHttp) { return }
    try {
        $json = @{ level = $Level; msg = $Text; src = "listener" } | ConvertTo-Json -Compress
        $content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, "application/json")
        [void]$Script:BridgeHttp.PostAsync($Script:BridgeLogUrl, $content)   # not awaited = non-blocking
    } catch { }
}
# Shadow Write-Host so existing chatter mirrors to the bridge while still printing.
function Write-Host {
    param(
        [Parameter(ValueFromPipeline=$true, Position=0)] $Object,
        [System.ConsoleColor]$ForegroundColor, [System.ConsoleColor]$BackgroundColor,
        [switch]$NoNewline, [string]$Separator)
    $p = @{}
    if ($PSBoundParameters.ContainsKey('ForegroundColor')) { $p.ForegroundColor = $ForegroundColor }
    if ($PSBoundParameters.ContainsKey('BackgroundColor')) { $p.BackgroundColor = $BackgroundColor }
    if ($NoNewline) { $p.NoNewline = $true }
    if ($PSBoundParameters.ContainsKey('Separator')) { $p.Separator = $Separator }
    Microsoft.PowerShell.Utility\Write-Host @p $Object
    if (-not $NoNewline) {
        $lvl = "log"
        if ($PSBoundParameters.ContainsKey('ForegroundColor')) {
            if ($ForegroundColor -eq [System.ConsoleColor]::Red -or $ForegroundColor -eq [System.ConsoleColor]::DarkRed) { $lvl = 'error' }
            elseif ($ForegroundColor -eq [System.ConsoleColor]::Yellow -or $ForegroundColor -eq [System.ConsoleColor]::DarkYellow) { $lvl = 'warn' }
        }
        Send-BridgeLog -Text ([string]$Object) -Level $lvl
    }
}
# -------------------------------------------------------------------------------

# ---- Directories / Temp Files ----

$ScriptVersion    = "26.2"   # v2194 — bumped so kpop-guard syncs this fixed build over any stale sibling copy
$AppID            = "KPop.Pop"
$AppDisplayName   = "KPop Pop!"
$TempDir          = "$env:TEMP\KPopListener"
$PidFile          = "$TempDir\KPopListener.pid"
$StatusFile       = "$TempDir\ListenerStatus.json"
$RequestLog       = "$TempDir\ToastRequests.log"
$StartConfirmFile = "$TempDir\start.confirmed"
$ForceBTFile      = "$TempDir\forcebt.flag"

if (-not (Test-Path $TempDir)) { New-Item -Path $TempDir -ItemType Directory -Force | Out-Null }

# v26.1 -- publish PID + version for the launcher's same-version guard
# (installers\kpop-guard.ps1). The PID lets the guard fully stop a superseded
# listener: with -NoExit the host process outlives the script after a
# control-file 'exit' and pins its cwd, which blocks pruning of old
# EngineProject_vNNN folders. The version file lets an engine auto-update
# SKIP relaunching us when the bundled listener is the same build, so
# toasts/pipes keep flowing uninterrupted through the update.
try { [string]$PID | Set-Content -Path $PidFile -Encoding ASCII -Force } catch {}
try { Set-Content -Path (Join-Path $TempDir 'Listener_Version.txt') -Value $ScriptVersion -Encoding ASCII -Force } catch {}

# ---- Global State ----

$global:Stats = @{ StartTime = Get-Date; TotalToasts=0; PipeToasts=0; FileToasts=0; Failures=0; LastToastTitle="None"; LastToastTime=$null; Version=$ScriptVersion }
# Shared recent-events ring buffer — the dashboard's console box tails this (Q2).
$global:RecentEvents = [System.Collections.ArrayList]::new()
# Round 295 — cross-runspace events bridge. The dashboard can run in a
# separate STA runspace (KPopShim's default for non-blocking launch),
# which means $global:RecentEvents in this runspace is invisible to the
# dashboard's $Global:RecentEvents. To make the dashboard's event console
# actually show events regardless of runspace topology, we also append
# each event to a tail file the dashboard reads. Path is fixed +
# predictable so the dashboard's timer can locate it without IPC.
$global:RecentEventsFile = $null
try {
    $_eventsDir = Join-Path $env:TEMP "KPopListener"
    if (-not (Test-Path $_eventsDir)) { New-Item -ItemType Directory -Path $_eventsDir -Force | Out-Null }
    $global:RecentEventsFile = Join-Path $_eventsDir "events.log"
    # Truncate at boot — we don't want a multi-day-old log scrolling past.
    Set-Content -Path $global:RecentEventsFile -Value "" -Encoding UTF8 -Force
} catch {
    Write-Host "[KPopListener] couldn't open events.log for tailing: $_" -ForegroundColor DarkYellow
}
function Add-RecentEvent($evt) {
    try {
        $s = if ($evt -is [string]) { $evt } else { try { ($evt | ConvertTo-Json -Compress -Depth 4) } catch { [string]$evt } }
        $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $s
        [void]$global:RecentEvents.Add($line)
        while ($global:RecentEvents.Count -gt 200) { $global:RecentEvents.RemoveAt(0) }
        # Round 295 — also append to the cross-runspace tail file. Best-effort;
        # a failure here doesn't break the in-process ring buffer.
        if ($global:RecentEventsFile) {
            try { Add-Content -Path $global:RecentEventsFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue } catch {}
        }
        return $line
    } catch { return $null }
}
# ---- PATCH-4 -- toast rate limiter (new) -----------------------------------
# Token window: allow at most KPOP_TOAST_RATE toasts per KPOP_TOAST_WINDOW
# seconds (defaults 5 per 10s). A chatty MQTT topic can no longer storm the
# desktop; suppressed messages still land in RecentEvents and the tail file.
# When the window reopens, one summary line notes how many were suppressed.
$Script:ToastRateMax    = 5
$Script:ToastRateWindow = 10
try { if ($env:KPOP_TOAST_RATE)   { $Script:ToastRateMax    = [int]$env:KPOP_TOAST_RATE } }   catch {}
try { if ($env:KPOP_TOAST_WINDOW) { $Script:ToastRateWindow = [int]$env:KPOP_TOAST_WINDOW } } catch {}
$Script:ToastTimes      = [System.Collections.Queue]::new()
$Script:ToastSuppressed = 0
function Test-KPopToastAllowed {
    $now = Get-Date
    while ($Script:ToastTimes.Count -gt 0 -and ($now - [datetime]$Script:ToastTimes.Peek()).TotalSeconds -gt $Script:ToastRateWindow) {
        [void]$Script:ToastTimes.Dequeue()
    }
    if ($Script:ToastTimes.Count -lt $Script:ToastRateMax) {
        $Script:ToastTimes.Enqueue($now)
        if ($Script:ToastSuppressed -gt 0) {
            Add-RecentEvent ("rate-limit: {0} toast(s) suppressed in the last window" -f $Script:ToastSuppressed) | Out-Null
            $Script:ToastSuppressed = 0
        }
        return $true
    }
    $Script:ToastSuppressed++
    return $false
}
# -----------------------------------------------------------------------------
$global:IsRunning = $true
$global:Paused = $false   # v1505 — pause = idle/resident (keep the loop alive); only 'exit' ends it
$global:MessageQueue = [System.Collections.Concurrent.ConcurrentQueue[object]]::new()
$global:BasePipeName = "KPopListenerPipe_$PID"
$global:WinRTAvailable = $false
$global:BurntToastAvailable = $false
$global:EngineSync = [hashtable]::Synchronized(@{ UseWinRT = $true })
$global:UseWinRT = $true

# ---- Load Common Functions ----

$commonModule = Join-Path $PSScriptRoot "KPopCommon.psm1"
try { if (Test-Path $commonModule) { Import-Module $commonModule -Force } } catch { Write-Host "[KPopListener] startup step failed (common, continuing): $_" -ForegroundColor Yellow }

$mqttModule = Join-Path $PSScriptRoot "KPopMqtt.psm1"
if ($EnableMqtt -and (Test-Path $mqttModule)) { Import-Module $mqttModule -Force }

# ---- Load Pipes Module ----

$pipesModule = Join-Path $PSScriptRoot "KPopPipes.psm1"
try { if (Test-Path $pipesModule) { Import-Module $pipesModule -Force } } catch { Write-Host "[KPopListener] startup step failed (pipes, continuing): $_" -ForegroundColor Yellow }

# ---- Load Dashboard ----

$dashboardModule = Join-Path $PSScriptRoot "KPopDashboard.psm1"
try { if (-not $NoDashboard -and (Test-Path $dashboardModule)) { Import-Module $dashboardModule -Force } } catch { Write-Host "[KPopListener] startup step failed (dashboard-import, continuing): $_" -ForegroundColor Yellow }

# ---- Round 63 — Load toast / AppID / tray modules ----
# These modules existed in the repo but were never imported, so the
# functions they export ($Send-BurntToastNotification, $Register-AppID,
# $Start-KPopupTrayIcon) were unreachable. That left the script calling
# names like Show-StartupProgress / Send-BurntToastNotif that simply
# don't exist anywhere, throwing CommandNotFoundException at startup.
$toastModule = Join-Path $PSScriptRoot "KPopToast.psm1"
try { if (Test-Path $toastModule) { Import-Module $toastModule -Force } } catch { Write-Host "[KPopListener] startup step failed (toast, continuing): $_" -ForegroundColor Yellow }

$appIdModule = Join-Path $PSScriptRoot "AppIDManager.psm1"
try { if (Test-Path $appIdModule) { Import-Module $appIdModule -Force } } catch { Write-Host "[KPopListener] startup step failed (appid, continuing): $_" -ForegroundColor Yellow }

$trayModule = Join-Path $PSScriptRoot "KPopupTrayIcon.psm1"
try { if (Test-Path $trayModule) { Import-Module $trayModule -Force } } catch { Write-Host "[KPopListener] startup step failed (tray-import, continuing): $_" -ForegroundColor Yellow }

# v709 — wire the KPopDiscord plugin (Round 290) back in. The module
# defines `Send-DiscordWebhook` + a plugin shape that mirrors toasts
# to a Discord channel. It was never imported by KPopListener.ps1 so
# the integration sat dormant. We import it here AND auto-register
# the plugin if a webhook URL is configured via env var or credential.
$discordModule = Join-Path $PSScriptRoot "KPopDiscord.psm1"
if (Test-Path $discordModule) {
    try {
        Import-Module $discordModule -Force
        $webhookUrl = $env:KPOP_DISCORD_WEBHOOK
        if ([string]::IsNullOrWhiteSpace($webhookUrl)) {
            # Optional: read from a "DISCORD_WEBHOOK_URL" entry in
            # Credentials.bas-format (one "Name=Value" per line) if it
            # lives next to KPopListener.ps1. Strictly opt-in — no
            # auto-creation, no scraping the network.
            $credPath = Join-Path $PSScriptRoot "Credentials.bas"
            if (Test-Path $credPath) {
                $line = Get-Content $credPath -ErrorAction SilentlyContinue |
                        Where-Object { $_ -match '^DISCORD_WEBHOOK_URL\s*=\s*(.+)$' } |
                        Select-Object -First 1
                if ($line) { $webhookUrl = ($line -split '=', 2)[1].Trim() }
            }
        }
        if (-not [string]::IsNullOrWhiteSpace($webhookUrl)) {
            if (Get-Command New-DiscordIntegrationPlugin -ErrorAction SilentlyContinue) {
                $discordPlugin = New-DiscordIntegrationPlugin -WebhookUrl $webhookUrl
                if ($discordPlugin -and (Get-Command Register-KPopPlugin -ErrorAction SilentlyContinue)) {
                    Register-KPopPlugin -Type Integration -Plugin $discordPlugin
                    Write-Info "[KPopListener] Discord integration registered (webhook configured)" -ForegroundColor Green
                }
            }
        } else {
            Write-Info "[KPopListener] KPopDiscord module loaded (set KPOP_DISCORD_WEBHOOK env var or DISCORD_WEBHOOK_URL in Credentials.bas to enable)" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "[KPopListener] KPopDiscord wiring failed: $_" -ForegroundColor Yellow
    }
}

# ---- v26 shim — restores the four functions the main script calls but
# that no bundled module defines: Start-PipeListener,
# Start-PipeListenerAsync, Start-FileWatcher, Process-Message. The
# Get-Command guards farther down silently swallow CommandNotFound when
# these are missing, leaving the listener cosmetic-only (startup toast
# + tray + dashboard, no pipe processing). With the shim loaded, the
# engine's bridge writes to \\.\pipe\KPopListenerPipe_<PID> arrive in
# $global:MessageQueue and Process-Message emits the real toast.
$shimModule = Join-Path $PSScriptRoot "KPopShim.psm1"
try { if (Test-Path $shimModule) { Import-Module $shimModule -Force } } catch { Write-Host "[KPopListener] startup step failed (shim, continuing): $_" -ForegroundColor Yellow }

# ---- Round 63 — Shim functions ----
# The main script references four function names that don't exist in
# any module. Three are pure UX (startup progress / spinner / ready
# toast); one is a rename (Send-BurntToastNotif vs Send-BurntToast-
# Notification). Define them here so the call sites below work.

# Wrapper preserving the older Send-BurntToastNotif(-Title -Message
# -ButtonText -ButtonUrl) call signature. The current module exports
# Send-BurntToastNotification which takes a typed [ToastConfig] object,
# incompatible with the existing call sites.
function Send-BurntToastNotif {
    param(
        [string]$Title,
        [string]$Message,
        [string]$ButtonText,
        [string]$ButtonUrl
    )
    if (-not $global:BurntToastAvailable) {
        Write-Host "[KPopListener] BurntToast module not available; toast skipped." -ForegroundColor Yellow
        return
    }
    try {
        # Round 109 — was: $params = @{ Text = @(...); AppId = $AppID }
        # BurntToast 1.1.0's New-BurntToastNotification does NOT accept
        # -AppId as a top-level parameter; passing it triggers
        # "parameter cannot be found" and the toast silently fails.
        # AppId in BurntToast 1.x is managed via the registered AppID
        # (which happens automatically at module load — see
        # AppIDManager v2.0.0 import above). Dropping AppId from the
        # splat makes the toast actually render.
        $params = @{ Text = @($Title, $Message) }
        # v1469 - avatar toast thumbnail (engine renders the current avatar -> bridge writes this PNG)
        $avatarLogo = Join-Path $env:USERPROFILE ".voxelbridge\kpop-avatar.png"
        if (Test-Path $avatarLogo) { $params.AppLogo = $avatarLogo }
        if ($ButtonText -and $ButtonUrl) {
            $btn = New-BTButton -Content $ButtonText -Arguments $ButtonUrl
            $params.Button = $btn
        }
        New-BurntToastNotification @params
        if ($global:Stats) { $global:Stats.TotalToasts++ }
    } catch {
        Write-Host "[KPopListener] Send-BurntToastNotif failed: $_" -ForegroundColor Red
    }
}

# Simple ASCII progress bar shown in the listener console at startup.
# Pure UX, no external dependency.
function Show-StartupProgress {
    param([int]$Steps = 4, [int]$DelayMs = 400)
    for ($i = 1; $i -le $Steps; $i++) {
        $bar = ('#' * $i) + ('-' * ($Steps - $i))
        Write-Info ("Starting {0}  [{1}] {2}/{3}" -f $AppDisplayName, $bar, $i, $Steps) -ForegroundColor Cyan
        Start-Sleep -Milliseconds $DelayMs
    }
}

# Brief spinner shown while WinRT initializes. Just visual confirmation
# that the platform is being warmed up; doesn't actually invoke any WinRT
# API since that's done elsewhere.
function Show-WinRTSpinner {
    param([int]$DurationSec = 2)
    $frames = @("|","/","-","\")
    $end = (Get-Date).AddSeconds($DurationSec)
    $i = 0
    while ((Get-Date) -lt $end) {
        Write-Host ("`r[WinRT] {0} initializing notification platform..." -f $frames[$i % $frames.Count]) -NoNewline -ForegroundColor Yellow
        $i++
        Start-Sleep -Milliseconds 100
    }
    Write-Info "`r[WinRT] notification platform ready                                " -ForegroundColor Green
}

# Wrapper for renamed Register-AppID in AppIDManager.psm1.
function Register-KPopAppID {
    if (Get-Command Register-AppID -ErrorAction SilentlyContinue) {
        try {
            Register-AppID -AppId $AppID -DisplayName $AppDisplayName | Out-Null
            Write-Info "[KPopListener] AppID registered: $AppID" -ForegroundColor DarkGray
        } catch {
            Write-Host "[KPopListener] Register-AppID failed: $_" -ForegroundColor Yellow
        }
    }
}

# ---- Toast Initialization ----

$global:WinRTAvailable = try { $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]; $true } catch { $false }
try { Import-Module BurntToast -ErrorAction Stop; $global:BurntToastAvailable = $true } catch {}

# ---- Protocol registration ----

if ($RegisterProtocol.IsPresent) { Register-KPopProtocol }

# ---- Register AppID ----

if (Get-Command Register-KPopAppID -ErrorAction SilentlyContinue) {
    Register-KPopAppID
} else {
    Write-Info "[KPopListener] Register-KPopAppID not defined; skipping AppID registration." -ForegroundColor DarkGray
}

# ---- Dashboard helpers ----

function Apply-DashboardSettings {
param([switch]$Force)
# PATCH-3: called every 5s from the main loop, this used to tear down and
# rebuild the pipe runspace UNCONDITIONALLY -- ~720 restarts/hour, each one
# stranding the alias ThreadJob blocked in WaitForConnection and leaving a
# window where senders hit a dead pipe. Now it restarts only when the
# effective config actually changed, when no listener is live (covers the
# shim's restart_pipes, which calls Stop-PipeListener first), or -Force.
$cfg = "$($global:RaiseEventMode)|$($global:UseRawStream)"
$live = $false
if (Get-Command Test-PipeListenerLive -ErrorAction SilentlyContinue) { $live = Test-PipeListenerLive }
if (-not $Force -and $live -and ($Script:AppliedPipeConfig -eq $cfg)) { return }
$Script:AppliedPipeConfig = $cfg
if ($global:RaiseEventMode) {
if (Get-Command Start-PipeListenerAsync -ErrorAction SilentlyContinue) {
$global:PipeHandle = Start-PipeListenerAsync -PipeName $global:BasePipeName -UseRawStream:$global:UseRawStream
Write-Log "Pipe listener started in event mode (RaiseEventMode=True)" "SUCCESS"
}
} else {
if (Get-Command Start-PipeListener -ErrorAction SilentlyContinue) {
$global:PipeHandle = Start-PipeListener -PipeName $global:BasePipeName -UseRawStream:$global:UseRawStream
Write-Log "Pipe listener started in runspace loop mode (RaiseEventMode=False)" "SUCCESS"
}
}
}

# ---- Start listener based on initial constants ----

try { Apply-DashboardSettings } catch { Write-Host "[KPopListener] pipe/listener init failed (continuing): $_" -ForegroundColor Yellow }

# ---- File watcher (optional fallback) ----

if (Get-Command Start-FileWatcher -ErrorAction SilentlyContinue) {
$global:FileWatcher = Start-FileWatcher
Write-Log "File watcher started" "SUCCESS"
}

# ---- Dashboard GUI ----

if (-not $NoDashboard) { try { $global:DashboardHandle = Start-KPopDashboard -AutoRefresh } catch { Write-Host "[KPopListener] dashboard start failed (continuing headless): $_" -ForegroundColor Yellow } }

# ---- Optional MQTT transport (opt-in via -EnableMqtt) ----
if ($EnableMqtt -and (Get-Command Initialize-KPopMqtt -ErrorAction SilentlyContinue)) {
    Initialize-KPopMqtt -Broker $MqttBroker -Port $MqttPort `
        -PubTopic $MqttPubTopic -SubTopic $MqttSubTopic `
        -Username $MqttUser -Password $MqttPass `
        -UseTls:$MqttTls -CaFile $MqttCaFile -Insecure:$MqttInsecure `
        -Publish -Subscribe
    Start-KPopMqtt
    Add-RecentEvent "MQTT enabled: pub '$MqttPubTopic' / sub '$MqttSubTopic' @ ${MqttBroker}:$MqttPort" | Out-Null
}
try { Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue } catch {}

# ---- Round 63 / Round 117 — System tray icon + right-click menu ----
# Round 63 added the icon, Round 117 fixed the click handlers: the icon
# now runs in a dedicated STA runspace with its own WinForms message
# pump. Previously the icon was created on the main listener thread
# (a console PowerShell host with no message pump), so menu items
# couldn't dispatch — "spinning cursor over menu" symptom. The new
# implementation in KPopupTrayIcon.psm1 isolates the UI thread; the
# main thread's pipe-listener loop is unaffected.
if (Get-Command Start-KPopupTrayIcon -ErrorAction SilentlyContinue) {
    try {
        $global:TrayIcon = Start-KPopupTrayIcon -Tooltip "$AppDisplayName Listener" -EnableMenu
        Write-Info "[KPopListener] Tray icon started (right-click for menu)." -ForegroundColor Green
    } catch {
        Write-Host "[KPopListener] Tray icon failed: $_" -ForegroundColor Yellow
    }
}

# ---- Show startup progress ----

if (-not $NoStartupToast -and $global:BurntToastAvailable) {
Show-StartupProgress -Steps 4 -DelayMs 400
if ($global:WinRTAvailable -and $global:EngineSync.UseWinRT) { Show-WinRTSpinner -DurationSec 2 }
}

# ---- Ready toast ----

if (-not $NoStartupToast) {
if (-not $NoDashboard -and $global:DashboardPort -ne "Disabled" -and $global:BurntToastAvailable) {
Send-BurntToastNotif -Title "$AppDisplayName Ready!" -Message "Click to open dashboard." -ButtonText "Open Dashboard" -ButtonUrl $global:DashboardUrl
} else { Send-Toast -Title "$AppDisplayName Ready!" -Message "All systems go!" }
}

# ---- v986 — startup greeting (speech offload) -----------------------------
# Announce on boot so you know the voice channel is live. The listener owns
# the System.Speech synths and uses SpeakAsync, so this never blocks startup.
# Any app speaks without blocking itself by dropping a *Request*.json with
#   {"Voice":"M1|M2","Text":"..."}  into %TEMP%\KPopListener\ (see Speak.bas /
# Send-VoxelSpeak.ps1). The greeting is OPT-IN: silent by default, so a silent auto-update relaunch
# and the startup .bat never say it out loud. Pass -Greet to speak it (the voice launchers do);
# -NoVoice always forces silence even if -Greet is set.
if ($Greet -and -not $NoVoice) {
    if (Get-Command Speak-Voiced -ErrorAction SilentlyContinue) {
        try { Speak-Voiced -Voice "M1" -Text $GreetText } catch {}
    }
}

# ---- v985 — ClipSaver mode (restored) -------------------------------------
# Captures the clipboard; when the copied text carries a header comment
#   # File: name.ext      (or)   # Path: v42\name.ext
# it auto-creates the file under <BaseFolder>\<version>\ (Modules\ for .psm1),
# backs up any existing copy, and version-tracks it. Runs in its own window so
# its "Saved:" confirmations are visible. -Verbose surfaces the per-check debug.
if ($ClipSaver) {
    $csPath = Join-Path $PSScriptRoot 'KPopupClipSaver.ps1'
    if (Test-Path $csPath) {
        $csArgs = @("-NoExit","-ExecutionPolicy","Bypass","-File","`"$csPath`"")
        if ($ClipSaverFolder) { $csArgs += @("-BaseFolder","`"$ClipSaverFolder`"") }
        if ($Script:KpopVerbose) { $csArgs += "-Verbose" }
        try {
            Start-Process -FilePath "powershell.exe" -ArgumentList $csArgs -WindowStyle Normal | Out-Null
            Write-Host "[KPopListener] ClipSaver started (clipboard auto-save active)." -ForegroundColor Green
        } catch {
            Write-Host "[KPopListener] ClipSaver failed to launch: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[KPopListener] ClipSaver requested but KPopupClipSaver.ps1 not found beside the listener." -ForegroundColor Yellow
    }
}

# ---- v987 — TTS voice picker (KPopupTTS.ps1) ------------------------------
# Interactive voice explorer/selector: preview the installed Windows voices and
# pick one. It writes %APPDATA%\KPopupTTS\SelectedVoice.json, which the listener
# hot-swaps to (your pick becomes the speaking voice with no restart). Runs in
# its own window since it's interactive (powershell.exe = STA, needed for the
# WinForms UI). Pairs with -ClipSaver.
if ($TTS) {
    $ttsPath = Join-Path $PSScriptRoot 'KPopupTTS.ps1'
    if (Test-Path $ttsPath) {
        try {
            Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit","-ExecutionPolicy","Bypass","-File","`"$ttsPath`"") -WindowStyle Normal | Out-Null
            Write-Host "[KPopListener] TTS voice picker started (pick a voice -> it hot-swaps the listener)." -ForegroundColor Green
        } catch {
            Write-Host "[KPopListener] TTS picker failed to launch: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[KPopListener] TTS requested but KPopupTTS.ps1 not found beside the listener." -ForegroundColor Yellow
    }
}

# ---- Main loop with spinner ----

$spin = @("⣾","⣽","⣻","⢿","⡿","⣟","⣯","⣷")
$i = 0
$last = Get-Date
$ControlFile = Join-Path $TempDir "KPopControl.txt"

while ($global:IsRunning) {
# Process queued messages
$m = $null
while ($global:MessageQueue.TryDequeue([ref]$m)) { if (-not $global:Paused) { try { Process-Message -msg $m } catch {} }; $line = Add-RecentEvent $m; if ($global:Mqtt -and $global:Mqtt.Publish -and $line) { Publish-KPopMqtt $line } }


if (-not $Background) {
    $e = if ($global:EngineSync.UseWinRT) { "WinRT" } else { "BT" }
    $txt = if ($global:Paused) { "Paused (idle, resident) [$e] $($spin[$i])" } else { "Listening... [$e] (T:$($global:Stats.TotalToasts)|P:$($global:Stats.PipeToasts)|F:$($global:Stats.FileToasts)) $($spin[$i])" }
    Write-Host "`r$txt " -NoNewline -ForegroundColor Cyan
    $i = ($i + 1) % $spin.Count
}

# Poll control file for protocol commands
if (Test-Path $ControlFile) {
    try {
        $cmd = (Get-Content $ControlFile -Raw).Trim().ToLower()
        switch ($cmd) {
            'pause'  { $global:Paused = $true;  Write-Log "Runtime command: pause (idle — staying resident)" "INFO" }
            'resume' { $global:Paused = $false; Write-Log "Runtime command: resume" "INFO" }
            'exit'   { Write-Log "Runtime command: exit" "INFO"; $global:IsRunning = $false }   # PATCH-2: 'break' only exited the SWITCH; set the loop flag so exit actually exits
        }
    } catch {}
    try { Remove-Item $ControlFile -Force } catch {}
}

# Refresh dashboard settings every 5 sec
if (((Get-Date) - $last).TotalSeconds -ge 5) {
    Apply-DashboardSettings
    Update-ListenerStatus
    $last = Get-Date
}

# Drain inbound MQTT messages (filled by the subscriber's background
# stdout reader) and raise toasts here on the main thread.
if ($global:MqttInbox) {
    $ml = $null
    while ($global:MqttInbox.TryDequeue([ref]$ml)) {
        if (-not $ml) { continue }
        $parts = $ml -split ' ', 2
        $mtopic = $parts[0]
        $mpayload = if ($parts.Count -gt 1) { $parts[1] } else { "" }
        if (Test-KPopToastAllowed) { try { Send-BurntToastNotif -Title "MQTT: $mtopic" -Message $mpayload } catch {} }   # PATCH-4: rate-limited
        Add-RecentEvent "MQTT< [$mtopic] $mpayload" | Out-Null
    }
}

# Pump the dashboard's WinForms message loop FREQUENTLY across the idle
# window instead of once per 200ms. A single DoEvents() followed by a flat
# 200ms sleep starved the message pump for 200ms at a stretch, which Windows
# renders as a busy "spinning" cursor over the whole window and makes the
# Refresh button feel unclickable (input is only serviced every 200ms).
# Pumping in a tight ~15ms cadence keeps the form responsive while preserving
# the loop's overall ~200ms tick for message/toast processing.
if ($global:DashboardHandle -and $global:DashboardHandle.Form) {
    for ($pump = 0; $pump -lt 13; $pump++) {
        try { [System.Windows.Forms.Application]::DoEvents() } catch {}
        Start-Sleep -Milliseconds 15
    }
} else {
    Start-Sleep -Milliseconds 200
}


}

# ---- Cleanup ----

try { if (Get-Command Stop-KPopMqtt -ErrorAction SilentlyContinue) { Stop-KPopMqtt } } catch {}
try { if ($global:PipeHandle -and ($global:PipeHandle -is [System.IDisposable])) { $global:PipeHandle.Dispose() } } catch {}
try { if ($global:FileWatcher -and ($global:FileWatcher -is [System.Management.Automation.PSCustomObject])) {} } catch {}

# v26.1 -- drop the liveness markers on graceful exit. KPopShim's sentinel is a
# System.Timers.Timer whose Elapsed action would otherwise keep touching
# Listener_Alive.txt under -NoExit (the process outlives this script), making
# /kpop/status and the launcher's kpop-guard.ps1 see a listener that is no
# longer actually listening. Unregistering the event subscription stops the
# writes even though the timer object lives inside the shim module's scope.
try { Unregister-Event -SourceIdentifier 'KPopShimSentinelTick' -ErrorAction SilentlyContinue } catch {}
try { Remove-Item (Join-Path $TempDir 'Listener_Alive.txt') -Force -ErrorAction SilentlyContinue } catch {}
try { Remove-Item (Join-Path $TempDir 'Listener_Version.txt') -Force -ErrorAction SilentlyContinue } catch {}
try { Remove-Item $PidFile -Force -ErrorAction SilentlyContinue } catch {}

Write-Log "Listener stopped." "INFO"
