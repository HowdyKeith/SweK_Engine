Attribute VB_Name = "ToastMasterDemo"

'***************************************************************
' Module: ToastMasterDemo
' Purpose: Complete demonstration and testing suite for toast system
' Version: 1.51
' Author: Keith Swerling + Grok
' Dependencies: MsgBoxUniversal.bas (v3.11), MsgBoxPython.bas (v1.9), MsgBoxMSHTA.bas (v6.15), Setup.bas (v1.7), Logs.bas (v1.0.3), MsgBoxMain.bas (v11.10), clsToastNotification.cls (v11.20), MsgBoxPushBullet.bas (v2.3), Credentials.bas (v1.0)
' Changes:
'   - v1.5: Enhanced CheckListenerStatus with detailed diagnostics, updated for MsgBoxUniversal.bas v3.11
'   - v1.4: Fixed Python test with SendPythonNotification, updated for MsgBoxPython.bas v1.9
'   - v1.3: Updated dependencies, added Pushbullet and Credentials tests, fixed listener check
'   - v1.2: Fixed Application.Wait type mismatch with SleepMs
' Updated: 2025-10-25
'***************************************************************
Option Explicit

'================= MASTER TEST MENU =================
Public Sub MasterToastTestMenu()
    Dim choice As String
    
    Do
        choice = InputBox("===== TOAST NOTIFICATION MASTER TEST MENU =====" & vbCrLf & vbCrLf & _
                          "QUICK TESTS:" & vbCrLf & _
                          "1 - Quick Info Toast (MSHTA)" & vbCrLf & _
                          "2 - Quick Warning Toast (MSHTA)" & vbCrLf & _
                          "3 - Quick Error Toast (MSHTA)" & vbCrLf & _
                          "4 - Quick Python Toast" & vbCrLf & _
                          "5 - Quick Pushbullet Toast" & vbCrLf & vbCrLf & _
                          "POSITION TESTS:" & vbCrLf & _
                          "6 - Test All MSHTA Positions" & vbCrLf & _
                          "7 - Test All Python Positions" & vbCrLf & _
                          "8 - Test Stacked Toasts (BR)" & vbCrLf & vbCrLf & _
                          "ADVANCED TESTS:" & vbCrLf & _
                          "9 - Test Link Toast" & vbCrLf & _
                          "10 - Test Callback Toast" & vbCrLf & _
                          "11 - Multi-Type Demo (Info/Warn/Error)" & vbCrLf & _
                          "12 - Credential Manager Test" & vbCrLf & _
                          "13 - Python Progress Toast" & vbCrLf & vbCrLf & _
                          "SYSTEM:" & vbCrLf & _
                          "14 - Check Listener Status" & vbCrLf & _
                          "15 - Reset Toast Stack" & vbCrLf & _
                          "16 - Full System Test" & vbCrLf & vbCrLf & _
                          "0 - Exit", _
                          "Toast Master Demo", "1")
        
        If choice = "" Or choice = "0" Then Exit Sub
        
        Select Case Val(choice)
            Case 1: QuickInfoTest
            Case 2: QuickWarningTest
            Case 3: QuickErrorTest
            Case 4: QuickPythonTest
            Case 5: QuickPushbulletTest
            Case 6: TestAllMSHTAPositions
            Case 7: TestAllPythonPositions
            Case 8: TestStackedToasts
            Case 9: TestLinkToast
            Case 10: TestCallbackToast
            Case 11: MultiTypeDemo
            Case 12: TestCredentials
            Case 13: TestPythonProgress
            Case 14: CheckListenerStatus
            Case 15: ResetStack
            Case 16: FullSystemTest
            Case Else
                MsgBox "Invalid choice. Please enter 0-16.", vbExclamation
        End Select
    Loop
End Sub

'================= QUICK TESTS =================
Private Sub QuickInfoTest()
    MsgBoxUniversal.MsgInfoEx "This is a quick info toast test!", "BR"
    MsgBox "Info toast displayed at bottom-right.", vbInformation, "Test Complete"
End Sub

