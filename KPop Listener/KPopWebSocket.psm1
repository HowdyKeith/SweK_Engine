# =====================================================================
# Module: KPopWebSocket.psm1
# Version: 1.0
# Purpose: Real-time WebSocket server for KPopListener
# Dependencies: PowerShell 7+, [System.Net.WebSockets]
# Usage: Load in KPopListener.ps1 if $global:EnableWebSockets = $True
# =====================================================================

$global:KPopWebSocketServer = $null
$global:KPopWebSocketClients = @()
$global:KPopWebSocketPort = 8080

function Start-KPopWebSocketServer {
    param(
        [int]$Port = 8080
    )

    if (-not $global:EnableWebSockets) { return $null }

    if ($global:KPopWebSocketServer) {
        Write-Host "WebSocket server already running on port $global:KPopWebSocketPort"
        return $global:KPopWebSocketServer
    }

    $global:KPopWebSocketPort = $Port

    $listener = [System.Net.HttpListener]::new()
    $prefix = "http://localhost:$Port/"
    $listener.Prefixes.Add($prefix)
    $listener.Start()
    $global:KPopWebSocketServer = $listener
    Write-Host "WebSocket server listening on ws://localhost:$Port"

    # Run listener in background runspace
    $runspace = [runspacefactory]::CreateRunspace()
    $runspace.ApartmentState = "STA"
    $runspace.ThreadOptions = "ReuseThread"
    $runspace.Open()
    $runspace.SessionStateProxy.SetVariable("Listener", $listener)
    $runspace.SessionStateProxy.SetVariable("Clients", $global:KPopWebSocketClients)
    $runspace.SessionStateProxy.SetVariable("Stats", $global:Stats)
    $runspace.SessionStateProxy.SetVariable("MessageQueue", $global:MessageQueue)

    $scriptBlock = {
        param($Listener, $Clients, $Stats, $MessageQueue)

        while ($Listener.IsListening) {
            try {
                $context = $Listener.GetContext()
                if ($context.Request.IsWebSocketRequest) {
                    $wsContext = $context.AcceptWebSocketAsync($null).Result
                    $socket = $wsContext.WebSocket
                    $Clients.Add($socket)
                    Write-Host "WebSocket client connected. Total clients: $($Clients.Count)"

                    # Keep connection alive and push initial stats
                    $initPayload = @{
                        Type = "Stats"
                        Data = $Stats
                    } | ConvertTo-Json -Depth 3
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($initPayload)
                    $socket.SendAsync($buf, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None) | Out-Null

                    # Keep socket alive
                    while ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
                        Start-Sleep -Milliseconds 500
                    }

                    # Remove disconnected client
                    $Clients.Remove($socket)
                    Write-Host "WebSocket client disconnected. Total clients: $($Clients.Count)"
                } else {
                    # Regular HTTP request: simple status JSON
                    $response = $context.Response
                    $respData = @{
                        Type = "Stats"
                        Data = $Stats
                    } | ConvertTo-Json -Depth 3
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($respData)
                    $response.ContentLength64 = $buf.Length
                    $response.ContentType = "application/json"
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                    $response.OutputStream.Close()
                }
            } catch {}
        }
    }

    $ps = [powershell]::Create()
    $ps.Runspace = $runspace
    $ps.AddScript($scriptBlock.ToString()) | Out-Null
    $ps.BeginInvoke()

    return $listener
}

function Send-WebSocketUpdate {
    param(
        [hashtable]$Payload
    )

    if (-not $global:EnableWebSockets) { return }

    $json = $Payload | ConvertTo-Json -Depth 3
    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)

    # Send to all connected clients
    $clientsCopy = @($global:KPopWebSocketClients)  # avoid modification during iteration
    foreach ($client in $clientsCopy) {
        try {
            if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
                $client.SendAsync($buf, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None) | Out-Null
            } else {
                $global:KPopWebSocketClients.Remove($client)
            }
        } catch {}
    }
}

function Stop-KPopWebSocketServer {
    if ($global:KPopWebSocketServer) {
        try {
            $global:KPopWebSocketServer.Stop()
            $global:KPopWebSocketServer.Close()
            $global:KPopWebSocketServer = $null
            Write-Host "WebSocket server stopped."
        } catch {}
    }
    $global:KPopWebSocketClients.Clear()
}

Export-ModuleMember -Function Start-KPopWebSocketServer, Stop-KPopWebSocketServer, Send-WebSocketUpdate
~~~
