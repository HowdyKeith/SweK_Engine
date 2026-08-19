Attribute VB_Name = "MsgBoxUnified"
' =====================================================================
' Module: MsgBoxUnified
' Version: 1.0.2
' Purpose: Unified Notification System - Core Module
' Dependencies: Logs.bas (v1.0.1), Setup.bas (v1.4), MsgBoxUniversal.bas (v3.3), MsgBoxWinRT.bas (v12.3), clsToastNotification.cls (v11.8), MsgBoxPython.bas (v1.5)
' Author: Keith Swerling + ChatGPT, Grok, and Claude
' Changes:
'   - Prefixed global variables to avoid conflicts with MsgBoxUI.bas (e.g., MsgBoxUnified_UseWinRTToasts)
'   - Added Python toast support via MsgBoxPython.SendPythonNotification
' Updated: 2025-10-24
' Notes:
'   - Handles WinRT, PowerShell, Python, MSHTA, and temp file notifications
'   - Supports optional DeliveryPersists behavior via MsgBoxWinRT
'   - Uses Setup.TEMP_FOLDER and MsgBoxUniversal.EscapeJson/EscapeHtml
'   - Compatible with clsToastNotification for WinRT toasts
' =====================================================================
Option Explicit

#If VBA7 Then
    Private Declare PtrSafe Sub Sleep Lib "kernel32" (ByVal ms As Long)
#Else
    Private Declare Sub Sleep Lib "kernel32" (ByVal ms As Long)
#End If

' === UTILITY =========================================================
Private Type toastData
    Title As String
    Message As String
    Level As String
    timeout As Long
    Position As String
    LinkUrl As String
    CallbackMacro As String
    Icon As String
    ImagePath As String
    Progress As Long
End Type

' === VERSION & CONFIGURATION =========================================
Public Const MSGBOX_VERSION As String = "1.0.2"
Public Const MSGBOX_DATE As String = "2025-10-24"
Private Const DEFAULT_TIMEOUT As Long = 5
Private Const MAX_RETRIES As Long = 3
Private Const PIPE_TIMEOUT As Long = 3000 ' milliseconds
Private Const ALWAYS_WRITE_TEMP As Boolean = False

' === GLOBAL SETTINGS =================================================
Public MsgBoxUnified_UsePowerShellToasts As Boolean
Public MsgBoxUnified_UseWinRTToasts As Boolean
Public MsgBoxUnified_UseAutoFallback As Boolean
Public MsgBoxUnified_VerboseLogging As Boolean
Public MsgBoxUnified_ToastPipeName As String
Public MsgBoxUnified_UseTempJsonFallback As Boolean

' === PATH RESOLUTION =================================================
Private m_PSScriptPath As String

Public Property Get PSScriptPath() As String
    If m_PSScriptPath = "" Then
        m_PSScriptPath = Setup.TEMP_FOLDER & "\ToastListener.ps1"
        If Dir(m_PSScriptPath) = "" Then
            Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
            Dim ts As Object: Set ts = fso.CreateTextFile(m_PSScriptPath, True)
            ts.WriteLine "$listener = New-Object System.Net.HttpListener"
            ts.WriteLine "$listener.Prefixes.Add('http://localhost:8765/toast/')"
            ts.WriteLine "$listener.Start()"
            ts.WriteLine "while ($listener.IsListening) {"
            ts.WriteLine "  $context = $listener.GetContext()"
            ts.WriteLine "  $reader = New-Object IO.StreamReader($context.Request.InputStream)"
            ts.WriteLine "  $data = $reader.ReadToEnd()"
            ts.WriteLine "  Write-Host ""Received: "" $data"
            ts.WriteLine "  $json = $data | ConvertFrom-Json"
            ts.WriteLine "  Import-Module BurntToast"
            ts.WriteLine "  $sound = switch ($json.Level) {"
            ts.WriteLine "    'ERROR' { 'Critical'; break }"
            ts.WriteLine "    'WARN' { 'Mail'; break }"
            ts.WriteLine "    default { 'Default' }"
            ts.WriteLine "  }"
            ts.WriteLine "  New-BurntToastNotification -AppId 'Excel VBA Toast' -Text $json.Title, $json.Message -Sound $sound"
            ts.WriteLine "  $response = $context.Response"
            ts.WriteLine "  $buffer = [System.Text.Encoding]::UTF8.GetBytes('OK')"
            ts.WriteLine "  $response.OutputStream.Write($buffer,0,$buffer.Length)"
            ts.WriteLine "  $response.OutputStream.Close()"
            ts.WriteLine "}"
            ts.Close
            Logs.DebugLog "[MsgBoxUnified] Generated PowerShell listener script: " & m_PSScriptPath, "INFO"
        End If
    End If
    PSScriptPath = m_PSScriptPath
