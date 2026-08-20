Attribute VB_Name = "MsgBoxPushBullet"
'***************************************************************
' Module: MsgBoxPushBullet
' Version: 2.2
' Purpose: Send Excel toast notifications to mobile devices via Pushbullet API
' Author: Keith Swerling + Claude
' Dependencies: Setup.bas (v1.8), Logs.bas (v1.0.3), Credentials.bas (v1.1)
' Changes:
'   - v2.2: Moved Push2Run integration to separate Push2Run.bas module
'   - v2.1: Added early validation, ShowErrorMsg parameter, Push2Run integration
'   - v2.0: Integrated Windows Credential Manager for secure API key storage
'   - v1.0: Initial version with file-based storage
' Features:
'   - Secure API key storage in Windows Credential Manager
'   - Send push notifications to mobile devices (iOS, Android)
'   - Support for title, message, and URLs
'   - Device targeting (all devices or specific device)
'   - Push history tracking
'   - Error handling and retry logic
' Setup:
'   1. Get free API key from https://www.pushbullet.com/#settings/account
'   2. Run PushbulletSetupWizard or call SetPushbulletAPIKey("your_api_key_here")
'   3. Use SendPush() to send notifications
'   4. Optional: For voice commands, see Push2Run.bas module
' Updated: 2025-10-29
'***************************************************************
Option Explicit

'=========================
' CONFIGURATION
'=========================
Private Const PUSHBULLET_API_URL As String = "https://api.pushbullet.com/v2/pushes"
Private Const CREDENTIAL_TARGET As String = "ExcelVBA:PushbulletAPI"
Private Const HISTORY_FILE As String = "PushbulletHistory.json"
Private Const MAX_RETRIES As Long = 3
Private Const RETRY_DELAY_MS As Long = 1000

Private m_APIKey As String
Private m_Enabled As Boolean

'=========================
' API KEY MANAGEMENT (Windows Credential Manager)
'=========================

' Set the Pushbullet API key (stores securely in Credential Manager)
Public Sub SetPushbulletAPIKey(ByVal apiKey As String)
    On Error GoTo ErrHandler
    
    If Len(Trim(apiKey)) = 0 Then
        Logs.LogError "[MsgBoxPushBullet] API key cannot be empty"
        MsgBox "API key cannot be empty!", vbExclamation, "Pushbullet Setup"
        Exit Sub
    End If
    
    ' Save to Windows Credential Manager
    If Credentials.SaveCredential(CREDENTIAL_TARGET, apiKey, "Pushbullet") Then
        m_APIKey = apiKey
        m_Enabled = True
        
        Logs.LogInfo "[MsgBoxPushBullet] API key saved securely to Credential Manager"
        MsgBox "Pushbullet API key saved securely!" & vbCrLf & vbCrLf & _
               "Stored in: Windows Credential Manager" & vbCrLf & _
               "Target: " & CREDENTIAL_TARGET & vbCrLf & vbCrLf & _
               "You can now send notifications to your mobile devices.", _
               vbInformation, "Setup Complete"
    Else
        Logs.LogError "[MsgBoxPushBullet] Failed to save API key to Credential Manager"
        MsgBox "Failed to save API key. Check Windows Credential Manager access.", _
               vbExclamation, "Setup Failed"
    End If
    Exit Sub

ErrHandler:
    Logs.LogError "[MsgBoxPushBullet] SetPushbulletAPIKey error: " & Err.Description
    MsgBox "Error saving API key: " & Err.Description, vbCritical, "Setup Error"
End Sub

' Load API key from Credential Manager
Private Sub LoadAPIKey()
    On Error Resume Next
    
    If Len(m_APIKey) > 0 Then Exit Sub ' Already loaded
    
    ' Read from Windows Credential Manager
    m_APIKey = Credentials.ReadCredential(CREDENTIAL_TARGET)
    
    If Len(m_APIKey) > 0 Then
        m_Enabled = True
        Logs.LogInfo "[MsgBoxPushBullet] API key loaded from Credential Manager"
    Else
        m_Enabled = False
        Logs.LogWarn "[MsgBoxPushBullet] No API key found in Credential Manager"
    End If
