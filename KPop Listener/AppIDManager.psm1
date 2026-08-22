# =====================================================================
# Module: AppIDManager.psm1
# Version: 2.0.0
# Purpose: AppID registration + WinRT / BurntToast notification helper
# Features:
#   - Dual notification system (WinRT native + BurntToast fallback)
#   - Smart AppID registration with shortcut support
#   - Automatic BurntToast installation (optional)
#   - Comprehensive error handling and logging
# =====================================================================

$script:ModuleVersion = "2.0.0"
$script:BurntToastVersion = "1.2.0"
$script:DefaultAppID = "KPop.Pop"
$script:DefaultDisplayName = "KPop Pop!"

# =====================================================================
# PRIVATE FUNCTIONS
# =====================================================================

function Write-ModuleLog {
    param(
        [string]$Message,
        [ValidateSet("Info","Success","Warning","Error")]
        [string]$Level = "Info"
    )
    
    $colors = @{
        Info = "Cyan"
        Success = "Green"
        Warning = "Yellow"
        Error = "Red"
    }
    
    $prefix = switch ($Level) {
        "Success" { "✓" }
        "Warning" { "⚠" }
        "Error" { "✗" }
        default { "→" }
    }
    
    Write-Host "$prefix $Message" -ForegroundColor $colors[$Level]
}

function Test-WinRTAvailable {
    try {
        Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction Stop
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
        return $true
    } catch {
        return $false
    }
}

# =====================================================================
# PUBLIC FUNCTIONS
# =====================================================================

function Install-BurntToastIfMissing {
    <#
    .SYNOPSIS
        Installs or updates BurntToast module if needed
    .PARAMETER ForceInstall
        Force installation even if module exists
    .PARAMETER Silent
        Suppress output messages
    #>
    [CmdletBinding()]
    param(
        [switch]$ForceInstall,
        [switch]$Silent
    )
    
    try {
        $existingModule = Get-Module -ListAvailable -Name BurntToast | 
            Sort-Object Version -Descending | 
            Select-Object -First 1
        
        if (-not $existingModule -or $ForceInstall) {
            if (-not $Silent) {
                Write-ModuleLog "Installing BurntToast v$script:BurntToastVersion..." "Info"
            }
            
            Install-Module -Name BurntToast -RequiredVersion $script:BurntToastVersion `
                -Force -Scope CurrentUser -AllowClobber -Confirm:$false -ErrorAction Stop
            
            if (-not $Silent) {
                Write-ModuleLog "BurntToast installed successfully" "Success"
            }
            return $true
        }
        
        # Check version
        if ($existingModule.Version.ToString() -ne $script:BurntToastVersion) {
            if (-not $Silent) {
                Write-ModuleLog "Updating BurntToast to v$script:BurntToastVersion..." "Info"
            }
            
            Install-Module -Name BurntToast -RequiredVersion $script:BurntToastVersion `
                -Force -Scope CurrentUser -AllowClobber -Confirm:$false -ErrorAction Stop
            
            if (-not $Silent) {
                Write-ModuleLog "BurntToast updated successfully" "Success"
            }
        }
        
        Import-Module BurntToast -Force -ErrorAction Stop
        return $true
        
    } catch {
        if (-not $Silent) {
            Write-ModuleLog "BurntToast installation failed: $($_.Exception.Message)" "Error"
        }
        return $false
    }
}

