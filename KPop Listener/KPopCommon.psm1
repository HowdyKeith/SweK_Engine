# Module: KPopCommon.psm1

# Shared functions, global constants, and toast utilities

# ---- Global constants / runtime options ----

$global:UseRawStream   = $true   # True = raw byte stream, False = length-prefixed framed messages
$global:RaiseEventMode = $false  # True = async events with Register-ObjectEvent, False = runspace loop

$global:Stats = @{
StartTime    = Get-Date
TotalToasts  = 0
PipeToasts   = 0
FileToasts   = 0
Failures     = 0
LastToastTitle = "None"
LastToastTime = $null
}
$global:MessageQueue = [System.Collections.Concurrent.ConcurrentQueue[object]]::new()
$global:IsRunning = $true

# ---- Utilities ----

function Get-FreePort { param([int]$StartPort=9000)
for ($p=$StartPort; $p -le 65535; $p++) {
try { $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$p); $l.Start(); $l.Stop(); return $p } catch {}
}
return 9000
}

function Write-Log {
param([string]$Message,[ValidateSet("INFO","SUCCESS","WARN","ERROR")][string]$Level="INFO")
$ts=(Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
$line="[$ts][$Level] $Message"
Write-Host $line
}

function Update-ListenerStatus {
param([string]$Status="Running")
$uptime=(Get-Date)-$global:Stats.StartTime
$uptimeStr="{0:D2}:{1:D2}:{2:D2}" -f $uptime.Hours,$uptime.Minutes,$uptime.Seconds
$statusData=@{
StartTime=$global:Stats.StartTime.ToString("o")
Uptime=$uptimeStr
Status=$Status
TotalToasts=$global:Stats.TotalToasts
PipeToasts=$global:Stats.PipeToasts
Failures=$global:Stats.Failures
UseRawStream=$global:UseRawStream
RaiseEventMode=$global:RaiseEventMode
}
try { $statusData | ConvertTo-Json -Depth 3 | Out-File "$env:TEMP\KPopStatus.json" -Encoding UTF8 -Force } catch {}
}

# ---- Toasts ----

function Send-Toast {
param([string]$Title="KPop Pop!",[string]$Message="",[int]$Progress=-1)
$global:Stats.TotalToasts++
Write-Log "Toast: $Title - $Message"
}
