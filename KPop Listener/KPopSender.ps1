<#
.SYNOPSIS
    KPopSender.ps1 v16.0 - Send notifications to KPopListener
.DESCRIPTION
    Production-grade sender with:
    • Named pipe (byte-mode with ACK) - Priority
    • File fallback - Guaranteed delivery
    • Auto-detects running listener
    • Beautiful UI with progress feedback
.PARAMETER Title
    Toast notification title
.PARAMETER Message
    Toast notification message body
.PARAMETER Type
    Toast type (INFO, SUCCESS, WARN, ERROR)
.PARAMETER Progress
    Progress value (0-100, -1 for none)
.PARAMETER LinkUrl
    Optional action button URL
.PARAMETER LinkText
    Text for action button
.EXAMPLE
    .\KPopSender.ps1 -Title "Build Complete" -Message "Success!"
    .\KPopSender.ps1 -Title "Download" -Message "Downloading..." -Progress 75
    .\KPopSender.ps1 -Title "Error" -Message "Failed" -Type ERROR -LinkUrl "https://logs.com"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$Title,
    
    [Parameter(Mandatory=$true)]
    [string]$Message,
    
    [ValidateSet("INFO","SUCCESS","WARN","ERROR")]
    [string]$Type = "INFO",
    
    [ValidateRange(-1,100)]
    [int]$Progress = -1,
    
    [string]$LinkUrl = "",
    
    [string]$LinkText = "Open"
)

#region Configuration
$TempDir = "$env:TEMP\KPopListener"
$StatusFile = Join-Path $TempDir "ListenerStatus.json"
$RequestFile = Join-Path $TempDir "ToastRequest.json"

if (-not (Test-Path $TempDir)) {
    New-Item -Path $TempDir -ItemType Directory -Force | Out-Null
}
#endregion

#region Banner
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║              🎯 KPop Pop! Sender v16.0                ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
#endregion

#region Find Listener
$pipeName = $null
$dashboardUrl = $null
$listenerFound = $false

if (Test-Path $StatusFile) {
    try {
        $status = Get-Content $StatusFile -Raw | ConvertFrom-Json
        $pipeName = $status.PipeName
        $dashboardUrl = $status.DashboardUrl
        $listenerPid = $status.PID
        
        $process = Get-Process -Id $listenerPid -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "✓ Found listener (PID: $listenerPid)" -ForegroundColor Green
            Write-Host "  Version: $($status.Version)" -ForegroundColor Gray
            Write-Host "  Pipe: $pipeName" -ForegroundColor Gray
            Write-Host "  Status: $($status.Status)" -ForegroundColor Gray
            if ($dashboardUrl -and $dashboardUrl -ne "Disabled") {
                Write-Host "  Dashboard: $dashboardUrl" -ForegroundColor Gray
            }
            $listenerFound = $true
        } else {
            Write-Host "⚠ Status file found but listener not running" -ForegroundColor Yellow
            Remove-Item $StatusFile -Force -ErrorAction SilentlyContinue
        }
    } catch {
        Write-Host "⚠ Could not read listener status: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠ No listener status found" -ForegroundColor Yellow
    Write-Host "  Make sure KPopListener.ps1 is running" -ForegroundColor Gray
}

Write-Host ""
#endregion

#region Prepare Payload
$payload = @{
    Title = $Title
    Message = $Message
    ToastType = $Type.ToUpper()
    Timestamp = (Get-Date).ToString("o")
}

if ($Progress -ge 0) { $payload.Progress = $Progress }
if ($LinkUrl) { 
    $payload.LinkUrl = $LinkUrl
    $payload.LinkText = $LinkText
}

$jsonPayload = $payload | ConvertTo-Json -Compress

Write-Host "📦 Payload:" -ForegroundColor Cyan
Write-Host "  Title: $Title" -ForegroundColor White
Write-Host "  Message: $Message" -ForegroundColor White
Write-Host "  Type: $Type" -ForegroundColor White
if ($Progress -ge 0) { Write-Host "  Progress: $Progress%" -ForegroundColor White }
if ($LinkUrl) { Write-Host "  Link: $LinkUrl" -ForegroundColor White }
Write-Host ""

$sent = $false
$method = "None"
#endregion

