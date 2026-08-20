@echo off
REM swek-cmd.bat - tiny forwarder so Push2Run (or any hotkey/clipboard tool) can
REM drive a RUNNING SweK Engine. Usage:
REM   swek-cmd.bat demo city_builder     (run a demo by id - ids are in the demo menu)
REM   swek-cmd.bat next                  (next demo)
REM   swek-cmd.bat random                (dealer's choice)
REM   swek-cmd.bat pause | resume | stop
REM   swek-cmd.bat perf                  (toggle the perf dashboard)
REM In Push2Run: Action = "Run a program", Program = full path to this .bat,
REM Parameters = the verb + optional id (e.g.  demo city_builder ).
REM Uses Windows' built-in curl.exe (Windows 10+). Bridge must be running on 8787.
curl -s "http://127.0.0.1:8787/push2run/exec?cmd=%~1&id=%~2&line=%~2" >nul 2>&1
exit /b 0