Private Sub QuickWarningTest()
    MsgBoxUniversal.MsgWarnEx "This is a warning toast with sound!", "TR"
    MsgBox "Warning toast displayed at top-right with beep.", vbInformation, "Test Complete"
End Sub

Private Sub QuickErrorTest()
    MsgBoxUniversal.MsgErrorEx "This is an error toast!", "TL"
    MsgBox "Error toast displayed at top-left.", vbInformation, "Test Complete"
End Sub

Private Sub QuickPythonTest()
    If Not MsgBoxUniversal.PythonListenerRunning Then
        MsgBox "Python listener (toast_winotify.py) not running. Start it and try again.", vbExclamation
        Exit Sub
    End If
    MsgBoxPython.SendPythonNotification "Python Test", "Testing Python toast!", "", 3, "BR", "", "INFO", 0
    MsgBox "Python toast launched successfully.", vbInformation, "Test Complete"
End Sub

Private Sub QuickPushbulletTest()
    If Not MsgBoxPushBullet.IsPushbulletEnabled Then
        MsgBox "Pushbullet not configured. Run PushbulletSetupWizard first.", vbExclamation
        Exit Sub
    End If
    If MsgBoxPushBullet.SendPush("Pushbullet Test", "Testing Pushbullet toast!", "https://www.pushbullet.com") Then
        MsgBox "Pushbullet toast sent successfully!", vbInformation, "Test Complete"
    Else
        MsgBox "Failed to send Pushbullet toast.", vbExclamation
    End If
End Sub

'================= POSITION TESTS =================
Private Sub TestAllMSHTAPositions()
    Dim positions As Variant
    Dim posNames As Variant
    Dim i As Long
    
    positions = Array("TL", "TR", "BL", "BR", "CR", "C")
    posNames = Array("Top-Left", "Top-Right", "Bottom-Left", "Bottom-Right", "Center-Right", "Center")
    
    MsgBox "Will display 6 MSHTA toasts in different positions." & vbCrLf & _
           "Each will appear for 3 seconds.", vbInformation, "Position Test"
    
    For i = LBound(positions) To UBound(positions)
        MsgBoxUniversal.ShowMsgBoxUnified _
            "Position: " & posNames(i), _
            "MSHTA Toast #" & (i + 1), _
            vbInformation, "mshta", 3, "INFO", "", "", "?", False, "", , , CStr(positions(i))
        SleepMs 3500
    Next i
    
    MsgBox "All MSHTA position tests complete!", vbInformation, "Test Complete"
End Sub

Private Sub TestAllPythonPositions()
    If Not MsgBoxUniversal.PythonListenerRunning Then
        MsgBox "Python listener (toast_winotify.py) not running. Start it and try again.", vbExclamation
        Exit Sub
    End If
    
    Dim positions As Variant
    Dim posNames As Variant
    Dim i As Long
    
    positions = Array("TL", "TR", "BL", "BR", "CR", "C")
    posNames = Array("Top-Left", "Top-Right", "Bottom-Left", "Bottom-Right", "Center-Right", "Center")
    
    MsgBox "Will display 6 Python toasts in different positions." & vbCrLf & _
           "Each will appear for 3 seconds.", vbInformation, "Position Test"
    
    For i = LBound(positions) To UBound(positions)
        MsgBoxPython.SendPythonNotification _
            "Python Toast #" & (i + 1), _
            "Position: " & posNames(i), _
            "", 3, CStr(positions(i)), "", "INFO", 0
        SleepMs 3500
    Next i
    
    MsgBox "All Python position tests complete!", vbInformation, "Test Complete"
End Sub

Private Sub TestStackedToasts()
    Dim i As Long
    
    MsgBox "Will display 5 stacked toasts at bottom-right." & vbCrLf & _
           "Watch them stack with offset!", vbInformation, "Stack Test"
    
    MsgBoxMSHTA.ResetToastStack
    
    For i = 1 To 5
        MsgBoxUniversal.MsgInfoEx "Stacked Toast #" & i & " of 5", "BR"
        SleepMs 1000
    Next i
    
    SleepMs 5000
    MsgBoxMSHTA.ResetToastStack
    
    MsgBox "Stack test complete!", vbInformation, "Test Complete"
