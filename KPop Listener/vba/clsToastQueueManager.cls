VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "clsToastQueueManager"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
'***************************************************************
' Class: clsToastQueueManager
' Version: 7.3
' Purpose: Manage toast notification queue with priority support
' Changes:
'   - v7.3: Removed Priority property (not in clsToastNotification)
'   - v7.2: Replaced Close with CloseToast
' Updated: 2025-10-27
'***************************************************************
Option Explicit

Private Type QueueEntry
    Toast As clsToastNotification
    Priority As Long
    Timestamp As Double
End Type

Private m_queue() As QueueEntry
Private m_queueCount As Long
Private m_maxVisible As Long
Private m_currentToast As clsToastNotification

'=========================
' PROPERTIES
'=========================

Public Property Get MaxVisibleToasts() As Long
    MaxVisibleToasts = m_maxVisible
End Property

Public Property Let MaxVisibleToasts(ByVal Value As Long)
    m_maxVisible = Value
End Property

Public Property Get QueueCount() As Long
    QueueCount = m_queueCount
End Property

'=========================
' INITIALIZATION
'=========================

Private Sub Class_Initialize()
    ReDim m_queue(0 To 99) As QueueEntry
    m_queueCount = 0
    m_maxVisible = 3
End Sub

Private Sub Class_Terminate()
    If Not m_currentToast Is Nothing Then
        m_currentToast.CloseToast
        Set m_currentToast = Nothing
    End If
    ClearQueue
End Sub

'=========================
' PUBLIC METHODS
'=========================

' Add info notification to queue
Public Sub NotifyInfo(ByVal Title As String, ByVal Message As String, Optional ByVal Priority As Long = 5)
    Dim Toast As New clsToastNotification
    With Toast
        .Title = Title
        .Message = Message
        .Level = "INFO"
        .Duration = 4
        .Position = "BR"
    End With
    
    AddToQueue Toast, Priority
End Sub

' Add success notification to queue
Public Sub NotifySuccess(ByVal Title As String, ByVal Message As String, Optional ByVal Priority As Long = 5)
    Dim Toast As New clsToastNotification
    With Toast
        .Title = Title
        .Message = Message
        .Level = "SUCCESS"
        .Duration = 4
        .Position = "BR"
    End With
    
    AddToQueue Toast, Priority
End Sub

' Add warning notification to queue
Public Sub NotifyWarning(ByVal Title As String, ByVal Message As String, Optional ByVal Priority As Long = 7)
    Dim Toast As New clsToastNotification
    With Toast
        .Title = Title
        .Message = Message
        .Level = "WARN"
        .Duration = 5
        .Position = "TR"
    End With
    
    AddToQueue Toast, Priority
End Sub

' Add error notification to queue
Public Sub NotifyError(ByVal Title As String, ByVal Message As String, Optional ByVal Priority As Long = 10)
    Dim Toast As New clsToastNotification
    With Toast
        .Title = Title
        .Message = Message
        .Level = "ERROR"
        .Duration = 6
        .Position = "TR"
    End With
    
    AddToQueue Toast, Priority
End Sub

' Add custom toast to queue
Public Sub AddToast(ByVal Toast As clsToastNotification, Optional ByVal Priority As Long = 5)
    AddToQueue Toast, Priority
End Sub

' Process next toast in queue
Public Sub ProcessNext()
    ProcessQueue
End Sub

' Clear all queued toasts
Public Sub ClearQueue()
    On Error Resume Next
    Dim i As Long
    For i = 0 To m_queueCount - 1
        Set m_queue(i).Toast = Nothing
    Next i
    
    ReDim m_queue(0 To 99) As QueueEntry
    m_queueCount = 0
End Sub

' Pause queue processing
Public Sub PauseQueue()
    ' Future implementation: Add pause flag
End Sub

' Resume queue processing
Public Sub ResumeQueue()
    ' Future implementation: Remove pause flag
    ProcessQueue
End Sub

'=========================
' PRIVATE METHODS
'=========================

' Add toast to queue with priority sorting
Private Sub AddToQueue(ByVal Toast As clsToastNotification, ByVal Priority As Long)
    On Error GoTo ErrorHandler
    
    ' Expand array if needed
    If m_queueCount >= UBound(m_queue) Then
        ReDim Preserve m_queue(0 To UBound(m_queue) + 50) As QueueEntry
    End If
    
    ' Create queue entry
    With m_queue(m_queueCount)
        Set .Toast = Toast
        .Priority = Priority
        .Timestamp = Timer
    End With
    
    m_queueCount = m_queueCount + 1
    
    ' Sort by priority (higher priority first)
    SortQueue
    
    ' Process queue
    ProcessQueue
    
    Exit Sub
    
ErrorHandler:
    Logs.DebugLog "[clsToastQueueManager] Error adding to queue: " & Err.Description, "ERROR"
End Sub

