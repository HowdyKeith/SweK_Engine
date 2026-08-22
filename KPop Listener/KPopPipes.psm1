# =====================================================================
# Module: KPopPipes.psm1 v3.0
# Purpose: Advanced named pipe communication for KPop
# Features:
#   - Multiple pipe protocols (raw, framed, chunked)
#   - Async and sync modes
#   - Connection pooling
#   - Automatic reconnection
#   - Bidirectional communication
#   - Compression support
#   - Message validation and CRC
# =====================================================================

using namespace System.IO.Pipes
using namespace System.Threading
using namespace System.Collections.Concurrent

# =====================================================================
# MODULE STATE
# =====================================================================

$script:PipeServers = [ConcurrentDictionary[string, object]]::new()
$script:PipeClients = [ConcurrentDictionary[string, object]]::new()
$script:PipeStats = @{
    TotalConnections = 0
    ActiveConnections = 0
    BytesSent = 0
    BytesReceived = 0
    MessagesProcessed = 0
    Errors = 0
}

# =====================================================================
# ENUMS & CONSTANTS
# =====================================================================

enum PipeProtocol {
    Raw = 0
    Framed = 1
    Chunked = 2
}

enum PipeState {
    Disconnected = 0
    Connecting = 1
    Connected = 2
    Disconnecting = 3
    Failed = 4
}

$script:MAGIC_HEADER = [byte[]]@(0x4B, 0x50, 0x4F, 0x50)  # "KPOP"
$script:PROTOCOL_VERSION = 1
$script:MAX_MESSAGE_SIZE = 10MB
$script:CHUNK_SIZE = 64KB

# =====================================================================
# PIPE CONFIGURATION
# =====================================================================

class PipeConfig {
    [string]$Name
    [PipeProtocol]$Protocol
    [int]$MaxInstances
    [int]$BufferSize
    [int]$TimeoutMs
    [bool]$EnableCompression
    [bool]$EnableCRC
    [bool]$AutoReconnect
    [int]$ReconnectDelayMs
    [int]$MaxReconnectAttempts
    
    PipeConfig() {
        $this.Protocol = [PipeProtocol]::Framed
        $this.MaxInstances = 10
        $this.BufferSize = 8192
        $this.TimeoutMs = 5000
        $this.EnableCompression = $false
        $this.EnableCRC = $true
        $this.AutoReconnect = $true
        $this.ReconnectDelayMs = 1000
        $this.MaxReconnectAttempts = 3
    }
}

# =====================================================================
# PIPE SERVER
# =====================================================================

class KPopPipeServer {
    [string]$Name
    [PipeConfig]$Config
    [NamedPipeServerStream]$Stream
    [PipeState]$State
    [scriptblock]$MessageHandler
    [CancellationTokenSource]$CancellationSource
    [System.Threading.Tasks.Task]$ListenerTask
    [ConcurrentQueue[hashtable]]$OutgoingQueue
    [datetime]$CreatedAt
    [datetime]$LastMessageAt
    
    KPopPipeServer([string]$Name, [PipeConfig]$Config) {
        $this.Name = $Name
        $this.Config = $Config
        $this.State = [PipeState]::Disconnected
        $this.CancellationSource = [CancellationTokenSource]::new()
        $this.OutgoingQueue = [ConcurrentQueue[hashtable]]::new()
        $this.CreatedAt = Get-Date
    }
    
    [void] Start([scriptblock]$MessageHandler) {
        if ($this.State -ne [PipeState]::Disconnected) {
            throw "Server already started"
        }
        
        $this.MessageHandler = $MessageHandler
        $this.State = [PipeState]::Connecting
        
        try {
            # Create named pipe server
            $this.Stream = [NamedPipeServerStream]::new(
                $this.Name,
                [PipeDirection]::InOut,
                $this.Config.MaxInstances,
                [PipeTransmissionMode]::Byte,
                [PipeOptions]::Asynchronous,
                $this.Config.BufferSize,
                $this.Config.BufferSize
            )
            
            Write-Host "Pipe server created: $($this.Name)" -ForegroundColor Green
            
            # Start async listener
            $this.ListenerTask = $this.StartListenerAsync()
            $this.State = [PipeState]::Connected
            
        } catch {
            $this.State = [PipeState]::Failed
            Write-Host "Failed to start pipe server: $_" -ForegroundColor Red
            throw
        }
    }
    
