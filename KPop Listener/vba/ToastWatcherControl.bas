Attribute VB_Name = "ToastWatcherControl"
'***************************************************************
' Module: ToastWatcherControl
' Version: 1.3
' Purpose: Control and manage ToastWatcherK.ps1 listener
' Author: Keith Swerling + Claude
' Dependencies: Setup.bas (v1.8), Logs.bas (v1.0.3), ToastSender.bas (v5.4),
'               MsgBoxUniversal.bas (v3.12)
' Features:
'   - Start/Stop listener (delegates to ToastSender)
'   - Send test toasts and commands
'   - Check listener status (uses named pipe check)
'   - Control menu for easy management
' Changes:
'   - v1.3: Integrated with ToastSender and MsgBoxUniversal
'   - v1.3: Uses named pipe check instead of sentinel file
'   - v1.3: Fixed logging calls to use correct Logs.bas API
'   - v1.3: Auto-detect listener path like ToastSender
'   - v1.3: Removed duplicate functionality
'   - v1.2: Added SendToastFromCommandLine
'   - v1.1: Safer execution, better logging
' Updated: 2025-10-29
'***************************************************************
Option Explicit

'=========================
' LISTENER CONTROL (Delegates to ToastSender)
'=========================
Public Sub StartToastListener(Optional ByVal ShowProgress As Boolean = False)
    On Error GoTo ErrorHandler
   
    ' Check if already running
    If IsListenerRunning() Then
        MsgBox "ToastWatcher is already running!", vbInformation, "Already Running"
        Logs.LogInfo "[ToastWatcherControl] Listener already running"
        Exit Sub
    End If
   
    ' Use ToastSender's built-in starter
    ToastSender.StartToastListener
    
    Logs.LogInfo "[ToastWatcherControl] Listener start delegated to ToastSender"
    Exit Sub
   
ErrorHandler:
    MsgBox "Error starting listener: " & Err.Description, vbCritical, "Error"
    Logs.LogError "[ToastWatcherControl] StartToastListener error: " & Err.Description
End Sub

Public Sub StopToastListener()
    On Error GoTo ErrorHandler
   
    If Not IsListenerRunning() Then
        MsgBox "ToastWatcher is not running.", vbInformation, "Not Running"
        Logs.LogInfo "[ToastWatcherControl] Listener not running"
        Exit Sub
    End If
   
    ' Send graceful stop command
    SendListenerCommand "STOP"
   
    ' Wait for graceful stop
    Application.Wait Now + TimeValue("00:00:02")
   
    If Not IsListenerRunning() Then
        MsgBox "ToastWatcher stopped.", vbInformation, "Stopped"
        Logs.LogInfo "[ToastWatcherControl] Listener stopped successfully"
    Else
        MsgBox "Failed to stop ToastWatcher gracefully. Use MsgBoxUniversal.StopToastListener for force stop.", _
               vbExclamation, "Failed"
        Logs.LogWarn "[ToastWatcherControl] Failed to stop listener gracefully"
    End If
    Exit Sub
   
ErrorHandler:
    MsgBox "Error stopping listener: " & Err.Description, vbCritical, "Error"
    Logs.LogError "[ToastWatcherControl] StopToastListener error: " & Err.Description
End Sub

Public Sub RestartToastListener()
    On Error GoTo ErrorHandler
    StopToastListener
    Application.Wait Now + TimeValue("00:00:01")
    StartToastListener
    Logs.LogInfo "[ToastWatcherControl] Listener restarted"
    Exit Sub
   
ErrorHandler:
    Logs.LogError "[ToastWatcherControl] RestartToastListener error: " & Err.Description
End Sub

'=========================
' LISTENER STATUS (Uses MsgBoxUniversal)
'=========================
Public Function IsListenerRunning() As Boolean
    On Error Resume Next
    ' Use MsgBoxUniversal's fast named pipe check
    IsListenerRunning = MsgBoxUniversal.PowershellListenerRunning()
End Function

