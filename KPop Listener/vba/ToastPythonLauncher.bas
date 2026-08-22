Attribute VB_Name = "ToastPythonLauncher"
Option Explicit
' ==========================================================================
'  Module: ToastPythonLauncher
'  Purpose: Launch and communicate with Python toast_helper.py
'  Features:
'    - Auto-starts Python helper (daemon or single-use)
'    - Supports DeliveryPersists = True/False (VBA-controlled)
'    - Detects running instance via named pipe
'    - Fallback to single-use if daemon not running
' ==========================================================================

#Const DeliveryPersists = False     ' <== Set True for persistent background daemon
Private Const PIPE_NAME As String = "\\.\pipe\ExcelToastPipe"

Private Declare PtrSafe Function WaitNamedPipe Lib "kernel32" Alias "WaitNamedPipeA" ( _
    ByVal lpNamedPipeName As String, _
    ByVal nTimeOut As Long) As Long

Private Declare PtrSafe Function GetLastError Lib "kernel32" () As Long

' --- Entry point to send a toast ---
Public Sub SendPythonToast(ByVal Title As String, ByVal Message As String, Optional ByVal Level As String = "INFO")
    Dim payload As String
    payload = BuildToastJson(Title, Message, Level)
    
    If PipeExists(PIPE_NAME) Then
        ' Send to running daemon
        If Not SendPipeMessage(PIPE_NAME, payload) Then
            Debug.Print "[Toast] Pipe write failed; running single-use fallback..."
            LaunchSingleUseToast payload
        End If
    Else
        ' No daemon running; start depending on DeliveryPersists
        If DeliveryPersists Then
            Debug.Print "[Toast] Starting Python daemon (persistent mode)..."
            LaunchPythonDaemon
            Application.Wait (Now + TimeSerial(0, 0, 2)) ' Wait a moment for pipe ready
            SendPipeMessage PIPE_NAME, payload
        Else
            Debug.Print "[Toast] Running single-use Python toast..."
            LaunchSingleUseToast payload
        End If
    End If
End Sub

' --- Build JSON for pipe message ---
Private Function BuildToastJson(ByVal Title As String, ByVal Message As String, ByVal Level As String) As String
    Dim s As String
    s = "{""Title"":""" & Replace(Title, """", "'") & """,""Message"":""" & Replace(Message, """", "'") & """,""Level"":""" & Level & """}"
    BuildToastJson = s
End Function

' --- Check if pipe already exists (daemon is running) ---
Private Function PipeExists(ByVal pipeName As String) As Boolean
    On Error Resume Next
    Dim result As Long
    result = WaitNamedPipe(pipeName, 0)
    PipeExists = (result <> 0)
End Function

' --- Send JSON payload to pipe ---
Private Function SendPipeMessage(ByVal pipeName As String, ByVal Message As String) As Boolean
    On Error Resume Next
    Dim oFSO As Object, oFile As Object
    Set oFSO = CreateObject("Scripting.FileSystemObject")
    Dim f As Integer
    f = FreeFile
    Open pipeName For Output As #f
    Print #f, Message
    Close #f
    SendPipeMessage = True
    Exit Function
ErrHandler:
    SendPipeMessage = False
End Function

' --- Launch persistent daemon if DeliveryPersists=True ---
Private Sub LaunchPythonDaemon()
    On Error Resume Next
    Dim scriptPath As String
    scriptPath = GetToastHelperPath()
    If Len(Dir(scriptPath)) = 0 Then
        MsgBox "toast_helper.py not found: " & scriptPath, vbCritical
        Exit Sub
    End If
    
    Dim cmd As String
    cmd = "python """ & scriptPath & """ --daemon"
    ShellExecuteHidden cmd
End Sub

' --- Launch one-off toast if no persistent daemon ---
Private Sub LaunchSingleUseToast(ByVal jsonPayload As String)
    On Error Resume Next
    Dim scriptPath As String
    scriptPath = GetToastHelperPath()
    
    Dim tempJson As String
    tempJson = Environ$("TEMP") & "\toast_payload.json"
    With CreateObject("Scripting.FileSystemObject")
        With .CreateTextFile(tempJson, True, True)
            .Write jsonPayload
            .Close
        End With
    End With
    
    Dim cmd As String
    cmd = "python """ & scriptPath & """ --listener --json-file """ & tempJson & """"
    ShellExecuteHidden cmd
End Sub

' --- Helper: Get full path to toast_helper.py ---
Private Function GetToastHelperPath() As String
    ' Try multiple common locations
    Dim paths As Variant
    paths = Array( _
        ThisWorkbook.path & "\toast_helper.py", _
        ThisWorkbook.path & "\scripts\toast_helper.py", _
        Environ$("USERPROFILE") & "\Scripts\toast_helper.py", _
        Environ$("APPDATA") & "\Python\Scripts\toast_helper.py", _
        Environ$("TEMP") & "\toast_helper.py" _
    )
    
    Dim p As Variant
    For Each p In paths
        If Dir(CStr(p)) <> "" Then
            GetToastHelperPath = CStr(p)
            Exit Function
        End If
    Next
    
    ' Default to workbook location
    GetToastHelperPath = ThisWorkbook.path & "\toast_helper.py"
End Function
' --- Helper: ShellExecute hidden (no console) ---
Private Sub ShellExecuteHidden(ByVal cmd As String)
    On Error Resume Next
    Dim sh As Object
    Set sh = CreateObject("WScript.Shell")
    sh.Run cmd, 0, False
End Sub


Sub SampleUse()
' === Example 1: Simple info toast ===
Call SendPythonToast("Upload Complete", "Your files were sent successfully.")

' === Example 2: Warning ===
Call SendPythonToast("Low Disk Space", "Only 500MB remaining.", "WARN")

' === Example 3: Persistent Daemon mode ===
' (Set #Const DeliveryPersists = True at top)
Call SendPythonToast("Connected", "Python toast listener is running persistently.")

End Sub
