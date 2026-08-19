# File: KPopupClipSaver.ps1
<#
.SYNOPSIS
    Monitors clipboard for script code and saves automatically.

.DESCRIPTION
    Watches clipboard for code snippets with filename comments (# File: or # Path:)
    and automatically saves them to the appropriate folder with backup support.
    
    Supported formats: PS1, PSM1, VBA (.bas/.frm), Python (.py), VBS, CSS, JS
    
.NOTES
    Version: 6.9
    Place at the root of your project folder
    Auto-detects latest version folder
#>

#Requires -Version 5.1

[CmdletBinding()]
param(
    # v985 — where versioned files land. Override per machine without editing the
    # script: pass -BaseFolder, or set the VOXEL_CLIPSAVE_DIR env var. Defaults to
    # the original KPopPops OneDrive folder for back-compat.
    [string]$BaseFolder = $(if ($env:VOXEL_CLIPSAVE_DIR) { $env:VOXEL_CLIPSAVE_DIR } else { "C:\Users\howdy\OneDrive\KPopPops" }),
    [int]$CheckIntervalMs = 500
)

# Configuration
$Script:Version = "v6.10"
$ValidExtensions = @("ps1", "psm1", "bas", "frm", "py", "vbs", "css", "js")
# v985 — QUIET by default (only "Saved:" confirmations + errors). Pass -Verbose
# to see the per-check / heartbeat / hash debug stream that used to be always on.
$DebugMode = ($VerbosePreference -eq 'Continue')

# State
$LastClipHash = ""

# Auto-detect latest version folder
function Get-LatestVersionFolder {
    try {
        $versionFolders = Get-ChildItem -Path $BaseFolder -Directory -Filter "v*" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^v(\d+)$' } |
            ForEach-Object {
                [PSCustomObject]@{
                    Name = $_.Name
                    Number = [int]$matches[1]
                    Path = $_.FullName
                }
            } |
            Sort-Object Number -Descending
        
        if ($versionFolders) {
            return $versionFolders[0].Name
        }
        else {
            Write-Warning "No version folders found. Creating v1..."
            return "v1"
        }
    }
    catch {
        Write-Warning "Error detecting version folder: $_. Using v1"
        return "v1"
    }
}

$DefaultVersion = Get-LatestVersionFolder

#region Helper Functions

function Initialize-Folders {
    param(
        [string]$VersionFolder
    )
    
    $modulesPath = Join-Path $VersionFolder "Modules"
    $backupPath = Join-Path $VersionFolder "Backup"
    
    $folders = @($VersionFolder, $modulesPath, $backupPath)
    foreach ($folder in $folders) {
        if (-not (Test-Path $folder)) {
            try {
                New-Item -ItemType Directory -Force -Path $folder | Out-Null
                Write-Verbose "Created folder: $folder"
            }
            catch {
                Write-Error "Failed to create folder ${folder}: $_"
                throw
            }
        }
    }
}

function Get-ClipboardHash {
    param(
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string]$Text
    )
    
    if ([string]::IsNullOrEmpty($Text)) {
        return ""
    }
    
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        $stream = [System.IO.MemoryStream]::new($bytes)
        $hash = (Get-FileHash -InputStream $stream -Algorithm SHA256).Hash
        $stream.Dispose()
        return $hash
    }
    catch {
        Write-Warning "Failed to generate hash: $_"
        return ""
    }
}

function Backup-ExistingFile {
    param(
        [Parameter(Mandatory)]
        [string]$FilePath,
        
        [Parameter(Mandatory)]
        [string]$BackupFolder
    )
    
    if (-not (Test-Path $FilePath)) {
        return
    }
    
    try {
        $fileName = [System.IO.Path]::GetFileName($FilePath)
        $extension = [System.IO.Path]::GetExtension($fileName)
        $nameWithoutExt = [System.IO.Path]::GetFileNameWithoutExtension($fileName)
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $bakName = "${nameWithoutExt}-BAK_${timestamp}${extension}"
        $bakPath = Join-Path $BackupFolder $bakName
        
        Copy-Item -Path $FilePath -Destination $bakPath -Force
        Write-Host "Backup created: $bakName" -ForegroundColor Cyan
    }
    catch {
        Write-Warning "Failed to create backup: $_"
    }
}

