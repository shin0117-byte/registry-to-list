@echo off
setlocal
cd /d "%~dp0"
set "paddlePython=%~dp0.paddleocr-venv\Scripts\python.exe"
if exist "%paddlePython%" (
  start "Registry local website" /min "%paddlePython%" "%~dp0paddle-ocr\local_web_server.py"
  exit /b 0
)
py -3 --version >nul 2>&1
if not errorlevel 1 (
  start "Registry local website" /min py -3 "%~dp0paddle-ocr\local_web_server.py"
  exit /b 0
)
set "nodeExe=C:\Users\PC01\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%nodeExe%" (
  start "Registry service" /min cmd /c "\"%nodeExe%\" server.mjs"
  timeout /t 2 /nobreak >nul
  start "" "http://127.0.0.1:4173/"
  exit /b 0
)
echo Python 3 is required for the local edition.
echo Download it at https://www.python.org/downloads/windows/ and select Add python.exe to PATH.
pause
