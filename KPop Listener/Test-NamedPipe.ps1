<#
.SYNOPSIS
    Named Pipe Listener v11.0 - Reliable byte-mode listener
.DESCRIPTION
    Uses background runspace for reliable pipe listening with proper error handling
#>
[CmdletBinding()]
param([string]$PipeName = 'TestPipe')

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       Named Pipe Listener (v11.0)                     ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "Pipe Name: \\.\pipe\$PipeName" -ForegroundColor Yellow
Write-Host "Process ID: $PID" -ForegroundColor Yellow
Write-Host ""

$global:messageCount = 0
$global:messages = [System.Collections.Concurrent.ConcurrentQueue[object]]::new()

# Create runspace for background listener
$runspace = [runspacefactory]::CreateRunspace()
$runspace.Open()

# Share variables
$runspace.SessionStateProxy.SetVariable('PipeName', $PipeName)
$runspace.SessionStateProxy.SetVariable('MessageQueue', $global:messages)

# Listener script
$listenerScript = {
    while ($true) {
        $pipe = $null
        try {
            # Create new pipe for each connection
            $pipe = [System.IO.Pipes.NamedPipeServerStream]::new(
                $PipeName,
                [System.IO.Pipes.PipeDirection]::InOut,
                1,
                [System.IO.Pipes.PipeTransmissionMode]::Byte,
                [System.IO.Pipes.PipeOptions]::None
            )
            
            # Wait for connection (blocking)
            $pipe.WaitForConnection()
            
            # Give client time to start writing
            Start-Sleep -Milliseconds 50
            
            # Read length (4 bytes)
            $lenBytes = [byte[]]::new(4)
            $bytesRead = 0
            $timeout = [DateTime]::Now.AddSeconds(5)
            
            while ($bytesRead -lt 4 -and [DateTime]::Now -lt $timeout) {
                if ($pipe.IsConnected) {
                    $read = $pipe.Read($lenBytes, $bytesRead, 4 - $bytesRead)
                    if ($read -gt 0) {
                        $bytesRead += $read
                    } else {
                        Start-Sleep -Milliseconds 10
                    }
                } else {
                    break
                }
            }
            
            if ($bytesRead -ne 4) {
                throw "Failed to read length prefix"
            }
            
            $length = [BitConverter]::ToInt32($lenBytes, 0)
            
            if ($length -le 0 -or $length -gt 1048576) {
                throw "Invalid message length: $length"
            }
            
            # Read message
            $buffer = [byte[]]::new($length)
            $totalRead = 0
            $timeout = [DateTime]::Now.AddSeconds(5)
            
            while ($totalRead -lt $length -and [DateTime]::Now -lt $timeout) {
                if ($pipe.IsConnected) {
                    $read = $pipe.Read($buffer, $totalRead, $length - $totalRead)
                    if ($read -gt 0) {
                        $totalRead += $read
                    } else {
                        Start-Sleep -Milliseconds 10
                    }
                } else {
                    break
                }
            }
            
            if ($totalRead -ne $length) {
                throw "Failed to read complete message: got $totalRead of $length bytes"
            }
            
            $message = [Text.Encoding]::UTF8.GetString($buffer, 0, $totalRead)
            
            # Send ACK
            try {
                $ack = "ACK at $((Get-Date).ToString('HH:mm:ss.fff'))"
                $ackBytes = [Text.Encoding]::UTF8.GetBytes($ack)
                $ackLen = [BitConverter]::GetBytes($ackBytes.Length)
                $pipe.Write($ackLen, 0, 4)
                $pipe.Write($ackBytes, 0, $ackBytes.Length)
                $pipe.Flush()
            } catch {
                # ACK failed, but we got the message
            }
            
            # Queue message for display
            $MessageQueue.Enqueue(@{
                Text = $message
                Bytes = $totalRead
                Timestamp = Get-Date
            })
            
        } catch {
            # Log error but continue
            $MessageQueue.Enqueue(@{
                Text = "ERROR: $($_.Exception.Message)"
                Bytes = 0
                Timestamp = Get-Date
            })
        } finally {
            if ($pipe) {
                try {
                    $pipe.Disconnect()
                    $pipe.Close()
                    $pipe.Dispose()
                } catch {}
            }
            # Small delay before creating next pipe
            Start-Sleep -Milliseconds 100
        }
    }
}