End Sub

' Clear API key and disable Pushbullet
Public Sub ClearPushbulletAPIKey()
    On Error Resume Next
    
    ' Remove from Credential Manager
    If Credentials.DeleteCredential(CREDENTIAL_TARGET) Then
        m_APIKey = ""
        m_Enabled = False
        Logs.LogInfo "[MsgBoxPushBullet] API key removed from Credential Manager"
        MsgBox "Pushbullet API key removed from Windows Credential Manager.", _
               vbInformation, "Pushbullet"
    Else
        MsgBox "No API key found or failed to remove.", vbExclamation, "Pushbullet"
    End If
End Sub

' Open Windows Credential Manager
Public Sub OpenCredentialManager()
    On Error Resume Next
    Credentials.OpenCredentialManager
End Sub

'=========================
' ENABLE/DISABLE
'=========================

Public Sub EnablePushbullet()
    LoadAPIKey
    If Len(m_APIKey) = 0 Then
        MsgBox "No API key found in Credential Manager." & vbCrLf & vbCrLf & _
               "Please run the setup wizard to configure Pushbullet.", _
               vbExclamation, "Pushbullet"
        Exit Sub
    End If
    m_Enabled = True
    Logs.LogInfo "[MsgBoxPushBullet] Pushbullet enabled"
End Sub

Public Sub DisablePushbullet()
    m_Enabled = False
    Logs.LogInfo "[MsgBoxPushBullet] Pushbullet disabled"
End Sub

Public Function IsPushbulletEnabled() As Boolean
    ' Load API key if not already loaded
    If Len(m_APIKey) = 0 Then
        LoadAPIKey
    End If
    
    ' Return enabled status
    IsPushbulletEnabled = m_Enabled And Len(m_APIKey) > 0
End Function

'=========================
' SEND PUSH NOTIFICATION
'=========================