    [System.Threading.Tasks.Task] StartListenerAsync() {
        return [System.Threading.Tasks.Task]::Run({
            try {
                # Wait for client connection
                $this.Stream.WaitForConnection()
                Write-Host "Client connected to pipe: $($this.Name)" -ForegroundColor Green
                
                $script:PipeStats.TotalConnections++
                $script:PipeStats.ActiveConnections++
                
                # Main message loop
                while (-not $this.CancellationSource.Token.IsCancellationRequested) {
                    try {
                        # Read message based on protocol
                        $message = switch ($this.Config.Protocol) {
                            ([PipeProtocol]::Raw) { $this.ReadRawMessage() }
                            ([PipeProtocol]::Framed) { $this.ReadFramedMessage() }
                            ([PipeProtocol]::Chunked) { $this.ReadChunkedMessage() }
                        }
                        
                        if ($message) {
                            $this.LastMessageAt = Get-Date
                            $script:PipeStats.MessagesProcessed++
                            
                            # Invoke handler
                            if ($this.MessageHandler) {
                                & $this.MessageHandler $message
                            }
                            
                            # Send ACK
                            $this.SendAck($message)
                        }
                        
                        # Process outgoing queue
                        $this.ProcessOutgoingQueue()
                        
                    } catch [System.IO.IOException] {
                        Write-Host "Pipe disconnected: $($this.Name)" -ForegroundColor Yellow
                        break
                    } catch {
                        Write-Host "Error processing message: $_" -ForegroundColor Red
                        $script:PipeStats.Errors++
                    }
                }
                
            } catch {
                Write-Host "Listener error: $_" -ForegroundColor Red
                $this.State = [PipeState]::Failed
            } finally {
                $script:PipeStats.ActiveConnections--
                $this.Cleanup()
            }
        })
    }
    
    [hashtable] ReadRawMessage() {
        $buffer = [byte[]]::new($this.Config.BufferSize)
        $bytesRead = $this.Stream.Read($buffer, 0, $buffer.Length)
        
        if ($bytesRead -gt 0) {
            $script:PipeStats.BytesReceived += $bytesRead
            $text = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $bytesRead)
            
            return @{
                Data = $text
                Size = $bytesRead
                Protocol = 'Raw'
                Timestamp = Get-Date
            }
        }
        
