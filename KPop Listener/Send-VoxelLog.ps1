<#
.SYNOPSIS
    Send-VoxelLog.ps1 — push a log line to the VoxelEngine in-game debug console.

.DESCRIPTION
    Connects to the engine's WSBridge (default ws://localhost:8787), sends a
    single JSON message of shape:
        { "type": "log", "msg": "...", "level": "info|warn|error|net|sys" }
    and disconnects. Renders in the in-engine console (toggle: backtick).

    Drop this script alongside KPopListener and pipe interesting events
    through it. Example KPop hook:

        # In KPopListener.ps1 message handler, after processing:
        & "$PSScriptRoot\Send-VoxelLog.ps1" -Message $title -Level info

.PARAMETER Message
    The text to display in-engine. No length limit but keep it short.

.PARAMETER Level
    Color/severity. Defaults to "net" (cyan, indicates external source).

.PARAMETER Url
    Bridge URL. Default ws://localhost:8787

.EXAMPLE
    .\Send-VoxelLog.ps1 -Message "Build complete" -Level info
    .\Send-VoxelLog.ps1 -Message "Disk usage 92%" -Level warn
    .\Send-VoxelLog.ps1 -Message "VBA macro fired" -Level net
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string] $Message,

    [ValidateSet("info", "warn", "error", "net", "sys")]
    [string] $Level = "net",

    [string] $Url = "ws://localhost:8787"
)

$ErrorActionPreference = "Stop"

# Build the JSON payload manually — no dependency on ConvertTo-Json on
# older PowerShell versions. Escape just the bare-minimum (quote, backslash, newline).
function Escape-Json([string]$s) {
    return $s.Replace('\', '\\').Replace('"', '\"').Replace("`r", '').Replace("`n", '\n')
}
$json = '{"type":"log","msg":"' + (Escape-Json $Message) + '","level":"' + $Level + '"}'

# Open WebSocket
$client = New-Object System.Net.WebSockets.ClientWebSocket
$cts = New-Object System.Threading.CancellationTokenSource
$cts.CancelAfter(2000)   # 2s connect timeout

try {
    $uri = [System.Uri]::new($Url)
    $task = $client.ConnectAsync($uri, $cts.Token)
    $task.Wait()

    if ($client.State -ne 'Open') {
        Write-Warning "Could not connect to $Url (state=$($client.State))"
        exit 2
    }

    # Send the message as text frame
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $segment = New-Object System.ArraySegment[byte] @(,$bytes)
    $sendCts = New-Object System.Threading.CancellationTokenSource
    $sendCts.CancelAfter(2000)
    $sendTask = $client.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $sendCts.Token)
    $sendTask.Wait()

    # Clean shutdown
    $closeCts = New-Object System.Threading.CancellationTokenSource
    $closeCts.CancelAfter(1000)
    $closeTask = $client.CloseAsync(
        [System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
        "done",
        $closeCts.Token)
    $closeTask.Wait()

    Write-Host "[Send-VoxelLog] sent: [$Level] $Message" -ForegroundColor Cyan
}
catch {
    Write-Warning "[Send-VoxelLog] failed: $($_.Exception.Message)"
    exit 1
}
finally {
    if ($client) { $client.Dispose() }
}
