@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0collectors\account-collector.ps1"
if errorlevel 1 (
  echo.
  echo Collector stopped with an error. Review the message above.
  pause
)
endlocal
