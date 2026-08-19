VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "clsToastNotification"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
'***************************************************************
' Class: clsToastNotification
' Version: 11.20
' Purpose: Toast notification data container for VBA
' Author: Keith Swerling + ChatGPT, Grok, and Claude
' Dependencies: MsgBoxUniversal.bas (v3.4), Logs.bas (v1.0.1), Setup.bas (v1.4)
' Features:
'   - Properties for toast attributes (Title, Message, Level, Duration, Position, ImagePath, Icon, YOffset, Progress, SoundName, CallbackMacro, AlwaysWriteTemp, IsShowing, IsActivated)
'   - Show method to write JSON for PowerShell/Python listeners
'   - CloseToast method to dismiss toasts (HTA, PowerShell, Python)
'   - TimerTick method for periodic timer-based updates via Application.OnTime
'   - GetHashID method to generate unique IDs for registry-based timer callbacks
'   - IsShowing property to check toast status
'   - DebugClass method to verify class integrity
' Changes:
'   - Renamed Close() to CloseToast() to avoid VBA reserved keyword conflict
'   - Added IsShowing and IsActivated as read/write properties
'   - Added Icon property for toast icon/emoji support
'   - Added TimerTick method for Application.OnTime integration
'   - Added GetHashID method for registry-based timer callbacks
'   - Updated version to 11.20
' Updated: 2025-10-25
'***************************************************************
Option Explicit

Private m_Title As String
Private m_Message As String
Private m_Level As String
Private m_Duration As Long
Private m_Position As String
Private m_ImagePath As String
Private m_Icon As String
Private m_YOffset As Long
Private m_Progress As Long
Private m_SoundName As String
Private m_CallbackMacro As String
Private m_AlwaysWriteTemp As Boolean
Private m_IsShowing As Boolean
Private m_IsActivated As Boolean

Public Property Let Title(ByVal Value As String)
    m_Title = Value
End Property
Public Property Get Title() As String
    Title = m_Title
End Property

Public Property Let Message(ByVal Value As String)
    m_Message = Value
End Property
Public Property Get Message() As String
    Message = m_Message
End Property

Public Property Let Level(ByVal Value As String)
    m_Level = UCase$(Value)
End Property
Public Property Get Level() As String
    Level = m_Level
End Property

Public Property Let Duration(ByVal Value As Long)
    m_Duration = Value
End Property
Public Property Get Duration() As Long
    Duration = m_Duration
End Property

Public Property Let Position(ByVal Value As String)
    m_Position = UCase$(Value)
End Property
Public Property Get Position() As String
    Position = m_Position
End Property

Public Property Let ImagePath(ByVal Value As String)
    m_ImagePath = Value
End Property
Public Property Get ImagePath() As String
    ImagePath = m_ImagePath
End Property

Public Property Let Icon(ByVal Value As String)
    m_Icon = Value
End Property
Public Property Get Icon() As String
    Icon = m_Icon
End Property

Public Property Let YOffset(ByVal Value As Long)
    m_YOffset = Value
End Property
Public Property Get YOffset() As Long
    YOffset = m_YOffset
End Property

Public Property Let Progress(ByVal Value As Long)
    m_Progress = Value
End Property
Public Property Get Progress() As Long
    Progress = m_Progress
End Property

Public Property Let SoundName(ByVal Value As String)
    m_SoundName = Value
End Property
Public Property Get SoundName() As String
    SoundName = m_SoundName
End Property

Public Property Let CallbackMacro(ByVal Value As String)
    m_CallbackMacro = Value
End Property
Public Property Get CallbackMacro() As String
    CallbackMacro = m_CallbackMacro
End Property

Public Property Let AlwaysWriteTemp(ByVal Value As Boolean)
    m_AlwaysWriteTemp = Value
End Property
Public Property Get AlwaysWriteTemp() As Boolean
    AlwaysWriteTemp = m_AlwaysWriteTemp
End Property

