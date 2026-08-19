Attribute VB_Name = "DiagnosePowerShellListener"
' ToastDiagnostics.bas
' Version: 1.2
' Purpose: Comprehensive diagnostics for ToastWatcherK v5.9 and toast_winrt.py v2.0
' Dependencies: Setup.bas (v1.7), Logs.bas (v1.0.3)
' Changes:
' - v1.2: Added Python listener log check (toast_log_YYYY-MM-DD.log)
'         Updated for ToastWatcherK v5.9 and toast_winrt.py v2.0
'         Enhanced logging to file and Immediate Window
'         Added split MsgBox output to avoid truncation
' - v1.1: Initial version for ToastWatcherK v4.52
' Date: 2025-10-28
Option Explicit

#If VBA7 Then
    Private Declare PtrSafe Sub Sleep Lib "kernel32" (ByVal dwMilliseconds As Long)
#Else
    Private Declare Sub Sleep Lib "kernel32" (ByVal dwMilliseconds As Long)
#End If

'=========================
' MAIN DIAGNOSTIC ROUTINE
'=========================
Public Sub RunFullDiagnostics()
    On Error Resume Next
    Dim report As String
    report = "===== TOAST LISTENER DIAGNOSTICS v1.2 =====" & vbCrLf & vbCrLf
    report = report & "Started: " & Now & vbCrLf & vbCrLf

    ' 1. TEMP FOLDER
    report = report & "1. TEMP FOLDER CHECK" & vbCrLf
    report = report & " Path: " & Setup.GetTempFolder() & vbCrLf
    report = report & TestTempFolder() & vbCrLf & vbCrLf

    ' 2. SENTINEL FILE
    report = report & "2. SENTINEL FILE CHECK" & vbCrLf
    report = report & TestSentinelFile() & vbCrLf & vbCrLf

    ' 3. FILE-BASED TOAST
    report = report & "3. FILE-BASED TOAST TEST (JSON)" & vbCrLf
    report = report & TestFileBasedToast() & vbCrLf & vbCrLf

    ' 4. IS-RUNNING QUERY (file method)
    report = report & "4. IS-RUNNING QUERY TEST (FILE)" & vbCrLf
    report = report & TestIsRunningQueryFile() & vbCrLf & vbCrLf

    ' 5. NAMED PIPE
    report = report & "5. NAMED PIPE CHECK" & vbCrLf
    report = report & TestNamedPipe() & vbCrLf & vbCrLf

    ' 6. RESPONSE FILES
    report = report & "6. RESPONSE FILES CHECK" & vbCrLf
    report = report & TestResponseFiles() & vbCrLf & vbCrLf

    ' 7. LISTENER LOGS
    report = report & "7. LISTENER LOGS CHECK" & vbCrLf
    report = report & TestListenerLogs() & vbCrLf

    report = report & vbCrLf & "Completed: " & Now

    ' Write to file
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    Dim filePath As String
    filePath = Environ$("TEMP") & "\ExcelToasts\Diagnostics_" & Format(Now, "yyyymmdd_hhmmss") & ".txt"
    With fso.CreateTextFile(filePath, True, True)
        .Write report
        .Close
    End With

    ' Output to Immediate Window
    Debug.Print report

    ' Split report for MsgBox
    Dim lines() As String
    lines = Split(report, vbCrLf)
    Dim chunk1 As String, chunk2 As String
    Dim i As Long
    Dim halfway As Long: halfway = UBound(lines) \ 2
    For i = 0 To halfway
        If Len(chunk1) + Len(lines(i)) + 2 < 1000 Then
            chunk1 = chunk1 & lines(i) & vbCrLf
        Else
            Exit For
        End If
    Next i
    For i = i To UBound(lines)
        If Len(chunk2) + Len(lines(i)) + 2 < 1000 Then
            chunk2 = chunk2 & lines(i) & vbCrLf
        Else
            Exit For
        End If
    Next i

    ' Display in two MsgBox calls
    If Len(chunk1) > 0 Then
        MsgBox chunk1, vbInformation, "Toast Listener Diagnostics (Part 1/2)"
    End If
    If Len(chunk2) > 0 Then
        MsgBox chunk2, vbInformation, "Toast Listener Diagnostics (Part 2/2)"
    End If

    ' Show summary
    MsgBox "Diagnostics Complete!" & vbCrLf & _
           "Full results written to: " & filePath & vbCrLf & _
           "Also available in Immediate Window (Ctrl+G)", vbInformation, "Diagnostics Results"

    ' Open file in Notepad
    shell "notepad.exe """ & filePath & """", vbNormalFocus

    ' Log to Logs.bas
    Logs.DebugLog report, "INFO"
End Sub

'=========================
' INDIVIDUAL TEST FUNCTIONS
'=========================
Private Function TestTempFolder() As String
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim tempPath As String: tempPath = Setup.GetTempFolder()
    If fso.FolderExists(tempPath) Then
        TestTempFolder = "? PASS - Folder exists"
    Else
        TestTempFolder = "? FAIL - Folder not found"
    End If
End Function

Private Function TestSentinelFile() As String
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim sentinelPath As String
    sentinelPath = fso.BuildPath(Setup.GetTempFolder(), "ToastWatcher_Alive.txt")
    Dim pythonSentinelPath As String
    pythonSentinelPath = fso.BuildPath(Setup.GetTempFolder(), "ToastPython_Alive.txt")

    Dim result As String
    result = " PowerShell Sentinel: " & sentinelPath & vbCrLf
    result = result & " Python Sentinel: " & pythonSentinelPath & vbCrLf

    ' Check PowerShell sentinel
    If Not fso.FileExists(sentinelPath) Then
        result = result & " PowerShell Status: ? FILE NOT FOUND" & vbCrLf
        result = result & " PowerShell listener may not be running!" & vbCrLf
    Else
        Dim sentinelFile As Object: Set sentinelFile = fso.GetFile(sentinelPath)
        Dim fileAge As Long: fileAge = DateDiff("s", sentinelFile.DateLastModified, Now)
        result = result & " PowerShell Status: ? FILE EXISTS" & vbCrLf
        result = result & " Last Modified: " & sentinelFile.DateLastModified & vbCrLf
        result = result & " Age: " & fileAge & " seconds" & vbCrLf
        If fileAge > 10 Then
            result = result & " ? WARNING: PowerShell sentinel is stale (>10s)" & vbCrLf
        Else
            result = result & " ? PowerShell sentinel is fresh - Listener is alive!" & vbCrLf
        End If
    End If

    ' Check Python sentinel
    If Not fso.FileExists(pythonSentinelPath) Then
        result = result & " Python Status: ? FILE NOT FOUND" & vbCrLf
        result = result & " Python listener may not be running!" & vbCrLf
    Else
        Dim pythonSentinelFile As Object: Set pythonSentinelFile = fso.GetFile(pythonSentinelPath)
        fileAge = DateDiff("s", pythonSentinelFile.DateLastModified, Now)
        result = result & " Python Status: ? FILE EXISTS" & vbCrLf
        result = result & " Last Modified: " & pythonSentinelFile.DateLastModified & vbCrLf
        result = result & " Age: " & fileAge & " seconds" & vbCrLf
        If fileAge > 10 Then
            result = result & " ? WARNING: Python sentinel is stale (>10s)" & vbCrLf
        Else
            result = result & " ? Python sentinel is fresh - Listener is alive!" & vbCrLf
        End If
    End If

    TestSentinelFile = result
End Function

Private Function TestFileBasedToast() As String
    On Error GoTo ErrorHandler
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim requestPath As String
    requestPath = fso.BuildPath(Setup.GetTempFolder(), "ToastRequest.json")

    Dim result As String
    result = " Request Path: " & requestPath & vbCrLf

    ' JSON test toast
    Dim testJson As String
    testJson = "{" & _
               """Title"": ""Test Toast from VBA""," & _
               """Message"": ""File-based test at " & Now & """," & _
               """ToastType"": ""INFO""," & _
               """DurationSec"": 3," & _
               """Position"": ""BR""" & _
               "}"
    Dim ts As Object: Set ts = fso.CreateTextFile(requestPath, True, False)
    ts.Write testJson: ts.Close

    result = result & " ? JSON written successfully" & vbCrLf
    result = result & " Waiting 3 seconds for toast..." & vbCrLf
    Sleep 3000

    If fso.FileExists(requestPath) Then
        result = result & " ? WARNING: Request file still exists!" & vbCrLf
        result = result & " Listener may not be processing files." & vbCrLf
    Else
        result = result & " ? Request file processed (deleted)" & vbCrLf
        result = result & " Did you see the toast notification?" & vbCrLf
    End If

    TestFileBasedToast = result
    Exit Function