End Property

Public Property Let PSScriptPath(ByVal Value As String)
    m_PSScriptPath = Value
End Property

' === INITIALIZATION ==================================================
Public Sub Initialize(Optional ByVal EnablePS As Boolean = True, _
                      Optional ByVal EnableWinRT As Boolean = False, _
                      Optional ByVal EnableFallback As Boolean = True, _
                      Optional ByVal pipeName As String = "")
    MsgBoxUnified_UsePowerShellToasts = EnablePS
    MsgBoxUnified_UseWinRTToasts = EnableWinRT
    MsgBoxUnified_UseAutoFallback = EnableFallback
    MsgBoxUnified_UseTempJsonFallback = True
    MsgBoxUnified_VerboseLogging = True
    If pipeName = "" Then
        MsgBoxUnified_ToastPipeName = "\\.\pipe\ExcelToastPipe"
    Else
        MsgBoxUnified_ToastPipeName = pipeName
    End If
    Logs.DebugLog "[MsgBoxUnified] Initialized v" & MSGBOX_VERSION & _
                  ", EnablePS=" & EnablePS & ", EnableWinRT=" & EnableWinRT & _
                  ", EnableFallback=" & EnableFallback & ", PipeName=" & pipeName, "INFO"
End Sub

' === MAIN API ========================================================
Public Function Notify(ByVal Title As String, _
                       ByVal Message As String, _
                       Optional ByVal Level As String = "INFO", _
                       Optional ByVal timeout As Long = DEFAULT_TIMEOUT, _
                       Optional ByVal Position As String = "BR", _
                       Optional ByVal LinkUrl As String = "", _
                       Optional ByVal CallbackMacro As String = "", _
                       Optional ByVal Icon As String = "", _
                       Optional ByVal ImagePath As String = "") As Boolean
    
    On Error GoTo ErrorHandler
    
    Dim Toast As toastData
    Toast.Title = Title
    Toast.Message = Message
    Toast.Level = UCase$(Level)
    Toast.timeout = timeout
    Toast.Position = UCase$(Position)
    Toast.LinkUrl = LinkUrl
    Toast.CallbackMacro = CallbackMacro
    Toast.Icon = Icon
    Toast.ImagePath = ImagePath
    Toast.Progress = -1
    
    If ALWAYS_WRITE_TEMP Then WriteTempJson Toast
    
    If MsgBoxUnified_UseWinRTToasts Then
        MsgBoxWinRT.ShowToast Title, Message, Level, timeout, Position, ImagePath, CallbackMacro
        Logs.DebugLog "[MsgBoxUnified] Delivered via WinRT: " & Title, "INFO"
        Notify = True
        Exit Function
    End If
    
    If MsgBoxUI_UsePythonToasts Then
        If MsgBoxPython.SendPythonNotification(Title, Message, "", timeout, Position, ImagePath) Then
            Logs.DebugLog "[MsgBoxUnified] Delivered via Python: " & Title, "INFO"
            Notify = True
            Exit Function
        End If
    End If
    
    If MsgBoxUnified_UsePowerShellToasts And IsListenerRunning() Then
        If DeliverViaPipe(Toast) Then
            Logs.DebugLog "[MsgBoxUnified] Delivered via pipe: " & Title, "INFO"
            Notify = True
            Exit Function
        End If
    End If
    
    If MsgBoxUnified_UseAutoFallback Then
        If DeliverViaMSHTA(Toast) Then
            Logs.DebugLog "[MsgBoxUnified] Delivered via MSHTA: " & Title, "INFO"
            Notify = True
            Exit Function
        End If
        MsgBox Message, vbInformation, Title
        Logs.DebugLog "[MsgBoxUnified] Delivered via MsgBox: " & Title, "INFO"
        Notify = True
    End If
    
    Exit Function
    
