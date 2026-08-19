<#
.SYNOPSIS
    Send-VoxelToast.ps1 — push a toast notification to the VoxelEngine.

.DESCRIPTION
    Connects to the engine's WSBridge, sends a single JSON message, and
    disconnects. Two payload modes:

    Toast:    -Title -Message [-Type info|success|warn|error|system] [-Duration ms]
    Tama:     -Tama <action> [-Text "speak this"]
              actions: feed | play | sleep | happy | sad | alert | wave | speak

.EXAMPLE
    .\Send-VoxelToast.ps1 -Title "Build done" -Message "All tests pass"
    .\Send-VoxelToast.ps1 -Title "Disk warning" -Message "92% full" -Type warn
    .\Send-VoxelToast.ps1 -Tama happy
    .\Send-VoxelToast.ps1 -Tama speak -Text "good morning!"
#>

[CmdletBinding(DefaultParameterSetName = "Toast")]
param(
    [Parameter(ParameterSetName = "Toast", Mandatory = $true, Position = 0)]
    [string] $Title,

    [Parameter(ParameterSetName = "Toast", Mandatory = $true, Position = 1)]
    [string] $Message,

    [Parameter(ParameterSetName = "Toast")]
    [ValidateSet("info", "success", "warn", "error", "system")]
    [string] $Type = "info",

    [Parameter(ParameterSetName = "Toast")]
    [int] $Duration = 4500,

    [Parameter(ParameterSetName = "Tama", Mandatory = $true)]
    [ValidateSet("feed", "play", "sleep", "happy", "sad", "alert", "wave", "speak")]
    [string] $Tama,

    [Parameter(ParameterSetName = "Tama")]
    [string] $Text = "",

    [string] $Url = "ws://localhost:8787"
)

$ErrorActionPreference = "Stop"

function Escape-Json([string]$s) {
    return $s.Replace('\', '\\').Replace('"', '\"').Replace("`r", '').Replace("`n", '\n')
}

# Build payload by parameter set
$json = if ($PSCmdlet.ParameterSetName -eq "Tama") {
    if ($Text) {
        '{"type":"tama","action":"' + $Tama + '","text":"' + (Escape-Json $Text) + '"}'
    } else {
        '{"type":"tama","action":"' + $Tama + '"}'
    }
} else {
    '{"type":"toast","title":"' + (Escape-Json $Title) +
    '","msg":"' + (Escape-Json $Message) +
    '","type":"' + $Type +
    '","duration":' + $Duration + '}'
}

# Open WebSocket
$client = New-Object System.Net.WebSockets.ClientWebSocket
$cts = New-Object System.Threading.CancellationTokenSource
$cts.CancelAfter(2000)

try {
    $uri = [System.Uri]::new($Url)
    $client.ConnectAsync($uri, $cts.Token).Wait()

    if ($client.State -ne 'Open') {
        Write-Warning "Could not connect to $Url (state=$($client.State))"
        exit 2
    }

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $segment = New-Object System.ArraySegment[byte] @(,$bytes)
    $sendCts = New-Object System.Threading.CancellationTokenSource
    $sendCts.CancelAfter(2000)
    $client.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $sendCts.Token).Wait()

    $closeCts = New-Object System.Threading.CancellationTokenSource
    $closeCts.CancelAfter(1000)
    $client.CloseAsync(
        [System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
        "done",
        $closeCts.Token).Wait()

    if ($PSCmdlet.ParameterSetName -eq "Tama") {
        Write-Host "[Send-VoxelToast] tama: $Tama $(if ($Text) { "($Text)" })" -ForegroundColor Magenta
    } else {
        Write-Host "[Send-VoxelToast] toast: [$Type] $Title" -ForegroundColor Cyan
    }
}
catch {
    Write-Warning "[Send-VoxelToast] failed: $($_.Exception.Message)"
    exit 1
}
finally {
    if ($client) { $client.Dispose() }
}