ErrorHandler:
    TestFileBasedToast = " ? ERROR: " & Err.Description
End Function

Private Function TestIsRunningQueryFile() As String
    On Error GoTo ErrorHandler
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim requestPath As String: requestPath = fso.BuildPath(Setup.GetTempFolder(), "ToastRequest.json")
    Dim statusPath As String: statusPath = fso.BuildPath(Setup.GetTempFolder(), "ToastListenerStatus.json")

    Dim result As String
    result = " Request: " & requestPath & vbCrLf
    result = result & " Response: " & statusPath & vbCrLf

    ' Clean up old status
    If fso.FileExists(statusPath) Then fso.DeleteFile statusPath, True

    ' Send query JSON
    Dim queryJson As String
    queryJson = "{""IsRunningQuery"": true}"
    Dim ts As Object: Set ts = fso.CreateTextFile(requestPath, True, False)
    ts.Write queryJson: ts.Close
    result = result & " ? Query sent" & vbCrLf

    ' Wait for response
    Dim startTime As Double: startTime = Timer
    Do While (Timer - startTime) < 3
        DoEvents
        If fso.FileExists(statusPath) Then
            Dim responseText As String
            responseText = ReadTextFile(statusPath)
            result = result & " ? Response received: " & responseText & vbCrLf
            Exit Do
        End If
        Sleep 100
    Loop
    If Not fso.FileExists(statusPath) Then
        result = result & " ? WARNING: No response from listener!" & vbCrLf
    End If

    TestIsRunningQueryFile = result
    Exit Function
