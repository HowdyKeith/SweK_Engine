Attribute VB_Name = "MsgBoxMSHTA"
'***************************************************************
' Module: MsgBoxMSHTA
' Version: 6.14
' Purpose: Display Excel/Office Toasts via HTA
' Author: Keith Swerling + ChatGPT, Grok, and Claude
' Dependencies: clsToastNotification.cls (v11.16), Setup.bas (v1.4), Logs.bas (v1.0.1), MsgBoxUniversal.bas (v3.4)
' Features:
'   - Queued & stacked toasts
'   - Progress updates
'   - Native sound alerts
'   - Callback macro auto-invoker
'   - Optional ALWAYS_WRITE_TEMP for external monitoring
'   - Integrated cleanup
'   - HTML generation for HTA toasts
'   - YOffset support for toast stacking
' Changes:
'   - Fixed Close method call with proper error handling
'   - Added SafeCloseToast helper function
'   - Enhanced object validation before Close
'   - Added ResetToastStack, GetStackOffset, DecrementStackCount for toast stacking
'   - Integrated automatic stack offset calculation
'   - Updated version to 6.16
' Updated: 2025-10-25
'***************************************************************
Option Explicit

'=========================
' CONFIGURATION
'=========================
Private Const ALWAYS_WRITE_TEMP As Boolean = False
Private SharedQueue As Collection
Private m_ToastStackCount As Long  ' Track number of stacked toasts

Private Function GetTempFile() As String
    On Error Resume Next
    GetTempFile = Setup.TEMP_FOLDER & "\Toast" & Setup.GetProcessId & Rnd() & ".hta"
    Logs.DebugLog "[MsgBoxMSHTA] Generated temp file path: " & GetTempFile, "INFO"
End Function

Public Sub CleanupTempFiles()
    On Error Resume Next
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim file As Object
    For Each file In fso.GetFolder(Setup.TEMP_FOLDER).Files
        If LCase(fso.GetExtensionName(file.Name)) = "hta" And InStr(file.Name, "Toast") > 0 Then
            file.Delete
            Logs.DebugLog "[MsgBoxMSHTA] Deleted HTA file: " & file.path, "INFO"
        End If
    Next
    Logs.DebugLog "[MsgBoxMSHTA] Cleaned HTA temp files in " & Setup.TEMP_FOLDER, "INFO"
End Sub

'=========================
' INITIALIZATION
'=========================
Private Sub InitQueue()
    If SharedQueue Is Nothing Then
        Set SharedQueue = New Collection
        Logs.DebugLog "[MsgBoxMSHTA] Initialized SharedQueue", "INFO"
    End If
End Sub

