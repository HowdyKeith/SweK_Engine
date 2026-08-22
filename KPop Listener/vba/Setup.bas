Attribute VB_Name = "Setup"
'***************************************************************
' Module: Setup
' Version: 1.8
' Purpose: Centralized configuration and utilities for paths and process info
' Dependencies: None
' Changes:
'   - v1.8: Fixed GetLogFilePath to handle empty workbook paths properly
'   - v1.7: Made GetLogFilePath dynamic based on Excel file path or TEMP_FOLDER
'   - v1.6: Added GetLogFilePath for Logs.bas compatibility
'   - v1.5: Updated GetProcessId from GetCurrentProcessId
' Updated: 2025-10-29
'***************************************************************
Option Explicit

'=========================
' Configuration
'=========================
Public Const TEMP_FOLDER As String = "C:\Users\howdy\AppData\Local\Temp\ExcelToasts"
Public Const AutoStartToastServers As Boolean = False

'=========================
' Get log file path
'=========================
Public Function GetLogFilePath() As String
    On Error Resume Next
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    Dim logDir As String
    
    ' Try to use the directory of the active Excel workbook
    If Not Application.ActiveWorkbook Is Nothing Then
        Dim wbPath As String
        wbPath = Application.ActiveWorkbook.path
        
        ' Only use workbook path if it's valid (file has been saved)
        If Len(wbPath) > 0 And fso.FolderExists(wbPath) Then
            logDir = wbPath
        Else
            ' Workbook not saved yet, use TEMP_FOLDER
            logDir = TEMP_FOLDER
        End If
    Else
        ' No active workbook, use TEMP_FOLDER
        logDir = TEMP_FOLDER
    End If
    
    ' Ensure directory exists
    If Not fso.FolderExists(logDir) Then
        fso.CreateFolder logDir
    End If
    
    GetLogFilePath = fso.BuildPath(logDir, "VBA_Logs.txt")
    
    Set fso = Nothing
End Function

'=========================
' Initialize setup
'=========================
Public Sub InitializeSetup()
    On Error Resume Next
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    ' Ensure TEMP_FOLDER exists
    If Not fso.FolderExists(TEMP_FOLDER) Then
        fso.CreateFolder TEMP_FOLDER
    End If
    
    ' Ensure log directory exists
    Dim logPath As String
    logPath = GetLogFilePath()
    
    If Len(logPath) > 0 Then
        Dim logDir As String
        logDir = fso.GetParentFolderName(logPath)
        
        If Not fso.FolderExists(logDir) Then
            fso.CreateFolder logDir
        End If
    End If
    
    Set fso = Nothing
End Sub

'=========================
' Get Excel process ID
'=========================
Public Function GetProcessId() As Long
    On Error Resume Next
    Dim objWMI As Object
    Set objWMI = GetObject("winmgmts:\\.\root\cimv2")
    
    Dim colProcesses As Object
    Set colProcesses = objWMI.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE Name = 'EXCEL.EXE'")
    
    Dim proc As Object
    For Each proc In colProcesses
        GetProcessId = CLng(proc.ProcessId)
        Exit For
    Next
    
    Set colProcesses = Nothing
    Set objWMI = Nothing
End Function

'=========================
' Get temp folder path
'=========================
Public Function GetTempFolder() As String
    GetTempFolder = TEMP_FOLDER
End Function

'=========================
' Test Setup functions
'=========================
Public Sub TestSetup()
    On Error GoTo ErrHandler
    
    Dim msg As String
    msg = "Setup Module Test Results" & vbCrLf & String(50, "=") & vbCrLf & vbCrLf
    
    ' Test GetLogFilePath
    msg = msg & "Log File Path:" & vbCrLf
    msg = msg & "  " & GetLogFilePath() & vbCrLf & vbCrLf
    
    ' Test GetTempFolder
    msg = msg & "Temp Folder:" & vbCrLf
    msg = msg & "  " & GetTempFolder() & vbCrLf & vbCrLf
    
    ' Test GetProcessId
    msg = msg & "Excel Process ID:" & vbCrLf
    msg = msg & "  " & GetProcessId() & vbCrLf & vbCrLf
    
    ' Check if folders exist
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    msg = msg & "Folder Status:" & vbCrLf
    msg = msg & "  TEMP_FOLDER exists: " & fso.FolderExists(TEMP_FOLDER) & vbCrLf
    
    Dim logDir As String
    logDir = fso.GetParentFolderName(GetLogFilePath())
    msg = msg & "  Log folder exists: " & fso.FolderExists(logDir) & vbCrLf
    
    MsgBox msg, vbInformation, "Setup Test"
    
    Exit Sub

ErrHandler:
    MsgBox "Error in TestSetup: " & Err.Description, vbCritical
End Sub
