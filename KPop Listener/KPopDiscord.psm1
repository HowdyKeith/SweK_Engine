# Module: KPopDiscord.psm1
#
# Round 290 — Discord webhook integration for KPopListener.
# Implements the shape teased in RunME_Example.ps1:
#
#   $plugin = New-DiscordIntegrationPlugin -WebhookUrl "..."
#   Register-KPopPlugin -Type Integration -Plugin $plugin
#
# When registered, the plugin mirrors toast notifications to the
# configured Discord channel via a webhook. Posting is fire-and-forget
# (background thread via .NET tasks) so the listener's main loop is
# never blocked by network latency or Discord 429s.
#
# Manual one-shot send is also exposed:
#   Send-DiscordWebhook -WebhookUrl <url> -Title <t> -Message <m> [-Color <hex>]
#
# Plugin registry is a global list `$Global:KPopPlugins.Integration`,
# created on first registration. Other parts of KPopListener can
# walk this list and call $_.OnToast({...}) when they fire a toast,
# without coupling to Discord specifically.

# Default embed color (KPop magenta-ish). Override per-call or per-plugin.
$Script:DefaultEmbedColor = 0xb83dba

function _Discord-PostAsync {
    param(
        [string]$WebhookUrl,
        [hashtable]$Payload
    )
    if ([string]::IsNullOrWhiteSpace($WebhookUrl)) { return }
    # Fire-and-forget POST via Invoke-RestMethod inside a runspace job.
    # Using Start-ThreadJob if available (PS 6+), else Start-Job
    # (slower but compatible). Either way the listener doesn't wait.
    try {
        $json = $Payload | ConvertTo-Json -Depth 6 -Compress
        $sb = {
            param($url, $body)
            try {
                $resp = Invoke-RestMethod -Uri $url `
                    -Method Post `
                    -ContentType "application/json" `
                    -Body $body `
                    -TimeoutSec 10 `
                    -ErrorAction Stop
            } catch {
                # Swallow — the listener's perspective is "we asked, Discord
                # may or may not have shown it". Log via host write so we can
                # see it during dev but don't escalate.
                Write-Host "[KPopDiscord] webhook POST failed: $_" -ForegroundColor DarkYellow
            }
        }
        if (Get-Command -Name Start-ThreadJob -ErrorAction SilentlyContinue) {
            $null = Start-ThreadJob -ScriptBlock $sb -ArgumentList $WebhookUrl, $json
        } else {
            $null = Start-Job -ScriptBlock $sb -ArgumentList $WebhookUrl, $json
        }
    } catch {
        Write-Host "[KPopDiscord] dispatch failed: $_" -ForegroundColor Red
    }
}

function Send-DiscordWebhook {
    param(
        [Parameter(Mandatory=$true)][string]$WebhookUrl,
        [string]$Title = "KPopListener",
        [string]$Message = "",
        [int]$Color = $Script:DefaultEmbedColor,
        [string]$Username = $null,
        [string]$AvatarUrl = $null,
        [hashtable[]]$Fields = $null
    )
    $embed = @{
        title       = $Title
        description = $Message
        color       = $Color
        timestamp   = (Get-Date).ToUniversalTime().ToString("o")
        footer      = @{ text = "KPopListener" }
    }
    if ($Fields -and $Fields.Count -gt 0) {
        # Each field: { name, value, [inline] }
        $embed.fields = @($Fields)
    }
    $payload = @{
        embeds = @($embed)
    }
    if ($Username)   { $payload.username   = $Username }
    if ($AvatarUrl)  { $payload.avatar_url = $AvatarUrl }
    _Discord-PostAsync -WebhookUrl $WebhookUrl -Payload $payload
}

function New-DiscordIntegrationPlugin {
    param(
        [Parameter(Mandatory=$true)][string]$WebhookUrl,
        [string]$Username = "KPopListener",
        [string]$AvatarUrl = $null,
        [int]$DefaultColor = $Script:DefaultEmbedColor,
        # If $true, also mirror plain "Send-Toast" calls (default).
        # Set $false to only mirror via explicit OnToast invocations.
        [bool]$MirrorToasts = $true,
        # Filter: only mirror toasts whose title contains one of these
        # substrings. Empty array = mirror all.
        [string[]]$FilterTitles = @()
    )
    # Validate webhook URL shape — Discord expects
    # https://discord.com/api/webhooks/<id>/<token>
    # or the discordapp.com legacy host.
    if (-not ($WebhookUrl -match '^https://(discord(?:app)?\.com)/api/webhooks/\d+/[\w-]+$')) {
        Write-Host "[KPopDiscord] WARNING: webhook URL doesn't match standard Discord pattern — sends may 404" -ForegroundColor Yellow
    }
    $plugin = [pscustomobject]@{
        Name         = "Discord"
        WebhookUrl   = $WebhookUrl
        Username     = $Username
        AvatarUrl    = $AvatarUrl
        DefaultColor = $DefaultColor
        MirrorToasts = $MirrorToasts
        FilterTitles = @($FilterTitles)
        # Callback the registry invokes
        OnToast = {
            param($toast)
            if (-not $this.MirrorToasts) { return }
            $title = if ($toast.Title)   { [string]$toast.Title }   else { "KPopListener" }
            $msg   = if ($toast.Message) { [string]$toast.Message } else { "" }
            # Filter: skip if title doesn't match any allowed substring
            if ($this.FilterTitles.Count -gt 0) {
                $matched = $false
                foreach ($f in $this.FilterTitles) {
                    if ($title -like "*$f*") { $matched = $true; break }
                }
                if (-not $matched) { return }
            }
            # Color override per-toast if provided (e.g. red for errors)
            $color = if ($toast.Color) { [int]$toast.Color } else { $this.DefaultColor }
            Send-DiscordWebhook `
                -WebhookUrl $this.WebhookUrl `
                -Title $title `
                -Message $msg `
                -Color $color `
                -Username $this.Username `
                -AvatarUrl $this.AvatarUrl
        }
    }
    return $plugin
}

function Register-KPopPlugin {
    param(
        [Parameter(Mandatory=$true)]
        [ValidateSet("Integration", "Filter", "Transform")]
        [string]$Type,
        [Parameter(Mandatory=$true)]$Plugin
    )
    if (-not $Global:KPopPlugins) {
        $Global:KPopPlugins = @{
            Integration = New-Object System.Collections.ArrayList
            Filter      = New-Object System.Collections.ArrayList
            Transform   = New-Object System.Collections.ArrayList
        }
    }
    $null = $Global:KPopPlugins.$Type.Add($Plugin)
    Write-Host "[KPopPlugin] registered $Type plugin: $($Plugin.Name)" -ForegroundColor Cyan
}

function Get-KPopPlugins {
    param([string]$Type = $null)
    if (-not $Global:KPopPlugins) { return @() }
    if ($Type) { return @($Global:KPopPlugins.$Type) }
    return $Global:KPopPlugins
}

# Hook for other modules: when a toast fires, call this. It walks the
# registered Integration plugins and invokes their OnToast callback.
# Safe to call when no plugins are registered — returns immediately.
function Invoke-KPopIntegrations {
    param(
        [Parameter(Mandatory=$true)][hashtable]$Toast
    )
    if (-not $Global:KPopPlugins -or -not $Global:KPopPlugins.Integration) { return }
    foreach ($plugin in $Global:KPopPlugins.Integration) {
        try {
            if ($plugin.OnToast) {
                # The OnToast scriptblock reads $this.WebhookUrl / $this.MirrorToasts
                # etc. Neither previous invoke bound $this, so $this was $null and
                # the very first line ("if (-not $this.MirrorToasts) { return }")
                # made every mirror silently no-op. InvokeWithContext lets us
                # define $this for the scriptblock's run; $Toast binds to its
                # param($toast) positionally.
                $vars = [System.Collections.Generic.List[System.Management.Automation.PSVariable]]::new()
                $vars.Add([System.Management.Automation.PSVariable]::new('this', $plugin))
                $null = $plugin.OnToast.InvokeWithContext($null, $vars, $Toast)
            }
        } catch {
            Write-Host "[KPopPlugin] $($plugin.Name) OnToast failed: $_" -ForegroundColor DarkYellow
        }
    }
}

Export-ModuleMember -Function `
    Send-DiscordWebhook, `
    New-DiscordIntegrationPlugin, `
    Register-KPopPlugin, `
    Get-KPopPlugins, `
    Invoke-KPopIntegrations
