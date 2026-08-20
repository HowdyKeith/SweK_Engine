Attribute VB_Name = "Logs"

'***************************************************************
' Module: Logs
' Version: 1.0.3
' Purpose: Centralized logging for debug, info, warning, error
' Dependencies: Setup.bas (v1.7)
' Changes:
'   - v1.0.3: Updated dependency to Setup.bas v1.7, added log path debug
'   - v1.0.2: Updated dependency to Setup.bas v1.6, improved error handling
'   - v1.0.1: Fixed hardcoded paths - now uses Setup.GetLogFilePath
' Updated: 2025-10-25
'***************************************************************
Option Explicit

' === CONFIGURATION ===
Private Const MAX_LOG_FILE_SIZE As Long = 1048576  ' 1 MB
Private Const ENABLE_FILE_LOGGING As Boolean = True
Private Const ENABLE_CONSOLE_LOGGING As Boolean = True

' === LOG LEVEL FILTERING ===
Public Enum LogLevel
    LOG_DEBUG = 0
    LOG_INFO = 1
    LOG_WARN = 2
    LOG_ERROR = 3
End Enum

Private m_MinLogLevel As LogLevel

'===========================
' Initialize logging system
'===========================
Public Sub InitializeLogging(Optional ByVal MinLevel As LogLevel = LOG_DEBUG)
    On Error GoTo ErrHandler
    m_MinLogLevel = MinLevel
    
    ' Ensure log directory exists
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    Dim logDir As String
    logDir = fso.GetParentFolderName(Setup.GetLogFilePath())
    
    If Not fso.FolderExists(logDir) Then
        fso.CreateFolder logDir
    End If
    
    LogInfo "=== Logging initialized ==="
    LogDebug "Log file path: " & Setup.GetLogFilePath()
    Exit Sub

ErrHandler:
    Debug.Print "[InitializeLogging] Error: " & Err.Description
End Sub

'===========================
' Core logging function
'===========================
Public Sub DebugLog(ByVal msg As String, Optional ByVal Level As String = "INFO")
    On Error GoTo ErrHandler
    
    ' Check log level filtering
    Dim levelValue As LogLevel
    Select Case UCase$(Level)
        Case "DEBUG": levelValue = LOG_DEBUG
        Case "INFO": levelValue = LOG_INFO
        Case "WARN", "WARNING": levelValue = LOG_WARN
        Case "ERROR": levelValue = LOG_ERROR
        Case Else: levelValue = LOG_INFO
    End Select
    
    If levelValue < m_MinLogLevel Then Exit Sub
    
    ' Build log message
    Dim Timestamp As String
    Timestamp = Format(Now, "yyyy-mm-dd hh:nn:ss")
    
    Dim fullMsg As String
    fullMsg = "[" & Timestamp & "] [" & PadRight(UCase$(Level), 5) & "] " & msg
    
    ' Output to console
    If ENABLE_CONSOLE_LOGGING Then
        Debug.Print fullMsg
    End If
    
    ' Output to file
    If ENABLE_FILE_LOGGING Then
        WriteLogToFile fullMsg
    End If
    Exit Sub

ErrHandler:
    Debug.Print "[DebugLog] Error: " & Err.Description
End Sub

'===========================
' Writes to file with rotation
'===========================
Private Sub WriteLogToFile(ByVal logLine As String)
    On Error GoTo ErrHandler
    
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    ' Check if we need to rotate the log
    If fso.FileExists(Setup.GetLogFilePath()) Then
        Dim fileSize As Long
        fileSize = fso.GetFile(Setup.GetLogFilePath()).Size
        
        If fileSize > MAX_LOG_FILE_SIZE Then
            RotateLogFile fso
        End If
    End If
    
    ' Append to log file
    Dim ts As Object
    Set ts = fso.OpenTextFile(Setup.GetLogFilePath(), 8, True, True) ' ForAppending = 8
    ts.WriteLine logLine
    ts.Close
    
    Set ts = Nothing
    Set fso = Nothing
    Exit Sub

ErrHandler:
    Debug.Print "[WriteLogToFile] Error: " & Err.Description
