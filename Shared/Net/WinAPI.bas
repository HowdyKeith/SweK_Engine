Attribute VB_Name = "WinAPI"
Option Explicit
'============================================================
' Module: WinAPI
' Purpose: Windows API declarations for memory and system operations
' Dependencies: None
' Notes:
' - Declares RtlMoveMemory (CopyMemory) for memory copying
' - Declares synchronisation primitives: CreateMutex, ReleaseMutex, WaitForSingleObject, CloseHandle
' - Declares SetTimer for periodic callbacks
' - Used by DLNACore.bas, clsTransmissionServer.cls, and other modules
' - Date: September 29, 2025
'============================================================

#If VBA7 Then
    Public Declare PtrSafe Sub CopyMemory Lib "kernel32" Alias "RtlMoveMemory" (Destination As Any, Source As Any, ByVal Length As Long)
    Public Declare PtrSafe Function GetTickCount Lib "kernel32" () As Long
    Public Declare PtrSafe Function CreateMutex Lib "kernel32" Alias "CreateMutexA" (ByVal lpMutexAttributes As Long, ByVal bInitialOwner As Long, ByVal lpName As String) As Long
    Public Declare PtrSafe Function ReleaseMutex Lib "kernel32" (ByVal hMutex As Long) As Long
    Public Declare PtrSafe Function WaitForSingleObject Lib "kernel32" (ByVal hHandle As Long, ByVal dwMilliseconds As Long) As Long
    Public Declare PtrSafe Function CloseHandle Lib "kernel32" (ByVal hObject As Long) As Long
    Public Declare PtrSafe Function SetTimer Lib "user32" (ByVal hwnd As Long, ByVal nIDEvent As Long, ByVal uElapse As Long, ByVal lpTimerFunc As LongPtr) As Long
    Public Declare PtrSafe Function KillTimer Lib "user32" (ByVal hwnd As Long, ByVal nIDEvent As Long) As Long
#Else
    Public Declare Sub CopyMemory Lib "kernel32" Alias "RtlMoveMemory" (Destination As Any, Source As Any, ByVal Length As Long)
    Public Declare Function GetTickCount Lib "kernel32" () As Long
    Public Declare Function CreateMutex Lib "kernel32" Alias "CreateMutexA" (ByVal lpMutexAttributes As Long, ByVal bInitialOwner As Long, ByVal lpName As String) As Long
    Public Declare Function ReleaseMutex Lib "kernel32" (ByVal hMutex As Long) As Long
    Public Declare Function WaitForSingleObject Lib "kernel32" (ByVal hHandle As Long, ByVal dwMilliseconds As Long) As Long
    Public Declare Function CloseHandle Lib "kernel32" (ByVal hObject As Long) As Long
    Public Declare Function SetTimer Lib "user32" (ByVal hwnd As Long, ByVal nIDEvent As Long, ByVal uElapse As Long, ByVal lpTimerFunc As Long) As Long
    Public Declare Function KillTimer Lib "user32" (ByVal hwnd As Long, ByVal nIDEvent As Long) As Long
#End If