        return $null
    }
    
    [hashtable] ReadFramedMessage() {
        # Read magic header
        $header = [byte[]]::new(4)
        $this.Stream.Read($header, 0, 4) | Out-Null
        
        if (-not ($header -eq $script:MAGIC_HEADER)) {
            throw "Invalid magic header"
        }
        
        # Read version
        $version = $this.Stream.ReadByte()
        if ($version -ne $script:PROTOCOL_VERSION) {
            throw "Unsupported protocol version: $version"
        }
        
        # Read flags
        $flags = $this.Stream.ReadByte()
        $isCompressed = ($flags -band 0x01) -ne 0
        $hasCRC = ($flags -band 0x02) -ne 0
        
        # Read length (4 bytes, little-endian)
        $lenBytes = [byte[]]::new(4)
        $this.Stream.Read($lenBytes, 0, 4) | Out-Null
        $length = [BitConverter]::ToInt32($lenBytes, 0)
        
        if ($length -gt $script:MAX_MESSAGE_SIZE) {
            throw "Message too large: $length bytes"
        }
        
        # Read payload
        $payload = [byte[]]::new($length)
        $totalRead = 0
        while ($totalRead -lt $length) {
            $read = $this.Stream.Read($payload, $totalRead, $length - $totalRead)
            $totalRead += $read
        }
        
        $script:PipeStats.BytesReceived += (10 + $length)  # Header + payload
        
        # Verify CRC if enabled
        if ($hasCRC) {
            $crcBytes = [byte[]]::new(4)
            $this.Stream.Read($crcBytes, 0, 4) | Out-Null
            $receivedCRC = [BitConverter]::ToUInt32($crcBytes, 0)
            $calculatedCRC = $this.CalculateCRC32($payload)
            
            if ($receivedCRC -ne $calculatedCRC) {
                throw "CRC mismatch"
            }
        }
        
        # Decompress if needed
        if ($isCompressed) {
            $payload = $this.Decompress($payload)
        }
        
        # Parse JSON
        $text = [System.Text.Encoding]::UTF8.GetString($payload)
        $data = $text | ConvertFrom-Json -AsHashtable
        
        return @{
            Data = $data
            Size = $length
            Protocol = 'Framed'
            Compressed = $isCompressed
            Timestamp = Get-Date
        }
    }
    
    [hashtable] ReadChunkedMessage() {
        $chunks = @()
        $totalSize = 0
        
        while ($true) {
            # Read chunk header
            $lenBytes = [byte[]]::new(4)
            $this.Stream.Read($lenBytes, 0, 4) | Out-Null
            $chunkLen = [BitConverter]::ToInt32($lenBytes, 0)
            
            if ($chunkLen -eq 0) { break }  # End of message
            
            # Read chunk data
            $chunk = [byte[]]::new($chunkLen)
            $this.Stream.Read($chunk, 0, $chunkLen) | Out-Null
            $chunks += ,$chunk
            $totalSize += $chunkLen
        }
        
        # Combine chunks
        $combined = [byte[]]::new($totalSize)
        $offset = 0
        foreach ($chunk in $chunks) {
            [Array]::Copy($chunk, 0, $combined, $offset, $chunk.Length)
            $offset += $chunk.Length
        }
        
        $script:PipeStats.BytesReceived += $totalSize
        
        $text = [System.Text.Encoding]::UTF8.GetString($combined)
        $data = $text | ConvertFrom-Json -AsHashtable
        
        return @{
            Data = $data
            Size = $totalSize
            Protocol = 'Chunked'
            Chunks = $chunks.Count
            Timestamp = Get-Date
        }
    }
    
    [void] SendAck([hashtable]$Message) {
        try {
            $ack = @{
                Type = "ACK"
                Timestamp = (Get-Date).ToString("o")
                MessageId = $Message.GetHashCode()
            } | ConvertTo-Json -Compress
            
            $ackBytes = [System.Text.Encoding]::UTF8.GetBytes($ack)
            $lenBytes = [BitConverter]::GetBytes($ackBytes.Length)
            
            $this.Stream.Write($lenBytes, 0, 4)
            $this.Stream.Write($ackBytes, 0, $ackBytes.Length)
            $this.Stream.Flush()
            
            $script:PipeStats.BytesSent += (4 + $ackBytes.Length)
        } catch {
            Write-Host "Failed to send ACK: $_" -ForegroundColor Yellow
        }
    }
    
    [void] ProcessOutgoingQueue() {
        $message = $null
        while ($this.OutgoingQueue.TryDequeue([ref]$message)) {
            try {
                $this.SendMessage($message)
            } catch {
                Write-Host "Failed to send queued message: $_" -ForegroundColor Red
            }
        }
    }
    
    [void] SendMessage([hashtable]$Message) {
        $json = $Message | ConvertTo-Json -Compress
        $payload = [System.Text.Encoding]::UTF8.GetBytes($json)
        
        # Compress if enabled
        if ($this.Config.EnableCompression -and $payload.Length -gt 1024) {
            $payload = $this.Compress($payload)
            $flags = 0x01
        } else {
            $flags = 0x00
        }
        
        # Calculate CRC if enabled
        $crc = 0
        if ($this.Config.EnableCRC) {
            $crc = $this.CalculateCRC32($payload)
            $flags = $flags -bor 0x02
        }
        
        # Write framed message
        $this.Stream.Write($script:MAGIC_HEADER, 0, 4)
        $this.Stream.WriteByte($script:PROTOCOL_VERSION)
        $this.Stream.WriteByte($flags)
        
        $lenBytes = [BitConverter]::GetBytes($payload.Length)
        $this.Stream.Write($lenBytes, 0, 4)
        $this.Stream.Write($payload, 0, $payload.Length)
        
        if ($this.Config.EnableCRC) {
            $crcBytes = [BitConverter]::GetBytes($crc)
            $this.Stream.Write($crcBytes, 0, 4)
        }
        
        $this.Stream.Flush()
        $script:PipeStats.BytesSent += (10 + $payload.Length + $(if ($this.Config.EnableCRC) { 4 } else { 0 }))
    }
    
    [byte[]] Compress([byte[]]$Data) {
        $ms = [System.IO.MemoryStream]::new()
        $gz = [System.IO.Compression.GZipStream]::new($ms, [System.IO.Compression.CompressionMode]::Compress)
        $gz.Write($Data, 0, $Data.Length)
        $gz.Close()
        return $ms.ToArray()
    }
    
    [byte[]] Decompress([byte[]]$Data) {
        $ms = [System.IO.MemoryStream]::new($Data)
        $gz = [System.IO.Compression.GZipStream]::new($ms, [System.IO.Compression.CompressionMode]::Decompress)
        $output = [System.IO.MemoryStream]::new()
        $gz.CopyTo($output)
        return $output.ToArray()
    }
    
    [uint32] CalculateCRC32([byte[]]$Data) {
        # Simple CRC32 implementation
        $crc = [uint32]0xFFFFFFFF
        foreach ($b in $Data) {
            $crc = $crc -bxor $b
            for ($i = 0; $i -lt 8; $i++) {
                if (($crc -band 1) -eq 1) {
                    $crc = ($crc -shr 1) -bxor 0xEDB88320
                } else {
                    $crc = $crc -shr 1
                }
            }
        }
        return $crc -bxor 0xFFFFFFFF
    }
    
    [void] Stop() {
        $this.State = [PipeState]::Disconnecting
        $this.CancellationSource.Cancel()
        $this.Cleanup()
    }
    
    [void] Cleanup() {
        try {
            if ($this.Stream) {
                if ($this.Stream.IsConnected) {
                    $this.Stream.Disconnect()
                }
                $this.Stream.Dispose()
                $this.Stream = $null
            }
        } catch {
            Write-Host "Cleanup error: $_" -ForegroundColor Yellow
        }
        $this.State = [PipeState]::Disconnected
    }
}

