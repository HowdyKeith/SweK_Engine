# =====================================================================
# Module: KPopToast.psm1 v5.0
# Purpose: Advanced toast notification system
# Features:
#   - Multi-engine support (WinRT, BurntToast, Custom)
#   - Toast templates and presets
#   - Action buttons with callbacks
#   - Progress notifications
#   - Toast groups and priorities
#   - Sound profiles
#   - Hero images and inline images
#   - Adaptive content
# =====================================================================

using namespace Windows.UI.Notifications
using namespace Windows.Data.Xml.Dom

# =====================================================================
# MODULE STATE
# =====================================================================

$script:ToastEngines = @{
    WinRT = $null
    BurntToast = $null
    Custom = @()
}

$script:ToastTemplates = @{}
$script:ToastHistory = [System.Collections.Concurrent.ConcurrentQueue[hashtable]]::new()
$script:ToastCallbacks = @{}
$script:DefaultAppID = "KPop.Pop"

# =====================================================================
# TOAST CONFIGURATION
# =====================================================================

class ToastConfig {
    [string]$AppID
    [string]$Title
    [string]$Message
    [string]$Attribution
    [string]$HeroImage
    [string]$AppLogoOverride
    [string[]]$InlineImages
    [string]$Sound
    [bool]$Silent
    [string]$Duration  # 'short' or 'long'
    [string]$Scenario  # 'default', 'alarm', 'reminder', 'incomingCall'
    [hashtable[]]$Buttons
    [hashtable[]]$Inputs
    [string]$Group
    [string]$Tag
    [int]$Priority  # 0=default, 1=high
    [double]$Progress  # -1 for none, 0.0-1.0 for progress
    [string]$ProgressStatus
    [hashtable]$LaunchArgs
    
    ToastConfig() {
        $this.AppID = $script:DefaultAppID
        $this.Sound = "ms-winsoundevent:Notification.Default"
        $this.Silent = $false
        $this.Duration = "short"
        $this.Scenario = "default"
        $this.Buttons = @()
        $this.Inputs = @()
        $this.Group = "Default"
        $this.Tag = [guid]::NewGuid().ToString()
        $this.Priority = 0
        $this.Progress = -1
        $this.InlineImages = @()
        $this.LaunchArgs = @{}
    }
}

# =====================================================================
# ENGINE DETECTION & INITIALIZATION
# =====================================================================

function Initialize-ToastEngines {
    <#
    .SYNOPSIS
        Detects and initializes available toast engines
    #>
    
    # Test WinRT
    try {
        Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction Stop
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
        
        $script:ToastEngines.WinRT = @{
            Available = $true
            Version = "Windows 10/11 Native"
            Priority = 1
        }
        
        Write-Host "✓ WinRT toast engine available" -ForegroundColor Green
    } catch {
        $script:ToastEngines.WinRT = @{ Available = $false }
        Write-Host "✗ WinRT not available" -ForegroundColor Yellow
    }
    
    # Test BurntToast
    try {
        Import-Module BurntToast -ErrorAction Stop
        $btVersion = (Get-Module BurntToast).Version
        
        $script:ToastEngines.BurntToast = @{
            Available = $true
            Version = $btVersion.ToString()
            Priority = 2
        }
        
        Write-Host "✓ BurntToast engine available (v$btVersion)" -ForegroundColor Green
    } catch {
        $script:ToastEngines.BurntToast = @{ Available = $false }
        Write-Host "✗ BurntToast not available" -ForegroundColor Yellow
    }
}

function Get-PreferredToastEngine {
    <#
    .SYNOPSIS
        Returns the preferred toast engine
    #>
    
    if ($script:ToastEngines.WinRT.Available) {
        return "WinRT"
    } elseif ($script:ToastEngines.BurntToast.Available) {
        return "BurntToast"
    } elseif ($script:ToastEngines.Custom.Count -gt 0) {
        return "Custom"
    }
    
    return $null
}

# =====================================================================
# TOAST TEMPLATES
# =====================================================================

function Register-ToastTemplate {
    <#
    .SYNOPSIS
        Registers a toast template
    .PARAMETER Name
        Template name
    .PARAMETER Template
        Template configuration
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,
        
        [Parameter(Mandatory)]
        [ToastConfig]$Template
    )
    
    $script:ToastTemplates[$Name] = $Template
    Write-Host "✓ Registered toast template: $Name" -ForegroundColor Green
}

