@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0paddle-ocr\Install-PaddleOCR.ps1"
if errorlevel 1 pause
