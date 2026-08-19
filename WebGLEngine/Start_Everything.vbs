' v684 — visible-window launch (was hidden / Run …, 0, …).
' Antivirus signatures flag VBS that calls WshShell.Run with the
' hidden-window flag (0) because that's the classic dropper pattern.
' Switched to 1 (SW_NORMAL) so users see a brief console flash; the
' rest of the launch behavior is unchanged.

' Start_Everything.vbs
' VoxelEngine all-in-one silent launcher.
'
' First-run installs ai-bridge deps automatically. Skips re-starting
' the server if port 8787 is already bound. Skips starting another
' KPopupListener if one is already in the same workdir.
'
' Does, silently:
'   1. Installs ai-bridge deps if missing (FIRST RUN ONLY -- shows console once)
'   2. Starts ai-bridge server hidden (if not already running)
'   3. Starts KPopupListener hidden
'   4. Waits ~2 seconds
'   5. Opens http://localhost:8787/

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)

' --- 1. First-run dep install (visible -- one-time, only if needed) -------
nodeModules = root & "\ai-bridge\node_modules"
If Not fso.FolderExists(nodeModules) Then
    sh.Popup "First-run setup will install Node.js dependencies. A console window will open briefly, then close.", 5, "VoxelEngine", 64
    installCmd = "cmd.exe /c cd /d """ & root & "\ai-bridge"" && npm install"
    sh.Run installCmd, 1, True  ' visible, wait until done
End If

' --- 2. Check if server already running ----------------------------------
' netstat -ano filtered for LISTENING on 8787. Run returns 0 on match.
serverAlreadyRunning = False
Set exec = sh.Exec("cmd.exe /c netstat -ano | findstr /R /C"":8787 .*LISTENING""")
Do While exec.Status = 0
    WScript.Sleep 50
Loop
If Len(exec.StdOut.ReadAll) > 0 Then serverAlreadyRunning = True

If Not serverAlreadyRunning Then
    serverCmd = "cmd.exe /c cd /d """ & root & "\ai-bridge"" && node server.js"
    sh.Run serverCmd, 1, False
End If

' --- 3. KPopupListener (user's full archive) ----------------------------
kpopupPs = root & "\KPopupListener\KPopListener.ps1"
If fso.FileExists(kpopupPs) Then
    kpopupCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & kpopupPs & """"
    sh.Run kpopupCmd, 1, False
End If

' --- 4. Wait + open browser ----------------------------------------------
If Not serverAlreadyRunning Then WScript.Sleep 2000

' Round 43l - prefer Chrome over default
chromePF = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe"
chrome86 = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe"
chromeLA = sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Google\Chrome\Application\chrome.exe"
If fso.FileExists(chromePF) Then
    sh.Run """" & chromePF & """ http://localhost:8787/", 1, False
ElseIf fso.FileExists(chrome86) Then
    sh.Run """" & chrome86 & """ http://localhost:8787/", 1, False
ElseIf fso.FileExists(chromeLA) Then
    sh.Run """" & chromeLA & """ http://localhost:8787/", 1, False
Else
    sh.Run "http://localhost:8787/", 1, False
End If
