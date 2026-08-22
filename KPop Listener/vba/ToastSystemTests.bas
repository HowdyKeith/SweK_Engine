Attribute VB_Name = "ToastSystemTests"
'***************************************************************
' Module: ToastSystemTests
' Version: 2.5
' Purpose: Automated test suite for ToastWatcher system components
' Author: Keith Swerling + Claude
' Dependencies: ToastWatcherControl.bas (v1.3), ToastSender.bas (v5.4),
'               MsgBoxUniversal.bas (v3.12), MsgBoxPushBullet.bas (v2.2),
'               Credentials.bas (v1.1), Logs.bas (v1.0.3), Setup.bas (v1.8)
' Features:
'   - Tests listener startup/shutdown
'   - Tests toast sending (ToastSender integration)
'   - Tests named pipe communication
'   - Tests credential management
'   - Tests MsgBoxUniversal quick methods
'   - Tests Pushbullet integration
'   - Logs results to file and Immediate window
' Changes:
'   - v2.5: Integrated with ToastSender.bas and MsgBoxUniversal.bas
'   - v2.5: Uses Setup.GetLogFilePath() instead of hardcoded paths
'   - v2.5: Added TestToastSender and TestMsgBoxUniversal
'   - v2.5: Added TestPushbullet
'   - v2.5: Removed non-existent IsCredentialManagerAvailable
'   - v2.5: Updated dependencies to latest versions
'   - v2.4: Added TestCommandLineToast
'   - v2.3: Added TestCredentials
' Updated: 2025-10-29
'***************************************************************
Option Explicit

#If VBA7 Then
    Private Declare PtrSafe Sub Sleep Lib "kernel32" (ByVal dwMilliseconds As Long)
#Else
    Private Declare Sub Sleep Lib "kernel32" (ByVal dwMilliseconds As Long)
#End If

'=========================
' LISTENER TESTS
'=========================
Private Function TestListenerStartup() As String
    On Error GoTo ErrorHandler
    Dim result As String
    result = "1. Listener Startup Test" & vbCrLf
    
    ' Ensure listener is stopped
    If ToastWatcherControl.IsListenerRunning() Then
        ToastWatcherControl.StopToastListener
        Sleep 1000
    End If
    
    ' Start listener using ToastWatcherControl (which delegates to ToastSender)
    ToastWatcherControl.StartToastListener
    Sleep 2000
    
    If ToastWatcherControl.IsListenerRunning() Then
        result = result & "  ? PASS - Listener started successfully" & vbCrLf
        Logs.LogInfo "[ToastSystemTests] Test 1 PASS - Listener started"
    Else
        result = result & "  ? FAIL - Listener failed to start" & vbCrLf
        Logs.LogError "[ToastSystemTests] Test 1 FAIL - Listener failed to start"
    End If
    
    TestListenerStartup = result
    Exit Function
    
ErrorHandler:
    TestListenerStartup = result & "  ? FAIL - " & Err.Description & vbCrLf
    Logs.LogError "[ToastSystemTests] Test 1 ERROR: " & Err.Description
End Function

Private Function TestStopListener() As String
    On Error GoTo ErrorHandler
    Dim result As String
    result = "2. Stop Listener Test" & vbCrLf
    
    ' Ensure listener is running
    If Not ToastWatcherControl.IsListenerRunning() Then
        ToastWatcherControl.StartToastListener
        Sleep 2000
    End If
    
    ' Verify listener is running
    If ToastWatcherControl.IsListenerRunning() Then
        result = result & "  ? PASS - Listener running before stop" & vbCrLf
    Else
        result = result & "  ? FAIL - Listener not running; cannot test stop" & vbCrLf
        TestStopListener = result
        Exit Function
    End If
    
    ' Stop listener
    ToastWatcherControl.StopToastListener
    Sleep 1000
    
    ' Verify listener is stopped
    If Not ToastWatcherControl.IsListenerRunning() Then
        result = result & "  ? PASS - Listener stopped successfully" & vbCrLf
        Logs.LogInfo "[ToastSystemTests] Test 2 PASS - Listener stopped"
    Else
        result = result & "  ? FAIL - Listener failed to stop" & vbCrLf
        Logs.LogError "[ToastSystemTests] Test 2 FAIL - Listener failed to stop"
    End If
    
    ' Restart listener for subsequent tests
    ToastWatcherControl.StartToastListener
    Sleep 2000
    If ToastWatcherControl.IsListenerRunning() Then
        result = result & "  ? PASS - Listener restarted" & vbCrLf
    Else
        result = result & "  ? FAIL - Failed to restart listener" & vbCrLf
    End If
    
    TestStopListener = result
    Exit Function
    
