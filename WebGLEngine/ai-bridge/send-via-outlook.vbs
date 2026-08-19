' send-via-outlook.vbs - v1023
' Send one email through the installed Outlook via COM, the same external-VBS /
' cscript pattern the VBA Transmitter uses (OutlookExternal.bas). Run with:
'   cscript //NoLogo //B send-via-outlook.vbs <msgFile>
' <msgFile> is a UTF-8 file: to(;-joined) + sentinel + subject + sentinel + body.
' Tries Outlook.Application first, then OutlookManager.Application (Geek's rig).
Option Explicit
On Error Resume Next

Dim args : Set args = WScript.Arguments
If args.Count < 1 Then WScript.Quit 2
Dim msgFile : msgFile = args(0)

' read the message as UTF-8 (ADODB.Stream so the body's unicode survives)
Dim s : Set s = CreateObject("ADODB.Stream")
s.Charset = "utf-8" : s.Open : s.LoadFromFile msgFile
Dim raw : raw = s.ReadText : s.Close
If Err.Number <> 0 Then WScript.Quit 3

Dim parts : parts = Split(raw, vbLf & "---PETFBI---" & vbLf)
If UBound(parts) < 4 Then WScript.Quit 3
Dim toAddr, ccAddr, bccAddr, subj, body, attaches
toAddr = parts(0) : ccAddr = parts(1) : bccAddr = parts(2) : subj = parts(3) : body = parts(4)
If UBound(parts) >= 5 Then attaches = parts(5) Else attaches = ""

' connect to (or start) Outlook - standard ProgID first, then the Transmitter's
Dim ol
Set ol = CreateObject("Outlook.Application")
If Err.Number <> 0 Or ol Is Nothing Then
    Err.Clear
    Set ol = CreateObject("OutlookManager.Application")
End If
If Err.Number <> 0 Or ol Is Nothing Then WScript.Quit 4

Dim mail : Set mail = ol.CreateItem(0)   ' 0 = olMailItem
mail.To = toAddr
If Len(ccAddr) > 0 Then mail.CC = ccAddr
If Len(bccAddr) > 0 Then mail.BCC = bccAddr
mail.Subject = subj
mail.Body = body
If Len(attaches) > 0 Then
    Dim fsoA : Set fsoA = CreateObject("Scripting.FileSystemObject")
    Dim ap, apath
    For Each ap In Split(attaches, "|")
        apath = Trim(ap)
        If Len(apath) > 0 Then
            If fsoA.FileExists(apath) Then mail.Attachments.Add apath
        End If
    Next
End If
mail.Send
If Err.Number <> 0 Then WScript.Quit 5

WScript.Quit 0
