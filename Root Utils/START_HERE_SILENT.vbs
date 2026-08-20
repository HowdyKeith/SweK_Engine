' START_HERE_SILENT.vbs - root-level silent entry point.
'
' Same as START_HERE.bat but no console window. Delegates to
' WebGLEngine\Start_Everything.vbs which:
'   - Installs ai-bridge npm deps if missing (one-time, shows console briefly)
'   - Starts ai-bridge Node server hidden
'   - Starts KPopupListener hidden
'   - Opens Chrome to http://localhost:8787/
'
' Excel / VBA Transmitter is NOT required to play the browser engine.
' The Node-side ai-bridge hosts the WebSocket endpoint on its own.

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
' v3466 -- MOVED INTO "Root Utils", SO THE ROOT IS ONE LEVEL UP. This script derives the project root from
' its OWN location, which is the right way to do it and is exactly why the move needed a fix: unchanged, it
' would look for Root Utils\WebGLEngine and pop "layout broken" -- loudly, which is better than the .bat
' files that would simply have failed their cd, but still wrong.
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
target = root & "\WebGLEngine\Start_Everything.vbs"

If Not fso.FileExists(target) Then
    sh.Popup "EngineProject layout broken — " & target & " not found." & vbCrLf & vbCrLf & _
             "This .vbs must live at the root of the EngineProject archive, " & _
             "with WebGLEngine\ as a sibling folder.", _
             10, "EngineProject launcher", 16
    WScript.Quit 1
End If

sh.Run "wscript.exe """ & target & """", 0, False
