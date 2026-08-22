Attribute VB_Name = "Credentials"
'***************************************************************
' Module: Credentials
' Version: 1.1
' Purpose: Manage Windows Credential Manager operations for secure storage
' Author: Keith Swerling + Claude
' Dependencies: Logs.bas (v1.0.3)
' Features:
'   - Save, read, and delete credentials in Windows Credential Manager
'   - Open Credential Manager UI
'   - Error handling with logging
' Setup:
'   - Used by MsgBoxPushBullet for secure Pushbullet API key storage
' Changes:
'   - v1.1: Fixed CREDENTIAL structure for proper API compatibility
'   - v1.0: Initial creation
' Updated: 2025-10-29
'***************************************************************
Option Explicit

#If VBA7 Then
    ' Windows Credential Manager API declarations
    Private Declare PtrSafe Function CredWriteW Lib "advapi32.dll" ( _
        ByRef CREDENTIAL As CREDENTIAL, _
        ByVal Flags As Long) As Long
    
    Private Declare PtrSafe Function CredReadW Lib "advapi32.dll" ( _
        ByVal TargetName As LongPtr, _
        ByVal CredType As Long, _
        ByVal Flags As Long, _
        ByRef CREDENTIAL As LongPtr) As Long
    
    Private Declare PtrSafe Function CredDeleteW Lib "advapi32.dll" ( _
        ByVal TargetName As LongPtr, _
        ByVal CredType As Long, _
        ByVal Flags As Long) As Long
    
    Private Declare PtrSafe Sub CredFree Lib "advapi32.dll" ( _
        ByVal Buffer As LongPtr)
    
    Private Declare PtrSafe Sub CopyMemory Lib "kernel32" Alias "RtlMoveMemory" ( _
        Destination As Any, _
        Source As Any, _
        ByVal Length As LongPtr)
    
    Private Declare PtrSafe Function lstrlenW Lib "kernel32" ( _
        ByVal lpString As LongPtr) As Long
#Else
    Private Declare Function CredWriteW Lib "advapi32.dll" ( _
        ByRef Credential As CREDENTIAL, _
        ByVal Flags As Long) As Long
    
    Private Declare Function CredReadW Lib "advapi32.dll" ( _
        ByVal TargetName As Long, _
        ByVal CredType As Long, _
        ByVal Flags As Long, _
        ByRef Credential As Long) As Long
    
    Private Declare Function CredDeleteW Lib "advapi32.dll" ( _
        ByVal TargetName As Long, _
        ByVal CredType As Long, _
        ByVal Flags As Long) As Long
    
    Private Declare Sub CredFree Lib "advapi32.dll" ( _
        ByVal Buffer As Long)
    
    Private Declare Sub CopyMemory Lib "kernel32" Alias "RtlMoveMemory" ( _
        Destination As Any, _
        Source As Any, _
        ByVal Length As Long)
    
    Private Declare Function lstrlenW Lib "kernel32" ( _
        ByVal lpString As Long) As Long
#End If

' Credential structure (must match Windows API exactly)
#If VBA7 Then
    Private Type CREDENTIAL
        Flags As Long
        Type As Long
        TargetName As LongPtr
        Comment As LongPtr
        LastWritten As Currency
        CredentialBlobSize As Long
        CredentialBlob As LongPtr
        Persist As Long
        AttributeCount As Long
        Attributes As LongPtr
        TargetAlias As LongPtr
        UserName As LongPtr
    End Type
#Else
    Private Type CREDENTIAL
        Flags As Long
        Type As Long
        TargetName As Long
        Comment As Long
        LastWritten As Currency
        CredentialBlobSize As Long
        CredentialBlob As Long
        Persist As Long
        AttributeCount As Long
        Attributes As Long
        TargetAlias As Long
        UserName As Long
    End Type
#End If

' Credential types
Private Const CRED_TYPE_GENERIC As Long = 1
Private Const CRED_PERSIST_LOCAL_MACHINE As Long = 2

