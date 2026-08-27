@echo off
setlocal
cd /d "%~dp0"

set "nodeExe=C:\Users\PC01\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%nodeExe%" (
  echo 找不到本機執行環境，無法啟動本機系統。
  echo 請回到 Codex 重新執行系統，或聯絡管理人員。
  pause
  exit /b 1
)

start "謄本轉清冊系統服務" /min cmd /c "\"%nodeExe%\" server.mjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4173/"