function Register-AppID {
    <#
    .SYNOPSIS
        Registers an AppID in Windows registry
    .PARAMETER AppId
        The AppUserModelID to register (e.g., "Company.App")
    .PARAMETER DisplayName
        The display name shown in Windows notifications
    .PARAMETER CreateShortcut
        Create Start Menu shortcut for the AppID
    .EXAMPLE
        Register-AppID -AppId "KPop.Pop" -DisplayName "KPop Pop!" -CreateShortcut
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$AppId,
        
        [Parameter(Mandatory=$true)]
        [string]$DisplayName,
        
        [switch]$CreateShortcut
    )
    
    $regPath = "HKCU:\SOFTWARE\Classes\AppUserModelId\$AppId"
    
    try {
        # Create registry key
        if (-not (Test-Path $regPath)) {
            New-Item -Path $regPath -Force -ErrorAction Stop | Out-Null
        }
        
        # Set properties
        Set-ItemProperty -Path $regPath -Name "DisplayName" -Value $DisplayName -Force -ErrorAction Stop
        Set-ItemProperty -Path $regPath -Name "ShowInSettings" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
        
        Write-ModuleLog "AppID registered: $AppId → '$DisplayName'" "Success"
        
        # Create shortcut if requested
        if ($CreateShortcut) {
            $shortcutPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$DisplayName.lnk"
            
            try {
                $shell = New-Object -ComObject WScript.Shell
                $lnk = $shell.CreateShortcut($shortcutPath)
                
                # Use PowerShell 7 if available, otherwise Windows PowerShell
                $pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
                $lnk.TargetPath = if ($pwshCmd) { $pwshCmd.Source } else { "powershell.exe" }
                $lnk.Arguments = "-NoProfile -WindowStyle Hidden -Command `"Start-Sleep -Seconds 1`""
                $lnk.WorkingDirectory = $env:USERPROFILE
                $lnk.Description = $DisplayName
                $lnk.Save()
                
                Write-ModuleLog "Shortcut created: $shortcutPath" "Success"
            } catch {
                Write-ModuleLog "Shortcut creation failed: $($_.Exception.Message)" "Warning"
            }
        }
        
        return $true
        
    } catch {
        Write-ModuleLog "AppID registration failed: $($_.Exception.Message)" "Error"
        return $false
    }
}

function Test-AppIDRegistered {
    <#
    .SYNOPSIS
        Checks if an AppID is properly registered
    .PARAMETER AppId
        The AppUserModelID to check
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$AppId
    )
    
    $regPath = "HKCU:\SOFTWARE\Classes\AppUserModelId\$AppId"
    
    if (-not (Test-Path $regPath)) {
        return $false
    }
    
    try {
        $displayName = Get-ItemProperty -Path $regPath -Name "DisplayName" -ErrorAction Stop
        return ($null -ne $displayName)
    } catch {
        return $false
    }
}

function Send-WinRTToast {
    <#
    .SYNOPSIS
        Sends a native Windows WinRT toast notification
    .PARAMETER AppId
        The AppUserModelID to use
    .PARAMETER Title
        Toast title
    .PARAMETER Message
        Toast message body
    .PARAMETER Attribution
        Optional attribution text
    .PARAMETER Sound
        Toast sound (default: ms-winsoundevent:Notification.Default)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$AppId,
        
        [Parameter(Mandatory=$true)]
        [string]$Title,
        
        [Parameter(Mandatory=$true)]
        [string]$Message,
        
        [string]$Attribution = "",
        
        [string]$Sound = "ms-winsoundevent:Notification.Default"
    )
    
    try {
        # Ensure WinRT types are loaded
        if (-not (Test-WinRTAvailable)) {
            throw "WinRT types not available"
        }
        
        # Escape XML special characters
        $titleEscaped = [System.Security.SecurityElement]::Escape($Title)
        $messageEscaped = [System.Security.SecurityElement]::Escape($Message)
        
        # Build XML
        $xmlText = @"
<toast launch='action=default'>
  <visual>
    <binding template='ToastGeneric'>
      <text>$titleEscaped</text>
      <text>$messageEscaped</text>
"@
        
        if ($Attribution) {
            $attributionEscaped = [System.Security.SecurityElement]::Escape($Attribution)
            $xmlText += "      <text placement='attribution'>$attributionEscaped</text>`n"
        }
        
        $xmlText += @"
    </binding>
  </visual>
  <audio src='$Sound'/>
</toast>
"@
        
        # Create and show toast
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($xmlText)
        
        $toast = New-Object Windows.UI.Notifications.ToastNotification($xml)
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId)
        $notifier.Show($toast)
        
        return $true
        
    } catch {
        Write-ModuleLog "WinRT toast failed: $($_.Exception.Message)" "Warning"
        return $false
    }
}

