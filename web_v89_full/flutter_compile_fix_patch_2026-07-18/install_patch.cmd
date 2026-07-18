@echo off
set /p PROJECT_PATH=Nhap duong dan project Flutter: 
powershell -ExecutionPolicy Bypass -File "%~dp0install_patch.ps1" -ProjectPath "%PROJECT_PATH%"
pause
