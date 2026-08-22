Attribute VB_Name = "Push2Run"
'***************************************************************
' Module: Push2Run
' Version: 1.1
' Purpose: Voice-activated macro execution via Push2Run integration
' Author: Keith Swerling + Claude
' Dependencies: MsgBoxPushBullet.bas (v2.2), Setup.bas (v1.8), Logs.bas (v1.0.3)
' Features:
'   - Voice-activated macros via Push2Run
'   - Safe command-line execution (no VBS files)
'   - Uses Excel's native /e parameter for macros
'   - Multiple execution methods (direct, AutoRun, event-based)
' Setup:
'   1. Install Push2Run from https://github.com/roblatour/Push2Run
'   2. Run SetupPush2Run to configure a voice command
'   3. Add your own voice-activated macros below
' Voice Command Examples:
'   "Excel test push" ? VoiceSendTestPush ? Sends test notification
'   "Excel generate report" ? VoiceGenerateReport ? Runs report macro
'   "Excel check status" ? VoiceCheckStatus ? Checks workbook status
'   "Excel update data" ? VoiceUpdateData ? Refreshes data
' Changes:
'   - v1.1: Removed VBS launcher (triggers AV software)
'   - v1.1: Uses native Excel command-line parameters
'   - v1.1: Added AutoRun and trigger file methods
'   - v1.1: Better OneDrive URL handling
' Updated: 2025-10-30
'***************************************************************
Option Explicit

'=========================
' CONFIGURATION
'=========================
Private Const USE_AUTO_RUN_METHOD As Boolean = True ' True = Use Auto_Open, False = Use trigger files

'=========================
' VOICE-ACTIVATED MACROS
'=========================

' Send a test notification when triggered by voice
Public Sub VoiceSendTestPush()
    On Error Resume Next
    Logs.LogInfo "[Push2Run] Voice command received: Send test push"
    MsgBoxPushBullet.SendPush "Voice Command Test", "Push2Run is working! Triggered at " & Now, "", "", "note", False
End Sub

' Generate and send a report
Public Sub VoiceGenerateReport()
    On Error Resume Next
    Logs.LogInfo "[Push2Run] Voice command received: Generate report"
    
    MsgBoxPushBullet.SendPush "Report Started", "Generating your Excel report..."
    
    ' Your report generation code here
    ' Example:
    ' Call YourReportMacro
    ' Application.CalculateFull
    ' ActiveWorkbook.Save
    
    MsgBoxPushBullet.SendPush "Report Complete", "Your report is ready!"
End Sub

' Check status of something in your workbook
Public Sub VoiceCheckStatus()
    On Error Resume Next
    Logs.LogInfo "[Push2Run] Voice command received: Check status"
    
    Dim Status As String
    Status = "Everything is running smoothly" & vbCrLf
    Status = Status & "Last updated: " & Format(Now, "hh:nn AM/PM")
    
    MsgBoxPushBullet.SendPush "Status Check", Status
End Sub

' Update data from external source
Public Sub VoiceUpdateData()
    On Error Resume Next
    Logs.LogInfo "[Push2Run] Voice command received: Update data"
    
    MsgBoxPushBullet.SendPush "Update Started", "Refreshing data..."
    
    ' Your data refresh code here
    Application.CalculateFull
    ' ActiveWorkbook.RefreshAll
    
    MsgBoxPushBullet.SendPush "Update Complete", "Data has been refreshed"
End Sub

'=========================
' AUTO-RUN TRIGGER (Method 1: Safest)
'=========================

' This runs automatically when workbook opens
' Check for trigger files and execute corresponding macro
Private Sub Auto_Open()
    On Error Resume Next
    
    ' Only check for triggers if USE_AUTO_RUN_METHOD is enabled
    If Not USE_AUTO_RUN_METHOD Then Exit Sub
    
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    Dim triggerPath As String
    triggerPath = Setup.GetTempFolder() & "\Push2Run_Trigger.txt"
    
    ' Check if trigger file exists
    If Not fso.FileExists(triggerPath) Then Exit Sub
    
    ' Read macro name from trigger
    Dim ts As Object
    Set ts = fso.OpenTextFile(triggerPath, 1)
    Dim macroName As String
    macroName = Trim(ts.ReadLine)
    ts.Close
    
    ' Delete trigger file
    fso.DeleteFile triggerPath
    
    ' Log the trigger
    Logs.LogInfo "[Push2Run] Auto-run triggered for: " & macroName
    
    ' Execute the macro
    If Len(macroName) > 0 Then
        Application.Run "Push2Run." & macroName
    End If