' Send a push notification to mobile device(s)
Public Function SendPush( _
    ByVal Title As String, _
    ByVal Message As String, _
    Optional ByVal Url As String = "", _
    Optional ByVal DeviceIden As String = "", _
    Optional ByVal PushType As String = "note", _
    Optional ByVal ShowErrorMsg As Boolean = False) As Boolean
    
    On Error GoTo ErrHandler
    
    ' Early validation - don't even try if not configured
    If Not IsPushbulletEnabled() Then
        Logs.LogWarn "[MsgBoxPushBullet] Pushbullet not configured - skipping push: " & Title
        SendPush = False
        
        If ShowErrorMsg Then
            MsgBox "Pushbullet is not configured." & vbCrLf & vbCrLf & _
                   "Run PushbulletSetupWizard to set up mobile notifications.", _
                   vbExclamation, "Pushbullet Not Configured"
        End If
        Exit Function
    End If
    
    ' Validate inputs
    If Len(Trim(Title)) = 0 Then
        Logs.LogWarn "[MsgBoxPushBullet] Cannot send push with empty title"
        SendPush = False
        Exit Function
    End If
    
    ' Build JSON payload
    Dim json As String
    json = "{"
    json = json & """type"":""" & PushType & ""","
    json = json & """title"":""" & EscapeJson(Title) & ""","
    json = json & """body"":""" & EscapeJson(Message) & """"
    
    If Len(Url) > 0 Then
        json = json & ",""url"":""" & EscapeJson(Url) & """"
    End If
    
    If Len(DeviceIden) > 0 Then
        json = json & ",""device_iden"":""" & DeviceIden & """"
    End If
    
    json = json & "}"
    
    Logs.LogDebug "[MsgBoxPushBullet] Sending push: " & Title
    
    ' Send via HTTP POST with retry logic
    Dim retryCount As Long
    For retryCount = 1 To MAX_RETRIES
        If SendHTTPRequest(json) Then
            SendPush = True
            LogPushHistory Title, Message, Url, "SUCCESS"
            Logs.LogInfo "[MsgBoxPushBullet] Push sent successfully: " & Title
            Exit Function
        End If
        
        If retryCount < MAX_RETRIES Then
            Logs.LogWarn "[MsgBoxPushBullet] Retry " & retryCount & " of " & MAX_RETRIES
            Sleep RETRY_DELAY_MS
        End If
    Next retryCount
    
    SendPush = False
    LogPushHistory Title, Message, Url, "FAILED"
    Logs.LogError "[MsgBoxPushBullet] Push failed after " & MAX_RETRIES & " retries"
    Exit Function

ErrHandler:
    SendPush = False
    LogPushHistory Title, Message, Url, "ERROR: " & Err.Description
    Logs.LogError "[MsgBoxPushBullet] SendPush error: " & Err.Description
End Function

' Send HTTP POST request to Pushbullet API
Private Function SendHTTPRequest(ByVal jsonPayload As String) As Boolean
    On Error GoTo ErrHandler
    
    Dim http As Object
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    
    ' Set timeout to 10 seconds
    http.setTimeouts 10000, 10000, 10000, 10000
    
    http.Open "POST", PUSHBULLET_API_URL, False
    http.setRequestHeader "Access-Token", m_APIKey
    http.setRequestHeader "Content-Type", "application/json"
    http.Send jsonPayload
    
    If http.Status = 200 Then
        Logs.LogDebug "[MsgBoxPushBullet] HTTP 200 OK"
        SendHTTPRequest = True
    Else
        Logs.LogError "[MsgBoxPushBullet] HTTP " & http.Status & ": " & http.responseText
        SendHTTPRequest = False
    End If
    
    Exit Function

ErrHandler:
    Logs.LogError "[MsgBoxPushBullet] SendHTTPRequest error: " & Err.Description
    SendHTTPRequest = False
End Function

'=========================
' DEVICE MANAGEMENT
'=========================

' Get list of devices (returns JSON array as string)
Public Function GetDevices() As String
    On Error GoTo ErrHandler
    
    LoadAPIKey
    
    If Not m_Enabled Or Len(m_APIKey) = 0 Then
        GetDevices = "[]"
        Exit Function
    End If
    
    Dim http As Object
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    
    http.Open "GET", "https://api.pushbullet.com/v2/devices", False
    http.setRequestHeader "Access-Token", m_APIKey
    http.Send
    
    If http.Status = 200 Then
        GetDevices = http.responseText
        Logs.LogInfo "[MsgBoxPushBullet] Retrieved devices list"
    Else
        GetDevices = "[]"
        Logs.LogError "[MsgBoxPushBullet] GetDevices HTTP " & http.Status
    End If
    
    Exit Function

ErrHandler:
    GetDevices = "[]"
    Logs.LogError "[MsgBoxPushBullet] GetDevices error: " & Err.Description
End Function

' Show devices in a message box
Public Sub ShowDevices()
    On Error GoTo ErrHandler
    
    Dim devicesJson As String
    devicesJson = GetDevices()
    
    If devicesJson = "[]" Then
        MsgBox "No devices found or error retrieving devices.", vbExclamation, "Pushbullet Devices"
        Exit Sub
    End If
    
    ' Simple parsing to extract device info
    Dim msg As String
    msg = "Connected Devices:" & vbCrLf & vbCrLf
    
    Dim pos As Long, deviceStart As Long
    pos = 1
    Do
        deviceStart = InStr(pos, devicesJson, """nickname"":")
        If deviceStart = 0 Then Exit Do
        
        Dim nameStart As Long, nameEnd As Long
        nameStart = InStr(deviceStart, devicesJson, """") + 1
        nameStart = InStr(nameStart, devicesJson, """") + 1
        nameEnd = InStr(nameStart, devicesJson, """")
        
        If nameEnd > nameStart Then
            msg = msg & "• " & Mid(devicesJson, nameStart, nameEnd - nameStart) & vbCrLf
        End If
        
        pos = nameEnd + 1
    Loop While pos < Len(devicesJson)
    
    If Len(msg) < 30 Then
        msg = "Unable to parse device list." & vbCrLf & vbCrLf & devicesJson
    End If
    
    MsgBox msg, vbInformation, "Pushbullet Devices"
    Exit Sub

ErrHandler:
    MsgBox "Error retrieving devices: " & Err.Description, vbCritical, "Error"
End Sub

'=========================
' PUSH HISTORY
'=========================

Private Sub LogPushHistory(ByVal Title As String, ByVal Message As String, ByVal Url As String, ByVal Status As String)
    On Error Resume Next
    
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim historyPath As String: historyPath = Setup.GetTempFolder() & "\" & HISTORY_FILE
    
    Dim historyJson As String
    If fso.FileExists(historyPath) Then
        Dim ts As Object: Set ts = fso.OpenTextFile(historyPath, 1, False, -1)
        historyJson = ts.ReadAll
        ts.Close
        
        ' Remove closing bracket
        If Right(historyJson, 1) = "]" Then
            historyJson = Left(historyJson, Len(historyJson) - 1)
            If Right(historyJson, 1) <> "[" Then historyJson = historyJson & ","
        End If
    Else
        historyJson = "["
    End If
    
    ' Add new entry
    Dim entry As String
    entry = "{"
    entry = entry & """timestamp"":""" & Format(Now, "yyyy-mm-dd hh:nn:ss") & ""","
    entry = entry & """title"":""" & EscapeJson(Title) & ""","
    entry = entry & """message"":""" & EscapeJson(Message) & ""","
    entry = entry & """url"":""" & EscapeJson(Url) & ""","
    entry = entry & """status"":""" & Status & """"
    entry = entry & "}"
    
    historyJson = historyJson & entry & "]"
    
    ' Write back
    Set ts = fso.CreateTextFile(historyPath, True, True)
    ts.Write historyJson
    ts.Close
End Sub

Public Sub ShowPushHistory()
    On Error GoTo ErrHandler
    
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim historyPath As String: historyPath = Setup.GetTempFolder() & "\" & HISTORY_FILE
    
    If Not fso.FileExists(historyPath) Then
        MsgBox "No push history found.", vbInformation, "Push History"
        Exit Sub
    End If
    
    Dim ts As Object: Set ts = fso.OpenTextFile(historyPath, 1, False, -1)
    Dim historyJson As String: historyJson = ts.ReadAll
    ts.Close
    
    ' Simple parsing to show last 10 entries
    Dim msg As String
    msg = "Recent Push Notifications:" & vbCrLf & vbCrLf
    
    Dim entries() As String
    entries = Split(historyJson, "},{")
    
    Dim i As Long, startIdx As Long
    startIdx = IIf(UBound(entries) > 9, UBound(entries) - 9, 0)
    
    For i = startIdx To UBound(entries)
        Dim entry As String: entry = entries(i)
        
        ' Extract timestamp
        Dim tsPos As Long: tsPos = InStr(entry, """timestamp"":""")
        If tsPos > 0 Then
            Dim tsStart As Long: tsStart = tsPos + 14
            Dim tsEnd As Long: tsEnd = InStr(tsStart, entry, """")
            If tsEnd > tsStart Then
                msg = msg & Mid(entry, tsStart, tsEnd - tsStart) & " - "
            End If
        End If
        
        ' Extract title
        Dim titlePos As Long: titlePos = InStr(entry, """title"":""")
        If titlePos > 0 Then
            Dim titleStart As Long: titleStart = titlePos + 10
            Dim titleEnd As Long: titleEnd = InStr(titleStart, entry, """")
            If titleEnd > titleStart Then
                msg = msg & Mid(entry, titleStart, titleEnd - titleStart)
            End If
        End If
        
        ' Extract status
        Dim statusPos As Long: statusPos = InStr(entry, """status"":""")
        If statusPos > 0 Then
            Dim statusStart As Long: statusStart = statusPos + 11
            Dim statusEnd As Long: statusEnd = InStr(statusStart, entry, """")
            If statusEnd > statusStart Then
                msg = msg & " [" & Mid(entry, statusStart, statusEnd - statusStart) & "]"
            End If
        End If
        
        msg = msg & vbCrLf
    Next i
    
    MsgBox msg, vbInformation, "Push History"
    Exit Sub

ErrHandler:
    MsgBox "Error loading push history: " & Err.Description, vbCritical, "Error"
End Sub

Public Sub ClearPushHistory()
    On Error Resume Next
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim historyPath As String: historyPath = Setup.GetTempFolder() & "\" & HISTORY_FILE
    If fso.FileExists(historyPath) Then fso.DeleteFile historyPath
    Logs.LogInfo "[MsgBoxPushBullet] Push history cleared"
    MsgBox "Push history cleared.", vbInformation, "Pushbullet"
End Sub

'=========================
' HELPER FUNCTIONS
'=========================

Private Function EscapeJson(ByVal s As String) As String
    s = Replace(s, "\", "\\")
    s = Replace(s, """", "\""")
    s = Replace(s, vbCrLf, "\n")
    s = Replace(s, vbCr, "\n")
    s = Replace(s, vbLf, "\n")
    s = Replace(s, vbTab, "\t")
    EscapeJson = s
End Function

Private Sub Sleep(ByVal ms As Long)
    Dim t As Single: t = Timer
    Do While Timer - t < ms / 1000
        DoEvents
    Loop
End Sub

'=========================
' SETUP WIZARD
'=========================

Public Sub PushbulletSetupWizard()
    Dim msg As String
    msg = "Pushbullet Mobile Notifications Setup" & vbCrLf & vbCrLf
    msg = msg & "This wizard will help you set up mobile push notifications." & vbCrLf & vbCrLf
    msg = msg & "You'll need:" & vbCrLf
    msg = msg & "1. A free Pushbullet account (pushbullet.com)" & vbCrLf
    msg = msg & "2. Pushbullet app installed on your phone" & vbCrLf
    msg = msg & "3. Your API access token" & vbCrLf & vbCrLf
    msg = msg & "API key will be securely stored in Windows Credential Manager." & vbCrLf & vbCrLf
    msg = msg & "Continue?"
    
    If MsgBox(msg, vbYesNo + vbQuestion, "Setup Wizard") <> vbYes Then Exit Sub
    
    ' Step 1: Get API key
    msg = "Step 1: Get your API Access Token" & vbCrLf & vbCrLf
    msg = msg & "1. Go to: https://www.pushbullet.com/#settings/account" & vbCrLf
    msg = msg & "2. Scroll to 'Access Tokens'" & vbCrLf
    msg = msg & "3. Click 'Create Access Token'" & vbCrLf
    msg = msg & "4. Copy the token" & vbCrLf & vbCrLf
    msg = msg & "Open Pushbullet website now?"
    
    If MsgBox(msg, vbYesNo + vbQuestion, "Setup Wizard") = vbYes Then
        shell "cmd /c start https://www.pushbullet.com/#settings/account", vbHide
    End If
    
    ' Step 2: Enter API key
    Dim apiKey As String
    apiKey = InputBox("Paste your Pushbullet Access Token here:", "Setup Wizard - Step 2")
    
    If Len(Trim(apiKey)) = 0 Then
        MsgBox "Setup cancelled.", vbInformation, "Setup Wizard"
        Exit Sub
    End If
    
    ' Save API key
    SetPushbulletAPIKey apiKey
    
    ' Step 3: Test push
    msg = "Setup complete!" & vbCrLf & vbCrLf
    msg = msg & "Send a test notification to your device?"
    
    If MsgBox(msg, vbYesNo + vbQuestion, "Setup Wizard") = vbYes Then
        If SendPush("Test from Excel", "Pushbullet is now connected! ??", "https://www.pushbullet.com") Then
            MsgBox "Test notification sent! Check your phone.", vbInformation, "Setup Complete"
        Else
            MsgBox "Failed to send test notification. Check your API key and try again.", vbExclamation, "Test Failed"
        End If
    End If
End Sub

'=========================
' TEST SUITE
'=========================

Public Sub TestPushbullet()
    If Not IsPushbulletEnabled() Then
        If MsgBox("Pushbullet not configured. Run setup wizard now?", vbYesNo + vbQuestion, "Setup Required") = vbYes Then
            PushbulletSetupWizard
        End If
        Exit Sub
    End If
    
    Dim choice As String
    choice = InputBox("Pushbullet Test Menu:" & vbCrLf & vbCrLf & _
                      "1 - Send test push" & vbCrLf & _
                      "2 - Send push with URL" & vbCrLf & _
                      "3 - Show devices" & vbCrLf & _
                      "4 - Show push history" & vbCrLf & _
                      "5 - Clear push history" & vbCrLf & _
                      "6 - Open Credential Manager" & vbCrLf & _
                      "7 - Setup Push2Run (see Push2Run.bas)" & vbCrLf & _
                      "8 - Remove API key" & vbCrLf & _
                      "0 - Exit", "Test Menu", "1")
    
    Select Case choice
        Case "1"
            If SendPush("Test Notification", "This is a test from Excel VBA! " & Now, "", "", "note", True) Then
                MsgBox "Push sent successfully!", vbInformation
            Else
                MsgBox "Failed to send push.", vbExclamation
            End If
        
        Case "2"
            If SendPush("Excel Report Ready", "Your report has been generated.", "https://example.com/report", "", "note", True) Then
                MsgBox "Push with URL sent!", vbInformation
            Else
                MsgBox "Failed to send push.", vbExclamation
            End If
        
        Case "3"
            ShowDevices
        
        Case "4"
            ShowPushHistory
        
        Case "5"
            ClearPushHistory
        
        Case "6"
            OpenCredentialManager
            
        Case "7"
            MsgBox "Push2Run setup has been moved to its own module!" & vbCrLf & vbCrLf & _
                   "Please run: Push2Run.SetupPush2Run" & vbCrLf & vbCrLf & _
                   "Or add voice-activated macros in the Push2Run.bas module.", _
                   vbInformation, "Push2Run"
            
        Case "8"
            If MsgBox("Are you sure you want to remove your Pushbullet API key?", vbYesNo + vbQuestion, "Confirm") = vbYes Then
                ClearPushbulletAPIKey
            End If
        
        Case Else
            Exit Sub
    End Select
End Sub

'=========================
' DIAGNOSTICS
'=========================

Public Sub DiagnosePushbullet()
    On Error Resume Next
    
    Dim msg As String
    msg = "Pushbullet Diagnostics" & vbCrLf & String(50, "=") & vbCrLf & vbCrLf
    
    ' Check module variable
    msg = msg & "Module variable m_APIKey: "
    If Len(m_APIKey) > 0 Then
        msg = msg & "SET (" & Len(m_APIKey) & " chars)" & vbCrLf
    Else
        msg = msg & "EMPTY" & vbCrLf
    End If
    
    ' Check module enabled flag
    msg = msg & "Module m_Enabled: " & m_Enabled & vbCrLf & vbCrLf
    
    ' Try to load from Credential Manager
    msg = msg & "Attempting to read from Credential Manager..." & vbCrLf
    Dim testKey As String
    testKey = Credentials.ReadCredential(CREDENTIAL_TARGET)
    
    msg = msg & "Credential Manager read result: "
    If Len(testKey) > 0 Then
        msg = msg & "SUCCESS (" & Len(testKey) & " chars)" & vbCrLf
        msg = msg & "First 10 chars: " & Left(testKey, 10) & "..." & vbCrLf
    Else
        msg = msg & "EMPTY/FAILED" & vbCrLf
        msg = msg & "Last DLL Error: " & Err.LastDllError & vbCrLf
    End If
    
    msg = msg & vbCrLf & "IsPushbulletEnabled(): " & IsPushbulletEnabled() & vbCrLf
    msg = msg & vbCrLf & "Workbook Path:" & vbCrLf
    msg = msg & "  " & ThisWorkbook.FullName
    
    MsgBox msg, vbInformation, "Pushbullet Diagnostics"
End Sub

