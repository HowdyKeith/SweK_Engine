# KPop Listener — VBA Modules (Excel/VBA integration)

These files are **Excel/VBA modules** — not used by the standalone
PowerShell listener. They're here for users who want to drive the
KPopListener pipeline **from an Excel workbook** (the .xlsm engine
side of the project).

You can ignore this folder entirely if you only use the listener
standalone (right-click tray icon → Open Dashboard).

## What's in here

### `.bas` files — VBA standard modules

| File | What it does |
|---|---|
| `Credentials.bas` | Read/write secrets from Windows Credential Manager (used by MsgBoxPushBullet for the Pushbullet API key, etc.) |
| `DiagnosePowerShellListener.bas` | One-click VBA macros to test that the PowerShell listener is reachable from Excel — pipe connect, file-watcher write, named-pipe write |
| `Logs.bas` | Lightweight log helpers — `LogInfo`, `LogWarn`, `LogError` macros that write to a CSV |
| `MsgBoxMSHTA.bas` | Pop a custom HTML message box via mshta.exe (HTML Application host) |
| `MsgBoxPushBullet.bas` | Send a notification to your phone via Pushbullet's REST API |
| `MsgBoxPython.bas` | Bridge to a Python helper for richer message boxes |
| `MsgBoxUnified.bas` | Wrapper that picks the best available MsgBox backend at runtime |
| `MsgBoxWinRT.bas` | Native Windows toast notification via the WinRT API |
| `Push2Run.bas` | Run an external program from a toast button click |
| `RibbonUI.bas` | Custom Excel ribbon tab integration (load + click handlers) |
| `Setup.bas` | First-time setup: register AppID, create folders, copy templates |
| `ToastMasterDemo.bas` | Demo macros showing every toast template + usage pattern |
| `ToastPythonLauncher.bas` | Toast button → launch a Python script |
| `ToastRegistry.bas` | Toast template registry (Success / Error / Progress / Reminder) |
| `ToastSystemTests.bas` | Self-test suite — checks each toast backend works |
| `ToastWatcherControl.bas` | Start/stop a file watcher from Excel |

### `.cls` files — VBA class modules

| File | What it does |
|---|---|
| `clsCallbacks.cls` | Class wrapper for VBA callback patterns (timers, events) |
| `clsFileIO.cls` | OOP wrapper for file read/write with error handling |
| `clsToastAnalytics.cls` | Track toast emission stats (count, success rate, types) |
| `clsToastNotification.cls` | Core toast object — title, body, type, actions, lifecycle |
| `clsToastProgress.cls` | Updatable progress toast (use `.SetProgress 0.55`) |
| `clsToastQueueManager.cls` | Queue with rate-limiting + dedup |
| `clsToastTemplateLibrary.cls` | In-memory cache of toast templates loaded from registry |

## How to use these in Excel

These import as standard VBA modules and classes:

1. Open your Excel workbook
2. Alt+F11 → opens the VBA editor
3. File → Import File → pick each `.bas` or `.cls` from this folder
4. The macros + classes are now available throughout the workbook
5. Save the workbook as `.xlsm` (macro-enabled)

To see what's running, the engine zip has the matching VoxelEngine
workbook that calls these modules from its `ThisWorkbook` /
`Workbook_Open` event handlers.

## Why are they here

Earlier versions of the archive mixed VBA modules + PowerShell modules
+ Python helpers all in the same folder, which made it hard to tell
what was actually needed for the standalone listener. v748 moved the
VBA bits into their own `vba/` subfolder so the parent `KPop Listener/`
directory only contains the files the PowerShell listener actually
uses at runtime.

If you don't open Excel and don't have a `.xlsm` workbook in your
EngineProject install, you can safely ignore this folder.
