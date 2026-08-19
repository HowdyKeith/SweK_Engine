# =====================================================================
# KPop System Usage Example
# Demonstrates all improved modules and plugin system
# =====================================================================

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     KPop Notification System - Complete Demo              ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# =====================================================================
# 1. LOAD ALL MODULES
# =====================================================================

Write-Host "→ Loading modules..." -ForegroundColor Yellow

# Core modules
Import-Module .\KPopCore.psm1 -Force
Import-Module .\KPopLog.psm1 -Force
Import-Module .\KPopToast.psm1 -Force
Import-Module .\KPopPipes.psm1 -Force
Import-Module .\KPopPlugins.psm1 -Force
Import-Module .\KPopDashboard.psm1 -Force

Write-Host "✓ All modules loaded" -ForegroundColor Green
Write-Host ""

# =====================================================================
# 2. INITIALIZE CORE SYSTEM
# =====================================================================

Write-Host "→ Initializing KPop Core..." -ForegroundColor Yellow

Initialize-KPopCore

# Configure core settings
Set-KPopConfig -Name "LogLevel" -Value "DEBUG"
Set-KPopConfig -Name "EnablePerformanceTracking" -Value $true
Set-KPopConfig -Name "MaxQueueSize" -Value 500

Write-Host "✓ Core initialized" -ForegroundColor Green
Write-Host ""

# =====================================================================
# 3. START LOGGING
# =====================================================================

Write-Host "→ Starting logging system..." -ForegroundColor Yellow

Start-KPopLog -Path "$env:TEMP\KPopLogs\demo.log" -MinLevel DEBUG -EnableConsole

# Set some context
Set-KPopLogContext -Context @{
    Session = [guid]::NewGuid().ToString()
    User = $env:USERNAME
    Demo = $true
}

Write-KPopInfo "Demo started" -Category "Demo"
Write-Host "✓ Logging started" -ForegroundColor Green
Write-Host ""

# =====================================================================
# 4. INITIALIZE TOAST SYSTEM
# =====================================================================

Write-Host "→ Initializing toast system..." -ForegroundColor Yellow

Initialize-ToastEngines

$engine = Get-PreferredToastEngine
Write-Host "  Active engine: $engine" -ForegroundColor Gray

# Register custom template
$customTemplate = [ToastConfig]::new()
$customTemplate.Sound = "ms-winsoundevent:Notification.Default"
$customTemplate.Duration = "long"
$customTemplate.Buttons = @(
    @{ Content = "View Details"; Arguments = "action=view" }
    @{ Content = "Dismiss"; Arguments = "action=dismiss" }
)

Register-ToastTemplate -Name "CustomDemo" -Template $customTemplate

Write-Host "✓ Toast system ready" -ForegroundColor Green
Write-Host ""

# =====================================================================
# 5. SETUP PLUGINS
# =====================================================================

Write-Host "→ Setting up plugins..." -ForegroundColor Yellow

# Example: Create and register a Slack plugin
# Uncomment and add your webhook URL to use
# $slackPlugin = New-SlackIntegrationPlugin -WebhookUrl "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
# Register-KPopPlugin -Type Integration -Plugin $slackPlugin

# Example: Create a Discord plugin
# $discordPlugin = New-DiscordIntegrationPlugin -WebhookUrl "https://discord.com/api/webhooks/YOUR/WEBHOOK"
# Register-KPopPlugin -Type Integration -Plugin $discordPlugin

# Create a custom transport plugin for demo
$demoTransport = [TransportPlugin]@{
    Name = "DemoTransport"
    Version = "1.0.0"
    Author = "Demo"
    Description = "Demo transport plugin"
}

$demoTransport | Add-Member -MemberType ScriptMethod -Name Initialize -Value {
    Write-KPopInfo "Demo transport initialized" -Category "Plugin"
} -Force

$demoTransport | Add-Member -MemberType ScriptMethod -Name Send -Value {
    param([hashtable]$Message)
    Write-KPopInfo "Demo transport sent: $($Message.Title)" -Category "Plugin"
    return $true
} -Force

Register-KPopPlugin -Type Transport -Plugin $demoTransport

Write-Host "✓ Plugins configured" -ForegroundColor Green
Write-Host ""

# =====================================================================
# 6. START PIPE SERVER
# =====================================================================

Write-Host "→ Starting pipe server..." -ForegroundColor Yellow

