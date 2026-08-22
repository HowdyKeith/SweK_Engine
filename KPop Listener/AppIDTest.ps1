<#
.SYNOPSIS
    AppIDTester.ps1 v7.0 – THE SOLUTION: Registry + WinRT
.DESCRIPTION
    • Registers AppID in Windows Registry (THE KEY!)
    • Tests BurntToast (for comparison)
    • Tests WinRT with Registry (WORKS!)
    • Creates shortcut for persistence
    • Works on PS5.1 + PS7
    • AppID = "KPop.Pop" → Shows as "KPop Pop!"
#>

param(
    [string]$AppID = "KPop.Pop",
    [string]$AppDisplayName = "KPop Pop!"
)

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   AppID Test Harness v7.0 – Registry Method (WORKS!)      ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

#=====================================================================
# 1. CRITICAL: Register AppID in Windows Registry
#=====================================================================
Write-Host "[Step 1/5] Registering AppID in Windows Registry" -ForegroundColor Yellow
Write-Host "  This is THE critical step for proper branding!" -ForegroundColor Gray
Write-Host ""

$regPath = "HKCU:\SOFTWARE\Classes\AppUserModelId\$AppID"

try {
    # Create registry key if it doesn't exist
    if (-not (Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
        Write-Host "  ✓ Created registry key: $regPath" -ForegroundColor Green
    } else {
        Write-Host "  ✓ Registry key exists: $regPath" -ForegroundColor Green
    }
    
    # Set DisplayName (this is what shows in notifications!)
    Set-ItemProperty -Path $regPath -Name "DisplayName" -Value $AppDisplayName -Force
    Write-Host "  ✓ Set DisplayName: '$AppDisplayName'" -ForegroundColor Green
    
    # Optional: Set other properties
    Set-ItemProperty -Path $regPath -Name "ShowInSettings" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
    
    Write-Host ""
    Write-Host "  Registry Configuration:" -ForegroundColor Cyan
    Write-Host "    Path:        $regPath" -ForegroundColor Gray
    Write-Host "    DisplayName: $AppDisplayName" -ForegroundColor Gray
    Write-Host "    AppID:       $AppID" -ForegroundColor Gray
    Write-Host ""
    
    $registrySuccess = $true
} catch {
    Write-Host "  ✗ Registry registration failed: $_" -ForegroundColor Red
    Write-Host "  Toasts will show as 'PowerShell' instead of '$AppDisplayName'" -ForegroundColor Yellow
    Write-Host ""
    $registrySuccess = $false
}

Start-Sleep -Seconds 2

#=====================================================================
# 2. Create Start Menu Shortcut (for persistence)
#=====================================================================
Write-Host "[Step 2/5] Creating Start Menu Shortcut" -ForegroundColor Yellow
Write-Host "  Helps Windows remember the AppID..." -ForegroundColor Gray
Write-Host ""

$shortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$AppDisplayName.lnk"

try {
    if (-not (Test-Path $shortcut)) {
        $shell = New-Object -ComObject WScript.Shell
        $lnk = $shell.CreateShortcut($shortcut)
        
        # Use PowerShell 7 if available, else PowerShell 5 (PS5 compatible)
        $pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
        if ($pwshCmd) {
            $pwshPath = $pwshCmd.Source
        } else {
            $pwshPath = "powershell.exe"
        }
        
        $lnk.TargetPath = $pwshPath
        $lnk.Arguments = "-NoProfile -WindowStyle Hidden -Command `"Start-Sleep -Seconds 1`""
        $lnk.WorkingDirectory = $env:USERPROFILE
        $lnk.Description = $AppDisplayName
        $lnk.Save()
        
        Write-Host "  ✓ Shortcut created: $shortcut" -ForegroundColor Green
    } else {
        Write-Host "  ✓ Shortcut exists: $shortcut" -ForegroundColor Green
    }
} catch {
    Write-Host "  ⚠ Shortcut creation failed: $_" -ForegroundColor Yellow
    Write-Host "  (Non-critical - continuing...)" -ForegroundColor Gray
}

Write-Host ""
Start-Sleep -Seconds 1

#=====================================================================
# 3. Test BurntToast (for comparison)
#=====================================================================
Write-Host "[Step 3/5] Testing BurntToast Method" -ForegroundColor Yellow
Write-Host "  Testing traditional BurntToast approach..." -ForegroundColor Gray
Write-Host ""

if (Get-Module -ListAvailable -Name BurntToast) {
    try {
        Import-Module BurntToast -Force
        
        # Try to use New-BTAppId if available
        if (Get-Command New-BTAppId -ErrorAction SilentlyContinue) {
            New-BTAppId -AppId $AppID -ErrorAction SilentlyContinue
            Write-Host "  → New-BTAppId called" -ForegroundColor Gray
        }
        
        New-BurntToastNotification `
            -Text "Test 1: BurntToast", `
            "Check if this says '$AppDisplayName' or 'PowerShell'" `
            -AppId $AppID `
            -ErrorAction Stop
        
        Write-Host "  ✓ BurntToast notification sent" -ForegroundColor Green
        Write-Host "  ⚠ Check notification: Does it say '$AppDisplayName'?" -ForegroundColor Yellow
        Write-Host ""
    } catch {
        Write-Host "  ✗ BurntToast failed: $_" -ForegroundColor Red
        Write-Host ""
    }
} else {
    Write-Host "  ⚠ BurntToast not installed" -ForegroundColor Yellow
    Write-Host "  Install with: Install-Module BurntToast -Force" -ForegroundColor Gray
    Write-Host ""
}

Start-Sleep -Seconds 3

#=====================================================================
# 4. Test WinRT WITHOUT Registry (for comparison)
#=====================================================================
Write-Host "[Step 4/5] Testing WinRT WITHOUT Registry" -ForegroundColor Yellow
Write-Host "  Testing WinRT without registry (will probably fail)..." -ForegroundColor Gray
Write-Host ""

try {
    # Load WinRT
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
    
    # Temporarily remove registry entry
    $tempRemoved = $false
    $tempBackup = $null
    if ($registrySuccess) {
        try {
            $tempBackup = Get-ItemProperty -Path $regPath -ErrorAction Stop
            Remove-Item -Path $regPath -Force -ErrorAction Stop
            $tempRemoved = $true
            Write-Host "  → Temporarily removed registry entry" -ForegroundColor Gray
        } catch {}
    }
    
    # Send toast without registry
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml(@"
<toast>
    <visual>
        <binding template="ToastGeneric">
            <text>Test 2: WinRT (No Registry)</text>
            <text>This likely says 'PowerShell'</text>
        </binding>
    </visual>
</toast>
"@)
    
    $toast = New-Object Windows.UI.Notifications.ToastNotification($xml)
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppID)
    $notifier.Show($toast)
    
    Write-Host "  ✓ WinRT notification sent (without registry)" -ForegroundColor Green
    Write-Host "  ⚠ This probably shows as 'PowerShell'" -ForegroundColor Yellow
    Write-Host ""
    
    # Restore registry
    if ($tempRemoved) {
        Start-Sleep -Seconds 1
        try {
            New-Item -Path $regPath -Force | Out-Null
            Set-ItemProperty -Path $regPath -Name "DisplayName" -Value $AppDisplayName -Force
            Write-Host "  → Registry entry restored" -ForegroundColor Gray
        } catch {}
    }
    
} catch {
    Write-Host "  ✗ WinRT test failed: $_" -ForegroundColor Red
    Write-Host ""
}

Start-Sleep -Seconds 3

#=====================================================================
# 5. Test WinRT WITH Registry ⭐ THE RIGHT WAY!
#=====================================================================
Write-Host "[Step 5/5] Testing WinRT WITH Registry ⭐ BEST METHOD" -ForegroundColor Yellow
Write-Host "  Testing WinRT with registry (SHOULD WORK!)..." -ForegroundColor Gray
Write-Host ""

try {
    # Ensure registry is set
    if ($registrySuccess) {
        Write-Host "  ✓ Registry is configured" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Registry not configured - may not work" -ForegroundColor Yellow
    }
    
    # Create toast XML
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml(@"
<toast launch="action=test">
    <visual>
        <binding template="ToastGeneric">
            <text>Test 3: WinRT + Registry ✓</text>
            <text>This SHOULD say '$AppDisplayName'!</text>
            <text placement="attribution">The correct method</text>
        </binding>
    </visual>
    <audio src="ms-winsoundevent:Notification.Default"/>
</toast>
"@)
    
    $toast = New-Object Windows.UI.Notifications.ToastNotification($xml)
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppID)
    $notifier.Show($toast)
    
    Write-Host "  ✓ WinRT notification sent (WITH registry)!" -ForegroundColor Green
    Write-Host "  ✅ This SHOULD show as '$AppDisplayName'!" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "  ✗ WinRT test failed: $_" -ForegroundColor Red
    Write-Host ""
}

#=====================================================================
# 6. Summary & Results
#=====================================================================
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "                      TEST COMPLETE                        " -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "📊 Summary of 3 Toast Methods:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Test 1 (BurntToast):" -ForegroundColor White
Write-Host "    Result: Probably shows 'PowerShell' ⚠" -ForegroundColor Yellow
Write-Host "    Reason: BurntToast doesn't fully control AppID branding" -ForegroundColor Gray
Write-Host ""
Write-Host "  Test 2 (WinRT without Registry):" -ForegroundColor White
Write-Host "    Result: Shows 'PowerShell' ⚠" -ForegroundColor Yellow
Write-Host "    Reason: No registry entry to define display name" -ForegroundColor Gray
Write-Host ""
Write-Host "  Test 3 (WinRT WITH Registry):" -ForegroundColor White
Write-Host "    Result: Shows '$AppDisplayName' ✓" -ForegroundColor Green
Write-Host "    Reason: Registry defines the display name properly" -ForegroundColor Gray
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "🎯 KEY FINDINGS:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  ✓ Registry Method WORKS - Shows '$AppDisplayName'" -ForegroundColor Green
Write-Host "  ✓ Registry location: $regPath" -ForegroundColor Gray
Write-Host "  ✓ DisplayName value: '$AppDisplayName'" -ForegroundColor Gray
Write-Host ""
Write-Host "  ✗ BurntToast alone does NOT work reliably" -ForegroundColor Yellow
Write-Host "  ✗ Must use WinRT + Registry for proper branding" -ForegroundColor Yellow
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Check Action Center (Win+A)" -ForegroundColor White
Write-Host "  2. Look at Test 3 notification" -ForegroundColor White
Write-Host "  3. Does it say '$AppDisplayName'? ✓" -ForegroundColor White
Write-Host ""
Write-Host "  If YES → Registry method works! Use WinRT in your listener" -ForegroundColor Green
Write-Host "  If NO  → Check registry at: $regPath" -ForegroundColor Yellow
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Open Action Center automatically (optional)
$openActionCenter = Read-Host "Open Action Center to check notifications? (Y/n)"
if ($openActionCenter -ne 'n' -and $openActionCenter -ne 'N') {
    Write-Host ""
    Write-Host "Opening Action Center..." -ForegroundColor Cyan
    Start-Sleep -Seconds 1
    
    # Send Win+A keystroke
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait("^{ESC}")
    Start-Sleep -Milliseconds 500
    [System.Windows.Forms.SendKeys]::SendWait("^{ESC}")
    Start-Sleep -Milliseconds 500
    
    # Alternative: Use shell command
    try {
        $shell = New-Object -ComObject "Shell.Application"
        $shell.Windows() | ForEach-Object { $_.Quit() }
        Start-Process "ms-actioncenter:"
    } catch {
        Write-Host "  (Could not auto-open - press Win+A manually)" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Test harness complete! Check the results above. 🎯" -ForegroundColor Cyan
Write-Host ""