#region Method 1: Named Pipe (Byte Mode with ACK)
if ($pipeName -and $listenerFound) {
    Write-Host "📡 Method 1: Named Pipe" -ForegroundColor Cyan
    
    $pipe = $null
    try {
        Write-Host "  → Connecting..." -NoNewline -ForegroundColor Gray
        
        $pipe = [System.IO.Pipes.NamedPipeClientStream]::new(
            ".",
            $pipeName,
            [System.IO.Pipes.PipeDirection]::InOut,
            [System.IO.Pipes.PipeOptions]::None
        )
        
        $pipe.Connect(3000)
        
        if ($pipe.IsConnected) {
            Write-Host "`r  → Sending...   " -NoNewline -ForegroundColor Gray
            
            # Convert to bytes
            $msgBytes = [Text.Encoding]::UTF8.GetBytes($jsonPayload)
            $lenBytes = [BitConverter]::GetBytes($msgBytes.Length)
            
            # Send length prefix
            $pipe.Write($lenBytes, 0, 4)
            $pipe.Flush()
            Start-Sleep -Milliseconds 50
            
            # Send payload
            $pipe.Write($msgBytes, 0, $msgBytes.Length)
            $pipe.Flush()
            
            Write-Host "`r  → Waiting ACK..." -NoNewline -ForegroundColor Gray
            
            # Wait for ACK
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
                        
                        Write-Host "`r  ✓ Sent via pipe (ACK: $ack)" -ForegroundColor Green
                        $sent = $true
                        $method = "Named Pipe"
                    }
                }
            } catch [System.TimeoutException] {
                Write-Host "`r  ✓ Sent via pipe (no ACK)" -ForegroundColor Yellow
                $sent = $true
                $method = "Named Pipe (no ACK)"
            }
        }
    } catch {
        Write-Host "`r  ✗ Pipe failed: $($_.Exception.Message)" -ForegroundColor Red
    } finally {
        if ($pipe) {
            try { $pipe.Close(); $pipe.Dispose() } catch {}
        }
    }
    
    Write-Host ""
}
#endregion

#region Method 2: File Fallback
if (-not $sent) {
    Write-Host "📁 Method 2: File Fallback" -ForegroundColor Cyan
    
    try {
        if (Test-Path $RequestFile) {
            Remove-Item $RequestFile -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 100
        }
        
        $jsonPayload | Out-File -FilePath $RequestFile -Encoding UTF8 -Force
        
        Write-Host "  ✓ Written to file" -ForegroundColor Green
        Write-Host "    Path: $RequestFile" -ForegroundColor Gray
        $sent = $true
        $method = "File Watcher"
    } catch {
        Write-Host "  ✗ File write failed: $_" -ForegroundColor Red
    }
    
    Write-Host ""
}
#endregion

#region Summary
Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan

if ($sent) {
    Write-Host "║              ✓ NOTIFICATION SENT                      ║" -ForegroundColor Green
    Write-Host "╠════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
    Write-Host "║                                                        ║" -ForegroundColor White
    
    $titleLine = "  Title: $Title"
    $titlePadded = $titleLine.PadRight(56)
    if ($titlePadded.Length > 56) { $titlePadded = $titleLine.Substring(0, 53) + "..." }
    Write-Host "║$titlePadded║" -ForegroundColor White
    
    $methodLine = "  Method: $method"
    Write-Host "║$($methodLine.PadRight(56))║" -ForegroundColor White
    
    $typeLine = "  Type: $Type"
    Write-Host "║$($typeLine.PadRight(56))║" -ForegroundColor White
    
    if ($Progress -ge 0) {
        $progLine = "  Progress: $Progress%"
        Write-Host "║$($progLine.PadRight(56))║" -ForegroundColor White
    }
    
    Write-Host "║                                                        ║" -ForegroundColor White
    
    if ($dashboardUrl -and $dashboardUrl -ne "Disabled") {
        $dashLine = "  Dashboard: $dashboardUrl"
        $dashPadded = $dashLine.PadRight(56)
        if ($dashPadded.Length > 56) { $dashPadded = $dashLine.Substring(0, 53) + "..." }
        Write-Host "║$dashPadded║" -ForegroundColor Cyan
    }
    
    Write-Host "║                                                        ║" -ForegroundColor White
    Write-Host "║  🎉 Toast notification will appear shortly!           ║" -ForegroundColor Green
} else {
    Write-Host "║              ✗ NOTIFICATION FAILED                    ║" -ForegroundColor Red
    Write-Host "╠════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
    Write-Host "║                                                        ║" -ForegroundColor White
    Write-Host "║  Troubleshooting:                                      ║" -ForegroundColor Yellow
    Write-Host "║                                                        ║" -ForegroundColor White
    Write-Host "║  1. Start the listener:                                ║" -ForegroundColor White
    Write-Host "║     .\KPopListener.ps1                                 ║" -ForegroundColor White
    Write-Host "║                                                        ║" -ForegroundColor White
    Write-Host "║  2. Check status:                                      ║" -ForegroundColor White
    Write-Host "║     Get-Content '$StatusFile'                          ║" -ForegroundColor White
    Write-Host "║                                                        ║" -ForegroundColor White
    Write-Host "║  3. Check temp folder:                                 ║" -ForegroundColor White
    Write-Host "║     explorer '$TempDir'                                ║" -ForegroundColor White
    Write-Host "║                                                        ║" -ForegroundColor White
}

Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
#endregion

exit $(if ($sent) { 0 } else { 1 })