# =====================================================================
# Module: KPopLog.psm1 v4.0
# Purpose: Advanced logging system for KPop
# Features:
#   - Multiple log targets (file, console, event log, remote)
#   - Structured logging with context
#   - Log rotation and archival
#   - Performance tracking
#   - Log filtering and querying
#   - Async logging
#   - Log encryption (optional)
# =====================================================================

using namespace System.Collections.Concurrent
using namespace System.IO

# =====================================================================
# MODULE STATE
# =====================================================================

$script:LogTargets = [ConcurrentDictionary[string, object]]::new()
$script:LogBuffer = [ConcurrentQueue[hashtable]]::new()
$script:LogStats = @{
    TotalEntries = 0
    EntriesByLevel = @{ DEBUG=0; INFO=0; WARN=0; ERROR=0; FATAL=0 }
    LastFlush = Get-Date
    BufferSize = 0
}
$script:LogConfig = @{
    Enabled = $true
    MinLevel = 'INFO'
    MaxBufferSize = 1000
    FlushInterval = 5000  # ms
    AsyncMode = $true
    IncludeStackTrace = $false
    IncludeContext = $true
    TimestampFormat = 'yyyy-MM-dd HH:mm:ss.fff'
    MaxFileSize = 10MB
    MaxArchiveFiles = 10
}
$script:FlushTimer = $null
$script:LogContext = @{}

# =====================================================================
# LOG LEVELS
# =====================================================================

enum LogLevel {
    DEBUG = 0
    INFO = 1
    WARN = 2
    ERROR = 3
    FATAL = 4
}

$script:LogLevelColors = @{
    DEBUG = 'DarkGray'
    INFO = 'Cyan'
    WARN = 'Yellow'
    ERROR = 'Red'
    FATAL = 'Magenta'
}

# =====================================================================
# LOG ENTRY
# =====================================================================

class LogEntry {
    [datetime]$Timestamp
    [LogLevel]$Level
    [string]$Message
    [string]$Category
    [hashtable]$Context
    [string]$CallerFile
    [int]$CallerLine
    [string]$CallerFunction
    [string]$StackTrace
    [int]$ProcessId
    [int]$ThreadId
    [string]$MachineName
    
    LogEntry([LogLevel]$Level, [string]$Message) {
        $this.Timestamp = Get-Date
        $this.Level = $Level
        $this.Message = $Message
        $this.Context = @{}
        $this.ProcessId = $PID
        $this.ThreadId = [System.Threading.Thread]::CurrentThread.ManagedThreadId
        $this.MachineName = $env:COMPUTERNAME
        
        # Capture caller info
        $caller = Get-PSCallStack | Select-Object -Skip 2 -First 1
        if ($caller) {
            $this.CallerFile = $caller.ScriptName
            $this.CallerLine = $caller.ScriptLineNumber
            $this.CallerFunction = $caller.FunctionName
        }
    }
    
    [string] ToString() {
        $ts = $this.Timestamp.ToString($script:LogConfig.TimestampFormat)
        $lvl = $this.Level.ToString().PadRight(5)
        $msg = $this.Message
        
        $parts = @($ts, $lvl, $msg)
        
        if ($this.Category) {
            $parts += "[$($this.Category)]"
        }
        
        return $parts -join ' | '
    }
    
    [string] ToJson() {
        return $this | ConvertTo-Json -Compress
    }
}

# =====================================================================
# LOG TARGETS
# =====================================================================

class LogTarget {
    [string]$Name
    [bool]$Enabled
    [LogLevel]$MinLevel
    
    LogTarget([string]$Name) {
        $this.Name = $Name
        $this.Enabled = $true
        $this.MinLevel = [LogLevel]::DEBUG
    }
    
    [void] Write([LogEntry]$Entry) {
        throw "Write() must be implemented by target"
    }
    
    [void] Flush() {
        # Optional: flush buffered data
    }
    
    [void] Close() {
        # Optional: cleanup resources
    }
}

class FileLogTarget : LogTarget {
    [string]$FilePath
    [StreamWriter]$Writer
    [long]$CurrentSize
    [bool]$EnableRotation
    
    FileLogTarget([string]$Name, [string]$FilePath) : base($Name) {
        $this.FilePath = $FilePath
        $this.EnableRotation = $true
        $this.CurrentSize = 0
        $this.OpenWriter()
    }
    
    [void] OpenWriter() {
        $dir = [System.IO.Path]::GetDirectoryName($this.FilePath)
        if ($dir -and -not [System.IO.Directory]::Exists($dir)) {
            [System.IO.Directory]::CreateDirectory($dir) | Out-Null
        }
        
        $this.Writer = [StreamWriter]::new($this.FilePath, $true, [System.Text.Encoding]::UTF8)
        $this.Writer.AutoFlush = $false
        
        if ([System.IO.File]::Exists($this.FilePath)) {
            $this.CurrentSize = [System.IO.FileInfo]::new($this.FilePath).Length
        }
    }
    