function New-FileShortcut {
    param(
        [Parameter(Mandatory)]
        [string]$FilePath
    )
    
    try {
        $folder = Split-Path $FilePath -Parent
        $shortcutPath = "$FilePath.lnk"
        
        $WshShell = New-Object -ComObject WScript.Shell
        $shortcut = $WshShell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $FilePath
        $shortcut.WorkingDirectory = $folder
        $shortcut.Save()
        
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($WshShell) | Out-Null
        
        Write-Host "Shortcut created: $([System.IO.Path]::GetFileName($shortcutPath))" -ForegroundColor Gray
    }
    catch {
        Write-Warning "Failed to create shortcut: $_"
    }
}

function Save-ClipboardFile {
    param(
        [Parameter(Mandatory)]
        [string]$Content
    )
    
    if ($DebugMode) {
        Write-Host "Checking clipboard content (first 100 chars):" -ForegroundColor Magenta
        Write-Host "   $($Content.Substring(0, [Math]::Min(100, $Content.Length)))..." -ForegroundColor DarkGray
    }
    
    # Match filename from comment: # File: or # Path:
    if ($Content -notmatch "(?m)^#\s*(File|Path)\s*:\s*(.+)$") {
        if ($DebugMode) {
            Write-Host "   No '# File:' or '# Path:' comment found" -ForegroundColor DarkRed
        }
        return
    }
    
    $pathValue = $matches[2].Trim()
    
    if ($DebugMode) {
        Write-Host "   Found path: $pathValue" -ForegroundColor DarkGreen
    }
    
    # Parse version and filename
    $versionFolder = $DefaultVersion
    $fileName = $pathValue
    
    if ($pathValue -match '^(v\d+)[/\\](.+)$') {
        # Format: v7\KPopupListener.ps1
        $versionFolder = $matches[1]
        $fileName = $matches[2]
        if ($DebugMode) {
            Write-Host "   Parsed version: $versionFolder, file: $fileName" -ForegroundColor DarkCyan
        }
    }
    elseif ($pathValue -match '^(v\d+)$') {
        # Format: just "v7" - skip, no filename
        if ($DebugMode) {
            Write-Host "   Skipping folder-only path: $pathValue" -ForegroundColor Yellow
        }
        return
    }
    
    $extension = ([System.IO.Path]::GetExtension($fileName) -replace "^\.", "").ToLower()
    
    # Validate extension
    if ($ValidExtensions -notcontains $extension) {
        if ($DebugMode) {
            Write-Host "   Unsupported extension: .$extension" -ForegroundColor DarkRed
        }
        return
    }
    
    if ($DebugMode) {
        Write-Host "   Valid extension: .$extension" -ForegroundColor DarkGreen
    }
    
    # Build paths
    $rootFolder = Join-Path $BaseFolder $versionFolder
    $modulesFolder = Join-Path $rootFolder "Modules"
    $backupFolder = Join-Path $rootFolder "Backup"
    
    # Ensure folders exist
    Initialize-Folders -VersionFolder $rootFolder
    
    # Determine target folder
    $targetFolder = if ($extension -eq "psm1") { $modulesFolder } else { $rootFolder }
    $filePath = Join-Path $targetFolder $fileName
    
    # Create backup if file exists
    Backup-ExistingFile -FilePath $filePath -BackupFolder $backupFolder
    
    # Save new content
    try {
        Set-Content -Path $filePath -Value $Content -Force -Encoding UTF8
        Write-Host "Saved: $versionFolder\$fileName" -ForegroundColor Green
        # v1085 — push a queue entry to the engine bridge so the KPop Listener
        # minitab can review recent captures. Best-effort; silent if bridge is down.
        try {
            $prev = if ($Content.Length -gt 200) { $Content.Substring(0,200) } else { $Content }
            $payload = @{ file = "$versionFolder\$fileName"; size = $Content.Length; hash = (Get-ClipboardHash -Text $Content); preview = $prev; engine = "powershell" } | ConvertTo-Json -Compress
            Invoke-RestMethod -Uri "http://localhost:8787/kpop/clip" -Method Post -Body $payload -ContentType "application/json" -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
        } catch { }
        
        # Create shortcut
        New-FileShortcut -FilePath $filePath

        # Round 101 — bark on capture. After a successful save, send
        # a Speech payload to the KPopListener so the M2 dog avatar
        # voice announces what was saved. Best-effort: fails silent
        # if listener isn't running or pipe is taken.
        Send-BarkNotification -FileName $fileName
    }
    catch {
        Write-Error "Failed to save ${fileName}: $_"
    }
}

