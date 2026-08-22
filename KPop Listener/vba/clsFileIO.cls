VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "clsFileIO"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
'***************************************************************
' Class: clsFileIO
' Purpose: File and JSON helper for toasts, progress updates, and temporary files
' Version: 1.1
' Date: October 2025
' Changes:
'   - Fixed GetCurrentProcessId to GetProcessId
'   - Added TEMP_FOLDER constant reference
'   - Updated version to 1.1
'***************************************************************
Option Explicit

Private Const TEMP_PREFIX As String = "toast_"

'----------------------------
' Get TEMP folder path from Setup module
Public Function GetTempPath() As String
    GetTempPath = Setup.TEMP_FOLDER
End Function

'----------------------------
' Get temporary file path with unique name
Public Function GetTempFile(Optional ByVal Extension As String = ".tmp") As String
    GetTempFile = Setup.TEMP_FOLDER & "\Toast_" & Setup.GetProcessId & "_" & Timer & Extension
End Function

'----------------------------
' Get TEMP folder path (alternative using environment variable)
Public Function tempPath() As String
    tempPath = Environ$("TEMP")
    If Right$(tempPath, 1) <> "\" Then tempPath = tempPath & "\"
End Function

'----------------------------
' Write text to file (overwrite)
Public Sub WriteTextFile(ByVal filePath As String, ByVal content As String, Optional ByVal Unicode As Boolean = True)
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    Dim ts As Object
    Set ts = fso.CreateTextFile(filePath, True, Unicode)
    ts.Write content
    ts.Close
End Sub

'----------------------------
' Read text from file
Public Function ReadTextFile(ByVal filePath As String) As String
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    If fso.FileExists(filePath) Then
        Dim ts As Object: Set ts = fso.OpenTextFile(filePath, 1, True)
        ReadTextFile = ts.ReadAll
        ts.Close
    Else
        ReadTextFile = ""
    End If
End Function

'----------------------------
' Delete file if exists
Public Sub DeleteFile(ByVal filePath As String)
    On Error Resume Next
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    If fso.FileExists(filePath) Then fso.DeleteFile filePath
    On Error GoTo 0
End Sub

'----------------------------
' Create unique temporary file path
Public Function tempFile(Optional ByVal Suffix As String = ".txt") As String
    tempFile = tempPath() & TEMP_PREFIX & Format(Now, "yyyymmddhhnnss") & "_" & Int((1000 * Rnd) + 1) & Suffix
End Function

'----------------------------
' Simple JSON escape (for strings)
Public Function EscapeJson(ByVal Text As String) As String
    Text = Replace(Text, "\", "\\")
    Text = Replace(Text, """", "\""")
    Text = Replace(Text, "/", "\/")
    Text = Replace(Text, vbCrLf, "\n")
    Text = Replace(Text, vbCr, "\n")
    Text = Replace(Text, vbLf, "\n")
    Text = Replace(Text, vbTab, "\t")
    EscapeJson = Text
End Function

'----------------------------
' Check if file exists
Public Function FileExists(ByVal filePath As String) As Boolean
    On Error Resume Next
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    FileExists = fso.FileExists(filePath)
End Function

'----------------------------
' Get file size in bytes
Public Function GetFileSize(ByVal filePath As String) As Long
    On Error Resume Next
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    If fso.FileExists(filePath) Then
        GetFileSize = fso.GetFile(filePath).Size
    Else
        GetFileSize = -1
    End If
End Function

'----------------------------
' Copy file
Public Sub CopyFile(ByVal SourcePath As String, ByVal DestPath As String, Optional ByVal Overwrite As Boolean = True)
    On Error Resume Next
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    fso.CopyFile SourcePath, DestPath, Overwrite
End Sub

'----------------------------
' Move file
Public Sub MoveFile(ByVal SourcePath As String, ByVal DestPath As String)
    On Error Resume Next
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    fso.MoveFile SourcePath, DestPath
End Sub

'----------------------------
' Get file extension
Public Function GetExtension(ByVal filePath As String) As String
    On Error Resume Next
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    GetExtension = fso.GetExtensionName(filePath)
End Function

'----------------------------
' Get filename without extension
Public Function GetBaseName(ByVal filePath As String) As String
    On Error Resume Next
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    GetBaseName = fso.GetBaseName(filePath)
End Function

'----------------------------
' Get parent folder path
Public Function GetParentFolder(ByVal filePath As String) As String
    On Error Resume Next
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    GetParentFolder = fso.GetParentFolderName(filePath)
End Function