Public Function GetListenerStatus() As String
    On Error Resume Next
  
    Dim Status As String
    Status = "===== ToastWatcher Status =====" & vbCrLf & vbCrLf
  
    If IsListenerRunning() Then
        Status = Status & "Status: RUNNING (named pipe available)" & vbCrLf
      
        ' Sentinel
        Dim fso As Object, sentinelFile As String, sentinelTime As Date, fileAge As Long
        Set fso = CreateObject("Scripting.FileSystemObject")
        sentinelFile = Setup.GetTempFolder() & "\ToastWatcher_Alive.txt"
        If fso.FileExists(sentinelFile) Then
            sentinelTime = fso.GetFile(sentinelFile).DateLastModified
            fileAge = DateDiff("s", sentinelTime, Now)
            Status = Status & "Last Update: " & fileAge & " seconds ago" & vbCrLf
        End If
      
        ' PID
        Dim pidFile As String, ts As Object, pid As String
        pidFile = Setup.GetTempFolder() & "\ToastWatcher.pid"
        If fso.FileExists(pidFile) Then
            Set ts = fso.OpenTextFile(pidFile, 1)
            pid = ts.ReadLine
            ts.Close
            Status = Status & "Process ID: " & pid & vbCrLf
        End If
      
        ' === LAST 3 RECEIVED TOASTS ===
        Dim logFile As String, logLines As Collection, i As Long
        logFile = Setup.GetTempFolder() & "\ToastRequests.log"
        If fso.FileExists(logFile) Then
            Set logLines = New Collection
            Set ts = fso.OpenTextFile(logFile, 1)
            Do Until ts.AtEndOfStream
                logLines.Add ts.ReadLine
                If logLines.count > 50 Then Exit Do ' limit
            Loop
            ts.Close
            
            Status = Status & vbCrLf & "Last Received Toasts (max 3):" & vbCrLf
            Dim count As Long: count = 0
            For i = logLines.count To 1 Step -1
                If count >= 3 Then Exit For
                Dim line As String
                line = logLines(i)
                If InStr(line, "|") > 0 Then
                    Dim parts() As String
                    parts = Split(line, "|", 6)
                    If UBound(parts) >= 5 Then
                        Status = Status & "  " & Trim(parts(0)) & " [" & Trim(parts(1)) & "] " & _
                                 Trim(parts(2)) & " " & Trim(parts(5)) & vbCrLf
                        count = count + 1
                    End If
                End If
            Next i
            If count = 0 Then Status = Status & "  (none yet)" & vbCrLf
        Else
            Status = Status & vbCrLf & "Last Received Toasts: (log not found)" & vbCrLf
        End If
    Else
        Status = Status & "Status: NOT RUNNING" & vbCrLf
    End If
  
    ' Script info
    Dim scriptPath As String
    scriptPath = "C:\Users\howdy\OneDrive\MsgBox\ToastWatcherK.ps1"
    Status = Status & vbCrLf & "Script Path: " & scriptPath & vbCrLf
    Status = Status & "Script Exists: " & fso.FileExists(scriptPath) & vbCrLf
    Status = Status & "Temp Folder: " & Setup.GetTempFolder() & vbCrLf
    Status = Status & "Pipe Path: \\.\pipe\ExcelToastPipe" & vbCrLf
    Status = Status & "Log File: " & Setup.GetTempFolder() & "\ToastRequests.log"
  
    GetListenerStatus = Status
End Function

Public Sub ShowListenerStatus()
    Debug.Print GetListenerStatus(), vbInformation, "ToastWatcher Status"
End Sub

'=========================
' SEND COMMANDS
'=========================
Private Sub SendListenerCommand(ByVal Command As String)
    On Error GoTo ErrorHandler
   
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
   
    Dim commandFile As String
    commandFile = Setup.GetTempFolder() & "\ListenerCommand.txt"
   
    ' Ensure temp folder exists
    If Not fso.FolderExists(Setup.GetTempFolder()) Then
        fso.CreateFolder Setup.GetTempFolder()
    End If
   
    ' Write command
    Dim ts As Object
    Set ts = fso.CreateTextFile(commandFile, True, True)
    ts.WriteLine Command
    ts.Close
    
    Logs.LogInfo "[ToastWatcherControl] Sent command: " & Command
    Exit Sub
   
ErrorHandler:
    Logs.LogError "[ToastWatcherControl] SendListenerCommand error: " & Err.Description
End Sub

Public Sub SendToastViaListener(ByVal Title As String, _
                                ByVal Message As String, _
                                Optional ByVal ToastType As String = "INFO")
    On Error GoTo ErrorHandler
   
    If Not IsListenerRunning() Then
        MsgBox "ToastWatcher is not running. Start it first.", vbExclamation, "Not Running"
        Logs.LogWarn "[ToastWatcherControl] Cannot send toast - listener not running"
        Exit Sub
    End If
   
    ' Use ToastSender for reliable delivery
    ToastSender.SendToast Title, Message, ToastType, 5, , , "Pipe"
    
    Logs.LogInfo "[ToastWatcherControl] Sent toast via ToastSender: " & Title
    Exit Sub
   
ErrorHandler:
    MsgBox "Error sending toast: " & Err.Description, vbCritical, "Error"
    Logs.LogError "[ToastWatcherControl] SendToastViaListener error: " & Err.Description
End Sub

Public Sub SendToastFromCommandLine(ByVal Title As String, _
                                    ByVal Message As String, _
                                    Optional ByVal ToastType As String = "INFO")
    On Error GoTo ErrorHandler
    
    ' Ensure listener is running
    If Not IsListenerRunning() Then
        StartToastListener False
        Application.Wait Now + TimeValue("00:00:02")
        If Not IsListenerRunning() Then
            Logs.LogError "[ToastWatcherControl] Failed to start listener for command-line toast"
            MsgBox "Failed to start ToastWatcher listener. Check logs.", vbCritical, "Error"
            Exit Sub
        End If
    End If
    
    ' Send toast using ToastSender
    ToastSender.SendToast Title, Message, ToastType, 5, , , "Pipe"
    
    Logs.LogInfo "[ToastWatcherControl] Command-line toast sent: " & Title
    
    ' Keep Excel open briefly to ensure toast is processed
    Application.Wait Now + TimeValue("00:00:01")
    
    Exit Sub