# Round 101 — Send-BarkNotification
# Connects to \\.\pipe\KPopListenerPipe (the canonical name the v26
# shim's Start-PipeListener binds) and writes a Speech payload that
# Process-Message routes to Speak-Voiced. M2 voice (dog) speaks the
# save announcement. No-op if the listener isn't there.
function Send-BarkNotification {
    param([string]$FileName)
    if (-not $FileName) { return }
    $PipeName = "KPopListenerPipe"
    $payload = @{
        Voice = "M2"
        Text  = "Saved: $FileName"
    } | ConvertTo-Json -Compress

    try {
        $client = New-Object System.IO.Pipes.NamedPipeClientStream(
            ".", $PipeName,
            [System.IO.Pipes.PipeDirection]::Out,
            [System.IO.Pipes.PipeOptions]::None)
        $client.Connect(800)   # ms timeout — listener absent? bail
        $writer = New-Object System.IO.StreamWriter($client)
        $writer.Write($payload)
        $writer.Flush()
        $writer.Close()
        $client.Close()
        if ($DebugMode) {
            Write-Host "  Bark sent: '$FileName' → M2 voice" -ForegroundColor DarkCyan
        }
    } catch {
        if ($DebugMode) {
            Write-Host "  Bark skipped: listener not reachable" -ForegroundColor DarkGray
        }
    }
}

#endregion

#region Main Loop

function Start-ClipboardMonitor {
    Write-Host ""
    Write-Host "KPopupClipSaver $Version" -ForegroundColor Yellow
    Write-Host "Base: $BaseFolder" -ForegroundColor Gray
    Write-Host "Latest version detected: $DefaultVersion" -ForegroundColor Gray
    Write-Host "Monitoring clipboard for script files..." -ForegroundColor Gray
    Write-Host ""
    Write-Host "Tip: Use '# File: filename.ps1' or '# Path: v7\filename.ps1'" -ForegroundColor DarkGray
    if ($DebugMode) {
        Write-Host "Debug mode enabled - you'll see what's happening" -ForegroundColor Magenta
    }
    Write-Host "Press Ctrl+C to stop" -ForegroundColor DarkGray
    Write-Host ""
    
    $checkCount = 0
    
    while ($true) {
        Start-Sleep -Milliseconds $CheckIntervalMs
        $checkCount++
        
        try {
            # Try to get clipboard as text, handle non-text content gracefully
            $clipboardText = $null
            try {
                $clipboardText = Get-Clipboard -Format Text -ErrorAction Stop
            }
            catch {
                # Clipboard contains non-text (image, file, etc.) - skip silently
                continue
            }
            
            # Convert to string if it's not already
            if ($null -eq $clipboardText) {
                continue
            }
            
            if ($clipboardText -isnot [string]) {
                # Try to convert to string
                $clipboardText = $clipboardText | Out-String
            }
            
            if ([string]::IsNullOrWhiteSpace($clipboardText)) {
                continue
            }
            
            # Calculate hash first to check if content actually changed
            $currentHash = Get-ClipboardHash -Text $clipboardText
            
            # Skip if hash matches (no actual change)
            if ($currentHash -eq $Script:LastClipHash) {
                # Show heartbeat less frequently
                if ($DebugMode -and ($checkCount % 40 -eq 0)) {
                    $hashPreview = if ($Script:LastClipHash) { $Script:LastClipHash.Substring(0, [Math]::Min(8, $Script:LastClipHash.Length)) } else { "(none)" }
                    Write-Host "[Heartbeat] Monitoring... (last hash: $hashPreview)" -ForegroundColor DarkGray
                }
                continue
            }
            
            # New content detected!
            $Script:LastClipHash = $currentHash
            
            if ($DebugMode) {
                Write-Host ""
                Write-Host "CLIPBOARD CHANGE DETECTED!" -ForegroundColor Yellow
                $currHashPreview = $currentHash.Substring(0, [Math]::Min(16, $currentHash.Length))
                Write-Host "New hash: $currHashPreview..." -ForegroundColor Cyan
                Write-Host "Content length: $($clipboardText.Length) chars" -ForegroundColor Cyan
                Write-Host "Processing..." -ForegroundColor Green
            }
            
            # Process clipboard content
            Save-ClipboardFile -Content $clipboardText
        }
        catch {
            if ($DebugMode) {
                Write-Warning "Clipboard check error: $_"
            }
            continue
        }
    }
}

#endregion

# Script Entry Point
try {
    Start-ClipboardMonitor
}
catch {
    Write-Error "Fatal error: $_"
    exit 1
}
finally {
    Write-Host ""
    Write-Host "KPopupClipSaver stopped." -ForegroundColor Yellow
}

