' run-macro.vbs - v4159
' Run ONE macro in a workbook via Excel COM, and print a single machine-readable line.
'   cscript //NoLogo //B run-macro.vbs <workbookPath> <macroName>
' Requires Excel. Mirrors assemble-workbook.vbs's contract: last line is OK:<result> or ERROR:<code>.
'
' THE ALLOWLIST IS NOT HERE. It is in ai-bridge/vbaArchiveBridge.js, which refuses any name not on it before
' cscript is ever spawned. This script deliberately does not carry a second copy: two allowlists that must
' agree are one allowlist and one stale list, and the stale one is always the permissive one.
'
' The workbook is opened WITHOUT running its Workbook_Open, and is NOT saved on the way out. Running a macro
' should not silently rewrite the file it lives in.
Option Explicit
On Error Resume Next

Dim args : Set args = WScript.Arguments
If args.Count < 2 Then WScript.StdOut.Write "ERROR:usage" : WScript.Quit 2
Dim bookPath : bookPath = args(0)
Dim macroName : macroName = args(1)

Dim fso : Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FileExists(bookPath) Then WScript.StdOut.Write "ERROR:no-book" : WScript.Quit 3

Dim xl : Set xl = CreateObject("Excel.Application")
If Err.Number <> 0 Or xl Is Nothing Then WScript.StdOut.Write "ERROR:no-excel" : WScript.Quit 4
xl.Visible = False
xl.DisplayAlerts = False
xl.EnableEvents = False          ' do not fire Workbook_Open just to call one macro

Dim wb : Set wb = xl.Workbooks.Open(bookPath, False, True)   ' UpdateLinks:=False, ReadOnly:=True
If Err.Number <> 0 Or wb Is Nothing Then
    xl.Quit : WScript.StdOut.Write "ERROR:no-book" : WScript.Quit 3
End If

Err.Clear
Dim result : result = ""
result = xl.Run("'" & wb.Name & "'!" & macroName)
Dim runErr : runErr = Err.Number
Dim runDesc : runDesc = Err.Description
Err.Clear

wb.Close False                   ' never save
xl.Quit
Set wb = Nothing : Set xl = Nothing

If runErr <> 0 Then
    ' 1004 from Application.Run is what Excel raises for a macro it cannot find, which is a different thing
    ' for a caller to read than a macro that ran and failed.
    If InStr(runDesc, "cannot be found") > 0 Or InStr(runDesc, "Cannot run the macro") > 0 Then
        WScript.StdOut.Write "ERROR:no-macro" : WScript.Quit 5
    End If
    WScript.StdOut.Write "ERROR:run-failed:" & runDesc : WScript.Quit 6
End If

WScript.StdOut.Write "OK:" & CStr(result)
WScript.Quit 0
