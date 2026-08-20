<#
.SYNOPSIS
    Send-VoxelSpeak.ps1 -- make the running KPopListener speak (offloaded).

.DESCRIPTION
    Drops a {Voice,Text} *Request*.json into %TEMP%\KPopListener\, which the
    listener's file watcher picks up and speaks via Speak-Voiced (async, so the
    caller never blocks). This mirrors exactly what Speak.bas does from Excel/VBA,
    so you can test the voice channel without VBA. Voices: M1 = female, M2 = male.

.EXAMPLE
    .\Send-VoxelSpeak.ps1 "Build finished."
    .\Send-VoxelSpeak.ps1 -Text "woof woof" -Voice M2
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Text,

    [ValidateSet("M1", "M2")]
    [string]$Voice = "M1"
)

$dir = Join-Path $env:TEMP "KPopListener"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

$name = "SpeakRequest_{0}_{1}.json" -f (Get-Date -Format "yyyyMMdd_HHmmss"), (Get-Random -Maximum 99999)
$path = Join-Path $dir $name

@{ Voice = $Voice; Text = $Text } | ConvertTo-Json -Compress |
    Set-Content -Path $path -Encoding UTF8

Write-Host "Queued speech ($Voice): $Text" -ForegroundColor Green
Write-Host "  -> $path  (listener will speak + remove it)" -ForegroundColor DarkGray