' Save credential to Windows Credential Manager
Public Function SaveCredential(ByVal TargetName As String, ByVal apiKey As String, Optional ByVal UserName As String = "") As Boolean
    On Error GoTo ErrHandler
    
    Dim cred As CREDENTIAL
    Dim credBlob() As Byte
    Dim targetBytes() As Byte
    Dim userBytes() As Byte
    
    If Len(UserName) = 0 Then UserName = Environ$("USERNAME")
    
    ' Convert strings to Unicode byte arrays
    targetBytes = TargetName & vbNullChar
    credBlob = apiKey & vbNullChar
    userBytes = UserName & vbNullChar
    
    ' Setup credential structure
    With cred
        .Type = CRED_TYPE_GENERIC
        .TargetName = VarPtr(targetBytes(0))
        .UserName = VarPtr(userBytes(0))
        .CredentialBlobSize = LenB(apiKey)
        .CredentialBlob = VarPtr(credBlob(0))
        .Persist = CRED_PERSIST_LOCAL_MACHINE
        .Comment = 0
        .Flags = 0
        .AttributeCount = 0
        .Attributes = 0
        .TargetAlias = 0
        .LastWritten = 0
    End With
    
    ' Write credential
    Dim result As Long
    result = CredWriteW(cred, 0)
    
    If result <> 0 Then
        SaveCredential = True
        On Error Resume Next
        Logs.LogInfo "[Credentials] Saved credential for " & TargetName
    Else
        SaveCredential = False
        On Error Resume Next
        Logs.LogError "[Credentials] Failed to save credential for " & TargetName & " (Error: " & Err.LastDllError & ")"
    End If
    
    Exit Function

ErrHandler:
    SaveCredential = False
    On Error Resume Next
    Logs.LogError "[Credentials] SaveCredential error for " & TargetName & ": " & Err.Description
End Function

' Read credential from Windows Credential Manager
Public Function ReadCredential(ByVal TargetName As String) As String
    On Error GoTo ErrHandler
    
    #If VBA7 Then
        Dim pCredential As LongPtr
    #Else
        Dim pCredential As Long
    #End If
    
    Dim cred As CREDENTIAL
    Dim apiKeyBytes() As Byte
    Dim targetBytes() As Byte
    
    ' Convert target name to Unicode
    targetBytes = TargetName & vbNullChar
    
    ' Read credential
    Dim result As Long
    result = CredReadW(VarPtr(targetBytes(0)), CRED_TYPE_GENERIC, 0, pCredential)
    
    If result = 0 Then
        ReadCredential = ""
        On Error Resume Next
        Logs.LogWarn "[Credentials] No credential found for " & TargetName & " (Error: " & Err.LastDllError & ")"
        Exit Function
    End If
    
    ' Copy credential structure
    CopyMemory cred, ByVal pCredential, LenB(cred)
    
    ' Extract API key bytes
    If cred.CredentialBlobSize > 0 Then
        ReDim apiKeyBytes(0 To cred.CredentialBlobSize - 1)
        CopyMemory apiKeyBytes(0), ByVal cred.CredentialBlob, cred.CredentialBlobSize
        
        ' Convert bytes to string (handle Unicode properly)
        Dim i As Long
        Dim resultStr As String
        resultStr = ""
        For i = 0 To UBound(apiKeyBytes)
            If apiKeyBytes(i) <> 0 Then
                resultStr = resultStr & Chr$(apiKeyBytes(i))
            End If
        Next i
        
        ReadCredential = resultStr
        On Error Resume Next
        Logs.LogInfo "[Credentials] Loaded credential for " & TargetName
    End If
    
    ' Free credential memory
    CredFree pCredential
    
    Exit Function

ErrHandler:
    ReadCredential = ""
    If pCredential <> 0 Then CredFree pCredential
    On Error Resume Next
    Logs.LogError "[Credentials] ReadCredential error for " & TargetName & ": " & Err.Description
End Function

' Delete credential from Windows Credential Manager
Public Function DeleteCredential(ByVal TargetName As String) As Boolean
    On Error GoTo ErrHandler
    
    Dim targetBytes() As Byte
    targetBytes = TargetName & vbNullChar
    
    Dim result As Long
    result = CredDeleteW(VarPtr(targetBytes(0)), CRED_TYPE_GENERIC, 0)
    
    If result <> 0 Then
        DeleteCredential = True
        On Error Resume Next
        Logs.LogInfo "[Credentials] Deleted credential for " & TargetName
    Else
        DeleteCredential = False
        On Error Resume Next
        Logs.LogWarn "[Credentials] Credential not found or failed to delete for " & TargetName & " (Error: " & Err.LastDllError & ")"
    End If
    
    Exit Function

ErrHandler:
    DeleteCredential = False
    On Error Resume Next
    Logs.LogError "[Credentials] DeleteCredential error for " & TargetName & ": " & Err.Description