End Sub

'===========================
' Rotate log file
'===========================
Private Sub RotateLogFile(ByRef fso As Object)
    On Error GoTo ErrHandler
    
    ' Generate archive name with timestamp
    Dim archiveName As String
    archiveName = Replace(Setup.GetLogFilePath(), ".txt", "_" & Format(Now, "yyyymmdd_hhnnss") & ".txt")
    
    ' Move current log to archive
    fso.MoveFile Setup.GetLogFilePath(), archiveName
    
    ' Log rotation event to new file
    Dim ts As Object
    Set ts = fso.CreateTextFile(Setup.GetLogFilePath(), True, True)
    ts.WriteLine "[" & Format(Now, "yyyy-mm-dd hh:nn:ss") & "] [INFO ] Log rotated. Previous log: " & fso.GetFileName(archiveName)
    ts.Close
    Set ts = Nothing
    Exit Sub

ErrHandler:
    Debug.Print "[RotateLogFile] Error: " & Err.Description
End Sub

'===========================
' Convenience methods
'===========================
Public Sub LogDebug(ByVal msg As String)
    DebugLog msg, "DEBUG"
End Sub

Public Sub LogInfo(ByVal msg As String)
    DebugLog msg, "INFO"
End Sub

Public Sub LogWarn(ByVal msg As String)
    DebugLog msg, "WARN"
End Sub

Public Sub LogError(ByVal msg As String)
    DebugLog msg, "ERROR"
End Sub

'===========================
' Clear log file
'===========================
Public Sub ClearLogFile()
    On Error GoTo ErrHandler
    
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    If fso.FileExists(Setup.GetLogFilePath()) Then
        fso.DeleteFile Setup.GetLogFilePath()
        LogInfo "Log file cleared"
    End If
    Exit Sub

ErrHandler:
    Debug.Print "[ClearLogFile] Error: " & Err.Description
End Sub

