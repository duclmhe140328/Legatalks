@echo off
setlocal
set "PROJECT=D:\fullweb\Legatalks\web_v89_full"
if not "%~1"=="" set "PROJECT=%~1"
set "TARGET=%PROJECT%\apps\web\src\components\JitsiMeetFrame.jsx"
if not exist "%TARGET%" (
  echo ERROR: File not found: %TARGET%
  exit /b 1
)
copy /Y "%TARGET%" "%TARGET%.bak_no_duplicate" >nul
copy /Y "%~dp0JitsiMeetFrame.jsx" "%TARGET%" >nul
if errorlevel 1 (
  echo ERROR: Could not replace JitsiMeetFrame.jsx
  exit /b 1
)
echo DONE: Jitsi duplicate participant guard installed.
echo Backup: %TARGET%.bak_no_duplicate
endlocal
