Attribute VB_Name = "MsgBoxWinRT"
'***************************************************************
' Module: MsgBoxWinRT.bas
' Version: 12.1
' Purpose: Unified WinRT Toast Notification Interface
' Features:
'   - Auto-detects WinRT, Python, PowerShell, or HTA fallback
'   - Optional delivery persistence (via DeliveryPersists Const)
'   - Queued/stacked toast delivery with progress + callbacks
'   - Writes JSON for external listeners; posts to local HTTP listener when available
'***************************************************************
Option Explicit

Private Const LISTENER_PORT As Long = 8765
Private SharedQueue As Collection
Private Const CALLBACK_INTERVAL_SEC As Long = 1
Private CallbackTimerSet As Boolean

' default: do not persist delivery mode between runs
Public Const DeliveryPersists As Boolean = False
Private Const DELIVERY_FILE As String = "delivery.ini"

Private LastDeliveryMode As String

Private Function GetTempToastFolder() As String
    Dim tmpPath As String
    tmpPath = Environ$("TEMP") & "\ExcelToasts\"
    If Dir(tmpPath, vbDirectory) = "" Then MkDir tmpPath
    GetTempToastFolder = tmpPath
End Function


' --------------------------
' Queue initialization
' --------------------------
Private Sub InitQueue()
    If SharedQueue Is Nothing Then Set SharedQueue = New Collection
    Dim tmp As String: tmp = GetTempToastFolder()
    If Dir(tmp, vbDirectory) = "" Then MkDir tmp
End Sub

' --------------------------
' WinRT availability check
' --------------------------
Public Function WinRTAvailable(Optional ByVal Silent As Boolean = True) As Boolean
    On Error GoTo FailCheck
    Dim result As Object
    Set result = CreateObject("Windows.UI.Notifications.ToastNotificationManager")
    WinRTAvailable = True
    If Not Silent Then Debug.Print "[WinRT] Available."
    Exit Function
FailCheck:
    WinRTAvailable = False
    If Not Silent Then Debug.Print "[WinRT] Not available: " & Err.Description
End Function

' --------------------------
' Determine best available mode
' --------------------------
Private Function DetermineToastMode() As String
    On Error Resume Next
    ' 1) persisted mode if enabled
    If DeliveryPersists Then
        Dim persisted As String
        persisted = LoadLastDeliveryMode()
        If persisted <> "" Then
            If persisted = "winrt" And WinRTAvailable(True) Then DetermineToastMode = persisted: Exit Function
            If persisted = "python" And FindPythonExe() <> "" Then DetermineToastMode = persisted: Exit Function
            If persisted = "powershell" Then DetermineToastMode = persisted: Exit Function
        End If
    End If
    ' 2) standard order
    If WinRTAvailable(True) Then
        DetermineToastMode = "winrt"
    ElseIf FindPythonExe() <> "" Then
        DetermineToastMode = "python"
    Else
        DetermineToastMode = "powershell"
    End If
End Function

' --------------------------
' Public toast entry points
' --------------------------
Public Sub ShowToast(ByVal Title As String, ByVal msg As String, _
                     Optional ByVal Level As String = "INFO", _
                     Optional ByVal durationSec As Long = 5, _
                     Optional ByVal Position As String = "BR", _
                     Optional ByVal Sound As String = "", _
                     Optional ByVal CallbackMacro As String = "")

    Dim Toast As clsToastNotification
    Set Toast = New clsToastNotification

    With Toast
        .Title = Title
        .Message = msg
        .Level = Level
        .Duration = durationSec
        .Position = Position
        .SoundName = Sound
        .CallbackMacro = CallbackMacro
        .IsShowing = False
        .IsActivated = False
        .Progress = -1
    End With

    InitQueue
    SharedQueue.Add Toast
    If SharedQueue.count = 1 Then DisplayNextToast
End Sub

Public Sub ShowProgressToast(ByVal Title As String, ByVal msg As String, _
                             Optional ByVal Progress As Long = 0, _
                             Optional ByVal durationSec As Long = 0, _
                             Optional ByVal CallbackMacro As String = "")

    Dim Toast As clsToastNotification
    Set Toast = New clsToastNotification

    With Toast
        .Title = Title
        .Message = msg
        .Level = "PROGRESS"
        .Progress = Progress
        .Duration = durationSec
        .CallbackMacro = CallbackMacro
        .IsShowing = False
        .IsActivated = False
    End With

    InitQueue
    SharedQueue.Add Toast
    If SharedQueue.count = 1 Then DisplayNextToast