ErrorHandler:
    Logs.DebugLog "[MsgBoxUnified] Notify error: " & Err.Description, "ERROR"
    Notify = False
End Function

' === PROGRESS =======================================================
Public Function Progress(ByVal Title As String, _
                         ByVal Message As String, _
                         ByVal Percent As Long, _
                         Optional ByVal Position As String = "BR") As String
    
    On Error GoTo ErrorHandler
    
    If Percent < 0 Then Percent = 0
    If Percent > 100 Then Percent = 100
    
    Dim Toast As toastData
    Toast.Title = Title
    Toast.Message = Message & " [" & Percent & "%]"
    Toast.Level = "PROGRESS"
    Toast.timeout = 0
    Toast.Position = UCase$(Position)
    Toast.Progress = Percent
    
    Dim ProgressFile As String
    ProgressFile = Setup.TEMP_FOLDER & "\ExcelToasts\Progress_" & Format(Now, "yyyymmddhhnnss") & ".json"
    
    Dim json As String
    json = ToastToJson(Toast)
    WriteTextFile ProgressFile, json
    
    If ALWAYS_WRITE_TEMP Then WriteTempJson Toast
    
    If MsgBoxUnified_UseWinRTToasts Then
        MsgBoxWinRT.ShowProgressToast Title, Message, Percent, 0, ""
        Logs.DebugLog "[MsgBoxUnified] Delivered progress via WinRT: " & Title, "INFO"
        Progress = ProgressFile
        Exit Function
    End If
    
    If MsgBoxUI_UsePythonToasts Then
        If MsgBoxPython.SendPythonNotification(Title, Message & " [" & Percent & "%]", "", 0, Position, "") Then
            Logs.DebugLog "[MsgBoxUnified] Delivered progress via Python: " & Title, "INFO"
            Progress = ProgressFile
            Exit Function
        End If
    End If
    
    If MsgBoxUnified_UsePowerShellToasts And IsListenerRunning() Then
        If DeliverViaPipe(Toast, ProgressFile) Then
            Logs.DebugLog "[MsgBoxUnified] Delivered progress via pipe: " & Title, "INFO"
            Progress = ProgressFile
            Exit Function
        End If
    End If
    
    If DeliverViaMSHTAProgress(Toast, ProgressFile) Then
        Logs.DebugLog "[MsgBoxUnified] Delivered progress via MSHTA: " & Title, "INFO"
        Progress = ProgressFile
        Exit Function
    End If
    
    Progress = ""
    Exit Function
    
ErrorHandler:
    Logs.DebugLog "[MsgBoxUnified] Progress error: " & Err.Description, "ERROR"
    Progress = ""
End Function