ErrorHandler:
    Logs.LogError "[ToastWatcherControl] SendToastFromCommandLine error: " & Err.Description
    MsgBox "Error sending toast: " & Err.Description, vbCritical, "Error"
End Sub

'=========================
' CONTROL MENU
'=========================
Public Sub ToastWatcherControlMenu()
    On Error GoTo ErrorHandler
   
    Do
        Dim choice As String
        choice = InputBox( _
            "ToastWatcher Control Menu" & vbCrLf & vbCrLf & _
            "1. Start listener" & vbCrLf & _
            "2. Stop listener" & vbCrLf & _
            "3. Restart listener" & vbCrLf & _
            "4. Check status" & vbCrLf & _
            "5. Send test toast" & vbCrLf & _
            "6. Test all toast types" & vbCrLf & _
            "7. Diagnose system" & vbCrLf & _
            "8. Open logs" & vbCrLf & _
            "0. Exit" & vbCrLf & vbCrLf & _
            "Enter choice:", "ToastWatcher Control", "1")
       
        If choice = "" Or choice = "0" Then
            Logs.LogInfo "[ToastWatcherControl] Menu exited by user"
            Exit Sub
        End If
       
        Select Case Val(choice)
            Case 1
                StartToastListener False
                
            Case 2
                StopToastListener
                
            Case 3
                RestartToastListener
                
            Case 4
                ShowListenerStatus
                
            Case 5
                If IsListenerRunning() Then
                    SendToastViaListener "Test Toast", "This is a test from VBA at " & Now, "INFO"
                    MsgBox "Test toast sent!", vbInformation
                Else
                    MsgBox "Listener is not running. Start it first.", vbExclamation
                End If
                
            Case 6
                If IsListenerRunning() Then
                    TestAllToastTypes
                Else
                    MsgBox "Listener is not running. Start it first.", vbExclamation
                End If
                
            Case 7
                MsgBoxUniversal.DiagnoseToastSystem
                
            Case 8
                Logs.OpenLogFile
                
            Case Else
                MsgBox "Invalid selection.", vbExclamation
        End Select
    Loop
   
ErrorHandler:
    Logs.LogError "[ToastWatcherControl] Menu error: " & Err.Description
End Sub

'=========================
' TEST FUNCTIONS
'=========================
Public Sub TestAllToastTypes()
    On Error GoTo ErrorHandler
    
    If Not IsListenerRunning() Then
        MsgBox "Listener is not running. Start it first.", vbExclamation
        Exit Sub
    End If
    
    MsgBox "Testing all toast types..." & vbCrLf & vbCrLf & _
           "You should see 4 toasts appear.", vbInformation, "Test Toasts"
    
    ' Test INFO
    SendToastViaListener "Info Test", "This is an informational toast", "INFO"
    Application.Wait Now + TimeValue("00:00:02")
    
    ' Test SUCCESS
    SendToastViaListener "Success Test", "This is a success toast", "SUCCESS"
    Application.Wait Now + TimeValue("00:00:02")
    
    ' Test WARN
    SendToastViaListener "Warning Test", "This is a warning toast", "WARN"
    Application.Wait Now + TimeValue("00:00:02")
    
    ' Test ERROR
    SendToastViaListener "Error Test", "This is an error toast", "ERROR"
    Application.Wait Now + TimeValue("00:00:02")
    
    MsgBox "Test complete!", vbInformation, "Test Toasts"
    Logs.LogInfo "[ToastWatcherControl] All toast types tested"
    Exit Sub

ErrorHandler:
    Logs.LogError "[ToastWatcherControl] TestAllToastTypes error: " & Err.Description
    MsgBox "Error during test: " & Err.Description, vbCritical
End Sub

Public Sub QuickStartAndTest()
    On Error GoTo ErrorHandler
    
    ' Quick setup for first-time users
    If Not IsListenerRunning() Then
        MsgBox "Starting ToastWatcher for the first time..." & vbCrLf & vbCrLf & _
               "This will take a few seconds.", vbInformation, "Quick Start"
        StartToastListener False
        Application.Wait Now + TimeValue("00:00:03")
    End If
    
    If IsListenerRunning() Then
        SendToastViaListener "Quick Start Complete", "ToastWatcher is now running!", "SUCCESS"
        MsgBox "ToastWatcher is ready!" & vbCrLf & vbCrLf & _
               "You should have seen a toast notification.", vbInformation, "Success"
    Else
        MsgBox "Failed to start ToastWatcher. Please check:" & vbCrLf & vbCrLf & _
               "1. PowerShell script path is correct" & vbCrLf & _
               "2. PowerShell execution policy allows scripts" & vbCrLf & _
               "3. Check logs for errors", vbExclamation, "Failed"
    End If
    
    Exit Sub

ErrorHandler:
    Logs.LogError "[ToastWatcherControl] QuickStartAndTest error: " & Err.Description
    MsgBox "Error: " & Err.Description, vbCritical
End Sub

