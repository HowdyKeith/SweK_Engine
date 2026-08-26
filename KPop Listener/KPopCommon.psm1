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

# *** v4028 -- THE LOGGER KILLED THE LISTENER, FROM INSIDE THE LISTENER. ***
#
# Keith's rig: "KPopListener FATAL ... The Win32 internal error 'No process is on the other end of the pipe'
# 0xE9 occurred while getting the console mode ... at Write-Log, KPopCommon.psm1: line 35".
#
# Write-Host DOES NOT WRITE TO STDOUT -- it writes to the PowerShell HOST, and asks that host for its console
# mode to do it. When this process has NO CONSOLE ATTACHED (started hidden, detached, from a service, or with
# its output handle closed at the far end) that query fails with a HostException, and because the failure is a
# terminating one inside a function every caller uses, THE LISTENER DIES OF ITS OWN LOGGING. The listener was
# not doing anything wrong when it crashed; it was reporting that it was fine.
#
# A LOGGER THAT CAN KILL THE PROCESS IT LOGS FOR IS WORSE THAN NO LOGGER -- the same shape as this tree's
# "a flag that lies is worse than no flag" (v2579), one level lower down.
#
# So the host write is attempted, and its failure is survivable rather than fatal. THE LINE IS NOT LOST WHEN
# THAT HAPPENS: a hostless run appends to a real file instead, because "the console was unavailable" and "there
# was nothing to say" are different facts and only one of them should look silent. The final catch is empty ON
# PURPOSE -- if even the file write fails there is nowhere left to report it, and throwing from here would
# recreate the exact crash this replaces.
function Write-Log {
param([string]$Message,[ValidateSet("INFO","SUCCESS","WARN","ERROR")][string]$Level="INFO")
$ts=(Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
$line="[$ts][$Level] $Message"
try { Write-Host $line }
catch {
  try {
    $dir = Join-Path $env:TEMP 'KPopLogs'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Add-Content -Path (Join-Path $dir 'KPop_hostless.log') -Value $line -Encoding UTF8
  } catch { }
}
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