function Get-ToastTemplate {
    <#
    .SYNOPSIS
        Gets a toast template by name
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name
    )
    
    if ($script:ToastTemplates.ContainsKey($Name)) {
        # Return a copy
        return $script:ToastTemplates[$Name].PSObject.Copy()
    }
    
    return $null
}

# Register default templates
function Initialize-DefaultTemplates {
    # Success template
    $success = [ToastConfig]@{
        Sound = "ms-winsoundevent:Notification.SMS"
        Duration = "short"
    }
    Register-ToastTemplate -Name "Success" -Template $success
    
    # Error template
    $error = [ToastConfig]@{
        Sound = "ms-winsoundevent:Notification.Looping.Alarm"
        Duration = "long"
        Scenario = "alarm"
    }
    Register-ToastTemplate -Name "Error" -Template $error
    
    # Progress template
    $progress = [ToastConfig]@{
        Silent = $true
        Duration = "long"
    }
    Register-ToastTemplate -Name "Progress" -Template $progress
    
    # Reminder template
    $reminder = [ToastConfig]@{
        Scenario = "reminder"
        Sound = "ms-winsoundevent:Notification.Reminder"
    }
    Register-ToastTemplate -Name "Reminder" -Template $reminder
}

# =====================================================================
# XML GENERATION (WinRT)
# =====================================================================

function Build-ToastXml {
    <#
    .SYNOPSIS
        Builds toast XML for WinRT
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ToastConfig]$Config
    )
    
    $xml = [System.Text.StringBuilder]::new()
    
    # Toast root
    $launchArgs = if ($Config.LaunchArgs.Count -gt 0) {
        ($Config.LaunchArgs.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "&"
    } else { "" }
    
    $xml.AppendLine("<toast launch='$launchArgs' duration='$($Config.Duration)' scenario='$($Config.Scenario)'>") | Out-Null
    
    # Visual
    $xml.AppendLine("  <visual>") | Out-Null
    $xml.AppendLine("    <binding template='ToastGeneric'>") | Out-Null
    
    # Hero image
    if ($Config.HeroImage) {
        $xml.AppendLine("      <image placement='hero' src='$($Config.HeroImage)'/>") | Out-Null
    }
    
    # App logo
    if ($Config.AppLogoOverride) {
        $xml.AppendLine("      <image placement='appLogoOverride' src='$($Config.AppLogoOverride)' hint-crop='circle'/>") | Out-Null
    }
    
    # Title
    if ($Config.Title) {
        $titleEscaped = [System.Security.SecurityElement]::Escape($Config.Title)
        $xml.AppendLine("      <text>$titleEscaped</text>") | Out-Null
    }
    
    # Message
    if ($Config.Message) {
        $messageEscaped = [System.Security.SecurityElement]::Escape($Config.Message)
        $xml.AppendLine("      <text>$messageEscaped</text>") | Out-Null
    }
    
    # Attribution
    if ($Config.Attribution) {
        $attrEscaped = [System.Security.SecurityElement]::Escape($Config.Attribution)
        $xml.AppendLine("      <text placement='attribution'>$attrEscaped</text>") | Out-Null
    }
    
    # Inline images
    foreach ($img in $Config.InlineImages) {
        $xml.AppendLine("      <image src='$img'/>") | Out-Null
    }
    
    # Progress bar
    if ($Config.Progress -ge 0) {
        $status = if ($Config.ProgressStatus) { $Config.ProgressStatus } else { "$([math]::Round($Config.Progress * 100))%" }
        $xml.AppendLine("      <progress value='$($Config.Progress)' status='$status'/>") | Out-Null
    }
    
    $xml.AppendLine("    </binding>") | Out-Null
    $xml.AppendLine("  </visual>") | Out-Null
    
    # Actions
    if ($Config.Buttons.Count -gt 0 -or $Config.Inputs.Count -gt 0) {
        $xml.AppendLine("  <actions>") | Out-Null
        
        # Inputs
        foreach ($input in $Config.Inputs) {
            $inputId = $input.Id
            $inputType = $input.Type
            $inputPlaceholder = if ($input.PlaceholderContent) { " placeHolderContent='$($input.PlaceholderContent)'" } else { "" }
            $xml.AppendLine("    <input id='$inputId' type='$inputType'$inputPlaceholder/>") | Out-Null
        }
        
        # Buttons
        foreach ($button in $Config.Buttons) {
            $btnContent = [System.Security.SecurityElement]::Escape($button.Content)
            $btnArgs = $button.Arguments
            $btnActivation = if ($button.ActivationType) { " activationType='$($button.ActivationType)'" } else { "" }
            $xml.AppendLine("    <action content='$btnContent' arguments='$btnArgs'$btnActivation/>") | Out-Null
        }
        
        $xml.AppendLine("  </actions>") | Out-Null
    }
    
    # Audio
    if ($Config.Silent) {
        $xml.AppendLine("  <audio silent='true'/>") | Out-Null
    } elseif ($Config.Sound) {
        $xml.AppendLine("  <audio src='$($Config.Sound)'/>") | Out-Null
    }
    
    $xml.AppendLine("</toast>") | Out-Null
    
    return $xml.ToString()
}

