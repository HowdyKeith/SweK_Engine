' assemble-workbook.vbs - v1124
' Build a workbook from a folder of VBA source modules, via Excel COM + the VBE.
' Imports every .bas/.cls/.frm in the folder (skipping document modules like
' ThisWorkbook / Sheet*) into a fresh workbook and saves it.
'   cscript //NoLogo //B assemble-workbook.vbs <srcFolder> <outPath> [xlsm|xlsb|xlsx]
' Requires Excel + "Trust access to the VBA project object model"
' (Excel > Options > Trust Center > Trust Center Settings > Macro Settings).
Option Explicit
On Error Resume Next

Dim args : Set args = WScript.Arguments
If args.Count < 2 Then WScript.StdOut.Write "ERROR:usage" : WScript.Quit 2
Dim srcDir : srcDir = args(0)
Dim outPath : outPath = args(1)
Dim fmt : If args.Count >= 3 Then fmt = LCase(args(2)) Else fmt = "xlsm"

Dim fso : Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FolderExists(srcDir) Then WScript.StdOut.Write "ERROR:no-folder" : WScript.Quit 3
Dim outDir : outDir = fso.GetParentFolderName(outPath)
If outDir <> "" And Not fso.FolderExists(outDir) Then fso.CreateFolder(outDir)

Dim xl : Set xl = CreateObject("Excel.Application")
If Err.Number <> 0 Or xl Is Nothing Then WScript.StdOut.Write "ERROR:no-excel" : WScript.Quit 4
xl.Visible = False
xl.DisplayAlerts = False

Dim wb : Set wb = xl.Workbooks.Add
Dim vbp : Set vbp = wb.VBProject
If Err.Number <> 0 Or vbp Is Nothing Then
    wb.Close False : xl.Quit
    WScript.StdOut.Write "ERROR:vba-trust"
    WScript.Quit 5
End If

Dim imported, skipped, f, ext, base
imported = 0 : skipped = 0
For Each f In fso.GetFolder(srcDir).Files
    ext = LCase(fso.GetExtensionName(f.Name))
    base = fso.GetBaseName(f.Name)
    If ext = "bas" Or ext = "cls" Or ext = "frm" Then
        If IsDocModule(base) Then
            skipped = skipped + 1
        Else
            Err.Clear
            vbp.VBComponents.Import f.Path
            If Err.Number = 0 Then
                imported = imported + 1
            Else
                skipped = skipped + 1 : Err.Clear
            End If
        End If
    End If
Next

Dim ff
If fmt = "xlsb" Then
    ff = 50          ' xlExcel12 (binary, macro-enabled)
ElseIf fmt = "xlsx" Then
    ff = 51          ' xlOpenXMLWorkbook (NOTE: drops VBA)
Else
    ff = 52          ' xlOpenXMLWorkbookMacroEnabled (.xlsm)
End If

Err.Clear
wb.SaveAs outPath, ff
If Err.Number <> 0 Then
    wb.Close False : xl.Quit
    WScript.StdOut.Write "ERROR:save-failed:" & Err.Description
    WScript.Quit 6
End If
wb.Close False
xl.Quit
WScript.StdOut.Write "OK:" & imported & ":" & skipped & ":" & outPath
WScript.Quit 0

Function IsDocModule(nm)
    Dim n : n = LCase(nm)
    IsDocModule = (n = "thisworkbook" Or n = "workbook" Or Left(n, 5) = "sheet")
End Function