' === LISTENER CONTROL ===============================================
Public Function StartToastListener() As Boolean
    On Error GoTo ErrorHandler
    
    If IsListenerRunning() Then
        Logs.DebugLog "[MsgBoxUnified] Listener already running", "INFO"
        StartToastListener = True
        Exit Function
    End If
    
    Dim psPath As String
    psPath = PSScriptPath
    If psPath = "" Then
        Logs.DebugLog "[MsgBoxUnified] ToastListener.ps1 not found", "ERROR"
        StartToastListener = False
        Exit Function
    End If
    
    Dim cmd As String
    cmd = "powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & psPath & """"
    shell cmd, vbHide
    
    Dim i As Long
    For i = 1 To 50
        If IsListenerRunning() Then
            Logs.DebugLog "[MsgBoxUnified] Listener started successfully", "INFO"
            StartToastListener = True
            Exit Function
        End If
        Sleep 100
    Next
    
    Logs.DebugLog "[MsgBoxUnified] Listener failed to start", "ERROR"
    StartToastListener = False
    Exit Function
    
ErrorHandler:
    Logs.DebugLog "[MsgBoxUnified] StartToastListener error: " & Err.Description, "ERROR"
    StartToastListener = False
End Function

Public Sub StopToastListener()
    On Error Resume Next
    
    ' Send exit signal via flag file
    Dim exitFlag As String
    exitFlag = Setup.TEMP_FOLDER & "\ExcelToasts\ExitListener.flag"
    WriteTextFile exitFlag, "EXIT"
    
    ' Wait for shutdown
    Dim i As Long
    For i = 1 To 30
        If Not IsListenerRunning() Then
            Logs.DebugLog "[MsgBoxUnified] Listener stopped successfully", "INFO"
            Exit Sub
        End If
        Sleep 100
    Next
    
    ' Force kill if still running
    shell "taskkill /F /FI ""WINDOWTITLE eq *ToastListener*""", vbHide
    Logs.DebugLog "[MsgBoxUnified] Force-killed listener", "WARN"
End Sub

Public Function IsListenerRunning() As Boolean
    On Error Resume Next
    
    ' Check sentinel file timestamp
    Dim sentinelFile As String
    sentinelFile = Setup.TEMP_FOLDER & "\ExcelToasts\ListenerHeartbeat.txt"
    
    If Dir(sentinelFile) = "" Then
        IsListenerRunning = False
        Exit Function
    End If
    
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    Dim lastMod As Date
    lastMod = fso.GetFile(sentinelFile).DateLastModified
    
    ' Listener should update every 5 seconds
    IsListenerRunning = (DateDiff("s", lastMod, Now) < 10)
    If IsListenerRunning Then
        Logs.DebugLog "[MsgBoxUnified] Listener running", "INFO"
    Else
        Logs.DebugLog "[MsgBoxUnified] Listener not running", "WARN"
    End If
End Function

Public Function PowershellListenerRunning() As Boolean
    PowershellListenerRunning = IsListenerRunning()
End Function

' === PYTHON LISTENER CONTROL =========================================
Public Sub StartPythonListener()
    On Error Resume Next
    Logs.DebugLog "[MsgBoxUnified] Starting Python listener...", "INFO"
    If MsgBoxUnified_UseWinRTToasts Then
        MsgBoxWinRT.EnsurePythonListenerRunning
        Logs.DebugLog "[MsgBoxUnified] Python listener started via MsgBoxWinRT", "INFO"
    Else
        MsgBoxPython.StartPythonDaemon
        Logs.DebugLog "[MsgBoxUnified] Python listener started via MsgBoxPython", "INFO"
    End If
End Sub

Public Sub StopPythonListener()
    On Error Resume Next
    Logs.DebugLog "[MsgBoxUnified] Stopping Python listener...", "INFO"
    shell "taskkill /F /IM python.exe /FI ""WINDOWTITLE eq *listener*""", vbHide
    Logs.DebugLog "[MsgBoxUnified] Python listener stopped", "INFO"
End Sub