function New-AppNotification {
    <#
    .SYNOPSIS
        Sends a Windows notification using best available method
    .DESCRIPTION
        Tries WinRT first (native), falls back to BurntToast if needed.
        Automatically registers AppID if not already registered.
    .PARAMETER AppId
        The AppUserModelID (default: KPop.Pop)
    .PARAMETER DisplayName
        Display name for the app (default: KPop Pop!)
    .PARAMETER Title
        Notification title
    .PARAMETER Message
        Notification message body
    .PARAMETER Tag
        Toast tag for grouping/replacing
    .PARAMETER Group
        Toast group for organizing
    .PARAMETER Progress
        Progress value (0-100, -1 for none)
    .PARAMETER LinkUrl
        Optional action button URL
    .PARAMETER LinkText
        Text for action button
    .PARAMETER Attribution
        Small attribution text at bottom
    .PARAMETER ForceBurntToast
        Force use of BurntToast instead of WinRT
    .PARAMETER Silent
        Suppress console output
    .EXAMPLE
        New-AppNotification -Title "Build Complete" -Message "Your project built successfully"
    .EXAMPLE
        New-AppNotification -Title "Download" -Message "50% complete" -Progress 50
    #>
    [CmdletBinding()]
    param(
        [string]$AppId = $script:DefaultAppID,
        [string]$DisplayName = $script:DefaultDisplayName,
        [Parameter(Mandatory=$true)]
        [string]$Title,
        [Parameter(Mandatory=$true)]
        [string]$Message,
        [string]$Tag = "General",
        [string]$Group = "Default",
        [ValidateRange(-1,100)]
        [int]$Progress = -1,
        [string]$LinkUrl = "",
        [string]$LinkText = "Open",
        [string]$Attribution = "",
        [switch]$ForceBurntToast,
        [switch]$Silent
    )
    
    # Ensure AppID is registered
    if (-not (Test-AppIDRegistered -AppId $AppId)) {
        Register-AppID -AppId $AppId -DisplayName $DisplayName | Out-Null
    }
    
    $success = $false
    
    # Try WinRT first (unless forced to use BurntToast)
    if (-not $ForceBurntToast -and (Test-WinRTAvailable)) {
        $attributionText = if ($Attribution) { $Attribution } else { "" }
        $success = Send-WinRTToast -AppId $AppId -Title $Title -Message $Message -Attribution $attributionText
        
        if ($success -and -not $Silent) {
            Write-ModuleLog "Toast sent via WinRT" "Success"
        }
    }
    
    # Fallback to BurntToast
    if (-not $success) {
        try {
            # Ensure BurntToast is available
            $btAvailable = Get-Module -ListAvailable -Name BurntToast
            if (-not $btAvailable) {
                if (-not $Silent) {
                    Write-ModuleLog "BurntToast not available, attempting install..." "Info"
                }
                Install-BurntToastIfMissing -Silent:$Silent | Out-Null
            }
            
            Import-Module BurntToast -Force -ErrorAction Stop
            
            # Build BurntToast parameters
            $btParams = @{
                Text = @($Title, $Message)
                AppLogoOverride = ""
                Silent = $false
                Tag = $Tag
                Group = $Group
            }
            
            # Add progress bar if specified
            if ($Progress -ge 0 -and $Progress -le 100) {
                $btParams['ProgressBar'] = New-BTProgressBar -Status "$Progress% complete" -Value ($Progress / 100.0)
            }
            
            # Add button if URL specified
            if ($LinkUrl) {
                $btParams['Button'] = New-BTButton -Content $LinkText -Arguments $LinkUrl
            }
            
            New-BurntToastNotification @btParams -ErrorAction Stop
            
            if (-not $Silent) {
                Write-ModuleLog "Toast sent via BurntToast" "Success"
            }
            $success = $true
            
        } catch {
            if (-not $Silent) {
                Write-ModuleLog "Notification failed: $($_.Exception.Message)" "Error"
            }
        }
    }
    
    return $success
}

function Get-AppIDManagerInfo {
    <#
    .SYNOPSIS
        Returns module version and capability information
    #>
    [CmdletBinding()]
    param()
    
    $btAvailable = $null -ne (Get-Module -ListAvailable -Name BurntToast)
    $winrtAvailable = Test-WinRTAvailable
    
    return [PSCustomObject]@{
        ModuleVersion = $script:ModuleVersion
        BurntToastAvailable = $btAvailable
        BurntToastVersion = if ($btAvailable) { (Get-Module -ListAvailable -Name BurntToast | Select-Object -First 1).Version } else { "Not Installed" }
        WinRTAvailable = $winrtAvailable
        DefaultAppID = $script:DefaultAppID
        DefaultDisplayName = $script:DefaultDisplayName
    }
}

# =====================================================================
# MODULE INITIALIZATION
# =====================================================================

Write-Host "AppIDManager v$script:ModuleVersion loaded" -ForegroundColor Cyan

# Export functions
Export-ModuleMember -Function @(
    'Install-BurntToastIfMissing',
    'Register-AppID',
    'Test-AppIDRegistered',
    'Send-WinRTToast',
    'New-AppNotification',
    'Get-AppIDManagerInfo'
)