# =====================================================================
# TOAST SENDING
# =====================================================================

function Send-KPopToast {
    <#
    .SYNOPSIS
        Sends a toast notification
    .PARAMETER Config
        Toast configuration
    .PARAMETER Engine
        Preferred engine (WinRT, BurntToast, Auto)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ToastConfig]$Config,
        
        [ValidateSet('Auto','WinRT','BurntToast','Custom')]
        [string]$Engine = 'Auto'
    )
    
    # Determine engine
    if ($Engine -eq 'Auto') {
        $Engine = Get-PreferredToastEngine
    }
    
    if (-not $Engine) {
        throw "No toast engine available"
    }
    
    try {
        $result = switch ($Engine) {
            'WinRT' { Send-WinRTToast -Config $Config }
            'BurntToast' { Send-BurntToastNotification -Config $Config }
            'Custom' { Send-CustomToast -Config $Config }
        }
        
        # Add to history
        $historyEntry = @{
            Timestamp = Get-Date
            Engine = $Engine
            Title = $Config.Title
            Message = $Config.Message
            Tag = $Config.Tag
            Group = $Config.Group
            Success = $result
        }
        
        $script:ToastHistory.Enqueue($historyEntry)
        
        # Keep only last 100
        while ($script:ToastHistory.Count -gt 100) {
            $script:ToastHistory.TryDequeue([ref]$null) | Out-Null
        }
        
        return $result
        
    } catch {
        Write-Host "Toast failed: $_" -ForegroundColor Red
        
        # Try fallback engine
        if ($Engine -eq 'WinRT' -and $script:ToastEngines.BurntToast.Available) {
            Write-Host "Falling back to BurntToast..." -ForegroundColor Yellow
            return Send-KPopToast -Config $Config -Engine 'BurntToast'
        }
        
        throw
    }
}

function Send-WinRTToast {
    [CmdletBinding()]
    param([ToastConfig]$Config)
    
    try {
        $xmlText = Build-ToastXml -Config $Config
        
        $xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
        $xml.LoadXml($xmlText)
        
        $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
        $toast.Tag = $Config.Tag
        $toast.Group = $Config.Group
        
        # Set priority
        if ($Config.Priority -eq 1) {
            $toast.Priority = [Windows.UI.Notifications.ToastNotificationPriority]::High
        }
        
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($Config.AppID)
        $notifier.Show($toast)
        
        Write-Host "✓ Toast sent via WinRT: $($Config.Title)" -ForegroundColor Green
        return $true
        
    } catch {
        Write-Host "✗ WinRT toast failed: $_" -ForegroundColor Red
        throw
    }
}

function Send-BurntToastNotification {
    [CmdletBinding()]
    param([ToastConfig]$Config)
    
    try {
        $btParams = @{
            Text = @($Config.Title, $Config.Message)
            AppId = $Config.AppID
            Silent = $Config.Silent
        }
        
        if ($Config.HeroImage) {
            $btParams.HeroImage = $Config.HeroImage
        }
        
        if ($Config.AppLogoOverride) {
            $btParams.AppLogo = $Config.AppLogoOverride
        }
        
        if ($Config.Progress -ge 0) {
            $status = if ($Config.ProgressStatus) { $Config.ProgressStatus } else { "$([math]::Round($Config.Progress * 100))%" }
            $btParams.ProgressBar = New-BTProgressBar -Status $status -Value $Config.Progress
        }
        
        if ($Config.Buttons.Count -gt 0) {
            $btButtons = foreach ($btn in $Config.Buttons) {
                New-BTButton -Content $btn.Content -Arguments $btn.Arguments
            }
            $btParams.Button = $btButtons
        }
        
        New-BurntToastNotification @btParams
        
        Write-Host "✓ Toast sent via BurntToast: $($Config.Title)" -ForegroundColor Green
        return $true
        
    } catch {
        Write-Host "✗ BurntToast failed: $_" -ForegroundColor Red
        throw
    }
}

