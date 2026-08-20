VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "clsCallbacks"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
'***************************************************************
' Class: clsCallbacks
' Purpose: Handle toast callback macros and link clicks
' Version: 1.0
' Date: October 2025
'***************************************************************
Option Explicit

' Dictionary of callbacks
Private Callbacks As Object

'----------------------------
' Initialize callbacks dictionary
Private Sub Class_Initialize()
    Set Callbacks = CreateObject("Scripting.Dictionary")
End Sub

'----------------------------
' Register a callback
Public Sub RegisterCallback(ByVal Name As String, ByVal macroName As String)
    If Len(Name) > 0 And Len(macroName) > 0 Then
        Callbacks(Name) = macroName
    End If
End Sub

'----------------------------
' Execute a callback by name
Public Sub ExecuteCallback(ByVal Name As String)
    If Callbacks.Exists(Name) Then
        Dim macro As String
        macro = Callbacks(Name)
        On Error Resume Next
        Application.Run macro
        If Err.Number <> 0 Then
            MsgBox "Error executing callback '" & Name & "': " & Err.Description, vbExclamation, "Callback Error"
        End If
        On Error GoTo 0
    Else
        MsgBox "Callback '" & Name & "' not registered.", vbExclamation, "Callback Error"
    End If
End Sub

'----------------------------
' Remove a callback
Public Sub RemoveCallback(ByVal Name As String)
    If Callbacks.Exists(Name) Then Callbacks.Remove Name
End Sub

'----------------------------
' Clear all callbacks
Public Sub ClearCallbacks()
    Callbacks.RemoveAll
End Sub

