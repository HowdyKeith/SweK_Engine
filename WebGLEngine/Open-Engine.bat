@echo off
REM ============================================================================
REM  Open-Engine.bat  (v1530)
REM  Opens the SweK Engine in Chrome at the machine's real LAN address + the
REM  server.html landing page -- NOT 127.0.0.1 / localhost.
REM
REM  The relay computes its best non-virtual LAN URL at  GET /net/info
REM  (.recommended, e.g. http://192.168.10.109:8787/). We resolve it at runtime
REM  so the IP is never hardcoded. Falls back to localhost/server.html if the
REM  bridge isn't answering yet. All logic is one powershell line on purpose
REM  (a batch if() block would premature-close on the parens inside powershell).
REM
REM  USE IT from your own launcher (e.g. the C:\Intel one that currently opens
REM  127.0.0.1): replace the browser-open line with a single call:
REM       call "%~dp0Open-Engine.bat"
REM  ...or just double-click this file once the bridge is up.
REM ============================================================================
powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; try{$i=Invoke-RestMethod -Uri 'http://localhost:8787/net/info' -TimeoutSec 5; $u=$i.recommended}catch{}; if([string]::IsNullOrWhiteSpace($u)){$u='http://localhost:8787/'}; $b=$u.TrimEnd('/'); $pg='/server.html'; try{$bm=Invoke-RestMethod -Uri ($b+'/boot/mode') -TimeoutSec 4; if($bm -and $bm.url){$pg=$bm.url}}catch{}; $u=$b+$pg; $c=(Get-Command chrome -ErrorAction SilentlyContinue).Source; if(-not $c){ foreach($p in @($env:ProgramFiles+'\Google\Chrome\Application\chrome.exe', ${env:ProgramFiles(x86)}+'\Google\Chrome\Application\chrome.exe', $env:LocalAppData+'\Google\Chrome\Application\chrome.exe')){ if(Test-Path $p){$c=$p; break} } }; Write-Host ('opening ' + $u); if($c){ Start-Process $c $u } else { Start-Process $u }"