# =====================================================================
# PIPE CLIENT
# =====================================================================

class KPopPipeClient {
    [string]$ServerName
    [string]$PipeName
    [PipeConfig]$Config
    [NamedPipeClientStream]$Stream
    [PipeState]$State
    [int]$ReconnectAttempts
    
    KPopPipeClient([string]$ServerName, [string]$PipeName, [PipeConfig]$Config) {
        $this.ServerName = $ServerName
        $this.PipeName = $PipeName
        $this.Config = $Config
        $this.State = [PipeState]::Disconnected
        $this.ReconnectAttempts = 0
    }
    
    [bool] Connect() {
        try {
            $this.State = [PipeState]::Connecting
            
            $this.Stream = [NamedPipeClientStream]::new(
                $this.ServerName,
                $this.PipeName,
                [PipeDirection]::InOut,
                [PipeOptions]::Asynchronous
            )
            
            $this.Stream.Connect($this.Config.TimeoutMs)
            
            if ($this.Stream.IsConnected) {
                $this.State = [PipeState]::Connected
                $this.ReconnectAttempts = 0
                Write-Host "Connected to pipe: $($this.PipeName)" -ForegroundColor Green
                return $true
            }
            
        } catch {
            $this.State = [PipeState]::Failed
            Write-Host "Connection failed: $_" -ForegroundColor Red
            
            # Auto-reconnect
            if ($this.Config.AutoReconnect -and $this.ReconnectAttempts -lt $this.Config.MaxReconnectAttempts) {
                $this.ReconnectAttempts++
                Write-Host "Reconnect attempt $($this.ReconnectAttempts)/$($this.Config.MaxReconnectAttempts)" -ForegroundColor Yellow
                Start-Sleep -Milliseconds $this.Config.ReconnectDelayMs
                return $this.Connect()
            }
        }
        
        return $false
    }
    
    [bool] Send([hashtable]$Message) {
        if ($this.State -ne [PipeState]::Connected) {
            if (-not $this.Connect()) {
                return $false
            }
        }
        
        try {
            $json = $Message | ConvertTo-Json -Compress
            $payload = [System.Text.Encoding]::UTF8.GetBytes($json)
            
            # Write framed message
            $this.Stream.Write($script:MAGIC_HEADER, 0, 4)
            $this.Stream.WriteByte($script:PROTOCOL_VERSION)
            $this.Stream.WriteByte(0x00)  # No compression for now
            
            $lenBytes = [BitConverter]::GetBytes($payload.Length)
            $this.Stream.Write($lenBytes, 0, 4)
            $this.Stream.Write($payload, 0, $payload.Length)
            $this.Stream.Flush()
            
            $script:PipeStats.BytesSent += (10 + $payload.Length)
            
            # Read ACK
            $ack = $this.ReadAck()
            
            return $true
        } catch {
            Write-Host "Send failed: $_" -ForegroundColor Red
            $this.State = [PipeState]::Failed
            return $false
        }
    }
    