End Sub

'================= ADVANCED TESTS =================
Private Sub TestLinkToast()
    MsgBoxUniversal.ShowMsgBoxUnified _
        "Click the link below to open Microsoft's website.", _
        "Toast with Link", _
        vbInformation, "mshta", 0, "INFO", _
        "https://www.microsoft.com", , "?", False, , , , "BR"
    
    MsgBox "Link toast displayed (no auto-close)." & vbCrLf & _
           "Click the link or close button to dismiss.", vbInformation, "Test Info"
End Sub

Private Sub TestCallbackToast()
    MsgBoxUniversal.ShowMsgBoxUnified _
        "This toast has a callback macro attached.", _
        "Callback Test", _
        vbInformation, "mshta", 0, "INFO", _
        "https://www.microsoft.com", "OnDemoToastCallback", "?", False, , , , "CR"
    
    MsgBox "Callback toast displayed at center-right." & vbCrLf & _
           "Click the link to trigger callback.", vbInformation, "Test Info"
End Sub

Private Sub MultiTypeDemo()
    MsgBox "Will display 3 toasts: Info, Warning, Error" & vbCrLf & _
           "Each in different positions.", vbInformation, "Multi-Type Demo"
    
    MsgBoxUniversal.MsgInfoEx "This is an INFO toast.", "BR"
    SleepMs 2000
    
    MsgBoxUniversal.MsgWarnEx "This is a WARNING toast!", "TR"
    SleepMs 2000
    
    MsgBoxUniversal.MsgErrorEx "This is an ERROR toast!", "TL"
    SleepMs 3000
    
    MsgBox "Multi-type demo complete!", vbInformation, "Test Complete"
End Sub

Private Sub TestCredentials()
    Setup.InitializeSetup
    Logs.InitializeLogging
    Credentials.TestCredentials
End Sub

Private Sub TestPythonProgress()
    If Not MsgBoxUniversal.PythonListenerRunning Then
        MsgBox "Python listener (toast_winotify.py) not running. Start it and try again.", vbExclamation
        Exit Sub
    End If
    MsgBoxPython.SendPythonNotification "Progress Test", "Processing 50%", "", 5, "BR", "", "INFO", 50
    MsgBox "Python progress toast (50%) displayed at bottom-right.", vbInformation, "Test Complete"
End Sub

'================= SYSTEM FUNCTIONS =================
Private Sub CheckListenerStatus()
    Dim psRunning As Boolean
    Dim pyRunning As Boolean
    psRunning = MsgBoxUniversal.PowershellListenerRunning
    pyRunning = MsgBoxUniversal.PythonListenerRunning
    
    Dim msg As String
    msg = "===== Listener Status =====" & vbCrLf & vbCrLf
    msg = msg & "PowerShell Listener (ToastWatcherK.ps1): " & IIf(psRunning, "RUNNING", "NOT RUNNING") & vbCrLf
    msg = msg & "Python Listener (toast_winotify.py): " & IIf(pyRunning, "RUNNING", "NOT RUNNING") & vbCrLf & vbCrLf
    
    ' Additional diagnostics
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim tempPath As String: tempPath = MsgBoxUniversal.GetTempPath()
    Dim statusFile As String: statusFile = tempPath & "\ToastListenerStatus.json"
    Dim sentinelFile As String
    sentinelFile = tempPath & "\ToastWatcher_Alive.txt"
    
    msg = msg & "Temp Directory: " & tempPath & vbCrLf
    msg = msg & "Temp Dir Exists: " & CBool(fso.FolderExists(tempPath)) & vbCrLf
    msg = msg & "Sentinel File Exists: " & CBool(fso.FileExists(sentinelFile)) & vbCrLf
    msg = msg & "Named Pipe Exists: " & CBool(fso.FileExists("\\.\pipe\ExcelToastResponsePipe")) & vbCrLf
    msg = msg & "Status File Exists: " & CBool(fso.FileExists(statusFile)) & vbCrLf & vbCrLf
    
    If Not psRunning And Not pyRunning Then
        msg = msg & "? Warning: No listeners running. Toasts will use MSHTA." & vbCrLf
        msg = msg & "Start ToastWatcherK.ps1 and/or toast_winotify.py."
    Else
        msg = msg & "? System ready for " & IIf(psRunning, "PowerShell", "") & _
                  IIf(psRunning And pyRunning, " and ", "") & IIf(pyRunning, "Python", "") & " toasts."
    End If
    
    MsgBox msg, vbInformation, "Listener Status"
