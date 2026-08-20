# WebGLEngine/ai-bridge/installers/kill-engine.ps1 -- v3658
#
# Reap a stale engine: the node process whose command line names server.js, and nothing else.
#
# *** WHY THIS IS A FILE AND NOT A LINE. Until v3658 the launcher WROTE this script into %TEMP%, RAN it with
# -ExecutionPolicy Bypass, and DELETED it. That is the textbook dropper sequence -- drop, execute with policy
# bypass, remove the evidence -- and on 2026-08-10 Avast's Behaviour Shield quarantined START_NODE_Engine.bat as
# IDP.ALEXA.54 for doing it. THE DETECTION WAS RIGHT ABOUT THE SHAPE AND WRONG ABOUT THE INTENT, which is the
# only thing a behavioural heuristic can be.
#
# The original reason for the temp file was real and is recorded in the launcher: "inline PowerShell with
# quotes/pipes/braces is a batch parsing footgun." THAT REASON DISAPPEARS THE MOMENT THE SCRIPT IS A FILE ON
# DISK -- there is nothing left for cmd to mis-parse. So the fix costs no capability at all: same CIM query,
# same match, same Stop-Process, and the drop-execute-delete sequence is gone. ***
#
# THE REGEX IS 'X\.js' WITH ONE BACKSLASH. My generator emitted TWO ('X\\.js'), which in a PowerShell
# regex means A LITERAL BACKSLASH FOLLOWED BY ANY CHARACTER and would have matched NOTHING -- so the reaper
# would have silently stopped reaping and the only symptom would be a stale process nobody could explain.
# FOUR ESCAPING LAYERS IN ONE LINE (python -> file -> cmd -> powershell regex) AND THE FAILURE IS SILENT.
#
# MATCHES BY COMMAND LINE ON PURPOSE, so only OUR process dies: a bare "kill every node.exe" would take out
# anything else the user happens to be running.

$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'server\.js' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