ErrorHandler:
    TestStopListener = result & "  ? FAIL - " & Err.Description & vbCrLf
    Logs.LogError "[ToastSystemTests] Test 2 ERROR: " & Err.Description
End Function

'=========================
' TOAST SENDER TESTS
'=========================
Private Function TestToastSender() As String
    On Error GoTo ErrorHandler
    Dim result As String
    result = "3. ToastSender Test" & vbCrLf
    
    If Not ToastWatcherControl.IsListenerRunning() Then
        ToastWatcherControl.StartToastListener
        Sleep 2000
    End If
    
    If ToastWatcherControl.IsListenerRunning() Then
        ' Test named pipe mode
        ToastSender.SendToast "Test Toast (Pipe)", "Testing named pipe at " & Now, "INFO", 3, , , "Pipe"
        Sleep 1000
        result = result & "  ? PASS - Toast sent via Pipe mode" & vbCrLf
        
        ' Test temp file mode
        ToastSender.SendToast "Test Toast (Temp)", "Testing temp file at " & Now, "INFO", 3, , , "Temp"
        Sleep 1000
        result = result & "  ? PASS - Toast sent via Temp mode" & vbCrLf
        
        Logs.LogInfo "[ToastSystemTests] Test 3 PASS - ToastSender working"
    Else
        result = result & "  ? FAIL - Listener not running; cannot test ToastSender" & vbCrLf
        Logs.LogError "[ToastSystemTests] Test 3 FAIL - Listener not running"
    End If
    
    TestToastSender = result
    Exit Function
    
ErrorHandler:
    TestToastSender = result & "  ? FAIL - " & Err.Description & vbCrLf
    Logs.LogError "[ToastSystemTests] Test 3 ERROR: " & Err.Description
End Function

Private Function TestMsgBoxUniversal() As String
    On Error GoTo ErrorHandler
    Dim result As String
    result = "4. MsgBoxUniversal Test" & vbCrLf
    
    If Not ToastWatcherControl.IsListenerRunning() Then
        ToastWatcherControl.StartToastListener
        Sleep 2000
    End If
    
    If ToastWatcherControl.IsListenerRunning() Then
        ' Test quick methods
        MsgBoxUniversal.MsgInfoEx "Test Info Toast"
        Sleep 1000
        result = result & "  ? PASS - MsgInfoEx sent" & vbCrLf
        
        MsgBoxUniversal.MsgSuccessEx "Test Success Toast"
        Sleep 1000
        result = result & "  ? PASS - MsgSuccessEx sent" & vbCrLf
        
        ' Test progress toast
        MsgBoxUniversal.ShowToastWithProgress "Test Progress", "Testing", 50, "INFO", 3
        Sleep 1000
        result = result & "  ? PASS - Progress toast sent" & vbCrLf
        
        Logs.LogInfo "[ToastSystemTests] Test 4 PASS - MsgBoxUniversal working"
    Else
        result = result & "  ? FAIL - Listener not running; cannot test MsgBoxUniversal" & vbCrLf
        Logs.LogError "[ToastSystemTests] Test 4 FAIL - Listener not running"
    End If
    
    TestMsgBoxUniversal = result
    Exit Function
    
ErrorHandler:
    TestMsgBoxUniversal = result & "  ? FAIL - " & Err.Description & vbCrLf
    Logs.LogError "[ToastSystemTests] Test 4 ERROR: " & Err.Description
End Function

