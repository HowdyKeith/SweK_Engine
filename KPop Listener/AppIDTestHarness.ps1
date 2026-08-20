<#
.SYNOPSIS
    AppIDTestHarness.ps1 v9.1 – Modular Init, Self-Heal, Toast, and Cleanup
.DESCRIPTION
    • Self-heals AppID registry + shortcut
    • Sends WinRT toast with proper AppID
    • Optional cleanup
    • PS5.1 + PS7 compatible
#>

param(
    [string]$AppID = "KPop.Pop",
    [string]$AppDisplayName = "KPop Pop!",
    [switch]$AutoCleanup
)

# GLOBALS
$global:AppRegPath = "HKCU:\SOFTWARE\Classes\AppUserModelId\$AppID"
$global:ShortcutPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$AppDisplayName.lnk"

# FUNCTION: Initialize-AppIDEnvironment
function Initialize-AppIDEnvironment {
    param([string]$AppID, [string]$AppDisplayName)

    Write-Host "Initializing AppID Environment for [$AppID] ..." -ForegroundColor Cyan
    $global:AppRegPath = "HKCU:\SOFTWARE\Classes\AppUserModelId\$AppID"
    $global:ShortcutPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$AppDisplayName.lnk"

    # Registry Self-Heal
    try {
        if (-not (Test-Path $global:AppRegPath)) {
            New-Item -Path $global:AppRegPath -Force | Out-Null
            Write-Host "   Created registry key" -ForegroundColor Green
        }
        Set-ItemProperty -Path $global:AppRegPath -Name "DisplayName" -Value $AppDisplayName -Force
        Set-ItemProperty -Path $global:AppRegPath -Name "ShowInSettings" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
        Write-Host "   Registry verified for $AppDisplayName" -ForegroundColor Green
    } catch {
        Write-Host "   Registry setup failed: $_" -ForegroundColor Red
    }

    # Shortcut Self-Heal
    try {
        if (-not (Test-Path $global:ShortcutPath)) {
            $shell = New-Object -ComObject WScript.Shell
            $lnk = $shell.CreateShortcut($global:ShortcutPath)
            $pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
            $lnk.TargetPath = if ($pwshCmd) { $pwshCmd.Source } else { "powershell.exe" }
            $lnk.Arguments = "-NoProfile -WindowStyle Hidden -Command `"Start-Sleep -Seconds 1`""
            $lnk.WorkingDirectory = $env:USERPROFILE
            $lnk.Description = $AppDisplayName
            $lnk.Save()
            Write-Host "   Created shortcut: $global:ShortcutPath" -ForegroundColor Green
        } else {
            Write-Host "   Shortcut exists" -ForegroundColor Green
        }
    } catch {
        Write-Host "   Shortcut creation failed: $_" -ForegroundColor Yellow
    }

    Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction SilentlyContinue
    Write-Host "Initialization complete." -ForegroundColor Cyan
}

# FUNCTION: Send-WinRTToast
function Send-WinRTToast {
    param(
        [string]$Title = "Test Toast",
        [string]$Message = "Message from WinRT",
        [string]$Attribution = "",
        [string]$Sound = "ms-winsoundevent:Notification.Default"
    )
    try {
        $xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
        $xml.LoadXml(@"
<toast launch='action=test'>
  <visual>
    <binding template='ToastGeneric'>
      <text>$Title</text>
      <text>$Message</text>
      $(if ($Attribution) { "<text placement='attribution'>$Attribution</text>" })
    </binding>
  </visual>
  <audio src='$Sound'/>
</toast>
"@)
        $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppID)
        $notifier.Show($toast)
        Write-Host "   Toast sent: $Title" -ForegroundColor Green
    } catch {
        Write-Host "   Toast send failed: $_" -ForegroundColor Red
    }
}

# FUNCTION: Cleanup-AppIDEnvironment
function Cleanup-AppIDEnvironment {
    Write-Host "Cleaning up AppID Environment..." -ForegroundColor Cyan
    try {
        if (Test-Path $global:AppRegPath) {
            Remove-Item -Path $global:AppRegPath -Recurse -Force
            Write-Host "   Removed registry key" -ForegroundColor Yellow
        }
        if (Test-Path $global:ShortcutPath) {
            Remove-Item -Path $global:ShortcutPath -Force
            Write-Host "   Removed shortcut" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   Cleanup failed: $_" -ForegroundColor Red
    }
}

# MAIN
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║ AppIDTestHarness v9.1 – Init / Self-Heal / Cleanup     ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Initialize-AppIDEnvironment -AppID $AppID -AppDisplayName $AppDisplayName
Send-WinRTToast -Title "KPop Test Toast" -Message "Initialization succeeded for $AppDisplayName" -Attribution "v9.1 Self-Heal"

Write-Host ""
if ($AutoCleanup) {
    Start-Sleep -Seconds 2
    Cleanup-AppIDEnvironment
    Write-Host "Auto-cleanup completed." -ForegroundColor Gray
} else {
    Write-Host "Run Cleanup-AppIDEnvironment manually to reset." -ForegroundColor Gray
}
Write-Host ""