End Sub

' --------------------------
' Display next toast
' --------------------------
Private Sub DisplayNextToast()
    If SharedQueue.count = 0 Then Exit Sub
    Dim t As clsToastNotification: Set t = SharedQueue(1)

    Dim Mode As String
    Mode = DetermineToastMode()
    LastDeliveryMode = Mode

    ' persist mode if enabled
    If DeliveryPersists Then SaveLastDeliveryMode Mode

    Select Case Mode
        Case "winrt"
            Debug.Print "[MsgBoxWinRT] Delivering via WinRT for: " & t.Title
            t.Show "winrt"
        Case "python"
            Debug.Print "[MsgBoxWinRT] Delivering via Python listener for: " & t.Title
            EnsurePythonListenerRunning
            WriteListenerJson t.Title, t.Message, t.Level, t.Duration
        Case "powershell"
            Debug.Print "[MsgBoxWinRT] Delivering via PowerShell listener for: " & t.Title
            EnsurePowerShellListenerRunning
            WriteListenerJson t.Title, t.Message, t.Level, t.Duration
        Case Else
            Debug.Print "[MsgBoxWinRT] No listener found; using HTA for: " & t.Title
            t.Show "hta"
    End Select

    t.IsShowing = True
    Dim endTime As Double: endTime = Timer + t.Duration
    Do While Timer < endTime
        DoEvents
    Loop

    t.CloseToast
    SharedQueue.Remove 1
    If SharedQueue.count > 0 Then DisplayNextToast
End Sub

' --------------------------
' Persistence helpers
' --------------------------
Private Sub SaveLastDeliveryMode(ByVal Mode As String)
    On Error Resume Next
    Dim path As String: path = GetTempToastFolder() & DELIVERY_FILE
    Dim f As Object: Set f = CreateObject("Scripting.FileSystemObject").CreateTextFile(path, True)
    f.Write Mode
    f.Close
End Sub

Private Function LoadLastDeliveryMode() As String
    On Error Resume Next
    Dim path As String: path = GetTempToastFolder() & DELIVERY_FILE
    If Dir(path) = "" Then Exit Function
    Dim f As Object: Set f = CreateObject("Scripting.FileSystemObject").OpenTextFile(path, 1)
    LoadLastDeliveryMode = Trim(f.ReadAll)
    f.Close
End Function