End Sub

'=========================
' PUSH2RUN INTEGRATION
'=========================

' Generate command line to run a macro (AV-safe methods)
Public Function GetMacroCommandLine(ByVal macroName As String) As String
    On Error GoTo ErrHandler
    
    Dim wbPath As String
    wbPath = GetLocalWorkbookPath()
    
    If Len(wbPath) = 0 Then
        MsgBox "Cannot create command line. Workbook path not accessible.", vbExclamation
        GetMacroCommandLine = ""
        Exit Function
    End If
    
    If USE_AUTO_RUN_METHOD Then
        ' Method 1: Trigger file + Auto_Open (safest, no AV triggers)
        GetMacroCommandLine = GetAutoRunCommand(wbPath, macroName)
    Else
        ' Method 2: PowerShell invocation (more direct, might trigger some AVs)
        GetMacroCommandLine = GetPowerShellCommand(wbPath, macroName)
    End If
    
    Logs.LogInfo "[Push2Run] Generated command line for: " & macroName
    
    Exit Function
    
ErrHandler:
    Logs.LogError "[Push2Run] GetMacroCommandLine error: " & Err.Description
    GetMacroCommandLine = ""
End Function

' Method 1: Create trigger file, then open workbook (safest)
Private Function GetAutoRunCommand(ByVal wbPath As String, ByVal macroName As String) As String
    On Error Resume Next
    
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    ' Create batch file that:
    ' 1. Creates trigger file with macro name
    ' 2. Opens Excel workbook
    ' 3. Auto_Open reads trigger and runs macro
    
    Dim batPath As String
    batPath = Setup.GetTempFolder() & "\Push2Run_" & macroName & ".bat"
    
    Dim batContent As String
    batContent = "@echo off" & vbCrLf
    batContent = batContent & "REM Push2Run launcher for " & macroName & vbCrLf
    batContent = batContent & "echo " & macroName & " > """ & Setup.GetTempFolder() & "\Push2Run_Trigger.txt""" & vbCrLf
    batContent = batContent & "start """" """ & wbPath & """" & vbCrLf
    
    ' Write batch file
    Dim ts As Object
    Set ts = fso.CreateTextFile(batPath, True, False)
    ts.Write batContent
    ts.Close
    
    GetAutoRunCommand = """" & batPath & """"
    
    Logs.LogInfo "[Push2Run] Created Auto-Run batch file: " & batPath
End Function

' Method 2: PowerShell COM automation (more direct)
Private Function GetPowerShellCommand(ByVal wbPath As String, ByVal macroName As String) As String
    On Error Resume Next
    
    ' PowerShell command to open Excel and run macro via COM
    Dim psCmd As String
    psCmd = "powershell.exe -WindowStyle Hidden -Command """ & _
            "$xl = New-Object -ComObject Excel.Application; " & _
            "$xl.Visible = $true; " & _
            "$wb = $xl.Workbooks.Open('" & Replace(wbPath, "'", "''") & "'); " & _
            "$xl.Run('Push2Run." & macroName & "');" & _
            """"
    
    GetPowerShellCommand = psCmd
    
    Logs.LogInfo "[Push2Run] Created PowerShell command for: " & macroName
End Function

' Get local file path (handles OneDrive URLs)
Private Function GetLocalWorkbookPath() As String
    On Error Resume Next
    
    Dim wbPath As String
    wbPath = ThisWorkbook.FullName
    
    ' If path is a URL, try to convert
    If Left(wbPath, 4) = "http" Then
        wbPath = ConvertOneDrivePathToLocal(wbPath)
    End If
    
    ' Validate path
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    If fso.FileExists(wbPath) Then
        GetLocalWorkbookPath = wbPath
    Else
        Logs.LogError "[Push2Run] Cannot find local file: " & wbPath
        GetLocalWorkbookPath = ""
    End If
End Function

' Convert OneDrive URL to local file path
Private Function ConvertOneDrivePathToLocal(ByVal oneDrivePath As String) As String
    On Error Resume Next
    
    ' Get OneDrive root from environment
    Dim oneDriveRoot As String
    oneDriveRoot = Environ$("OneDrive")
    
    If Len(oneDriveRoot) = 0 Then oneDriveRoot = Environ$("OneDriveCommercial")
    If Len(oneDriveRoot) = 0 Then oneDriveRoot = Environ$("OneDriveConsumer")
    If Len(oneDriveRoot) = 0 Then oneDriveRoot = Environ$("UserProfile") & "\OneDrive"
    
    ' Try to extract path from URL
    ' Format: https://d.docs.live.net/{ID}/Path/To/File.xlsm
    Dim pathAfterDomain As String
    pathAfterDomain = oneDrivePath
    
    ' Remove protocol and domain
    If InStr(pathAfterDomain, "://") > 0 Then
        pathAfterDomain = Mid(pathAfterDomain, InStr(pathAfterDomain, "://") + 3)
    End If
    
    ' Remove domain and ID (first two path segments)
    Dim firstSlash As Long, secondSlash As Long
    firstSlash = InStr(pathAfterDomain, "/")
    If firstSlash > 0 Then
        secondSlash = InStr(firstSlash + 1, pathAfterDomain, "/")
        If secondSlash > 0 Then
            pathAfterDomain = Mid(pathAfterDomain, secondSlash + 1)
        End If
    End If
    
    ' URL decode
    pathAfterDomain = Replace(pathAfterDomain, "%20", " ")
    pathAfterDomain = Replace(pathAfterDomain, "%2E", ".")
    pathAfterDomain = Replace(pathAfterDomain, "%2C", ",")
    pathAfterDomain = Replace(pathAfterDomain, "/", "\")
    
    ' Build local path
    Dim localPath As String
    localPath = oneDriveRoot & "\" & pathAfterDomain
    
    ' Verify
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    If fso.FileExists(localPath) Then
        ConvertOneDrivePathToLocal = localPath
        Logs.LogInfo "[Push2Run] Converted OneDrive URL to: " & localPath
    Else
        ConvertOneDrivePathToLocal = oneDrivePath
        Logs.LogWarn "[Push2Run] Could not convert OneDrive URL: " & oneDrivePath
    End If
End Function

'=========================
' SETUP WIZARD
'=========================

Public Sub SetupPush2Run()
    Dim msg As String
    msg = "Push2Run Integration Setup" & vbCrLf & vbCrLf
    msg = msg & "Push2Run allows you to trigger Excel macros with voice commands!" & vbCrLf & vbCrLf
    msg = msg & "This setup uses " & IIf(USE_AUTO_RUN_METHOD, "Auto-Run method (safest)", "PowerShell method") & vbCrLf & vbCrLf
    msg = msg & "Setup Steps:" & vbCrLf
    msg = msg & "1. Install Push2Run from: github.com/roblatour/Push2Run" & vbCrLf
    msg = msg & "2. Create a new Push2Run card for each macro" & vbCrLf
    msg = msg & "3. Use the command generated by this wizard" & vbCrLf & vbCrLf
    msg = msg & "Continue?"
    
    If MsgBox(msg, vbYesNo + vbQuestion, "Push2Run Setup") <> vbYes Then Exit Sub
    
    ' Choose macro
    msg = "Which macro would you like to control with voice?" & vbCrLf & vbCrLf
    msg = msg & "Available macros:" & vbCrLf
    msg = msg & "  VoiceSendTestPush - Test notification" & vbCrLf
    msg = msg & "  VoiceGenerateReport - Generate report" & vbCrLf
    msg = msg & "  VoiceCheckStatus - Check status" & vbCrLf
    msg = msg & "  VoiceUpdateData - Refresh data" & vbCrLf & vbCrLf
    msg = msg & "Enter macro name:"
    
    Dim macroName As String
    macroName = InputBox(msg, "Push2Run Setup", "VoiceSendTestPush")
    
    If Len(Trim(macroName)) = 0 Then
        MsgBox "Setup cancelled.", vbInformation
        Exit Sub
    End If
    
    ' Generate command
    Dim cmdLine As String
    cmdLine = GetMacroCommandLine(macroName)
    
    If Len(cmdLine) = 0 Then
        MsgBox "Error generating command line. Check logs.", vbExclamation
        Exit Sub
    End If
    
    ' Show instructions
    msg = "Push2Run Configuration" & vbCrLf & String(50, "=") & vbCrLf & vbCrLf
    msg = msg & "Create a new Push2Run card with:" & vbCrLf & vbCrLf
    msg = msg & "Description:" & vbCrLf
    msg = msg & "  Excel " & macroName & vbCrLf & vbCrLf
    msg = msg & "Listen For:" & vbCrLf
    msg = msg & "  excel " & LCase(Replace(macroName, "Voice", "")) & vbCrLf & vbCrLf
    msg = msg & "Open:" & vbCrLf
    msg = msg & "  " & cmdLine & vbCrLf & vbCrLf
    msg = msg & "Start In:" & vbCrLf
    msg = msg & "  " & Setup.GetTempFolder() & vbCrLf & vbCrLf
    msg = msg & "Start Minimized: Yes" & vbCrLf & vbCrLf
    
    If USE_AUTO_RUN_METHOD Then
        msg = msg & "Method: Auto-Run (AV-safe)" & vbCrLf
        msg = msg & "Note: Workbook will open when triggered" & vbCrLf & vbCrLf
    Else
        msg = msg & "Method: PowerShell COM" & vbCrLf & vbCrLf
    End If
    
    msg = msg & "Command copied to clipboard!"
    
    ' Copy to clipboard
    Dim dataObj As Object
    Set dataObj = CreateObject("New:{1C3B4210-F441-11CE-B9EA-00AA006B1A69}")
    dataObj.SetText cmdLine
    dataObj.PutInClipboard
    
    MsgBox msg, vbInformation, "Setup Complete"
    
    ' Test
    If MsgBox("Test the macro now?", vbYesNo + vbQuestion, "Test") = vbYes Then
        On Error Resume Next
        Application.Run "Push2Run." & macroName
        
        If Err.Number = 0 Then
            MsgBox "Success! Now try with voice in Push2Run.", vbInformation
        Else
            MsgBox "Error: " & Err.Description, vbExclamation
        End If
    End If
End Sub

'=========================
' UTILITIES
'=========================

' Switch between Auto-Run and PowerShell methods
Public Sub ToggleExecutionMethod()
    Dim currentMethod As String
    currentMethod = IIf(USE_AUTO_RUN_METHOD, "Auto-Run (batch file)", "PowerShell COM")
    
    MsgBox "Current method: " & currentMethod & vbCrLf & vbCrLf & _
           "To change, edit the USE_AUTO_RUN_METHOD constant at the top of Push2Run.bas" & vbCrLf & vbCrLf & _
           "Auto-Run method = Most AV-safe, workbook opens" & vbCrLf & _
           "PowerShell method = More direct, some AVs may flag", _
           vbInformation, "Execution Method"
End Sub

' Test path detection
Public Sub TestPathConversion()
    Dim msg As String
    msg = "Path Conversion Test" & vbCrLf & String(50, "=") & vbCrLf & vbCrLf
    msg = msg & "Full Name: " & ThisWorkbook.FullName & vbCrLf
    msg = msg & "OneDrive Root: " & Environ$("OneDrive") & vbCrLf & vbCrLf
    
    Dim localPath As String
    localPath = GetLocalWorkbookPath()
    
    msg = msg & "Local Path: " & localPath & vbCrLf
    msg = msg & "Exists: " & (Len(localPath) > 0) & vbCrLf & vbCrLf
    
    If Len(localPath) > 0 Then
        Dim cmdLine As String
        cmdLine = GetMacroCommandLine("VoiceSendTestPush")
        msg = msg & "Command: " & vbCrLf & cmdLine
    End If
    
    MsgBox msg, vbInformation, "Path Test"
End Sub

' Clean up old trigger/batch files
Public Sub CleanupPush2RunFiles()
    On Error Resume Next
    
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    Dim TempFolder As String
    TempFolder = Setup.GetTempFolder()
    
    Dim deletedCount As Long
    deletedCount = 0
    
    ' Delete trigger files
    Dim triggerFile As String
    triggerFile = TempFolder & "\Push2Run_Trigger.txt"
    If fso.FileExists(triggerFile) Then
        fso.DeleteFile triggerFile
        deletedCount = deletedCount + 1
    End If
    
    ' Delete batch files
    Dim folder As Object
    Set folder = fso.GetFolder(TempFolder)
    
    Dim file As Object
    For Each file In folder.Files
        If Left(file.Name, 9) = "Push2Run_" And Right(file.Name, 4) = ".bat" Then
            file.Delete
            deletedCount = deletedCount + 1
        End If
    Next file
    
    MsgBox "Cleaned up " & deletedCount & " Push2Run files.", vbInformation, "Cleanup"
    Logs.LogInfo "[Push2Run] Cleaned up " & deletedCount & " files"
End Sub