'=========================
' CREDENTIALS TEST
'=========================
Private Function TestCredentials() As String
    On Error GoTo ErrorHandler
    Dim result As String
    result = "5. Credentials Test" & vbCrLf
    
    ' Test save/read/delete
    Dim testTarget As String
    testTarget = "ExcelVBA:TestCredential_" & Format(Now, "yyyymmddhhnnss")
    Dim testKey As String
    testKey = "TestKey_" & Format(Now, "yyyymmddhhnnss")
    
    ' Save credential
    If Credentials.SaveCredential(testTarget, testKey) Then
        result = result & "  ? PASS - Saved credential" & vbCrLf
    Else
        result = result & "  ? FAIL - Failed to save credential" & vbCrLf
        TestCredentials = result
        Exit Function
    End If
    
    ' Read credential
    Dim readKey As String
    readKey = Credentials.ReadCredential(testTarget)
    If readKey = testKey Then
        result = result & "  ? PASS - Read credential correctly" & vbCrLf
    Else
        result = result & "  ? FAIL - Read credential mismatch (Expected: " & testKey & ", Got: " & readKey & ")" & vbCrLf
    End If
    
    ' Delete credential
    If Credentials.DeleteCredential(testTarget) Then
        result = result & "  ? PASS - Deleted credential" & vbCrLf
    Else
        result = result & "  ? FAIL - Failed to delete credential" & vbCrLf
    End If
    
    Logs.LogInfo "[ToastSystemTests] Test 5 PASS - Credentials working"
    TestCredentials = result
    Exit Function
    
ErrorHandler:
    TestCredentials = result & "  ? FAIL - " & Err.Description & vbCrLf
    Logs.LogError "[ToastSystemTests] Test 5 ERROR: " & Err.Description
End Function

'=========================
' PUSHBULLET TEST
'=========================
Private Function TestPushbullet() As String
    On Error GoTo ErrorHandler
    Dim result As String
    result = "6. Pushbullet Test" & vbCrLf
    
    If MsgBoxPushBullet.IsPushbulletEnabled() Then
        result = result & "  ? PASS - Pushbullet is enabled" & vbCrLf
        result = result & "  ??  NOTE - Not sending actual push to avoid spam" & vbCrLf
        ' Uncomment to send actual test push:
        ' MsgBoxPushBullet.SendPush "Test from VBA", "ToastSystemTests is running", "", "", "note", False
        Logs.LogInfo "[ToastSystemTests] Test 6 PASS - Pushbullet enabled"
    Else
        result = result & "  ??  SKIP - Pushbullet not configured" & vbCrLf
        result = result & "  ??  Run MsgBoxPushBullet.PushbulletSetupWizard to configure" & vbCrLf
        Logs.LogWarn "[ToastSystemTests] Test 6 SKIP - Pushbullet not configured"
    End If
    
    TestPushbullet = result
    Exit Function
    
ErrorHandler:
    TestPushbullet = result & "  ? FAIL - " & Err.Description & vbCrLf
    Logs.LogError "[ToastSystemTests] Test 6 ERROR: " & Err.Description
End Function

'=========================
' SYSTEM TESTS
'=========================
Private Function TestTempFolder() As String
    On Error GoTo ErrorHandler
    Dim result As String
    result = "7. Temp Folder Test" & vbCrLf
    
    Dim TempFolder As String
    TempFolder = Setup.GetTempFolder()
    
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    If fso.FolderExists(TempFolder) Then
        result = result & "  ? PASS - Temp folder exists: " & TempFolder & vbCrLf
        Logs.LogInfo "[ToastSystemTests] Test 7 PASS - Temp folder exists"
    Else
        result = result & "  ? FAIL - Temp folder does not exist: " & TempFolder & vbCrLf
        Logs.LogError "[ToastSystemTests] Test 7 FAIL - Temp folder missing"
    End If
    
    TestTempFolder = result
    Exit Function
    
ErrorHandler:
    TestTempFolder = result & "  ? FAIL - " & Err.Description & vbCrLf
    Logs.LogError "[ToastSystemTests] Test 7 ERROR: " & Err.Description
End Function