$pipeConfig = [PipeConfig]::new()
$pipeConfig.Protocol = [PipeProtocol]::Framed
$pipeConfig.EnableCRC = $true
$pipeConfig.EnableCompression = $false

$messageHandler = {
    param($Message)
    Write-KPopInfo "Pipe received: $($Message.Data)" -Category "Pipe"
    
    # Process message and show toast
    if ($Message.Data -is [hashtable]) {
        Show-KPopNotification -Title $Message.Data.Title -Message $Message.Data.Message -Type Info
    }
    
    # Update stats
    Update-KPopStatistics -Transport "Pipe" -Success $true
}

$pipeServer = Start-KPopPipeServer -Name "KPopDemo" -MessageHandler $messageHandler -Config $pipeConfig

Write-Host "✓ Pipe server listening" -ForegroundColor Green
Write-Host ""

# =====================================================================
# 7. DEMONSTRATE FEATURES
# =====================================================================

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    FEATURE DEMONSTRATIONS                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Demo 1: Simple notification
Write-Host "[Demo 1] Simple notification" -ForegroundColor Yellow
Show-KPopNotification -Title "Welcome!" -Message "KPop notification system is running" -Type Info
Write-KPopInfo "Sent simple notification" -Category "Demo"
Start-Sleep -Seconds 2

# Demo 2: Success notification
Write-Host "[Demo 2] Success notification" -ForegroundColor Yellow
Show-KPopNotification -Title "Build Complete" -Message "Your project built successfully" -Type Success
Write-KPopInfo "Sent success notification" -Category "Demo"
Start-Sleep -Seconds 2

# Demo 3: Warning notification
Write-Host "[Demo 3] Warning notification" -ForegroundColor Yellow
Show-KPopNotification -Title "Low Disk Space" -Message "Only 10% disk space remaining" -Type Warning
Write-KPopInfo "Sent warning notification" -Category "Demo"
Start-Sleep -Seconds 2

# Demo 4: Progress notification
Write-Host "[Demo 4] Progress notification" -ForegroundColor Yellow
$progressTag = "demo-progress"
for ($i = 0; $i -le 100; $i += 20) {
    Update-KPopProgressToast -Tag $progressTag -Progress $i -Status "Processing... $i%"
    Write-KPopDebug "Progress: $i%" -Category "Demo"
    Start-Sleep -Milliseconds 500
}
Start-Sleep -Seconds 1

# Demo 5: Custom template
Write-Host "[Demo 5] Custom template notification" -ForegroundColor Yellow
$config = Get-ToastTemplate -Name "CustomDemo"
$config.Title = "Custom Notification"
$config.Message = "This uses a custom template with buttons"
Send-KPopToast -Config $config
Write-KPopInfo "Sent custom template notification" -Category "Demo"
Start-Sleep -Seconds 2

# Demo 6: Pipe client communication
Write-Host "[Demo 6] Pipe communication" -ForegroundColor Yellow
$pipeClient = New-KPopPipeClient -PipeName "KPopDemo" -Config $pipeConfig
if ($pipeClient.Connect()) {
    $testMessage = @{
        Title = "Pipe Test"
        Message = "Hello from pipe client!"
        Timestamp = (Get-Date).ToString("o")
    }
    
    $sent = $pipeClient.Send($testMessage)
    if ($sent) {
        Write-Host "  ✓ Message sent via pipe" -ForegroundColor Green
    }
    
    $pipeClient.Disconnect()
}
Start-Sleep -Seconds 2

# Demo 7: Plugin invocation
Write-Host "[Demo 7] Plugin system" -ForegroundColor Yellow
$pluginMessage = @{
    Title = "Plugin Demo"
    Message = "Testing plugin system"
}
Invoke-KPopTransport -TransportName "DemoTransport" -Message $pluginMessage
Start-Sleep -Seconds 1

# Demo 8: Event system
Write-Host "[Demo 8] Event system" -ForegroundColor Yellow
Register-KPopEventHandler -EventName "OnToastSent" -ScriptBlock {
    param($Data)
    Write-KPopDebug "Event fired: Toast sent - $($Data.Title)" -Category "Event"
}
Invoke-KPopEvent -EventName "OnToastSent" -Data @{ Title = "Test Event" }
Start-Sleep -Seconds 1

Write-Host ""