End Function

' Open Windows Credential Manager UI
Public Sub OpenCredentialManager()
    On Error Resume Next
    shell "rundll32.exe keymgr.dll,KRShowKeyMgr", vbNormalFocus
    MsgBox "Windows Credential Manager opened." & vbCrLf & vbCrLf & _
           "Look for entries starting with 'ExcelVBA:'", vbInformation, "Credential Manager"
End Sub

' Test suite for credential operations
Public Sub TestCredentials()
    On Error GoTo ErrHandler
    
    Dim testTarget As String
    testTarget = "ExcelVBA:TestCredential"
    
    Dim choice As String
    choice = InputBox("Credentials Test Menu:" & vbCrLf & vbCrLf & _
                      "1 - Save test credential" & vbCrLf & _
                      "2 - Read test credential" & vbCrLf & _
                      "3 - Delete test credential" & vbCrLf & _
                      "4 - Open Credential Manager" & vbCrLf & _
                      "0 - Exit", "Credentials Test", "1")
    
    Select Case choice
        Case "1"
            Dim testKey As String
            testKey = "TestKey_" & Format(Now, "yyyymmddhhnnss")
            If SaveCredential(testTarget, testKey) Then
                MsgBox "Test credential saved successfully!" & vbCrLf & vbCrLf & _
                       "Target: " & testTarget & vbCrLf & _
                       "Value: " & testKey, vbInformation
            Else
                MsgBox "Failed to save test credential." & vbCrLf & vbCrLf & _
                       "Error: " & Err.LastDllError, vbExclamation
            End If
        
        Case "2"
            Dim readKey As String
            readKey = ReadCredential(testTarget)
            If Len(readKey) > 0 Then
                MsgBox "Credential read successfully!" & vbCrLf & vbCrLf & _
                       "Target: " & testTarget & vbCrLf & _
                       "Value: " & readKey, vbInformation
            Else
                MsgBox "No credential found or failed to read." & vbCrLf & vbCrLf & _
                       "Error: " & Err.LastDllError, vbExclamation
            End If
        
        Case "3"
            If DeleteCredential(testTarget) Then
                MsgBox "Test credential deleted successfully!", vbInformation
            Else
                MsgBox "No credential found or failed to delete." & vbCrLf & vbCrLf & _
                       "Error: " & Err.LastDllError, vbExclamation
            End If
        
        Case "4"
            OpenCredentialManager
        
        Case "0", ""
            Exit Sub
        
        Case Else
            MsgBox "Invalid choice. Please enter 0-4.", vbExclamation
    End Select
    
    Exit Sub

ErrHandler:
    On Error Resume Next
    Logs.LogError "[Credentials] TestCredentials error: " & Err.Description
    MsgBox "Error in test: " & Err.Description & vbCrLf & _
           "DLL Error: " & Err.LastDllError, vbCritical
End Sub

Sub CompleteTest()
    On Error Resume Next
    
    ' Test 1: Setup
    Debug.Print "=== Test 1: Setup Module ==="
    Debug.Print "Log Path: " & Setup.GetLogFilePath()
    Debug.Print "Temp Folder: " & Setup.GetTempFolder()
    Debug.Print ""
    
    ' Test 2: Save Credential
    Debug.Print "=== Test 2: Save Credential ==="
    Dim saveResult As Boolean
    saveResult = Credentials.SaveCredential("ExcelVBA:PushbulletAPI", "test_api_key_12345")
    Debug.Print "Save Result: " & saveResult
    Debug.Print "Last Error: " & Err.LastDllError
    Debug.Print ""
    
    ' Test 3: Read Credential
    Debug.Print "=== Test 3: Read Credential ==="
    Dim readResult As String
    readResult = Credentials.ReadCredential("ExcelVBA:PushbulletAPI")
    Debug.Print "Read Result: '" & readResult & "'"
    Debug.Print "Length: " & Len(readResult)
    Debug.Print "Last Error: " & Err.LastDllError
    Debug.Print ""
    
    ' Test 4: Check Pushbullet Status
    Debug.Print "=== Test 4: Pushbullet Status ==="
    Debug.Print "Is Enabled: " & MsgBoxPushBullet.IsPushbulletEnabled()
    
    MsgBox "Tests complete! Check Immediate Window (Ctrl+G) for results.", vbInformation
End Sub