'=========================
' GENERATE HTA CONTENT
'=========================
Private Function GenerateHtaContent(ByVal Toast As clsToastNotification) As String
    On Error Resume Next
    Dim html As String
    Dim positionStyle As String
    
    ' Validate Toast object
    If Toast Is Nothing Then
        Logs.DebugLog "[MsgBoxMSHTA] GenerateHtaContent: Toast object is Nothing", "ERROR"
        Exit Function
    End If
    If TypeName(Toast) <> "clsToastNotification" Then
        Logs.DebugLog "[MsgBoxMSHTA] GenerateHtaContent: Invalid Toast type: " & TypeName(Toast), "ERROR"
        Exit Function
    End If
    Toast.DebugClass ' Log class details
    
    ' Set position style based on Position and YOffset
    Select Case UCase(Toast.Position)
        Case "TL": positionStyle = "position:absolute; top:" & (10 + Toast.YOffset) & "px; left:10px;"
        Case "TR": positionStyle = "position:absolute; top:" & (10 + Toast.YOffset) & "px; right:10px;"
        Case "BL": positionStyle = "position:absolute; bottom:" & (10 + Toast.YOffset) & "px; left:10px;"
        Case "BR": positionStyle = "position:absolute; bottom:" & (10 + Toast.YOffset) & "px; right:10px;"
        Case "C", "CR": positionStyle = "position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); margin-top:" & Toast.YOffset & "px;"
        Case Else: positionStyle = "position:absolute; bottom:" & (10 + Toast.YOffset) & "px; right:10px;"
    End Select
    
    html = "<!DOCTYPE html>" & vbCrLf
    html = html & "<html>" & vbCrLf
    html = html & "<head>" & vbCrLf
    html = html & "<title>" & MsgBoxUniversal.EscapeHTML(Toast.Title) & "</title>" & vbCrLf
    html = html & "<hta:application id='oToast' applicationname='Toast' singleinstance='yes' windowstate='normal' />" & vbCrLf
    html = html & "<style>" & vbCrLf
    html = html & "body { font-family: Segoe UI, Arial; font-size: 14px; padding: 10px; background: transparent; }" & vbCrLf
    html = html & ".toast { " & positionStyle & " border: 1px solid #ccc; padding: 10px; background: white; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }" & vbCrLf
    html = html & "progress { width: 100%; }" & vbCrLf
    html = html & "</style>" & vbCrLf
    html = html & "</head>" & vbCrLf
    html = html & "<body>" & vbCrLf
    html = html & "<div class='toast'>" & vbCrLf
    html = html & "<h3>" & MsgBoxUniversal.EscapeHTML(Toast.Title) & "</h3>" & vbCrLf
    html = html & "<p>" & MsgBoxUniversal.EscapeHTML(Toast.Message) & "</p>" & vbCrLf
    If Toast.Level = "PROGRESS" Then
        html = html & "<progress value='" & Toast.Progress & "' max='100'>" & Toast.Progress & "%</progress>" & vbCrLf
        html = html & "<p>" & Toast.Progress & "%</p>" & vbCrLf
    End If
    If Len(Toast.ImagePath) > 0 Then
        html = html & "<img src='" & MsgBoxUniversal.EscapeHTML(Toast.ImagePath) & "' style='max-width:48px; max-height:48px;' />" & vbCrLf
    End If
    html = html & "</div>" & vbCrLf
    If Len(Toast.SoundName) > 0 Then
        html = html & "<bgsound src='" & MsgBoxUniversal.EscapeHTML(Toast.SoundName) & "' />" & vbCrLf
    End If
    If Len(Toast.CallbackMacro) > 0 Then
        html = html & "<script language='VBScript'>" & vbCrLf
        html = html & "Sub window_onload" & vbCrLf
        html = html & "  CreateObject(""Excel.Application"").Run """ & MsgBoxUniversal.EscapeHTML(Toast.CallbackMacro) & """" & vbCrLf
        html = html & "End Sub" & vbCrLf
        html = html & "</script>" & vbCrLf
    End If
    html = html & "</body>" & vbCrLf
    html = html & "</html>"
    GenerateHtaContent = html
    Logs.DebugLog "[MsgBoxMSHTA] Generated HTA content for toast: " & Toast.Title & ", Position: " & Toast.Position & ", YOffset: " & Toast.YOffset, "INFO"
End Function

'=========================
' SAFE CLOSE HELPER
'=========================
Private Sub SafeCloseToast(ByVal Toast As clsToastNotification, ByVal HTAPath As String)
    On Error Resume Next
    Dim fso As Object
    
    ' Validate object before attempting Close
    If Toast Is Nothing Then
        Logs.DebugLog "[MsgBoxMSHTA] SafeCloseToast: Toast is Nothing, skipping Close", "WARN"
        GoTo CleanupFile
    End If
    
    If TypeName(Toast) <> "clsToastNotification" Then
        Logs.DebugLog "[MsgBoxMSHTA] SafeCloseToast: Invalid type (" & TypeName(Toast) & "), skipping Close", "WARN"
        GoTo CleanupFile
    End If
    
    ' Attempt to close via object method
    Logs.DebugLog "[MsgBoxMSHTA] SafeCloseToast: Attempting CloseToast for: " & Toast.Title, "INFO"
    
    ' Call the renamed CloseToast method (avoids VBA reserved keyword 'Close')
    Toast.CloseToast
    
    Logs.DebugLog "[MsgBoxMSHTA] SafeCloseToast: CloseToast method executed for: " & Toast.Title, "INFO"
    
CleanupFile:
    ' Always attempt file cleanup
    Set fso = CreateObject("Scripting.FileSystemObject")
    If fso.FileExists(HTAPath) Then
        fso.DeleteFile HTAPath, True
        Logs.DebugLog "[MsgBoxMSHTA] SafeCloseToast: Deleted HTA file: " & HTAPath, "INFO"
    End If
    
    If Err.Number <> 0 Then
        Logs.DebugLog "[MsgBoxMSHTA] SafeCloseToast: Error occurred: " & Err.Description, "WARN"
        Err.Clear
    End If
End Sub

'=========================
' SHOW TOAST
'=========================
Public Sub ShowToast(ByVal Title As String, ByVal Message As String, _
                     Optional ByVal Level As String = "INFO", _
                     Optional ByVal Duration As Long = 5, _
                     Optional ByVal Position As String = "BR", _
                     Optional ByVal SoundName As String = "", _
                     Optional ByVal ImagePath As String = "", _
                     Optional ByVal CallbackMacro As String = "")
    
    If Not ToastsEnabled() Then
        Logs.DebugLog "[MsgBoxMSHTA] Toasts disabled; skipping toast: " & Title, "WARN"
        Exit Sub
    End If
    
    Dim Toast As clsToastNotification
    Set Toast = New clsToastNotification
    
    With Toast
        .Title = Title
        .Message = Message
        .Level = Level
        .Duration = Duration
        .Position = Position
        .SoundName = SoundName
        .ImagePath = ImagePath
        .CallbackMacro = CallbackMacro
        .AlwaysWriteTemp = ALWAYS_WRITE_TEMP
        .YOffset = GetStackOffset()  ' Use stack offset
    End With
    
    InitQueue
    SharedQueue.Add Toast
    Logs.DebugLog "[MsgBoxMSHTA] Queued toast: " & Title & ", Position: " & Position & ", YOffset: " & Toast.YOffset & ", Type: " & TypeName(Toast), "INFO"
    If SharedQueue.count = 1 Then DisplayNextToast
End Sub

'=========================
' SHOW PROGRESS TOAST
'=========================
Public Sub ShowProgressToast(ByVal Title As String, ByVal Message As String, _
                             ByVal Percent As Long, _
                             Optional ByVal Position As String = "BR", _
                             Optional ByVal SoundName As String = "", _
                             Optional ByVal ImagePath As String = "", _
                             Optional ByVal CallbackMacro As String = "")
    
    If Not ToastsEnabled() Then
        Logs.DebugLog "[MsgBoxMSHTA] Toasts disabled; skipping progress toast: " & Title, "WARN"
        Exit Sub
    End If
    
    Dim Toast As clsToastNotification
    Set Toast = New clsToastNotification
    
    With Toast
        .Title = Title
        .Message = Message
        .Level = "PROGRESS"
        .Progress = Percent
        .Duration = 0 ' persistent
        .Position = Position
        .SoundName = SoundName
        .ImagePath = ImagePath
        .CallbackMacro = CallbackMacro
        .AlwaysWriteTemp = ALWAYS_WRITE_TEMP
        .YOffset = GetStackOffset()  ' Use stack offset
    End With
    
    InitQueue
    SharedQueue.Add Toast
    Logs.DebugLog "[MsgBoxMSHTA] Queued progress toast: " & Title & ", Progress: " & Percent & ", Position: " & Position & ", YOffset: " & Toast.YOffset & ", Type: " & TypeName(Toast), "INFO"
    If SharedQueue.count = 1 Then DisplayNextToast
End Sub

'=========================
' DISPLAY NEXT TOAST
'=========================
Private Sub DisplayNextToast()
    If SharedQueue.count = 0 Then Exit Sub
    
    Dim currentToast As clsToastNotification
    Set currentToast = SharedQueue(1)
    
    ' Validate currentToast
    If currentToast Is Nothing Then
        Logs.DebugLog "[MsgBoxMSHTA] DisplayNextToast: currentToast is Nothing", "ERROR"
        SharedQueue.Remove 1
        If SharedQueue.count > 0 Then DisplayNextToast
        Exit Sub
    End If
    If TypeName(currentToast) <> "clsToastNotification" Then
        Logs.DebugLog "[MsgBoxMSHTA] DisplayNextToast: Invalid currentToast type: " & TypeName(currentToast), "ERROR"
        SharedQueue.Remove 1
        If SharedQueue.count > 0 Then DisplayNextToast
        Exit Sub
    End If
    
    Logs.DebugLog "[MsgBoxMSHTA] Processing toast: " & currentToast.Title & ", Type: " & TypeName(currentToast) & ", Position: " & currentToast.Position & ", YOffset: " & currentToast.YOffset & ", Time: " & Now, "INFO"
    currentToast.DebugClass ' Log class details
    
    ' Generate and write HTA file
    Dim HTAPath As String: HTAPath = GetTempFile()
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim ts As Object: Set ts = fso.CreateTextFile(HTAPath, True)
    ts.Write GenerateHtaContent(currentToast)
    ts.Close
    
    ' Display toast
    On Error Resume Next
    currentToast.Show "hta"
    If Err.Number <> 0 Then
        Logs.DebugLog "[MsgBoxMSHTA] Error in currentToast.Show: " & Err.Description, "ERROR"
        Err.Clear
    End If
    shell "mshta.exe """ & HTAPath & """", vbNormalFocus
    Logs.DebugLog "[MsgBoxMSHTA] Displaying toast: " & currentToast.Title & ", Position: " & currentToast.Position & ", YOffset: " & currentToast.YOffset, "INFO"
    
    Dim waitSeconds As Long
    waitSeconds = currentToast.Duration
    
    If currentToast.IsShowing And waitSeconds > 0 Then
        Dim endTime As Double: endTime = Timer + waitSeconds
        Do While Timer < endTime
            DoEvents
        Loop
    End If
    
    ' Close toast using safe method
    SafeCloseToast currentToast, HTAPath
    
    ' Decrement stack counter
    DecrementStackCount
    
    ' Remove from queue and process next
    SharedQueue.Remove 1
    Logs.DebugLog "[MsgBoxMSHTA] Removed toast from queue: " & currentToast.Title, "INFO"
    
    ' Display next toast in queue
    If SharedQueue.count > 0 Then DisplayNextToast
End Sub

'=========================
' ENABLE/DISABLE TOASTS
'=========================
Public Function ToastsEnabled() As Boolean
    ToastsEnabled = True
    Logs.DebugLog "[MsgBoxMSHTA] ToastsEnabled checked: " & ToastsEnabled, "INFO"
End Function

'=========================
' STACK MANAGEMENT
'=========================
Public Sub ResetToastStack()
    On Error Resume Next
    m_ToastStackCount = 0
    Logs.DebugLog "[MsgBoxMSHTA] Toast stack reset", "INFO"
End Sub

Public Function GetStackOffset() As Long
    ' Calculate Y offset for stacked toasts
    ' Each toast gets a 10px offset
    Const STACK_OFFSET As Long = 10
    GetStackOffset = m_ToastStackCount * STACK_OFFSET
    m_ToastStackCount = m_ToastStackCount + 1
    Logs.DebugLog "[MsgBoxMSHTA] Stack offset calculated: " & GetStackOffset & "px, Count: " & m_ToastStackCount, "INFO"
End Function

Public Sub DecrementStackCount()
    On Error Resume Next
    If m_ToastStackCount > 0 Then
        m_ToastStackCount = m_ToastStackCount - 1
        Logs.DebugLog "[MsgBoxMSHTA] Stack count decremented: " & m_ToastStackCount, "INFO"
    End If
End Sub


