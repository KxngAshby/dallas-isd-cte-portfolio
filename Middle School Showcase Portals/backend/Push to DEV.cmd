@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\push-dev.ps1"
pause