' === DELIVERY METHODS ================================================
Private Function DeliverViaPipe(ByRef Toast As toastData, _
                               Optional ByVal ProgressFile As String = "") As Boolean
    On Error GoTo ErrorHandler
    
    Dim json As String
    json = ToastToJson(Toast)
    If ProgressFile <> "" Then
        json = Left$(json, Len(json) - 1) & ",""ProgressFile"":""" & MsgBoxUniversal.EscapeJson(ProgressFile) & """}"
    End If
    
    Dim retries As Long
    For retries = 1 To MAX_RETRIES
        If WritePipe(MsgBoxUnified_ToastPipeName, json) Then
            Logs.DebugLog "[MsgBoxUnified] Delivered via pipe (attempt " & retries & ")", "INFO"
            DeliverViaPipe = True
            Exit Function
        End If
        Sleep 500
    Next
    
    Logs.DebugLog "[MsgBoxUnified] Pipe delivery failed after " & MAX_RETRIES & " attempts", "ERROR"
    DeliverViaPipe = False
    Exit Function
    
ErrorHandler:
    Logs.DebugLog "[MsgBoxUnified] DeliverViaPipe error: " & Err.Description, "ERROR"
    DeliverViaPipe = False
End Function

Private Function DeliverViaMSHTA(ByRef Toast As toastData) As Boolean
    On Error GoTo ErrorHandler
    Dim HTAPath As String
    HTAPath = Setup.TEMP_FOLDER & "\ExcelToasts\Toast_" & Format(Now, "yyyymmddhhnnss") & ".hta"
    WriteTextFile HTAPath, BuildToastHTA(Toast)
    shell "mshta.exe """ & HTAPath & """", vbHide
    DeliverViaMSHTA = True
    Exit Function
ErrorHandler:
    Logs.DebugLog "[MsgBoxUnified] DeliverViaMSHTA error: " & Err.Description, "ERROR"
    DeliverViaMSHTA = False
End Function

Private Function DeliverViaMSHTAProgress(ByRef Toast As toastData, ByVal ProgressFile As String) As Boolean
    On Error GoTo ErrorHandler
    Dim HTAPath As String
    HTAPath = Setup.TEMP_FOLDER & "\ExcelToasts\ProgressToast_" & Format(Now, "yyyymmddhhnnss") & ".hta"
    WriteTextFile HTAPath, BuildProgressHTA(Toast, ProgressFile)
    shell "mshta.exe """ & HTAPath & """", vbHide
    DeliverViaMSHTAProgress = True
    Exit Function
ErrorHandler:
    Logs.DebugLog "[MsgBoxUnified] DeliverViaMSHTAProgress error: " & Err.Description, "ERROR"
    DeliverViaMSHTAProgress = False
End Function

' === BUILDERS ========================================================
Private Function BuildToastHTA(ByRef Toast As toastData) As String
    Dim html As String, bgColor As String, textColor As String, iconChar As String
    
    Select Case Toast.Level
        Case "WARN", "WARNING"
            bgColor = "linear-gradient(135deg, #ffeb3b, #ffa000)"
            textColor = "#000000"
            iconChar = "?"
        Case "ERROR"
            bgColor = "linear-gradient(135deg, #ff6b6b, #d32f2f)"
            textColor = "#ffffff"
            iconChar = "?"
        Case Else
            bgColor = "linear-gradient(135deg, #4caf50, #2e7d32)"
            textColor = "#ffffff"
            iconChar = "?"
    End Select
    
    If Toast.Icon <> "" Then iconChar = Toast.Icon
    
    Dim posX As Long, posY As Long
    CalculatePosition Toast.Position, posX, posY
    
    html = "<!DOCTYPE html><html><head><meta charset='UTF-8'>" & vbCrLf
    html = html & "<title>" & MsgBoxUniversal.EscapeHTML(Toast.Title) & "</title>" & vbCrLf
    html = html & "<HTA:APPLICATION BORDER='none' CAPTION='no' SHOWINTASKBAR='no' " & _
           "SYSMENU='no' SCROLL='no' SINGLEINSTANCE='no'>" & vbCrLf
    html = html & "<style>body{margin:0;padding:12px;font-family:'Segoe UI',Arial;" & _
           "background:" & bgColor & ";color:" & textColor & ";border-radius:8px;" & _
           "box-shadow:0 4px 16px rgba(0,0,0,0.4);animation:slideIn 0.4s ease-out;}" & _
           "h3{margin:0 0 8px;font-size:18px;font-weight:600;}" & _
           ".icon{font-size:24px;margin-right:8px;}" & _
           "p{margin:0;font-size:14px;line-height:1.4;}" & _
           "button{margin-top:10px;padding:6px 12px;border:none;border-radius:4px;" & _
           "background:rgba(255,255,255,0.2);color:" & textColor & ";cursor:pointer;font-size:12px;}" & _
           "button:hover{background:rgba(255,255,255,0.3);}</style>" & vbCrLf
    html = html & "<script>window.resizeTo(370,170);" & vbCrLf
    html = html & "window.moveTo(" & posX & "," & posY & ");" & vbCrLf
    If Toast.timeout > 0 Then
        html = html & "setTimeout(function(){document.body.style.animation='slideOut 0.3s ease-in';" & _
               "setTimeout(function(){window.close();},300);}," & (Toast.timeout * 1000) & ");" & vbCrLf
    End If
    If Toast.LinkUrl <> "" Then
        html = html & "function openLink(){window.open('" & MsgBoxUniversal.EscapeJson(Toast.LinkUrl) & "');}" & vbCrLf
    End If
    html = html & "function dismiss(){document.body.style.animation='slideOut 0.3s ease-in';" & _
           "setTimeout(function(){window.close();},300);}</script></head><body>" & vbCrLf
    html = html & "<h3><span class='icon'>" & iconChar & "</span>" & MsgBoxUniversal.EscapeHTML(Toast.Title) & "</h3>" & vbCrLf
    html = html & "<p>" & MsgBoxUniversal.EscapeHTML(Toast.Message) & "</p>" & vbCrLf
    If Toast.ImagePath <> "" Then
        html = html & "<img src='" & MsgBoxUniversal.EscapeHTML(Toast.ImagePath) & "' style='max-width:50px;max-height:50px;margin-top:10px;' />" & vbCrLf
    End If
    If Toast.LinkUrl <> "" Then html = html & "<button onclick='openLink()'>Open Link</button>" & vbCrLf
    html = html & "<button onclick='dismiss()'>Dismiss</button>" & vbCrLf
    html = html & "</body></html>"
    
    BuildToastHTA = html
End Function

Private Function BuildProgressHTA(ByRef Toast As toastData, ByVal ProgressFile As String) As String
    BuildProgressHTA = BuildToastHTA(Toast)
End Function

Private Function ToastToJson(ByRef Toast As toastData) As String
    Dim json As String
    json = "{" & _
           """Title"":""" & MsgBoxUniversal.EscapeJson(Toast.Title) & """," & _
           """Message"":""" & MsgBoxUniversal.EscapeJson(Toast.Message) & """," & _
           """Level"":""" & MsgBoxUniversal.EscapeJson(Toast.Level) & """," & _
           """Timeout"":" & Toast.timeout & "," & _
           """Position"":""" & MsgBoxUniversal.EscapeJson(Toast.Position) & """," & _
           """LinkUrl"":""" & MsgBoxUniversal.EscapeJson(Toast.LinkUrl) & """," & _
           """CallbackMacro"":""" & MsgBoxUniversal.EscapeJson(Toast.CallbackMacro) & """," & _
           """Icon"":""" & MsgBoxUniversal.EscapeJson(Toast.Icon) & """," & _
           """ImagePath"":""" & MsgBoxUniversal.EscapeJson(Toast.ImagePath) & """"
    If Toast.Progress >= 0 Then json = json & ",""Progress"":" & Toast.Progress
    json = json & "}"
    ToastToJson = json