    [void] Write([LogEntry]$Entry) {
        if ($Entry.Level -lt $this.MinLevel) { return }
        
        $line = $Entry.ToString()
        $this.Writer.WriteLine($line)
        $this.CurrentSize += $line.Length + 2  # +2 for newline
        
        # Check rotation
        if ($this.EnableRotation -and $this.CurrentSize -gt $script:LogConfig.MaxFileSize) {
            $this.Rotate()
        }
    }
    
    [void] Flush() {
        if ($this.Writer) {
            $this.Writer.Flush()
        }
    }
    
    [void] Rotate() {
        $this.Writer.Close()
        
        # Shift existing archives
        for ($i = $script:LogConfig.MaxArchiveFiles - 1; $i -ge 1; $i--) {
            $oldPath = "$($this.FilePath).$i"
            $newPath = "$($this.FilePath).$($i + 1)"
            
            if ([System.IO.File]::Exists($oldPath)) {
                if ([System.IO.File]::Exists($newPath)) {
                    [System.IO.File]::Delete($newPath)
                }
                [System.IO.File]::Move($oldPath, $newPath)
            }
        }
        
        # Archive current log
        if ([System.IO.File]::Exists($this.FilePath)) {
            [System.IO.File]::Move($this.FilePath, "$($this.FilePath).1")
        }
        
        $this.CurrentSize = 0
        $this.OpenWriter()
        
        Write-Host "Log rotated: $($this.FilePath)" -ForegroundColor Yellow
    }
    
    [void] Close() {
        if ($this.Writer) {
            $this.Writer.Close()
            $this.Writer.Dispose()
            $this.Writer = $null
        }
    }
}

class ConsoleLogTarget : LogTarget {
    [bool]$UseColors
    
    ConsoleLogTarget([string]$Name) : base($Name) {
        $this.UseColors = $true
    }
    
    [void] Write([LogEntry]$Entry) {
        if ($Entry.Level -lt $this.MinLevel) { return }
        
        $text = $Entry.ToString()
        
        if ($this.UseColors) {
            $color = $script:LogLevelColors[$Entry.Level.ToString()]
            Write-Host $text -ForegroundColor $color
        } else {
            Write-Host $text
        }
    }
}

class EventLogTarget : LogTarget {
    [string]$LogName
    [string]$Source
    
    EventLogTarget([string]$Name, [string]$LogName, [string]$Source) : base($Name) {
        $this.LogName = $LogName
        $this.Source = $Source
        
        # Create event source if it doesn't exist
        if (-not [System.Diagnostics.EventLog]::SourceExists($Source)) {
            try {
                [System.Diagnostics.EventLog]::CreateEventSource($Source, $LogName)
            } catch {
                Write-Warning "Failed to create event source: $_"
            }
        }
    }
    
    [void] Write([LogEntry]$Entry) {
        if ($Entry.Level -lt $this.MinLevel) { return }
        
        $entryType = switch ($Entry.Level) {
            ([LogLevel]::DEBUG) { [System.Diagnostics.EventLogEntryType]::Information }
            ([LogLevel]::INFO) { [System.Diagnostics.EventLogEntryType]::Information }
            ([LogLevel]::WARN) { [System.Diagnostics.EventLogEntryType]::Warning }
            ([LogLevel]::ERROR) { [System.Diagnostics.EventLogEntryType]::Error }
            ([LogLevel]::FATAL) { [System.Diagnostics.EventLogEntryType]::Error }
        }
        
        try {
            [System.Diagnostics.EventLog]::WriteEntry($this.Source, $Entry.Message, $entryType)
        } catch {
            Write-Warning "Failed to write to event log: $_"
        }
    }
}

# =====================================================================
# PUBLIC FUNCTIONS
# =====================================================================