'===========================
' Open log file in Notepad
'===========================
Public Sub OpenLogFile()
    On Error GoTo ErrHandler
    
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    If fso.FileExists(Setup.GetLogFilePath()) Then
        shell "notepad.exe """ & Setup.GetLogFilePath() & """", vbNormalFocus
    Else
        MsgBox "Log file does not exist: " & Setup.GetLogFilePath(), vbExclamation, "Log File"
    End If
    Exit Sub

ErrHandler:
    Debug.Print "[OpenLogFile] Error: " & Err.Description
End Sub

'===========================
' Get log file size
'===========================
Public Function GetLogFileSize() As String
    On Error GoTo ErrHandler
    
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    If fso.FileExists(Setup.GetLogFilePath()) Then
        Dim fileSize As Long
        fileSize = fso.GetFile(Setup.GetLogFilePath()).Size
        
        If fileSize < 1024 Then
            GetLogFileSize = fileSize & " bytes"
        ElseIf fileSize < 1048576 Then
            GetLogFileSize = Format(fileSize / 1024, "#,##0.0") & " KB"
        Else
            GetLogFileSize = Format(fileSize / 1048576, "#,##0.00") & " MB"
        End If
    Else
        GetLogFileSize = "Log file does not exist"
    End If
    Exit Function

ErrHandler:
    Debug.Print "[GetLogFileSize] Error: " & Err.Description
    GetLogFileSize = "Error accessing log file"
End Function

'===========================
' Memory usage logging
'===========================
Public Sub LogMemoryUsage(Optional ByVal msg As String = "")
    On Error GoTo ErrHandler
    
    Dim memoryKB As Double
    memoryKB = GetExcelMemoryUsage()
    
    Dim output As String
    If Len(msg) > 0 Then
        output = msg & " - Memory: " & FormatMemory(memoryKB)
    Else
        output = "Memory usage: " & FormatMemory(memoryKB)
    End If
    
    LogInfo output
    Exit Sub

ErrHandler:
    Debug.Print "[LogMemoryUsage] Error: " & Err.Description
End Sub

'===========================
' Get Excel memory usage
'===========================
Private Function GetExcelMemoryUsage() As Double
    On Error GoTo ErrHandler
    
    Dim objWMI As Object
    Set objWMI = GetObject("winmgmts:\\.\root\cimv2")
    
    Dim colProcesses As Object
    Set colProcesses = objWMI.ExecQuery( _
        "SELECT WorkingSetSize FROM Win32_Process WHERE ProcessId=" & Setup.GetProcessId())
    
    Dim proc As Object
    For Each proc In colProcesses
        GetExcelMemoryUsage = CDbl(proc.WorkingSetSize) / 1024 ' Convert to KB
        Exit For
    Next
    
    Set colProcesses = Nothing
    Set objWMI = Nothing
    Exit Function

ErrHandler:
    Debug.Print "[GetExcelMemoryUsage] Error: " & Err.Description
    GetExcelMemoryUsage = 0
End Function

'===========================
' Format memory display
'===========================
Private Function FormatMemory(ByVal memoryKB As Double) As String
    On Error Resume Next
    If memoryKB < 1024 Then
        FormatMemory = Format(memoryKB, "#,##0") & " KB"
    ElseIf memoryKB < 1048576 Then
        FormatMemory = Format(memoryKB / 1024, "#,##0.0") & " MB"
    Else
        FormatMemory = Format(memoryKB / 1048576, "#,##0.00") & " GB"
    End If
End Function

'===========================
' Utility: Pad string right
'===========================
Private Function PadRight(ByVal Text As String, ByVal Length As Long) As String
    If Len(Text) >= Length Then
        PadRight = Left$(Text, Length)
    Else
        PadRight = Text & Space$(Length - Len(Text))
    End If
End Function

'===========================
' Log statistics
'===========================
Public Function GetLogStatistics() As String
    On Error GoTo ErrHandler
    
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    Dim stats As String
    stats = "=== Log Statistics ===" & vbCrLf
    stats = stats & "Log File: " & Setup.GetLogFilePath() & vbCrLf
    stats = stats & "File Size: " & GetLogFileSize() & vbCrLf
    stats = stats & "Max Size: " & Format(MAX_LOG_FILE_SIZE / 1048576, "#,##0") & " MB" & vbCrLf
    
    If fso.FileExists(Setup.GetLogFilePath()) Then
        stats = stats & "Last Modified: " & fso.GetFile(Setup.GetLogFilePath()).DateLastModified & vbCrLf
        
        ' Count lines
        Dim ts As Object
        Set ts = fso.OpenTextFile(Setup.GetLogFilePath(), 1)
        
        Dim lineCount As Long
        Do Until ts.AtEndOfStream
            ts.ReadLine
            lineCount = lineCount + 1
        Loop
        ts.Close
        
        stats = stats & "Line Count: " & Format(lineCount, "#,##0") & vbCrLf
    Else
        stats = stats & "Status: Log file does not exist" & vbCrLf
    End If
    
    stats = stats & "File Logging: " & IIf(ENABLE_FILE_LOGGING, "Enabled", "Disabled") & vbCrLf
    stats = stats & "Console Logging: " & IIf(ENABLE_CONSOLE_LOGGING, "Enabled", "Disabled")
    
    GetLogStatistics = stats
    Exit Function

ErrHandler:
    Debug.Print "[GetLogStatistics] Error: " & Err.Description
    GetLogStatistics = "Error retrieving log statistics"
End Function

'===========================
' Test logging system
'===========================
Public Sub TestLogging()
    On Error GoTo ErrHandler
    InitializeLogging LOG_DEBUG
    
    LogDebug "This is a debug message"
    LogInfo "This is an info message"
    LogWarn "This is a warning message"
    LogError "This is an error message"
    
    LogMemoryUsage "After test messages"
    
    MsgBox GetLogStatistics(), vbInformation, "Log Statistics"
    
    ' Ask if user wants to open log
    If MsgBox("Open log file?", vbYesNo + vbQuestion) = vbYes Then
        OpenLogFile
    End If
    Exit Sub

ErrHandler:
    Debug.Print "[TestLogging] Error: " & Err.Description
End Sub