End Function

Private Sub WriteTempJson(ByRef Toast As toastData)
    Dim tempFile As String
    tempFile = Setup.TEMP_FOLDER & "\ExcelToasts\Toast_" & Format(Now, "yyyymmddhhnnss") & ".json"
    WriteTextFile tempFile, ToastToJson(Toast)
End Sub

Private Sub WriteTextFile(ByVal filePath As String, ByVal content As String)
    Dim fso As Object, ts As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    If Not fso.FolderExists(Setup.TEMP_FOLDER & "\ExcelToasts") Then
        fso.CreateFolder Setup.TEMP_FOLDER & "\ExcelToasts"
    End If
    Set ts = fso.CreateTextFile(filePath, True, True)
    ts.Write content
    ts.Close
    Logs.DebugLog "[MsgBoxUnified] Wrote file: " & filePath, "INFO"
End Sub

Private Sub CalculatePosition(ByVal pos As String, ByRef x As Long, ByRef y As Long)
    Const MARGIN As Long = 20
    Const TOAST_W As Long = 350
    Const TOAST_H As Long = 150
    Dim screenW As Long: screenW = 1920
    Dim screenH As Long: screenH = 1080
    Select Case pos
        Case "TL": x = MARGIN: y = MARGIN
        Case "TR": x = screenW - TOAST_W - MARGIN: y = MARGIN
        Case "BL": x = MARGIN: y = screenH - TOAST_H - MARGIN
        Case "BR": x = screenW - TOAST_W - MARGIN: y = screenH - TOAST_H - MARGIN
        Case "CR": x = screenW - TOAST_W - MARGIN: y = (screenH - TOAST_H) / 2
        Case "C": x = (screenW - TOAST_W) / 2: y = (screenH - TOAST_H) / 2
        Case Else: x = screenW - TOAST_W - MARGIN: y = screenH - TOAST_H - MARGIN
    End Select
