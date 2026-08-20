<#
.SYNOPSIS
    Named Pipe Sender (BYTE MODE v10.0) - Sends with length prefix and reads ACK
.DESCRIPTION
    Sends messages to a byte-mode named pipe with 4-byte length prefix.
    Waits for ACK response from server.
#>
[CmdletBinding()]
param(
    [string]$PipeName = "TestPipe",
    [string]$Message = "Test message from sender",
    [switch]$Json,
    [int]$Count = 1
)

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        Named Pipe Sender (BYTE MODE v10.0)            ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "Target Pipe: \\.\pipe\$PipeName" -ForegroundColor Yellow
Write-Host "Messages to send: $Count" -ForegroundColor Yellow
Write-Host "Format: $(if ($Json) { 'JSON' } else { 'Plain Text' })" -ForegroundColor Yellow
Write-Host ""

$success = 0
$failed = 0

for ($i = 1; $i -le $Count; $i++) {
    $pipe = $null
    try {
        Write-Host "[$i/$Count] Connecting..." -NoNewline -ForegroundColor Cyan
        
        # Prepare payload
        $payload = if ($Json) {
            @{
                Title = "Test Message #$i"
                Message = $Message
                Timestamp = (Get-Date).ToString('o')
                Index = $i
            } | ConvertTo-Json -Compress
        } else {
            "$Message (message #$i)"
        }
        
        # Create pipe client (BYTE mode, synchronous)
        $pipe = [System.IO.Pipes.NamedPipeClientStream]::new(
            ".",
            $PipeName,
            [System.IO.Pipes.PipeDirection]::InOut,
            [System.IO.Pipes.PipeOptions]::None
        )
        
        # Connect with timeout
        try {
            $pipe.Connect(3000)
        } catch {
            throw "Connection timeout - is the listener running?"
        }
        
        if (-not $pipe.IsConnected) {
            throw "Failed to connect to pipe"
        }
        
        Write-Host "`r[$i/$Count] Sending...   " -NoNewline -ForegroundColor Cyan
        
        # Convert message to bytes
        $msgBytes = [Text.Encoding]::UTF8.GetBytes($payload)
        $lenBytes = [BitConverter]::GetBytes($msgBytes.Length)
        
        # Send length prefix (4 bytes)
        $pipe.Write($lenBytes, 0, 4)
        $pipe.Flush()
        
        # Small delay to ensure length is received
        Start-Sleep -Milliseconds 50
        
        # Send message payload
        $pipe.Write($msgBytes, 0, $msgBytes.Length)
        $pipe.Flush()
        
        Write-Host "`r[$i/$Count] Waiting ACK..." -NoNewline -ForegroundColor Cyan
        
        # Wait for ACK with timeout
        $ackReceived = $false
        try {
            $pipe.ReadTimeout = 2000
            
            $ackLenBytes = [byte[]]::new(4)
            $read = $pipe.Read($ackLenBytes, 0, 4)
            
            if ($read -eq 4) {
                $ackLen = [BitConverter]::ToInt32($ackLenBytes, 0)
                if ($ackLen -gt 0 -and $ackLen -lt 1024) {
                    $ackBytes = [byte[]]::new($ackLen)
                    $ackRead = $pipe.Read($ackBytes, 0, $ackLen)
                    $ack = [Text.Encoding]::UTF8.GetString($ackBytes, 0, $ackRead)
                    
                    Write-Host "`r[$i/$Count] ✓ Sent & ACK received" -ForegroundColor Green
                    Write-Host "    Bytes: $($msgBytes.Length)" -ForegroundColor Gray
                    Write-Host "    ACK: $ack" -ForegroundColor Gray
                    $ackReceived = $true
                }
            }
        } catch [System.TimeoutException] {
            Write-Host "`r[$i/$Count] ✓ Sent (ACK timeout)" -ForegroundColor Yellow
            Write-Host "    Bytes: $($msgBytes.Length)" -ForegroundColor Gray
        } catch {
            Write-Host "`r[$i/$Count] ✓ Sent (no ACK: $($_.Exception.Message))" -ForegroundColor Yellow
            Write-Host "    Bytes: $($msgBytes.Length)" -ForegroundColor Gray
        }
        
        if (-not $ackReceived) {
            Write-Host "`r[$i/$Count] ✓ Sent (no ACK)" -ForegroundColor Yellow
            Write-Host "    Bytes: $($msgBytes.Length)" -ForegroundColor Gray
        }
        
        $success++
        
        # Show preview
        $preview = if ($payload.Length -gt 60) {
            $payload.Substring(0, 60) + "..."
        } else {
            $payload
        }
        Write-Host "    $(if($Json){'JSON'}else{'Text'}): $preview" -ForegroundColor White
        Write-Host ""
        
    } catch {
        Write-Host "`r[$i/$Count] ✗ Failed                 " -ForegroundColor Red
        Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        $failed++
    } finally {
        if ($pipe) {
            try { 
                $pipe.Close()
                $pipe.Dispose() 
            } catch {}
        }
    }
    
    # Delay between messages
    if ($i -lt $Count) {
        Start-Sleep -Milliseconds 500
    }
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  ✓ Successful: $success" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "  ✗ Failed: $failed" -ForegroundColor Red
}
Write-Host ""

if ($failed -eq $Count) {
    Write-Host "All messages failed! Troubleshooting:" -ForegroundColor Red
    Write-Host "  • Make sure listener is running: .\Test-NamedPipe.ps1" -ForegroundColor Yellow
    Write-Host "  • Check pipe name matches: '$PipeName'" -ForegroundColor Yellow
    Write-Host "  • Try running as Administrator" -ForegroundColor Yellow
    Write-Host ""
}

exit $(if ($success -gt 0) { 0 } else { 1 })