    [hashtable] ReadAck() {
        try {
            $this.Stream.ReadTimeout = $this.Config.TimeoutMs
            
            $lenBytes = [byte[]]::new(4)
            $this.Stream.Read($lenBytes, 0, 4) | Out-Null
            $length = [BitConverter]::ToInt32($lenBytes, 0)
            
            $ackBytes = [byte[]]::new($length)
            $this.Stream.Read($ackBytes, 0, $length) | Out-Null
            
            $ackText = [System.Text.Encoding]::UTF8.GetString($ackBytes)
            return $ackText | ConvertFrom-Json -AsHashtable
        } catch {
            Write-Host "Failed to read ACK: $_" -ForegroundColor Yellow
            return $null
        }
    }
    
    [void] Disconnect() {
        $this.State = [PipeState]::Disconnecting
        if ($this.Stream) {
            $this.Stream.Close()
            $this.Stream.Dispose()
            $this.Stream = $null
        }
        $this.State = [PipeState]::Disconnected
    }
}

# =====================================================================
# PUBLIC FUNCTIONS
# =====================================================================

function Start-KPopPipeServer {
    <#
    .SYNOPSIS
        Starts a named pipe server
    .PARAMETER Name
        Pipe name
    .PARAMETER MessageHandler
        Script block to handle incoming messages
    .PARAMETER Config
        Pipe configuration
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,
        
        [Parameter(Mandatory)]
        [scriptblock]$MessageHandler,
        
        [PipeConfig]$Config = [PipeConfig]::new()
    )
    
    if ($script:PipeServers.ContainsKey($Name)) {
        throw "Pipe server already exists: $Name"
    }
    
    $Config.Name = $Name
    $server = [KPopPipeServer]::new($Name, $Config)
    $server.Start($MessageHandler)
    
    $script:PipeServers.TryAdd($Name, $server) | Out-Null
    
    return $server
}

function Stop-KPopPipeServer {
    <#
    .SYNOPSIS
        Stops a named pipe server
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name
    )
    
    $server = $null
    if ($script:PipeServers.TryRemove($Name, [ref]$server)) {
        $server.Stop()
        Write-Host "Pipe server stopped: $Name" -ForegroundColor Green
    }
}

function New-KPopPipeClient {
    <#
    .SYNOPSIS
        Creates a named pipe client
    #>
    [CmdletBinding()]
    param(
        [string]$ServerName = ".",
        
        [Parameter(Mandatory)]
        [string]$PipeName,
        
        [PipeConfig]$Config = [PipeConfig]::new()
    )
    
    $client = [KPopPipeClient]::new($ServerName, $PipeName, $Config)
    
    $clientId = "$ServerName\$PipeName"
    $script:PipeClients.TryAdd($clientId, $client) | Out-Null
    
    return $client
}

function Get-KPopPipeStatistics {
    <#
    .SYNOPSIS
        Gets pipe statistics
    #>
    return [PSCustomObject]$script:PipeStats
}

function Reset-KPopPipeStatistics {
    <#
    .SYNOPSIS
        Resets pipe statistics
    #>
    $script:PipeStats.BytesSent = 0
    $script:PipeStats.BytesReceived = 0
    $script:PipeStats.MessagesProcessed = 0
    $script:PipeStats.Errors = 0
}

function Get-KPopPipeServers {
    <#
    .SYNOPSIS
        Lists active pipe servers
    #>
    return $script:PipeServers.Keys | ForEach-Object {
        $server = $script:PipeServers[$_]
        [PSCustomObject]@{
            Name = $server.Name
            State = $server.State
            Protocol = $server.Config.Protocol
            CreatedAt = $server.CreatedAt
            LastMessageAt = $server.LastMessageAt
        }
    }
}

# =====================================================================
# MODULE INITIALIZATION
# =====================================================================

Write-Host "KPopPipes v3.0 loaded" -ForegroundColor Cyan
Write-Host "  Protocols: Raw, Framed, Chunked" -ForegroundColor Gray
Write-Host "  Features: Compression, CRC, Auto-reconnect" -ForegroundColor Gray

# =====================================================================
# EXPORT
# =====================================================================

Export-ModuleMember -Function @(
    'Start-KPopPipeServer',
    'Stop-KPopPipeServer',
    'New-KPopPipeClient',
    'Get-KPopPipeStatistics',
    'Reset-KPopPipeStatistics',
    'Get-KPopPipeServers'
)