' v684 — visible-window launch (was hidden / Run …, 0, …).
' Antivirus signatures flag VBS that calls WshShell.Run with the
' hidden-window flag (0) because that's the classic dropper pattern.
' Switched to 1 (SW_NORMAL) so users see a brief console flash; the
' rest of the launch behavior is unchanged.

Set WshShell = CreateObject("WScript.Shell")
' Kill existing node processes first
WshShell.Run "taskkill /f /im node.exe", 1, True
' Start the server again
WshShell.Run "cmd.exe /c cd /d C:\VoxelEngine\ai-bridge && node server.js", 1, False