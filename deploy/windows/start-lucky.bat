@echo off
REM اجرای Lucky روی ویندوز
REM این فایل را از داخل پوشهٔ برنامه اجرا کن (دابل‌کلیک)

setlocal
cd /d "%~dp0\..\.."

REM پوشهٔ داده‌ها — همهٔ اطلاعات اینجا ذخیره می‌شود
set "LUCKY_DATA_DIR=C:\lucky-data"
if not exist "%LUCKY_DATA_DIR%" mkdir "%LUCKY_DATA_DIR%"

set "PORT=3000"
set "HOST=0.0.0.0"
set "NODE_ENV=production"

echo.
echo  Lucky در حال اجراست:
echo    http://localhost:%PORT%
echo  پوشهٔ داده: %LUCKY_DATA_DIR%
echo  برای توقف: Ctrl+C
echo.

node server\index.js
pause