End Sub

Private Function WritePipe(ByVal pipeName As String, ByVal Message As String) As Boolean
    On Error GoTo ErrHandler
    Dim tmpFile As String
    tmpFile = Setup.TEMP_FOLDER & "\ExcelToasts\pipe_msg_" & Format(Now, "yyyymmddhhnnss") & ".json"
    WriteTextFile tmpFile, Message
    
    Dim cmd As String
    cmd = "powershell -Command ""$pipe=new-object System.IO.Pipes.NamedPipeClientStream('.', '" & pipeName & "', 'Out');" & _
          "$pipe.Connect();[byte[]]$b=[System.Text.Encoding]::UTF8.GetBytes((Get-Content '" & tmpFile & "' -Raw));" & _
          "$pipe.Write($b,0,$b.Length);$pipe.Close();"""
    shell cmd, vbHide
    WritePipe = True
    Logs.DebugLog "[MsgBoxUnified] Wrote pipe message: " & tmpFile, "INFO"
    Exit Function
ErrHandler:
    Logs.DebugLog "[MsgBoxUnified] WritePipe error: " & Err.Description, "ERROR"
    WritePipe = False
End Function

Public Function GetSystemInfo() As String
    Dim info As String
    info = "=== MsgBoxUnified System Info ===" & vbCrLf
    info = info & "Version: " & MSGBOX_VERSION & vbCrLf
    info = info & "Date: " & MSGBOX_DATE & vbCrLf
    info = info & "Listener Running: " & IsListenerRunning() & vbCrLf
    info = info & "PS Mode Enabled: " & MsgBoxUnified_UsePowerShellToasts & vbCrLf
    info = info & "WinRT Mode Enabled: " & MsgBoxUnified_UseWinRTToasts & vbCrLf
    info = info & "Auto Fallback: " & MsgBoxUnified_UseAutoFallback & vbCrLf
    info = info & "Verbose Logging: " & MsgBoxUnified_VerboseLogging & vbCrLf
    info = info & "PS Script: " & PSScriptPath & vbCrLf
    info = info & "Temp Folder: " & Setup.TEMP_FOLDER & vbCrLf
    info = info & "Pipe Name: " & MsgBoxUnified_ToastPipeName
    GetSystemInfo = info
End Function

Public Sub CleanupTempFiles()
    On Error Resume Next
    Dim fso As Object, folder As Object, file As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    If Not fso.FolderExists(Setup.TEMP_FOLDER & "\ExcelToasts") Then Exit Sub
    Set folder = fso.GetFolder(Setup.TEMP_FOLDER & "\ExcelToasts")
    
    For Each file In folder.Files
        ' Delete files older than 24 hours
        If DateDiff("h", file.DateLastModified, Now) > 24 Then
            file.Delete True
            Logs.DebugLog "[MsgBoxUnified] Deleted old file: " & file.path, "INFO"
        End If
    Next
End Sub




