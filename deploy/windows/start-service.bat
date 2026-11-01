@echo off
chcp 65001 >nul 2>nul
REM نسخهٔ سرویسی: بدون pause و بدون پنجرهٔ اضافه
cd /d "%~dp0..\.."

set "LUCKY_DATA_DIR=C:\lucky-data"
if not exist "%LUCKY_DATA_DIR%" mkdir "%LUCKY_DATA_DIR%"
set "PORT=3000"
set "HOST=0.0.0.0"
set "NODE_ENV=production"

where node >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\nodejs\node.exe" (
    "C:\Program Files\nodejs\node.exe" server\index.js
    goto :eof
  )
  echo Node.js پیدا نشد.  >> "C:\lucky-data\service-error.log"
  exit /b 1
)
node server\index.js
