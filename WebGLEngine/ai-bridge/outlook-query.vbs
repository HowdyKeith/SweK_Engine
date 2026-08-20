' outlook-query.vbs - v1024
' Query the installed Outlook via COM, same external-VBS / cscript pattern as the
' VBA Transmitter (OutlookExternal.bas). Prints a one-line result to stdout.
'   cscript //NoLogo //B outlook-query.vbs unread
'   cscript //NoLogo //B outlook-query.vbs rules
'   cscript //NoLogo //B outlook-query.vbs runrule "Rule Name"
Option Explicit
On Error Resume Next

Dim args : Set args = WScript.Arguments
Dim op : If args.Count >= 1 Then op = LCase(args(0)) Else op = "unread"

' connect to a running Outlook (Geek's ProgID first per his rig, then standard, then start one)
Dim ol
Set ol = GetObject(, "OutlookManager.Application")
If Err.Number <> 0 Or ol Is Nothing Then Err.Clear : Set ol = GetObject(, "Outlook.Application")
If Err.Number <> 0 Or ol Is Nothing Then Err.Clear : Set ol = CreateObject("Outlook.Application")
If Err.Number <> 0 Or ol Is Nothing Then WScript.StdOut.Write "ERROR:no-outlook" : WScript.Quit 4

Dim ns : Set ns = ol.GetNamespace("MAPI")

If op = "unread" Then
    Dim inbox : Set inbox = ns.GetDefaultFolder(6)   ' olFolderInbox
    If Err.Number <> 0 Then WScript.StdOut.Write "ERROR:no-inbox" : WScript.Quit 5
    WScript.StdOut.Write "UNREAD:" & inbox.UnreadItemCount
    WScript.Quit 0

ElseIf op = "rules" Then
    Dim rules, r, out
    Set rules = ns.DefaultStore.GetRules()
    If Err.Number <> 0 Then WScript.StdOut.Write "ERROR:no-rules" : WScript.Quit 5
    out = ""
    For Each r In rules
        out = out & r.Name & vbTab & CStr(r.Enabled) & vbLf
    Next
    WScript.StdOut.Write out
    WScript.Quit 0

ElseIf op = "runrule" Then
    Dim nm : If args.Count >= 2 Then nm = args(1) Else nm = ""
    If nm = "" Then WScript.StdOut.Write "ERROR:no-name" : WScript.Quit 2
    Dim rules2, r2
    Set rules2 = ns.DefaultStore.GetRules()
    If Err.Number <> 0 Then WScript.StdOut.Write "ERROR:no-rules" : WScript.Quit 5
    For Each r2 In rules2
        If r2.Name = nm Then
            If r2.Enabled Then
                r2.Execute False, ns.GetDefaultFolder(6)
                If Err.Number <> 0 Then WScript.StdOut.Write "ERROR:exec-failed" : WScript.Quit 6
                WScript.StdOut.Write "OK:executed"
                WScript.Quit 0
            Else
                WScript.StdOut.Write "ERROR:disabled"
                WScript.Quit 3
            End If
        End If
    Next
    WScript.StdOut.Write "ERROR:not-found"
    WScript.Quit 3

ElseIf op = "list" Then
    ' list N recent inbox mail items as a JSON array (newest first).
    '   cscript //NoLogo //B outlook-query.vbs list 10
    Dim nWanted : If args.Count >= 2 Then nWanted = CInt(args(1)) Else nWanted = 10
    If Err.Number <> 0 Then Err.Clear : nWanted = 10
    Dim ibx : Set ibx = ns.GetDefaultFolder(6)   ' olFolderInbox
    If Err.Number <> 0 Then WScript.StdOut.Write "ERROR:no-inbox" : WScript.Quit 5
    Dim itms : Set itms = ibx.Items
    itms.Sort "[ReceivedTime]", True              ' descending = newest first
    Dim itm, c2, jout, bdy, addr
    c2 = 0 : jout = "["
    For Each itm In itms
        If c2 >= nWanted Then Exit For
        If itm.Class = 43 Then                    ' olMail
            addr = "" : addr = itm.SenderEmailAddress
            bdy = "" : bdy = itm.Body
            If Len(bdy) > 4000 Then bdy = Left(bdy, 4000)
            If c2 > 0 Then jout = jout & ","
            jout = jout & "{""entryId"":""" & JEsc(itm.EntryID) & """,""from"":""" & JEsc(addr) & _
                """,""fromName"":""" & JEsc(itm.SenderName) & """,""subject"":""" & JEsc(itm.Subject) & _
                """,""received"":""" & JEsc(CStr(itm.ReceivedTime)) & """,""unread"":" & LCase(CStr(itm.UnRead)) & _
                ",""hasAttachment"":" & LCase(CStr(itm.Attachments.Count > 0)) & _
                ",""body"":""" & JEsc(bdy) & """}"
            c2 = c2 + 1
        End If
    Next
    jout = jout & "]"
    WScript.StdOut.Write jout
    WScript.Quit 0
ElseIf op = "markread" Then
    Dim eid : If args.Count >= 2 Then eid = args(1) Else eid = ""
    If Len(eid) = 0 Then WScript.StdOut.Write "ERROR:no-entryid" : WScript.Quit 6
    Dim mr : Set mr = ns.GetItemFromID(eid)
    If Err.Number <> 0 Or mr Is Nothing Then WScript.StdOut.Write "ERROR:not-found" : WScript.Quit 7
    mr.UnRead = False
    mr.Save
    If Err.Number <> 0 Then WScript.StdOut.Write "ERROR:save-failed" : WScript.Quit 8
    WScript.StdOut.Write "OK:markread"
    WScript.Quit 0
ElseIf op = "categorize" Then
    Dim ceid : If args.Count >= 2 Then ceid = args(1) Else ceid = ""
    Dim cat : If args.Count >= 3 Then cat = args(2) Else cat = "Processed"
    If Len(ceid) = 0 Then WScript.StdOut.Write "ERROR:no-entryid" : WScript.Quit 6
    Dim ci : Set ci = ns.GetItemFromID(ceid)
    If Err.Number <> 0 Or ci Is Nothing Then WScript.StdOut.Write "ERROR:not-found" : WScript.Quit 7
    If Len(ci.Categories) > 0 Then ci.Categories = ci.Categories & "," & cat Else ci.Categories = cat
    ci.Save
    If Err.Number <> 0 Then WScript.StdOut.Write "ERROR:save-failed" : WScript.Quit 8
    WScript.StdOut.Write "OK:categorize"
    WScript.Quit 0
End If

WScript.StdOut.Write "ERROR:unknown-op"
WScript.Quit 1

' JSON string escaper (quotes, backslashes, CR/LF/tab)
Function JEsc(s)
    Dim t : t = s & ""
    t = Replace(t, "\", "\\")
    t = Replace(t, """", "\""")
    t = Replace(t, vbCrLf, "\n")
    t = Replace(t, vbCr, "\n")
    t = Replace(t, vbLf, "\n")
    t = Replace(t, vbTab, " ")
    JEsc = t
End Function
