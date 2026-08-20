# KPopListener

A modern Windows notification toolkit combining **PowerShell** and **VBA** (Excel/Access).

KPopListener makes it easy to display rich toast notifications, progress bars, unified message boxes, clipboard monitoring, TTS, tray icons, and more — with fast communication between VBA and PowerShell using **named pipes**.

## Features

- Rich Windows toast notifications with progress, templates, and analytics
- **Unified MsgBox** system with multiple backends (Toast, WinRT, MSHTA, Python, PushBullet, PowerShell)
- Persistent **PowerShell Listener** using named pipes for fast, reliable communication
- Clipboard auto-saver, Text-to-Speech (TTS), and system tray icon support
- VBA classes for progress toasts, queue management, callbacks, and analytics
- AppID management for branded toasts
- Setup, logging, Ribbon UI, and diagnostic tools

## Current Repository Structure

**PowerShell Core:**
- `KPopListener.ps1`, `KPopToast.psm1`, `KPopCommon.psm1`, `KPopLog.psm1`, `KPopSender.ps1`
- `KPopPipes.psm1`, `PipeManager.psm1`, `KPopWebSocket.psm1`, `NamedPipeSender.ps1`
- `KPopupClipSaverAdvanced.psm1`, `KPopupTTS.ps1`, `KPopupTrayIcon.psm1`
- `AppIDManager.psm1`, `AppIDTestHarness.ps1`

**VBA Core:**
- `MsgBoxUnified.bas` (main entry point)
- `Setup.bas`, `DiagnosePowerShellListener.bas`, `ToastMasterDemo.bas`
- Class modules: `clsToastProgress.cls`, `clsCallbacks.cls`, `clsToastQueueManager.cls`, `clsToastNotification.cls`, etc.
- Backend modules: `MsgBoxWinRT.bas`, `MsgBoxMSHTA.bas`, `MsgBoxPython.bas`, `MsgBoxPushBullet.bas`, `ToastPythonLauncher.bas`

**Helpers & Tests:**
- `Logs.bas`, `Credentials.bas`, `RibbonUI.bas`, `Push2Run.bas`, `ToastRegistry.bas`
- Test files: `Test-NamedPipe.ps1`, `RunME_Example.ps1`, `ToastSystemTests.bas`

## Getting Started

### VBA Setup (Excel / Access)
1. Open your file → `Alt + F11`
2. Import the following key files:
   - `Setup.bas`
   - `MsgBoxUnified.bas`
   - `DiagnosePowerShellListener.bas`
   - `ToastMasterDemo.bas`
   - All `cls*.cls` files you need
3. Run the `Setup` macro once to configure registry settings.

### PowerShell Setup
```powershell
Import-Module .\KPopCommon.psm1
Import-Module .\KPopToast.psm1
Import-Module .\KPopPipes.psm1
Detailed VBA Examples
1. Simple Toast
vbaSub ShowSimpleToast()
    Call SendToast("KPopListener", "Hello from VBA!", "Notification sent successfully.")
End Sub
2. Unified Message Box (Recommended)
vbaSub TestMsgBoxUnified()
    Dim Response As VbMsgBoxResult
    Response = MsgBoxUnified("Do you want to continue?", vbYesNo + vbQuestion, "KPopListener", "Toast")
    
    If Response = vbYes Then
        Call MsgBoxUnified("You chose Yes!", vbInformation)
    End If
End Sub
3. Progress Toast
vbaSub ShowProgressToast()
    Dim prog As clsToastProgress
    Set prog = New clsToastProgress
    prog.Title = "Processing Files"
    prog.Message = "Please wait..."
    prog.Show
    
    Dim i As Integer
    For i = 10 To 100 Step 10
        prog.UpdateProgress i, i & "% complete"
        Application.Wait Now + TimeValue("0:00:01")
    Next i
    
    prog.Complete "All files processed successfully!"
End Sub
4. Run Demo
Import and run ToastMasterDemo.bas for multiple ready-to-use examples.
PowerShell Listener (Named Pipes)
The PowerShell Listener runs a persistent background process that listens for commands via named pipes. This is much faster and more reliable than launching PowerShell every time.
Key files:

KPopListener.ps1 – Starts the listener
KPopPipes.psm1 + PipeManager.psm1 – Handles framed protocol, CRC, compression, and auto-reconnect
KPopSender.ps1 / NamedPipeSender.ps1 – Send commands to the listener
DiagnosePowerShellListener.bas – VBA tool to diagnose and connect

Starting the Listener from VBA
vbaSub StartListener()
    Dim shell As Object
    Set shell = CreateObject("WScript.Shell")
    shell.Run "powershell.exe -ExecutionPolicy Bypass -File ""KPopListener.ps1""", 0, False
End Sub
Diagnosing the Listener
vbaSub DiagnoseListener()
    Call DiagnosePowerShellListener
End Sub
PowerShell Examples
PowerShell# Start the listener
.\KPopListener.ps1

# Send a toast using the sender
.\KPopSender.ps1 -Title "KPopListener" -Message "Hello from PowerShell!" -Type Info
Contributing
Feel free to improve VBA integration, add new notification backends, enhance the listener, or expand tests.
License
Open source (consider adding a LICENSE file).

Built for Office automation enthusiasts and PowerShell developers who need reliable Windows notifications.

---

## Python listener (alternative to the PowerShell one) — `KPopListener.py`

A drop-in alternative for when you'd rather not run PowerShell. It speaks the
same contract as `KPopListener.ps1`, so existing senders keep working:

- **File drop** (always on, no deps): write `<name>Request.json` into
  `%TEMP%\KPopListener\` with `{"Title": "...", "Message": "...", "Type": "info|success|warn|error|system", "Text": "optional TTS"}` — it pops a toast and deletes the file.
- **Named pipe** `\\.\pipe\KPopListenerPipe_<PID>` (byte-mode + `OK` ACK) — needs `pip install pywin32`.
- **WebSocket** `--enable-websocket [--websocket-port 8080]` — needs `pip install websockets`.
- **MQTT** `--enable-mqtt --mqtt-broker ... --mqtt-sub-topic kpop/in` — needs `pip install paho-mqtt`.

Lowercase keys (`title`/`msg`/`message`/`text`/`type`) are accepted too, so the
WebSocket toast schema works. Status is written to
`%TEMP%\KPopListener\ListenerStatus.json` **and** `%TEMP%\KPopStatus.json` (the
name the PS dashboard polls), plus a PID file — the JSON includes the live
`PipeName` so a sender can discover the PID-suffixed pipe.

**Toast backends**, tried in order: `windows-toasts` → `win11toast` →
`win10toast` → console. Install one for real toasts: `pip install windows-toasts`.
Optional `pip install pyttsx3` speaks the `Text` field.

```
python KPopListener.py                          # file drop + pipe
python KPopListener.py --enable-websocket       # + ws on :8080
```

Notes: syntax-checked + the file-drop→toast→status path was smoke-tested, but the
real Windows toast + named-pipe paths are UNTESTED from the build sandbox —
verify on Windows. This is *parallel* to the PS listener; don't run both against
the same pipe/file dir at once. (There's also a second copy of this folder at
`WebGLEngine/KPopupListener/` — the .py lives here in the canonical `KPop Listener/`.)