ErrorHandler:
    TestIsRunningQueryFile = " ? ERROR: " & Err.Description
End Function

Private Function TestNamedPipe() As String
    On Error Resume Next
    Dim pipeName As String
    pipeName = "\\.\pipe\ExcelToastPipe"

    Dim result As String
    result = " Named pipe: " & pipeName & vbCrLf

    ' Attempt to write to pipe
    Dim fileIO As New clsFileIO
    Dim testJson As String
    testJson = "{""Title"":""Pipe Test"",""Message"":""Testing pipe"",""ToastType"":""INFO"",""DurationSec"":3,""Position"":""BR""}"
    Dim pipeResult As String
    pipeResult = fileIO.WritePipe(testJson, pipeName)
    If InStr(pipeResult, "Error") > 0 Then
        result = result & " ? FAIL - Pipe write failed: " & pipeResult & vbCrLf
    Else
        result = result & " ? PASS - Pipe write succeeded" & vbCrLf
        result = result & " Did you see the 'Pipe Test' toast?" & vbCrLf
    End If

    TestNamedPipe = result
End Function

Private Function TestResponseFiles() As String
    On Error Resume Next
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim respPath As String
    respPath = fso.BuildPath(Setup.GetTempFolder(), "ToastResponse.txt")

    Dim result As String
    If fso.FileExists(respPath) Then
        result = " ? PASS - Response file exists: " & respPath & vbCrLf
        result = result & " Content: " & ReadTextFile(respPath) & vbCrLf
    Else
        result = " ? WARNING - Response file not found: " & respPath & vbCrLf
    End If
    TestResponseFiles = result
End Function

Private Function TestListenerLogs() As String
    On Error Resume Next
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim logFiles(1) As String
    logFiles(0) = Environ$("USERPROFILE") & "\OneDrive\Documents\2025\ToastWatcher.log"
    logFiles(1) = Environ$("USERPROFILE") & "\OneDrive\Documents\2025\Python\toast_log_" & Format(Date, "yyyy-mm-dd") & ".log"
    Dim result As String
    Dim i As Long

    For i = 0 To 1
        result = result & " Log File: " & logFiles(i) & vbCrLf
        If fso.FileExists(logFiles(i)) Then
            Dim logFile As Object: Set logFile = fso.GetFile(logFiles(i))
            Dim fileAge As Long: fileAge = DateDiff("s", logFile.DateLastModified, Now)
            result = result & " Status: ? FILE EXISTS" & vbCrLf
            result = result & " Last Modified: " & logFile.DateLastModified & vbCrLf
            result = result & " Age: " & fileAge & " seconds" & vbCrLf
            If fileAge > 60 Then
                result = result & " ? WARNING: Log file is stale (>60s)" & vbCrLf
            Else
                result = result & " ? Log file is fresh" & vbCrLf
            End If
        Else
            result = result & " Status: ? FILE NOT FOUND" & vbCrLf
        End If
        result = result & vbCrLf
    Next i

    TestListenerLogs = result
End Function

' Utility to read text file
Private Function ReadTextFile(filePath As String) As String
    On Error Resume Next
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim ts As Object
    Set ts = fso.OpenTextFile(filePath, 1)
    ReadTextFile = ts.ReadAll
    ts.Close
End Function