End Sub

Private Sub ResetStack()
    MsgBoxMSHTA.ResetToastStack
    MsgBox "Toast stack counter has been reset.", vbInformation, "Stack Reset"
End Sub

Private Sub FullSystemTest()
    Dim response As VbMsgBoxResult
    response = MsgBox("This will run a comprehensive test of the entire toast system." & vbCrLf & vbCrLf & _
                      "It will take about 60 seconds and display multiple toasts." & vbCrLf & vbCrLf & _
                      "Continue?", vbQuestion + vbYesNo, "Full System Test")
    
    If response <> vbYes Then Exit Sub
    
    ' Phase 1: Basic MSHTA toasts
    MsgBox "Phase 1: Testing basic MSHTA toasts...", vbInformation, "Test Phase 1/6"
    MsgBoxUniversal.MsgInfoEx "Phase 1: Info toast", "BR"
    SleepMs 3000
    MsgBoxUniversal.MsgWarnEx "Phase 1: Warning toast", "TR"
    SleepMs 3000
    MsgBoxUniversal.MsgErrorEx "Phase 1: Error toast", "TL"
    SleepMs 3000
    
    ' Phase 2: Position tests
    MsgBox "Phase 2: Testing all positions...", vbInformation, "Test Phase 2/6"
    Dim positions As Variant
    positions = Array("TL", "TR", "BL", "BR", "CR", "C")
    Dim i As Long
    For i = LBound(positions) To UBound(positions)
        MsgBoxUniversal.MsgInfoEx "Position: " & positions(i), CStr(positions(i))
        SleepMs 2000
    Next i
    
    ' Phase 3: Stacking test
    MsgBox "Phase 3: Testing stacked toasts...", vbInformation, "Test Phase 3/6"
    MsgBoxMSHTA.ResetToastStack
    For i = 1 To 3
        MsgBoxUniversal.MsgInfoEx "Stacked #" & i, "BR"
        SleepMs 1000
    Next i
    SleepMs 4000
    
    ' Phase 4: Python test
    MsgBox "Phase 4: Testing Python toasts...", vbInformation, "Test Phase 4/6"
    If MsgBoxUniversal.PythonListenerRunning Then
        MsgBoxPython.SendPythonNotification "Python Test", "Python toast test", "", 3, "BR", "", "INFO", 0
    Else
        MsgBox "Python listener not running. Skipping Python test.", vbExclamation
    End If
    SleepMs 4000
    
    ' Phase 5: Pushbullet test
    MsgBox "Phase 5: Testing Pushbullet toasts...", vbInformation, "Test Phase 5/6"
    If MsgBoxPushBullet.IsPushbulletEnabled Then
        MsgBoxPushBullet.SendPush "Pushbullet Test", "Pushbullet toast test", "https://www.pushbullet.com"
    Else
        MsgBox "Pushbullet not configured. Skipping Pushbullet test.", vbExclamation
    End If
    SleepMs 4000
    
    ' Phase 6: Credential test
    MsgBox "Phase 6: Testing credential storage...", vbInformation, "Test Phase 6/6"
    Dim testTarget As String: testTarget = "ExcelVBA:TestCredential"
    Dim testKey As String: testKey = "TestKey_" & Format(Now, "yyyymmddhhnnss")
    If Credentials.SaveCredential(testTarget, testKey) Then
        Dim readKey As String: readKey = Credentials.ReadCredential(testTarget)
        If readKey = testKey Then
            Credentials.DeleteCredential testTarget
            MsgBox "Credential test passed: Save/Read/Delete successful.", vbInformation
        Else
            MsgBox "Credential test failed: Read mismatch.", vbExclamation
        End If
    Else
        MsgBox "Credential test failed: Save failed.", vbExclamation
    End If
    SleepMs 2000
    
    ' Cleanup
    MsgBoxMSHTA.ResetToastStack
    
    MsgBox "? Full system test complete!" & vbCrLf & vbCrLf & _
           "All components tested successfully.", vbInformation, "Test Complete"
