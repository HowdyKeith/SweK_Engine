Attribute VB_Name = "MsgBoxPython"

'***************************************************************
' Module: MsgBoxPython
' Version: 1.9
' Purpose: Interface with Python toast notifications via toast_winotify.py
' Author: Keith Swerling + Grok
' Dependencies: clsToastNotification.cls (v11.20), Setup.bas (v1.7), Logs.bas (v1.0.3), MsgBoxUniversal.bas (v3.10)
' Features:
'   - JSON-based toast requests to toast_winotify.py
'   - Named pipe support for faster communication
'   - Supports Icon, Position, YOffset, CallbackMacro, Progress
'   - Requires toast_winotify.py listener running
' Changes:
'   - v1.9: Added SendPythonNotification for named pipe support, aligned with MsgBoxUniversal.bas v3.10
'   - v1.8: Aligned with toast_winotify.py (v1.6), removed ShellExecute, required listener
' Updated: 2025-10-25
'***************************************************************
Option Explicit

Private Const PYTHON_PATH As String = "C:\Users\howdy\OneDrive\Documents\2025\Python\toast_winotify.py"
Private Const PIPE_NAME As String = "\\.\pipe\ExcelToastPipe"

Public Sub ShowToast(ByVal Title As String, ByVal Message As String, _
                     Optional ByVal Level As String = "INFO", _
                     Optional ByVal Duration As Long = 5, _
                     Optional ByVal Position As String = "BR", _
                     Optional ByVal SoundName As String = "", _
                     Optional ByVal ImagePath As String = "", _
                     Optional ByVal Icon As String = "", _
                     Optional ByVal ProgressValue As Long = 0)
    
    On Error GoTo ErrHandler
    
    If Not ToastsEnabled Then
        Logs.DebugLog "[MsgBoxPython] Toasts disabled; skipping toast: " & Title, "WARN"
        Exit Sub
    End If
    
    ' Check for Python listener
    If Not MsgBoxUniversal.PythonListenerRunning Then
        Logs.DebugLog "[MsgBoxPython] Python listener (toast_winotify.py) not running", "ERROR"
        MsgBox "Python toast listener is not running. Start toast_winotify.py and try again.", vbCritical
        Exit Sub
    End If
    
    Dim Toast As clsToastNotification
    Set Toast = New clsToastNotification
    
    With Toast
        .Title = Title
        .Message = Message
        .Level = Level
        .Duration = Duration
        .Position = Position
        .SoundName = SoundName
        .ImagePath = ImagePath
        .Icon = Icon
        .Progress = ProgressValue
        .AlwaysWriteTemp = True
        .YOffset = 0
    End With
    
    Dim json As String
    json = Toast.GetJsonData
    
    Dim tempFile As String
    tempFile = Setup.TEMP_FOLDER & "\ToastRequest.json"
    
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim ts As Object: Set ts = fso.CreateTextFile(tempFile, True, True) ' UTF-8
    ts.Write json
    ts.Close
    
    Logs.DebugLog "[MsgBoxPython] Wrote JSON to: " & tempFile & ", Content: " & json, "INFO"
    Logs.DebugLog "[MsgBoxPython] Triggered Python toast: " & Title & ", Position: " & Position & ", Icon: " & Icon & ", Progress: " & ProgressValue, "INFO"
    Exit Sub

ErrHandler:
    Logs.LogError "[MsgBoxPython] ShowToast error: " & Err.Description
End Sub

Public Function SendPythonNotification(ByVal Title As String, ByVal Message As String, _
                                      ByVal CallbackMacro As String, ByVal durationSec As Long, _
                                      ByVal Position As String, ByVal ImagePath As String, _
                                      ByVal Level As String, ByVal ProgressValue As Long) As Boolean
    On Error GoTo ErrHandler
    
    If Not ToastsEnabled Then
        Logs.DebugLog "[MsgBoxPython] Toasts disabled; skipping notification: " & Title, "WARN"
        SendPythonNotification = False
        Exit Function
    End If
    
    If Not MsgBoxUniversal.PythonListenerRunning Then
        Logs.DebugLog "[MsgBoxPython] Python listener (toast_winotify.py) not running", "ERROR"
        SendPythonNotification = False
        Exit Function
    End If
    
    Dim Toast As clsToastNotification
    Set Toast = New clsToastNotification
    
    With Toast
        .Title = Title
        .Message = Message
        .Level = Level
        .Duration = durationSec
        .Position = Position
        .ImagePath = ImagePath
        .CallbackMacro = CallbackMacro
        .Progress = ProgressValue
        .YOffset = 0
    End With
    
    Dim json As String
    json = Toast.GetJsonData
    
    ' Try sending via named pipe
    Dim pipe As Object
    Set pipe = CreateObject("WScript.Shell")
    Dim cmd As String
    cmd = "powershell -Command ""$pipe = New-Object System.IO.Pipes.NamedPipeClientStream('.', 'ExcelToastPipe', [System.IO.Pipes.PipeAccessRights]::InOut); $pipe.Connect(2000); $writer = New-Object System.IO.StreamWriter($pipe); $writer.Write('" & Replace(json, """", "\""") & "'); $writer.Flush(); $writer.Close(); $pipe.Close()"""
    
    Dim exec As Object: Set exec = pipe.exec(cmd)
    Dim errOutput As String: errOutput = exec.StdErr.ReadAll
    If Len(errOutput) = 0 Then
        SendPythonNotification = True
        Logs.DebugLog "[MsgBoxPython] Sent Python notification via named pipe: " & Title & ", Position: " & Position & ", Progress: " & ProgressValue, "INFO"
        Exit Function
    End If
    
    Logs.DebugLog "[MsgBoxPython] Named pipe failed: " & errOutput, "WARN"
    
    ' Fallback to JSON file
    Dim tempFile As String
    tempFile = Setup.TEMP_FOLDER & "\ToastRequest.json"
    
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim ts As Object: Set ts = fso.CreateTextFile(tempFile, True, True) ' UTF-8
    ts.Write json
    ts.Close
    
    SendPythonNotification = True
    Logs.DebugLog "[MsgBoxPython] Wrote JSON fallback to: " & tempFile & ", Content: " & json, "INFO"
    Exit Function

ErrHandler:
    Logs.LogError "[MsgBoxPython] SendPythonNotification error: " & Err.Description
    SendPythonNotification = False
End Function

Public Function ToastsEnabled() As Boolean
    ToastsEnabled = Setup.EnablePowerShellToast Or Setup.EnableVBSToast
    Logs.DebugLog "[MsgBoxPython] ToastsEnabled checked: " & ToastsEnabled, "INFO"
End Function

Private Function IsProcessRunning(ByVal processName As String, ByVal processPath As String) As Boolean
    On Error GoTo ErrHandler
    Dim wmi As Object
    Set wmi = GetObject("winmgmts://./root/cimv2")
    Dim query As String
    query = "SELECT * FROM Win32_Process WHERE Name = '" & processName & "' AND CommandLine LIKE '%" & processPath & "%'"
    Dim processes As Object
    Set processes = wmi.ExecQuery(query)
    IsProcessRunning = processes.count > 0
    Logs.DebugLog "[MsgBoxPython] Process check: " & processName & " (" & processPath & ") running: " & IsProcessRunning, "INFO"
    Exit Function

ErrHandler:
    Logs.LogError "[MsgBoxPython] IsProcessRunning error: " & Err.Description
    IsProcessRunning = False
End Function