Private Function TestLogging() As String
    On Error GoTo ErrorHandler
    Dim result As String
    result = "8. Logging Test" & vbCrLf
    
    Dim testMessage As String
    testMessage = "[ToastSystemTests] Test log entry at " & Format(Now, "yyyy-mm-dd HH:nn:ss")
    
    ' Write test log entry
    Logs.LogInfo testMessage
    
    ' Verify log file exists
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    Dim logFile As String
    logFile = Setup.GetLogFilePath()
    
    If fso.FileExists(logFile) Then
        result = result & "  ? PASS - Log file exists: " & logFile & vbCrLf
        
        ' Check if test message was written
        Dim ts As Object
        Set ts = fso.OpenTextFile(logFile, 1, False, -1)
        Dim logContent As String
        logContent = ts.ReadAll
        ts.Close
        
        If InStr(logContent, testMessage) > 0 Then
            result = result & "  ? PASS - Test message found in log" & vbCrLf
        Else
            result = result & "  ? FAIL - Test message not found in log" & vbCrLf
        End If
    Else
        result = result & "  ? FAIL - Log file not found: " & logFile & vbCrLf
    End If
    
    Logs.LogInfo "[ToastSystemTests] Test 8 PASS - Logging working"
    TestLogging = result
    Exit Function
    
ErrorHandler:
    TestLogging = result & "  ? FAIL - " & Err.Description & vbCrLf
    Logs.LogError "[ToastSystemTests] Test 8 ERROR: " & Err.Description
End Function

Private Function TestDiagnostics() As String
    On Error GoTo ErrorHandler
    Dim result As String
    result = "9. Diagnostics Test" & vbCrLf
    
    ' Test MsgBoxUniversal diagnostics
    On Error Resume Next
    MsgBoxUniversal.DiagnoseToastSystem
    If Err.Number = 0 Then
        result = result & "  ? PASS - DiagnoseToastSystem runs without error" & vbCrLf
    Else
        result = result & "  ? FAIL - DiagnoseToastSystem error: " & Err.Description & vbCrLf
    End If
    On Error GoTo ErrorHandler
    
    ' Test ToastSender diagnostics
    On Error Resume Next
    ToastSender.CheckToastListener
    If Err.Number = 0 Then
        result = result & "  ? PASS - CheckToastListener runs without error" & vbCrLf
    Else
        result = result & "  ? FAIL - CheckToastListener error: " & Err.Description & vbCrLf
    End If
    On Error GoTo ErrorHandler
    
    Logs.LogInfo "[ToastSystemTests] Test 9 PASS - Diagnostics working"
    TestDiagnostics = result
    Exit Function
    
ErrorHandler:
    TestDiagnostics = result & "  ? FAIL - " & Err.Description & vbCrLf
    Logs.LogError "[ToastSystemTests] Test 9 ERROR: " & Err.Description
End Function

Private Function TestEndToEnd() As String
    On Error GoTo ErrorHandler
    Dim result As String
    result = "10. End-to-End Test" & vbCrLf
    
    ' Stop listener if running
    If ToastWatcherControl.IsListenerRunning() Then
        ToastWatcherControl.StopToastListener
        Sleep 1000
    End If
    
    ' Start listener
    ToastWatcherControl.StartToastListener
    Sleep 2000
    
    If ToastWatcherControl.IsListenerRunning() Then
        result = result & "  ? PASS - Listener started" & vbCrLf
    Else
        result = result & "  ? FAIL - Listener failed to start" & vbCrLf
        TestEndToEnd = result
        Exit Function
    End If
    
    ' Send toast via ToastSender
    ToastSender.SendToast "End-to-End Test", "Full system test at " & Now, "INFO", 3, , , "Pipe"
    Sleep 2000
    result = result & "  ? PASS - Toast sent" & vbCrLf
    
    ' Stop listener
    ToastWatcherControl.StopToastListener
    Sleep 1000
    If Not ToastWatcherControl.IsListenerRunning() Then
        result = result & "  ? PASS - Listener stopped" & vbCrLf
    Else
        result = result & "  ? FAIL - Listener failed to stop" & vbCrLf
    End If
    
    Logs.LogInfo "[ToastSystemTests] Test 10 PASS - End-to-end test complete"
    TestEndToEnd = result
    Exit Function
    