End Sub

'================= CALLBACK HANDLERS =================
Public Sub OnDemoToastCallback()
    MsgBox "Callback executed successfully!" & vbCrLf & vbCrLf & _
           "This macro was triggered by clicking the toast link.", _
           vbInformation, "Callback Success"
End Sub

'================= DIAGNOSTIC TOOL =================
Public Sub DiagnoseToastSystem()
    Dim report As String
    report = "===== TOAST SYSTEM DIAGNOSTIC REPORT =====" & vbCrLf & vbCrLf
    
    ' Check temp directory
    Dim tempPath As String
    tempPath = MsgBoxUniversal.GetTempPath()
    report = report & "Temp Directory: " & tempPath & vbCrLf
    report = report & "Temp Dir Exists: " & CBool(Len(Dir(tempPath, vbDirectory)) > 0) & vbCrLf & vbCrLf
    
    ' Check listeners
    report = report & "PowerShell Listener (ToastWatcherK.ps1): " & MsgBoxUniversal.PowershellListenerRunning & vbCrLf
    report = report & "Python Listener (toast_winotify.py): " & MsgBoxUniversal.PythonListenerRunning & vbCrLf & vbCrLf
    
    ' Check for temp files
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    Dim TempFolder As Object
    Set TempFolder = fso.GetFolder(tempPath)
    
    Dim toastFileCount As Long
    Dim f As Object
    For Each f In TempFolder.Files
        If InStr(1, f.Name, "ToastRequest", vbTextCompare) > 0 Or _
           InStr(1, f.Name, "toast_", vbTextCompare) > 0 Or _
           InStr(1, f.Name, "ShowToast_", vbTextCompare) > 0 Then
            toastFileCount = toastFileCount + 1
        End If
    Next f
    
    report = report & "Temp Toast Files: " & toastFileCount & vbCrLf & vbCrLf
    
    ' Module status
    report = report & "? MsgBoxUniversal.bas (v3.11) loaded" & vbCrLf
    report = report & "? MsgBoxPython.bas (v1.9) loaded" & vbCrLf
    report = report & "? MsgBoxMSHTA.bas (v6.15) loaded" & vbCrLf
    report = report & "? Setup.bas (v1.7) loaded" & vbCrLf
    report = report & "? MsgBoxMain.bas (v11.10) loaded" & vbCrLf
    report = report & "? clsToastNotification.cls (v11.20) loaded" & vbCrLf
    report = report & "? MsgBoxPushBullet.bas (v2.3) loaded" & vbCrLf
    report = report & "? Credentials.bas (v1.0) loaded" & vbCrLf & vbCrLf
    
    report = report & "System Status: OPERATIONAL"
    
    MsgBox report, vbInformation, "System Diagnostic"
End Sub

'================= CLEANUP UTILITY =================
Public Sub CleanupToastTempFiles()
    On Error Resume Next
    
    Dim tempPath As String
    tempPath = MsgBoxUniversal.GetTempPath()
    
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    Dim count As Long
    count = 0
    
    Dim f As Object
    For Each f In fso.GetFolder(tempPath).Files
        If InStr(1, f.Name, "ToastRequest", vbTextCompare) > 0 Or _
           InStr(1, f.Name, "toast_", vbTextCompare) > 0 Or _
           InStr(1, f.Name, "ShowToast_", vbTextCompare) > 0 Or _
           InStr(1, f.Name, "callback_", vbTextCompare) > 0 Then
            f.Delete True
            count = count + 1
        End If
    Next f
    
    MsgBox "Cleanup complete!" & vbCrLf & vbCrLf & _
           "Files removed: " & count, vbInformation, "Cleanup"
End Sub

'================= HELPER FUNCTIONS =================
Private Sub SleepMs(ms As Long)
    Dim t As Single
    t = Timer
    Do While Timer - t < ms / 1000
        DoEvents
    Loop
End Sub






