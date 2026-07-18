@echo off
setlocal
if "%~1"=="" (
  echo Usage: install_patch.cmd "D:\path\to\flutter_project"
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_patch.ps1" -ProjectPath "%~1"
exit /b %errorlevel%