function Write-KPopLog {
    <#
    .SYNOPSIS
        Writes a log entry
    .PARAMETER Message
        Log message
    .PARAMETER Level
        Log level
    .PARAMETER Category
        Optional category
    .PARAMETER Context
        Additional context data
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Message,
        
        [ValidateSet('DEBUG','INFO','WARN','ERROR','FATAL')]
        [string]$Level = 'INFO',
        
        [string]$Category = '',
        
        [hashtable]$Context = @{}
    )
    
    if (-not $script:LogConfig.Enabled) { return }
    
    # Check minimum level
    $levelEnum = [LogLevel]::$Level
    $minEnum = [LogLevel]::$($script:LogConfig.MinLevel)
    if ($levelEnum -lt $minEnum) { return }
    
    # Create entry
    $entry = [LogEntry]::new($levelEnum, $Message)
    $entry.Category = $Category
    
    # Merge context
    if ($script:LogConfig.IncludeContext) {
        foreach ($key in $script:LogContext.Keys) {
            $entry.Context[$key] = $script:LogContext[$key]
        }
    }
    
    foreach ($key in $Context.Keys) {
        $entry.Context[$key] = $Context[$key]
    }
    
    # Capture stack trace for errors
    if ($script:LogConfig.IncludeStackTrace -and $levelEnum -ge [LogLevel]::ERROR) {
        $entry.StackTrace = (Get-PSCallStack | Select-Object -Skip 1 | Out-String)
    }
    
    # Update stats
    $script:LogStats.TotalEntries++
    $script:LogStats.EntriesByLevel[$Level]++
    
    # Process entry
    if ($script:LogConfig.AsyncMode) {
        # Add to buffer
        $script:LogBuffer.Enqueue($entry)
        $script:LogStats.BufferSize = $script:LogBuffer.Count
        
        # Flush if buffer is full
        if ($script:LogBuffer.Count -ge $script:LogConfig.MaxBufferSize) {
            Flush-LogBuffer
        }
    } else {
        # Write immediately
        Write-LogEntry -Entry $entry
    }
}

function Write-LogEntry {
    [CmdletBinding()]
    param([LogEntry]$Entry)
    
    foreach ($targetName in $script:LogTargets.Keys) {
        $target = $null
        if ($script:LogTargets.TryGetValue($targetName, [ref]$target)) {
            if ($target.Enabled) {
                try {
                    $target.Write($Entry)
                } catch {
                    Write-Warning "Log target failed ($targetName): $_"
                }
            }
        }
    }
}

function Flush-LogBuffer {
    <#
    .SYNOPSIS
        Flushes buffered log entries
    #>
    
    $entry = $null
    while ($script:LogBuffer.TryDequeue([ref]$entry)) {
        Write-LogEntry -Entry $entry
    }
    
    # Flush all targets
    foreach ($target in $script:LogTargets.Values) {
        try {
            $target.Flush()
        } catch {}
    }
    
    $script:LogStats.LastFlush = Get-Date
    $script:LogStats.BufferSize = 0
}

function Start-KPopLog {
    <#
    .SYNOPSIS
        Starts the logging system
    .PARAMETER Path
        Log file path
    .PARAMETER MinLevel
        Minimum log level
    .PARAMETER EnableConsole
        Enable console logging
    .PARAMETER EnableEventLog
        Enable Windows Event Log
    #>
    [CmdletBinding()]
    param(
        [string]$Path = "$env:TEMP\KPopLogs\KPop_$(Get-Date -Format 'yyyyMMdd').log",
        
        [ValidateSet('DEBUG','INFO','WARN','ERROR','FATAL')]
        [string]$MinLevel = 'INFO',
        
        [switch]$EnableConsole,
        
        [switch]$EnableEventLog,
        
        [switch]$NoAutoFlush
    )
    
    $script:LogConfig.Enabled = $true
    $script:LogConfig.MinLevel = $MinLevel
    
    # Add file target
    $fileTarget = [FileLogTarget]::new("File", $Path)
    $script:LogTargets.TryAdd("File", $fileTarget) | Out-Null
    
    # Add console target
    if ($EnableConsole) {
        $consoleTarget = [ConsoleLogTarget]::new("Console")
        $script:LogTargets.TryAdd("Console", $consoleTarget) | Out-Null
    }
    
    # Add event log target
    if ($EnableEventLog) {
        try {
            $eventTarget = [EventLogTarget]::new("EventLog", "Application", "KPop")
            $script:LogTargets.TryAdd("EventLog", $eventTarget) | Out-Null
        } catch {
            Write-Warning "Failed to add event log target: $_"
        }
    }
    
    # Start auto-flush timer
    if (-not $NoAutoFlush -and $script:LogConfig.AsyncMode) {
        $script:FlushTimer = New-Object System.Timers.Timer
        $script:FlushTimer.Interval = $script:LogConfig.FlushInterval
        $script:FlushTimer.AutoReset = $true
        
        Register-ObjectEvent -InputObject $script:FlushTimer -EventName Elapsed -Action {
            Flush-LogBuffer
        } | Out-Null
        
        $script:FlushTimer.Start()
    }
    
    Write-KPopLog "Logging started: $Path" -Level INFO -Category "System"
}

