@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\deploy-live.ps1"
pause