' Sort queue by priority (bubble sort - simple for small queues)
Private Sub SortQueue()
    On Error Resume Next
    
    If m_queueCount <= 1 Then Exit Sub
    
    Dim i As Long, j As Long
    Dim temp As QueueEntry
    
    For i = 0 To m_queueCount - 2
        For j = i + 1 To m_queueCount - 1
            ' Higher priority should be first
            If m_queue(j).Priority > m_queue(i).Priority Then
                ' Swap
                temp = m_queue(i)
                m_queue(i) = m_queue(j)
                m_queue(j) = temp
            End If
        Next j
    Next i
End Sub

' Process queue (show next toast)
Private Sub ProcessQueue()
    On Error GoTo ErrorHandler
    
    ' Check if system is ready
    If Not MsgBoxMain.IsToastSystemReady Then
        Logs.DebugLog "[clsToastQueueManager] Toast system not ready; queue paused", "WARN"
        Exit Sub
    End If
    
    ' Check if queue is empty
    If m_queueCount = 0 Then Exit Sub
    
    ' Close current toast if showing
    If Not m_currentToast Is Nothing Then
        m_currentToast.CloseToast
        Set m_currentToast = Nothing
    End If
    
    ' Get next toast (highest priority)
    Dim Toast As clsToastNotification
    Set Toast = m_queue(0).Toast
    
    ' Remove from queue
    RemoveFromQueue 0
    
    ' Show toast
    Set m_currentToast = Toast
    Toast.Show
    
    Logs.DebugLog "[clsToastQueueManager] Processed toast: " & Toast.Title & " (Queue: " & m_queueCount & " remaining)", "INFO"
    
    Exit Sub
    
ErrorHandler:
    Logs.DebugLog "[clsToastQueueManager] Error processing queue: " & Err.Description, "ERROR"
End Sub

' Remove toast from queue at index
Private Sub RemoveFromQueue(ByVal Index As Long)
    On Error Resume Next
    
    If Index < 0 Or Index >= m_queueCount Then Exit Sub
    
    ' Shift all items down
    Dim i As Long
    For i = Index To m_queueCount - 2
        m_queue(i) = m_queue(i + 1)
    Next i
    
    ' Clear last item
    Set m_queue(m_queueCount - 1).Toast = Nothing
    m_queue(m_queueCount - 1).Priority = 0
    m_queue(m_queueCount - 1).Timestamp = 0
    
    m_queueCount = m_queueCount - 1
End Sub

'=========================
' UTILITY METHODS
'=========================

' Get queue summary
Public Function GetQueueSummary() As String
    Dim summary As String
    summary = "Queue Status:" & vbCrLf
    summary = summary & "  Items: " & m_queueCount & vbCrLf
    summary = summary & "  Max Visible: " & m_maxVisible & vbCrLf & vbCrLf
    
    If m_queueCount > 0 Then
        summary = summary & "Queued Toasts:" & vbCrLf
        Dim i As Long
        For i = 0 To m_queueCount - 1
            summary = summary & "  [P" & m_queue(i).Priority & "] " & _
                     m_queue(i).Toast.Title & " - " & _
                     m_queue(i).Toast.Level & vbCrLf
        Next i
    Else
        summary = summary & "Queue is empty"
    End If
    
    GetQueueSummary = summary
End Function

'***************************************************************
' USAGE EXAMPLES:
'
' Sub Example1_BasicQueue()
'     Dim queue As New clsToastQueueManager
'
'     ' Add various toasts
'     queue.NotifyInfo "Task Started", "Processing data..."
'     queue.NotifyWarning "Low Memory", "Memory usage: 85%"
'     queue.NotifyError "Connection Lost", "Server unavailable"
'     queue.NotifySuccess "Complete", "All tasks finished"
'
'     ' Queue processes automatically
' End Sub
'
' Sub Example2_WithPriority()
'     Dim queue As New clsToastQueueManager
'
'     ' Lower priority (shows later)
'     queue.NotifyInfo "Info", "Regular message", 3
'
'     ' Higher priority (shows first)
'     queue.NotifyError "Critical", "Important error!", 10
'
'     ' Medium priority
'     queue.NotifyWarning "Warning", "Check this", 6
' End Sub
'
' Sub Example3_CustomToast()
'     Dim queue As New clsToastQueueManager
'     Dim toast As New clsToastNotification
'
'     With toast
'         .Title = "Custom"
'         .Message = "Special notification"
'         .Level = "SUCCESS"
'         .Icon = "??"
'         .Position = "C"
'     End With
'
'     queue.AddToast toast, 8  ' Priority 8
' End Sub
'
' Sub Example4_QueueManagement()
'     Dim queue As New clsToastQueueManager
'
'     ' Add multiple toasts
'     queue.NotifyInfo "Task 1", "Processing..."
'     queue.NotifyInfo "Task 2", "Processing..."
'     queue.NotifyInfo "Task 3", "Processing..."
'
'     ' Check queue status
'     Debug.Print queue.GetQueueSummary()
'     Debug.Print "Queue count: " & queue.QueueCount
'
'     ' Clear queue if needed
'     queue.ClearQueue
' End Sub
'***************************************************************