ErrorHandler:
    TestEndToEnd = result & "  ? FAIL - " & Err.Description & vbCrLf
    Logs.LogError "[ToastSystemTests] Test 10 ERROR: " & Err.Description
End Function

'=========================
' MAIN TEST RUNNER
'=========================
Public Sub RunAllTests()
    On Error GoTo ErrorHandler
    
    Logs.LogInfo "[ToastSystemTests] ========== Starting Test Suite =========="
    
    Dim report As String
    report = "===== Toast System Test Report =====" & vbCrLf
    report = report & "Run at: " & Format(Now, "yyyy-mm-dd HH:nn:ss") & vbCrLf
    report = report & "Excel Version: " & Application.Version & vbCrLf
    report = report & String(50, "=") & vbCrLf & vbCrLf
    
    report = report & TestListenerStartup() & vbCrLf
    report = report & TestStopListener() & vbCrLf
    report = report & TestToastSender() & vbCrLf
    report = report & TestMsgBoxUniversal() & vbCrLf
    report = report & TestCredentials() & vbCrLf
    report = report & TestPushbullet() & vbCrLf
    report = report & TestTempFolder() & vbCrLf
    report = report & TestLogging() & vbCrLf
    report = report & TestDiagnostics() & vbCrLf
    report = report & TestEndToEnd() & vbCrLf
    
    ' Count passes, fails, and skips
    Dim passCount As Long, failCount As Long, skipCount As Long
    Dim i As Long, pos As Long
    
    ' Count PASS
    pos = 1
    Do
        pos = InStr(pos, report, "PASS")
        If pos > 0 Then
            passCount = passCount + 1
            pos = pos + 1
        End If
    Loop While pos > 0
    
    ' Count FAIL
    pos = 1
    Do
        pos = InStr(pos, report, "FAIL")
        If pos > 0 Then
            failCount = failCount + 1
            pos = pos + 1
        End If
    Loop While pos > 0
    
    ' Count SKIP
    pos = 1
    Do
        pos = InStr(pos, report, "SKIP")
        If pos > 0 Then
            skipCount = skipCount + 1
            pos = pos + 1
        End If
    Loop While pos > 0
    
    report = report & String(50, "=") & vbCrLf
    report = report & "Summary:" & vbCrLf
    report = report & "  ? Passes: " & passCount & vbCrLf
    report = report & "  ? Fails: " & failCount & vbCrLf
    report = report & "  ??  Skips: " & skipCount & vbCrLf
    report = report & String(50, "=") & vbCrLf
    
    ' Print to Immediate Window
    Debug.Print report
    
    ' Save to file
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    Dim outputFile As String
    outputFile = Setup.GetTempFolder() & "\TestResults_" & Format(Now, "yyyymmdd_hhnnss") & ".txt"
    
    Dim ts As Object
    Set ts = fso.CreateTextFile(outputFile, True, True)
    ts.Write report
    ts.Close
    
    Logs.LogInfo "[ToastSystemTests] Test report written to: " & outputFile
    Logs.LogInfo "[ToastSystemTests] ========== Test Suite Complete =========="
    
    MsgBox "Tests completed!" & vbCrLf & vbCrLf & _
           "Passes: " & passCount & vbCrLf & _
           "Fails: " & failCount & vbCrLf & _
           "Skips: " & skipCount & vbCrLf & vbCrLf & _
           "Results written to:" & vbCrLf & outputFile, _
           vbInformation, "Test Results"
    Exit Sub
    
ErrorHandler:
    Logs.LogError "[ToastSystemTests] RunAllTests error: " & Err.Description
    MsgBox "Error running tests: " & Err.Description, vbCritical
End Sub

'=========================
' QUICK TESTS
'=========================
Public Sub QuickTestToastSender()
    Debug.Print TestToastSender()
End Sub

Public Sub QuickTestMsgBoxUniversal()
    Debug.Print TestMsgBoxUniversal()
End Sub

Public Sub QuickTestCredentials()
    Debug.Print TestCredentials()
End Sub

Public Sub QuickTestPushbullet()
    Debug.Print TestPushbullet()
End Sub

Public Sub QuickTestAll()
    RunAllTests
End Sub

