' v684 — visible-window launch (was hidden / Run …, 0, …).
' Antivirus signatures flag VBS that calls WshShell.Run with the
' hidden-window flag (0) because that's the classic dropper pattern.
' Switched to 1 (SW_NORMAL) so users see a brief console flash; the
' rest of the launch behavior is unchanged.

Set WshShell = CreateObject("WScript.Shell")

' 1. Start the server hidden
command = "cmd.exe /c cd /d C:\VoxelEngine\ai-bridge && node server.js"
WshShell.Run command, 1, False

' 2. Wait 2 seconds for the server to initialize
WScript.Sleep 2000

' 3. Open the browser to the dashboard
WshShell.Run "http://localhost:3000"