@echo off
REM SweK Engine validation guard. Pass --core for a quick check.
node "%~dp0..\\WebGLEngine\tools\check.mjs" %*
pause
