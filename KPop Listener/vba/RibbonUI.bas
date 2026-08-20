Attribute VB_Name = "RibbonUI"
'***************************************************************
' Module: RibbonUI
' Version: 10.0
' Purpose: Enhanced Ribbon UI for Toast + KPopListener Control
' Features:
'   • Full support for KPopListener.ps1 (Named Pipe + MMF + JSON)
'   • Accurate detection via PID file, pipe, and sentinel
'   • Auto-refresh every 15 seconds
'   • Single toggle button (Start/Stop)
'   • Progress toast demo
'   • Error logging + user feedback
'***************************************************************
Option Explicit

Private gRibbon As IRibbonUI
Private Const REFRESH_INTERVAL_SEC As Long = 15
Private RefreshTimerSet As Boolean

' Listener paths (update as needed)
Private Const LISTENER_PS1 As String = "C:\Users\howdy\OneDrive\MsgBox\ToastWatcherK.ps1"
Private Const TEMP_DIR As String = "C:\Users\howdy\AppData\Local\Temp\ExcelToasts"
Private Const PID_FILE As String = "ToastWatcher.pid"
Private Const SENTINEL_FILE As String = "ToastWatcher_Alive.txt"
Private Const PIPE_NAME As String = "\\.\pipe\ExcelToastPipe"

' =====================================================
' RIBBON XML
' =====================================================
Public Function GetCustomUI(RibbonID As String) As String
    Dim xml As String
    xml = "<customUI xmlns='http://schemas.microsoft.com/office/2009/07/customui'>" & _
          "<ribbon>" & _
          "<tabs>" & _
          "<tab id='tabExcelToasts' label='Excel Toasts'>" & _
          "<group id='grpToasts' label='Notifications'>" & _
          "<button id='btnTestToast' label='Test Toast' imageMso='HappyFace' size='large' onAction='OnTestToast'/>" & _
          "<button id='btnProgressToast' label='Progress Demo' imageMso='Animation' size='large' onAction='OnProgressDemo'/>" & _
          "</group>" & _
          "<group id='grpListener' label='KPop Listener'>" & _
          "<toggleButton id='btnToggleListener' label='Start Listener' imageMso='MacroPlay' size='large' " & _
          "getPressed='GetListenerPressed' onAction='OnToggleListener' getSupertip='GetListenerTip'/>" & _
          "<labelControl id='lblStatus' getLabel='GetStatusLabel'/>" & _
          "</group>" & _
          "</tab>" & _
          "</tabs>" & _
          "</ribbon>" & _
          "</customUI>"
    GetCustomUI = xml
End Function

Public Sub OnRibbonLoad(ribbon As IRibbonUI)
    Set gRibbon = ribbon
    StartRefreshTimer
    RefreshRibbon
End Sub

' =====================================================
' RIBBON CALLBACKS
' =====================================================
Public Function GetListenerPressed(control As IRibbonControl) As Boolean
    GetListenerPressed = IsListenerRunning()
End Function

Public Function GetListenerTip(control As IRibbonControl) As String
    If IsListenerRunning() Then
        GetListenerTip = "Click to stop KPopListener (PowerShell)" & vbCrLf & _
                        "Pipe: " & PIPE_NAME & vbCrLf & _
                        "Temp: " & TEMP_DIR
    Else
        GetListenerTip = "Click to start KPopListener (PowerShell)" & vbCrLf & _
                        "Script: " & LISTENER_PS1
    End If
End Function

Public Function GetStatusLabel(control As IRibbonControl) As String
    Dim pid As String
    pid = GetPIDFromFile()
    If IsListenerRunning() Then
        GetStatusLabel = "Running (PID: " & pid & ")"
    Else
        GetStatusLabel = "Stopped"
    End If
End Function

Public Sub OnToggleListener(control As IRibbonControl, pressed As Boolean)
    If pressed Then
        StartPowerShellListener
    Else
        StopPowerShellListener
    End If
    Application.OnTime Now + TimeSerial(0, 0, 1), "RibbonUI.RefreshRibbon"
End Sub

Public Sub OnTestToast(control As IRibbonControl)
    MsgBoxWinRT.ShowToast "Test", "Hello from Ribbon!", "INFO", 3
End Sub

Public Sub OnProgressDemo(control As IRibbonControl)
    Dim i As Integer
    For i = 10 To 100 Step 10
        MsgBoxWinRT.ShowProgressToast "Processing", "Step " & i & "%", i
        Application.Wait Now + TimeSerial(0, 0, 0.5)
    Next i
    MsgBoxWinRT.ShowToast "Complete", "Demo finished!", "SUCCESS", 3
End Sub

