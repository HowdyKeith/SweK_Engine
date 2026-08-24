@echo off
REM ============================================================================
REM  Open-Engine.bat  (v1530, REVERSED AT v3981)
REM  Opens the SweK Engine in Chrome at LOCALHOST + the server.html landing page.
REM
REM  *** v3981 -- THIS USED TO OPEN THE LAN IP ON PURPOSE ("NOT 127.0.0.1 / localhost"),
REM  AND THAT ONE CHOICE SILENTLY DISABLED WebGPU ON EVERY PAGE THIS LAUNCHER OPENS.
REM  WebGPU is gated on a SECURE CONTEXT. https qualifies and localhost qualifies;
REM  http://<lan-ip>:8787 is NEITHER, so the browser does not define navigator.gpu
REM  there at all. Launching at the LAN address therefore put the machine that has
REM  the GPU on the one origin that cannot use it -- Keith hit exactly this on
REM  ising-bench, euler-gpu-check and lbm3d-gpu in a row, then asked the question
REM  that found it: "not sure why server.html is opening with ip, if localhost is
REM  needed?" It was not needed. The v1530 reason was to keep the LAN address in
REM  front of the user, and NOTHING ACTUALLY DEPENDED ON THE BROWSER BEING THERE:
REM  connect.html, hub.html, presence.html, macrodroid.html and phoneConnectQR all
REM  fetch /net/info for the LAN URL rather than reading location, and the QR helper
REM  has handled a localhost origin explicitly since v637 for this very reason. ***
REM
REM  The port still comes from GET /net/info (.port) so a bridge on a non-default
REM  port is followed; 8787 is only the bootstrap probe and the fallback. All logic
REM  is one powershell line on purpose (a batch if() block would premature-close on
REM  the parens inside powershell).
REM
REM  USE IT from your own launcher (e.g. the C:\Intel one that currently opens
REM  127.0.0.1): replace the browser-open line with a single call:
REM       call "%~dp0Open-Engine.bat"
REM  ...or just double-click this file once the bridge is up.
REM ============================================================================
powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; $pt=8787; try{$i=Invoke-RestMethod -Uri 'http://localhost:8787/net/info' -TimeoutSec 5; if($i -and $i.port){$pt=$i.port}}catch{}; $b='http://localhost:'+$pt; $pg='/server.html'; try{$bm=Invoke-RestMethod -Uri ($b+'/boot/mode') -TimeoutSec 4; if($bm -and $bm.url){$pg=$bm.url}}catch{}; $u=$b+$pg; $c=(Get-Command chrome -ErrorAction SilentlyContinue).Source; if(-not $c){ foreach($p in @($env:ProgramFiles+'\Google\Chrome\Application\chrome.exe', ${env:ProgramFiles(x86)}+'\Google\Chrome\Application\chrome.exe', $env:LocalAppData+'\Google\Chrome\Application\chrome.exe')){ if(Test-Path $p){$c=$p; break} } }; Write-Host ('opening ' + $u); if($c){ Start-Process $c $u } else { Start-Process $u }"