# =====================================================================
# 8. SHOW STATISTICS
# =====================================================================

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                        STATISTICS                          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Core stats
Write-Host "→ Core Statistics:" -ForegroundColor Yellow
$coreStats = Get-KPopStatistics
Write-Host "  Total Toasts: $($coreStats.TotalToasts)" -ForegroundColor Gray
Write-Host "  Success Rate: $($coreStats.SuccessRate)%" -ForegroundColor Gray
Write-Host "  Avg Processing: $($coreStats.AvgProcessingTimeMs)ms" -ForegroundColor Gray
Write-Host "  Memory: $($coreStats.CurrentMemoryMB)MB (Peak: $($coreStats.PeakMemoryMB)MB)" -ForegroundColor Gray
Write-Host ""

# Log stats
Write-Host "→ Log Statistics:" -ForegroundColor Yellow
$logStats = Get-KPopLogStatistics
Write-Host "  Total Entries: $($logStats.TotalEntries)" -ForegroundColor Gray
Write-Host "  INFO: $($logStats.EntriesByLevel.INFO)" -ForegroundColor Gray
Write-Host "  DEBUG: $($logStats.EntriesByLevel.DEBUG)" -ForegroundColor Gray
Write-Host "  WARN: $($logStats.EntriesByLevel.WARN)" -ForegroundColor Gray
Write-Host ""

# Pipe stats
Write-Host "→ Pipe Statistics:" -ForegroundColor Yellow
$pipeStats = Get-KPopPipeStatistics
Write-Host "  Total Connections: $($pipeStats.TotalConnections)" -ForegroundColor Gray
Write-Host "  Active Connections: $($pipeStats.ActiveConnections)" -ForegroundColor Gray
Write-Host "  Messages Processed: $($pipeStats.MessagesProcessed)" -ForegroundColor Gray
Write-Host "  Bytes Sent: $($pipeStats.BytesSent)" -ForegroundColor Gray
Write-Host "  Bytes Received: $($pipeStats.BytesReceived)" -ForegroundColor Gray
Write-Host ""

# Plugin stats
Write-Host "→ Registered Plugins:" -ForegroundColor Yellow
$plugins = Get-KPopPlugins
foreach ($plugin in $plugins) {
    Write-Host "  $($plugin.Name) v$($plugin.Version) [$($plugin.Author)]" -ForegroundColor Gray
}
Write-Host ""

# Toast history
Write-Host "→ Recent Toasts:" -ForegroundColor Yellow
$history = Get-KPopToastHistory -Last 5
foreach ($entry in $history) {
    $time = $entry.Timestamp.ToString("HH:mm:ss")
    Write-Host "  [$time] $($entry.Title) ($($entry.Engine))" -ForegroundColor Gray
}
Write-Host ""

# =====================================================================
# 9. LAUNCH DASHBOARD (Optional)
# =====================================================================

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                         DASHBOARD                          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$launchDashboard = Read-Host "Launch dashboard? (Y/n)"
if ($launchDashboard -ne 'n' -and $launchDashboard -ne 'N') {
    Write-Host "→ Launching dashboard..." -ForegroundColor Yellow
    Write-Host "  (Close dashboard window to continue cleanup)" -ForegroundColor Gray
    Write-Host ""
    
    Show-KPopDashboard -AutoRefresh -RefreshInterval 1000
}

# =====================================================================
# 10. CLEANUP
# =====================================================================

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                          CLEANUP                           ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Write-Host "→ Cleaning up..." -ForegroundColor Yellow

# Stop pipe server
Stop-KPopPipeServer -Name "KPopDemo"
Write-Host "  ✓ Pipe server stopped" -ForegroundColor Green

# Unregister plugins
Unregister-KPopPlugin -Name "DemoTransport"
Write-Host "  ✓ Plugins unregistered" -ForegroundColor Green

# Flush logs
Flush-LogBuffer
Write-Host "  ✓ Logs flushed" -ForegroundColor Green

# Stop logging
Stop-KPopLog
Write-Host "  ✓ Logging stopped" -ForegroundColor Green

# Stop core
Stop-KPopCore
Write-Host "  ✓ Core stopped" -ForegroundColor Green

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    DEMO COMPLETE! 🎉                       ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Check logs at: $env:TEMP\KPopLogs\demo.log" -ForegroundColor Gray
Write-Host ""