' =====================================================
' LISTENER CONTROL
' =====================================================
Private Sub StartPowerShellListener()
    On Error GoTo ErrorHandler
    
    If Not FileExists(LISTENER_PS1) Then
        MsgBoxWinRT.ShowToast "Error", "KPopListener.ps1 not found!", "ERROR", 5
        Logs.LogError "RibbonUI: Script not found: " & LISTENER_PS1
        Exit Sub
    End If

    Dim cmd As String
    cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & LISTENER_PS1 & """ -Background"

    shell cmd, vbHide
    Logs.LogInfo "RibbonUI: Starting KPopListener: " & cmd

    Exit Sub
ErrorHandler:
    Logs.LogError "RibbonUI.StartPowerShellListener: " & Err.Description
    MsgBoxWinRT.ShowToast "Error", "Failed to start listener.", "ERROR", 4
End Sub

Private Sub StopPowerShellListener()
    On Error Resume Next
    
    Dim pid As String
    pid = GetPIDFromFile()
    If pid <> "" Then
        shell "taskkill /PID " & pid & " /F /T", vbHide
        Logs.LogInfo "RibbonUI: Stopped listener (PID: " & pid & ")"
    Else
        shell "taskkill /F /IM powershell.exe /T", vbHide
        Logs.LogWarn "RibbonUI: PID not found, killing all powershell.exe"
    End If

    ' Clean up
    KillFile GetPIDFile()
    KillFile GetSentinelFile()
End Sub

' =====================================================
' DETECTION LOGIC (Robust)
' =====================================================
Public Function IsListenerRunning() As Boolean
    On Error Resume Next
    
    ' 1. PID file exists and process is alive?
    Dim pid As String
    pid = GetPIDFromFile()
    If pid <> "" Then
        If IsProcessRunning(CLng(pid)) Then
            IsListenerRunning = True
            Exit Function
        End If
    End If

    ' 2. Named pipe exists?
    If PipeExists() Then
        IsListenerRunning = True
        Exit Function
    End If

    ' 3. Sentinel file recent (< 30 sec)?
    If FileExists(GetSentinelFile()) Then
        If (Now - FileDateTime(GetSentinelFile())) * 86400 < 30 Then
            IsListenerRunning = True
            Exit Function
        End If
    End If

    IsListenerRunning = False
End Function

Private Function GetPIDFromFile() As String
    Dim path As String
    path = GetPIDFile()
    If FileExists(path) Then
        GetPIDFromFile = Trim(ReadTextFile(path))
    Else
        GetPIDFromFile = ""
    End If
End Function

Private Function GetPIDFile() As String
    GetPIDFile = TEMP_DIR & "\" & PID_FILE
End Function

Private Function GetSentinelFile() As String
    GetSentinelFile = TEMP_DIR & "\" & SENTINEL_FILE
End Function

Private Function PipeExists() As Boolean
    On Error Resume Next
    Dim hPipe As Long
    hPipe = CreateFile(PIPE_NAME, &H80000000, 0, 0, 3, 0, 0) ' GENERIC_READ, OPEN_EXISTING
    If hPipe <> -1 Then
        CloseHandle hPipe
        PipeExists = True
    Else
        PipeExists = False
    End If
End Function

Private Function IsProcessRunning(pid As Long) As Boolean
    On Error Resume Next
    Dim wmi As Object, query As String, processes As Object
    Set wmi = GetObject("winmgmts:")
    query = "SELECT * FROM Win32_Process WHERE ProcessId = " & pid
    Set processes = wmi.ExecQuery(query)
    IsProcessRunning = (processes.count > 0)
End Function

' =====================================================
' AUTO REFRESH
' =====================================================
Private Sub StartRefreshTimer()
    If Not RefreshTimerSet Then
        Application.OnTime Now + TimeSerial(0, 0, REFRESH_INTERVAL_SEC), "RibbonUI.RefreshListenerStatus", , True
        RefreshTimerSet = True
    End If
End Sub

Public Sub RefreshListenerStatus()
    RefreshTimerSet = False
    RefreshRibbon
    StartRefreshTimer
End Sub

Public Sub RefreshRibbon()
    If Not gRibbon Is Nothing Then
        gRibbon.InvalidateControl "btnToggleListener"
        gRibbon.InvalidateControl "lblStatus"
    End If
End Sub

' =====================================================
' FILE HELPERS
' =====================================================
Private Function FileExists(path As String) As Boolean
    On Error Resume Next
    FileExists = (Dir(path) <> "")
End Function

Private Sub KillFile(path As String)
    On Error Resume Next
    If FileExists(path) Then Kill path
End Sub

Private Function ReadTextFile(path As String) As String
    On Error Resume Next
    Dim f As Object, ts As Object
    Set f = CreateObject("Scripting.FileSystemObject")
    Set ts = f.OpenTextFile(path, 1)
    ReadTextFile = ts.ReadAll
    ts.Close
End Function