# Start listener in background
$powershell = [powershell]::Create()
$powershell.Runspace = $runspace
$powershell.AddScript($listenerScript) | Out-Null
$handle = $powershell.BeginInvoke()

Write-Host "✓ Listener started successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "To test, run in another window:" -ForegroundColor Yellow
Write-Host "  .\Test-NamedPipeSender.ps1" -ForegroundColor White
Write-Host "  .\Test-NamedPipeSender.ps1 -Json" -ForegroundColor White
Write-Host "  .\Test-NamedPipeSender.ps1 -Json -Count 5" -ForegroundColor White
Write-Host ""
Write-Host ("=" * 60) -ForegroundColor DarkGray
Write-Host ""

# Main display loop
$spin = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'.ToCharArray()
$i = 0
$running = $true

# Ctrl+C handler
[Console]::TreatControlCAsInput = $false
$null = Register-EngineEvent PowerShell.Exiting -Action {
    $script:running = $false
}

try {
    while ($running) {
        # Process any queued messages
        $msg = $null
        while ($global:messages.TryDequeue([ref]$msg)) {
            $global:messageCount++
            $ts = $msg.Timestamp.ToString('HH:mm:ss.fff')
            
            # Clear spinner line
            Write-Host "`r$(' ' * 80)`r" -NoNewline
            
            Write-Host "[$ts] 📨 MESSAGE #$global:messageCount RECEIVED" -ForegroundColor Green
            Write-Host "    Bytes: $($msg.Bytes)" -ForegroundColor Yellow
            
            # Try to parse as JSON
            try {
                $json = $msg.Text | ConvertFrom-Json -ErrorAction Stop
                Write-Host "    Type: JSON" -ForegroundColor Cyan
                $json.PSObject.Properties | ForEach-Object {
                    Write-Host "      $($_.Name): $($_.Value)" -ForegroundColor White
                }
            } catch {
                Write-Host "    Type: Plain Text" -ForegroundColor Cyan
                Write-Host "    Content: $($msg.Text)" -ForegroundColor White
            }
            
            Write-Host ""
        }
        
        # Update spinner
        Write-Host "`rListening $($spin[$i]) (Received: $global:messageCount)  " -NoNewline -ForegroundColor Cyan
        $i = ($i + 1) % $spin.Length
        
        Start-Sleep -Milliseconds 200
        
        # Check if background task failed
        if ($handle.IsCompleted) {
            Write-Host "`r$(' ' * 80)`r" -NoNewline
            Write-Host "⚠ Background listener stopped unexpectedly" -ForegroundColor Red
            
            # Check for errors
            try {
                $powershell.EndInvoke($handle)
            } catch {
                Write-Host "Error: $_" -ForegroundColor Red
            }
            
            if ($powershell.Streams.Error.Count -gt 0) {
                Write-Host "Errors:" -ForegroundColor Red
                foreach ($err in $powershell.Streams.Error) {
                    Write-Host "  $err" -ForegroundColor Red
                }
            }
            
            break
        }
    }
} finally {
    # Cleanup
    Write-Host "`r$(' ' * 80)`r" -NoNewline
    Write-Host ""
    
    # Stop the background task
    $powershell.Stop()
    $runspace.Close()
    $runspace.Dispose()
    
    Write-Host "✓ Listener stopped" -ForegroundColor Green
    Write-Host ""
    Write-Host "Summary:" -ForegroundColor Cyan
    Write-Host "  Total messages received: $global:messageCount" -ForegroundColor White
    Write-Host ""
}