Public Function Show(Optional ByVal DeliveryMode As String = "auto") As Boolean
    On Error GoTo ErrHandler
    Dim json As String
    json = "{"
    json = json & """Title"":""" & MsgBoxUniversal.EscapeJson(m_Title) & ""","
    json = json & """Message"":""" & MsgBoxUniversal.EscapeJson(m_Message) & ""","
    json = json & """ToastType"":""" & m_Level & ""","
    json = json & """DurationSec"":" & m_Duration & ","
    json = json & """Position"":""" & m_Position & ""","
    json = json & """ImagePath"":""" & MsgBoxUniversal.EscapeJson(m_ImagePath) & ""","
    json = json & """Icon"":""" & MsgBoxUniversal.EscapeJson(m_Icon) & ""","
    json = json & """YOffset"":" & m_YOffset & ","
    json = json & """Progress"":" & m_Progress & ","
    json = json & """SoundName"":""" & MsgBoxUniversal.EscapeJson(m_SoundName) & ""","
    json = json & """CallbackMacro"":""" & MsgBoxUniversal.EscapeJson(m_CallbackMacro) & """"
    json = json & "}"
    
    If m_AlwaysWriteTemp Or DeliveryMode <> "hta" Then
        Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
        Dim file As Object: Set file = fso.CreateTextFile(Setup.TEMP_FOLDER & "\ToastRequest.json", True)
        file.Write json
        file.Close
    End If
    
    Show = True
    Logs.DebugLog "[clsToastNotification] Showing toast: " & m_Title & ", Position: " & m_Position & ", Icon: " & m_Icon & ", YOffset: " & m_YOffset & ", Progress: " & m_Progress & ", Type: " & TypeName(Me), "INFO"
    Exit Function
    
ErrHandler:
    Logs.DebugLog "[clsToastNotification] Error in Show: " & Err.Description, "ERROR"
    Show = False
End Function

Public Sub CloseToast()
    On Error GoTo ErrHandler
    Logs.DebugLog "[clsToastNotification] CloseToast method called for toast: " & m_Title & ", Level: " & m_Level & ", Duration: " & m_Duration & ", Object Type: " & TypeName(Me) & ", Time: " & Now, "INFO"
    
    If m_Level = "PROGRESS" Or m_Duration = 0 Then
        Dim safeTitle As String
        safeTitle = Replace(m_Title, """", "") ' Sanitize title for command
        shell "taskkill /IM mshta.exe /FI ""WINDOWTITLE eq " & safeTitle & """ /T", vbHide
        Logs.DebugLog "[clsToastNotification] Executed taskkill for HTA toast: " & safeTitle, "INFO"
    Else
        Logs.DebugLog "[clsToastNotification] Non-persistent toast; no taskkill needed: " & m_Title, "INFO"
    End If
    
    Logs.DebugLog "[clsToastNotification] CloseToast method completed for toast: " & m_Title & ", Time: " & Now, "INFO"
    Exit Sub
    
ErrHandler:
    Logs.DebugLog "[clsToastNotification] Error in CloseToast: " & Err.Description & ", Toast: " & m_Title, "ERROR"
End Sub

Public Property Get IsShowing() As Boolean
    IsShowing = m_IsShowing
End Property

Public Property Let IsShowing(ByVal Value As Boolean)
    m_IsShowing = Value
End Property

Public Property Get IsActivated() As Boolean
    IsActivated = m_IsActivated
End Property

Public Property Let IsActivated(ByVal Value As Boolean)
    m_IsActivated = Value
End Property

Public Sub DebugClass()
    On Error Resume Next
    Logs.DebugLog "[clsToastNotification] DebugClass: Object Type: " & TypeName(Me) & ", Title: " & m_Title & ", Level: " & m_Level & ", Duration: " & m_Duration & ", Position: " & m_Position & ", Icon: " & m_Icon & ", IsShowing: " & m_IsShowing & ", IsActivated: " & m_IsActivated & ", Methods Available: Show, CloseToast, IsShowing", "INFO"
End Sub

Public Sub TimerTick()
    On Error Resume Next
    ' Called periodically by Application.OnTime for timer-based updates
    ' Can be used to refresh progress toasts or check if toast should auto-close
    
    Logs.DebugLog "[clsToastNotification] TimerTick called for: " & m_Title, "INFO"
    
    ' If this is a progress toast, you could update the display here
    ' If duration has expired, close the toast
    If m_Duration > 0 And m_IsShowing Then
        ' Check if toast should close (implement timing logic as needed)
        ' For now, this is a placeholder for timer-based functionality
    End If
End Sub

Public Function GetHashID() As String
    ' Generate a unique hash ID for this toast instance
    ' Used for registry lookup with Application.OnTime
    GetHashID = "Toast_" & Format(Now, "yyyymmdd_hhnnss") & "_" & Int((9999 * Rnd) + 1)
End Function