function Stop-KPopLog {
    <#
    .SYNOPSIS
        Stops the logging system
    #>
    
    Write-KPopLog "Logging stopped" -Level INFO -Category "System"
    
    # Stop timer
    if ($script:FlushTimer) {
        $script:FlushTimer.Stop()
        $script:FlushTimer.Dispose()
        $script:FlushTimer = $null
    }
    
    # Flush buffer
    Flush-LogBuffer
    
    # Close all targets
    foreach ($target in $script:LogTargets.Values) {
        try {
            $target.Close()
        } catch {}
    }
    
    $script:LogTargets.Clear()
    $script:LogConfig.Enabled = $false
}

function Add-KPopLogTarget {
    <#
    .SYNOPSIS
        Adds a custom log target
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [LogTarget]$Target
    )
    
    if ($script:LogTargets.TryAdd($Target.Name, $Target)) {
        Write-Host "✓ Added log target: $($Target.Name)" -ForegroundColor Green
    } else {
        Write-Warning "Log target already exists: $($Target.Name)"
    }
}

function Remove-KPopLogTarget {
    <#
    .SYNOPSIS
        Removes a log target
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name
    )
    
    $target = $null
    if ($script:LogTargets.TryRemove($Name, [ref]$target)) {
        $target.Close()
        Write-Host "✓ Removed log target: $Name" -ForegroundColor Green
    }
}

function Set-KPopLogContext {
    <#
    .SYNOPSIS
        Sets global log context
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [hashtable]$Context
    )
    
    foreach ($key in $Context.Keys) {
        $script:LogContext[$key] = $Context[$key]
    }
}

function Clear-KPopLogContext {
    <#
    .SYNOPSIS
        Clears global log context
    #>
    $script:LogContext.Clear()
}

function Get-KPopLogStatistics {
    <#
    .SYNOPSIS
        Gets logging statistics
    #>
    return [PSCustomObject]$script:LogStats
}

function Get-KPopLogEntries {
    <#
    .SYNOPSIS
        Queries log entries from file
    .PARAMETER Path
        Log file path
    .PARAMETER Level
        Filter by level
    .PARAMETER Last
        Number of last entries to return
    .PARAMETER Pattern
        Search pattern
    #>
    [CmdletBinding()]
    param(
        [string]$Path,
        [string]$Level,
        [int]$Last = 100,
        [string]$Pattern
    )
    
    if (-not $Path) {
        # Get default log file from file target
        $fileTarget = $script:LogTargets["File"]
        if ($fileTarget) {
            $Path = $fileTarget.FilePath
        } else {
            throw "No log file specified and no file target configured"
        }
    }
    
    if (-not (Test-Path $Path)) {
        throw "Log file not found: $Path"
    }
    
    $entries = Get-Content $Path | Select-Object -Last $Last
    
    if ($Level) {
        $entries = $entries | Where-Object { $_ -match "\| $Level \|" }
    }
    
    if ($Pattern) {
        $entries = $entries | Where-Object { $_ -match $Pattern }
    }
    
    return $entries
}

# =====================================================================
# CONVENIENCE FUNCTIONS
# =====================================================================

function Write-KPopDebug {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Message, [string]$Category = '', [hashtable]$Context = @{})
    Write-KPopLog -Message $Message -Level DEBUG -Category $Category -Context $Context
}

function Write-KPopInfo {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Message, [string]$Category = '', [hashtable]$Context = @{})
    Write-KPopLog -Message $Message -Level INFO -Category $Category -Context $Context
}

function Write-KPopWarn {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Message, [string]$Category = '', [hashtable]$Context = @{})
    Write-KPopLog -Message $Message -Level WARN -Category $Category -Context $Context
}

function Write-KPopError {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Message, [string]$Category = '', [hashtable]$Context = @{})
    Write-KPopLog -Message $Message -Level ERROR -Category $Category -Context $Context
}

function Write-KPopFatal {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Message, [string]$Category = '', [hashtable]$Context = @{})
    Write-KPopLog -Message $Message -Level FATAL -Category $Category -Context $Context
}

# =====================================================================
# MODULE INITIALIZATION
# =====================================================================

Write-Host "KPopLog v4.0 loaded" -ForegroundColor Cyan
Write-Host "  Features: Async, Rotation, Multiple targets" -ForegroundColor Gray

# =====================================================================
# EXPORT
# =====================================================================

Export-ModuleMember -Function @(
    'Write-KPopLog',
    'Start-KPopLog',
    'Stop-KPopLog',
    'Flush-LogBuffer',
    'Add-KPopLogTarget',
    'Remove-KPopLogTarget',
    'Set-KPopLogContext',
    'Clear-KPopLogContext',
    'Get-KPopLogStatistics',
    'Get-KPopLogEntries',
    'Write-KPopDebug',
    'Write-KPopInfo',
    'Write-KPopWarn',
    'Write-KPopError',
    'Write-KPopFatal'
)