# =====================================================================
# CONVENIENCE FUNCTIONS
# =====================================================================

function Show-KPopNotification {
    <#
    .SYNOPSIS
        Quick notification with minimal parameters
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Title,
        
        [Parameter(Mandatory)]
        [string]$Message,
        
        [ValidateSet('Info','Success','Warning','Error')]
        [string]$Type = 'Info',
        
        [double]$Progress = -1,
        
        [hashtable[]]$Buttons = @()
    )
    
    $config = [ToastConfig]::new()
    $config.Title = $Title
    $config.Message = $Message
    
    # Apply type-specific settings
    switch ($Type) {
        'Success' {
            $config.Sound = "ms-winsoundevent:Notification.SMS"
            $config.Attribution = "✓ Success"
        }
        'Warning' {
            $config.Sound = "ms-winsoundevent:Notification.Default"
            $config.Attribution = "⚠ Warning"
        }
        'Error' {
            $config.Sound = "ms-winsoundevent:Notification.Looping.Alarm"
            $config.Duration = "long"
            $config.Attribution = "✗ Error"
        }
        'Info' {
            $config.Attribution = "ℹ Information"
        }
    }
    
    if ($Progress -ge 0) {
        $config.Progress = $Progress / 100.0
        $config.ProgressStatus = "$Progress%"
    }
    
    if ($Buttons.Count -gt 0) {
        $config.Buttons = $Buttons
    }
    
    Send-KPopToast -Config $config
}

function Update-KPopProgressToast {
    <#
    .SYNOPSIS
        Updates a progress toast
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Tag,
        
        [Parameter(Mandatory)]
        [double]$Progress,
        
        [string]$Status,
        
        [string]$Group = "Default"
    )
    
    $config = [ToastConfig]::new()
    $config.Tag = $Tag
    $config.Group = $Group
    $config.Title = "Progress Update"
    $config.Message = if ($Status) { $Status } else { "Processing..." }
    $config.Progress = $Progress / 100.0
    $config.ProgressStatus = "$Progress%"
    $config.Silent = $true
    
    Send-KPopToast -Config $config
}

function Clear-KPopToast {
    <#
    .SYNOPSIS
        Clears a toast by tag/group
    #>
    [CmdletBinding()]
    param(
        [string]$Tag,
        [string]$Group = "Default",
        [string]$AppID = $script:DefaultAppID
    )
    
    try {
        if ($script:ToastEngines.WinRT.Available) {
            $history = [Windows.UI.Notifications.ToastNotificationManager]::History
            
            if ($Tag) {
                $history.Remove($Tag, $Group, $AppID)
            } else {
                $history.RemoveGroup($Group, $AppID)
            }
            
            Write-Host "✓ Toast cleared: $Tag" -ForegroundColor Green
        }
    } catch {
        Write-Host "✗ Failed to clear toast: $_" -ForegroundColor Red
    }
}

function Get-KPopToastHistory {
    <#
    .SYNOPSIS
        Gets toast history
    #>
    [CmdletBinding()]
    param(
        [int]$Last = 10
    )
    
    $history = @()
    $script:ToastHistory.GetEnumerator() | ForEach-Object { $history += $_ }
    
    return $history | Select-Object -Last $Last | ForEach-Object {
        [PSCustomObject]$_
    }
}

# =====================================================================
# MODULE INITIALIZATION
# =====================================================================

Initialize-ToastEngines
Initialize-DefaultTemplates

Write-Host "KPopToast v5.0 loaded" -ForegroundColor Cyan
$engine = Get-PreferredToastEngine
if ($engine) {
    Write-Host "  Active engine: $engine" -ForegroundColor Gray
} else {
    Write-Host "  No toast engine available!" -ForegroundColor Red
}

# =====================================================================
# EXPORT
# =====================================================================

Export-ModuleMember -Function @(
    'Initialize-ToastEngines',
    'Get-PreferredToastEngine',
    'Register-ToastTemplate',
    'Get-ToastTemplate',
    'Send-KPopToast',
    'Show-KPopNotification',
    'Update-KPopProgressToast',
    'Clear-KPopToast',
    'Get-KPopToastHistory'
)