' --------------------------
' Listener JSON writer
' --------------------------
Public Sub WriteListenerJson(ByVal Title As String, ByVal msg As String, ByVal Level As String, ByVal durationSec As Long)
    On Error Resume Next
    Dim tmpPath As String: tmpPath = GetTempToastFolder()
    If Dir(tmpPath, vbDirectory) = "" Then MkDir tmpPath

    Dim jsonFile As String
    jsonFile = tmpPath & "Toast_" & Format(Now, "yyyymmdd_hhnnss") & ".json"

    Dim f As Object
    Set f = CreateObject("Scripting.FileSystemObject").CreateTextFile(jsonFile, True, True)

    f.WriteLine "{"
    f.WriteLine "  ""Title"": """ & EscapeJson(Title) & ""","
    f.WriteLine "  ""Message"": """ & EscapeJson(msg) & ""","
    f.WriteLine "  ""Level"": """ & EscapeJson(Level) & ""","
    f.WriteLine "  ""DurationSec"": " & durationSec
    f.WriteLine "}"
    f.Close

    If IsListenerRunning() Then
        PostJsonToListener jsonFile
    Else
        Debug.Print "[MsgBoxWinRT] Listener not running; JSON written to: " & jsonFile
    End If
End Sub

' --------------------------
' Listener detection / startup
' --------------------------
Private Sub EnsurePythonListenerRunning()
    If IsListenerRunning() Then Exit Sub
    Dim pyExe As String: pyExe = FindPythonExe()
    If pyExe = "" Then
        Debug.Print "[MsgBoxWinRT] Python not found; not starting Python listener."
        Exit Sub
    End If

    Dim pyPath As String: pyPath = Environ$("TEMP") & "\listener.py"
    If Dir(pyPath) = "" Then
        Dim f As Object: Set f = CreateObject("Scripting.FileSystemObject").CreateTextFile(pyPath, True)
        f.WriteLine "import http.server, socketserver, json"
        f.WriteLine "PORT=" & LISTENER_PORT
        f.WriteLine "class Handler(http.server.SimpleHTTPRequestHandler):"
        f.WriteLine "  def do_POST(self):"
        f.WriteLine "    content_len = int(self.headers.get('Content-Length',0))"
        f.WriteLine "    data = self.rfile.read(content_len)"
        f.WriteLine "    print('Received:', data.decode())"
        f.WriteLine "    self.send_response(200); self.end_headers()"
        f.WriteLine "socketserver.TCPServer(('127.0.0.1', PORT), Handler).serve_forever()"
        f.Close
    End If

    Debug.Print "[MsgBoxWinRT] Starting Python listener..."
    shell "cmd /c start ""PythonListener"" """ & pyExe & """ """ & pyPath & """", vbHide
End Sub

Private Sub EnsurePowerShellListenerRunning()
    If IsListenerRunning() Then Exit Sub
Dim psPath As String
' Try multiple common locations
Dim paths As Variant
paths = Array( _
    Environ$("USERPROFILE") & "\Documents\PowerShell\ToastWatcherRT.ps1", _
    Environ$("USERPROFILE") & "\OneDrive\Documents\PowerShell\ToastWatcherRT.ps1", _
    Environ$("APPDATA") & "\PowerShell\ToastWatcherRT.ps1" _
)

Dim p As Variant
For Each p In paths
    If Dir(CStr(p)) <> "" Then
        psPath = LCase$(CStr(p))
        Exit For
    End If
Next
    If Dir(psPath) = "" Then
        Dim f As Object: Set f = CreateObject("Scripting.FileSystemObject").CreateTextFile(psPath, True)
        f.WriteLine "$listener = New-Object System.Net.HttpListener"
        f.WriteLine "$listener.Prefixes.Add('http://localhost:" & LISTENER_PORT & "/toast/')"
        f.WriteLine "$listener.Start()"
        f.WriteLine "while ($listener.IsListening) {"
        f.WriteLine "  $context = $listener.GetContext()"
        f.WriteLine "  $reader = New-Object IO.StreamReader($context.Request.InputStream)"
        f.WriteLine "  $data = $reader.ReadToEnd()"
        f.WriteLine "  Write-Host ""Received: "" $data"
        f.WriteLine "  $response = $context.Response"
        f.WriteLine "  $buffer = [System.Text.Encoding]::UTF8.GetBytes('OK')"
        f.WriteLine "  $response.OutputStream.Write($buffer,0,$buffer.Length)"
        f.WriteLine "  $response.OutputStream.Close()"
        f.WriteLine "}"
        f.Close
    End If

    Debug.Print "[MsgBoxWinRT] Starting PowerShell listener..."
    shell "powershell -ExecutionPolicy Bypass -File """ & psPath & """", vbHide
End Sub

Private Function FindPythonExe() As String
    On Error Resume Next
    Dim ws As Object, result As String
    Set ws = CreateObject("WScript.Shell")
    result = ws.exec("cmd /c where python").StdOut.ReadAll
    If InStr(result, "python.exe") > 0 Then
        FindPythonExe = Trim(Split(result, vbCrLf)(0))
    Else
        FindPythonExe = ""
    End If
End Function

' --------------------------
' Listener check/post helpers
' --------------------------
Public Function IsListenerRunning() As Boolean
    On Error Resume Next
    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP")
    http.Open "GET", "http://127.0.0.1:" & LISTENER_PORT & "/", False
    http.Send
    IsListenerRunning = (http.Status = 200)
End Function

Private Sub PostJsonToListener(ByVal jsonFile As String)
    On Error GoTo ErrHandler
    Dim http As Object, stream As Object
    Set http = CreateObject("MSXML2.XMLHTTP")
    Set stream = CreateObject("ADODB.Stream")
    stream.Open
    stream.Type = 1
    stream.LoadFromFile jsonFile
    http.Open "POST", "http://127.0.0.1:" & LISTENER_PORT & "/toast", False
    http.setRequestHeader "Content-Type", "application/json"
    http.Send stream.Read
    stream.Close
    Debug.Print "[MsgBoxWinRT] Posted JSON to listener: " & jsonFile
    Exit Sub
ErrHandler:
    Debug.Print "[MsgBoxWinRT] PostJsonToListener error: " & Err.Description
End Sub

' --------------------------
' Escaping utility
' --------------------------
Private Function EscapeJson(ByVal s As String) As String
    Dim result As String
    result = Replace(s, "\", "\\")
    result = Replace(result, """", "\""")
    result = Replace(result, vbCr, "\r")
    result = Replace(result, vbLf, "\n")
    EscapeJson = result
End Function


