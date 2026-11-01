@echo off
chcp 65001 >nul 2>nul
REM نصب یک‌بارهٔ وابستگی‌ها — همین فایل را دابل‌کلیک کن
setlocal enabledelayedexpansion
cd /d "%~dp0..\.."
echo.
echo  پوشهٔ برنامه: %CD%
echo.

if not exist "package.json" (
  echo  [X] package.json اینجا نیست.
  echo      یعنی فایل‌ها را در پوشهٔ اشتباهی باز کردی.
  echo      zip را در C:\ باز کن تا مسیر C:\lucky\package.json ساخته شود.
  pause
  exit /b 1
)
echo  [OK] package.json پیدا شد.
if exist "package-lock.json" (echo  [OK] package-lock.json پیدا شد.) else (echo  [!] package-lock.json نیست؛ از npm install استفاده می‌کنم.)
if exist "server\index.js" (echo  [OK] server\index.js پیدا شد.) else (echo  [X] پوشهٔ server نیست. & pause & exit /b 1)

where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js نصب نیست. از nodejs.org نسخهٔ LTS را نصب کن و cmd را ببند و باز کن.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo  [OK] Node %%v

echo.
echo  نصب بسته‌ها... (یکی دو دقیقه)
if exist "package-lock.json" (
  call npm ci --omit=dev
  if errorlevel 1 (
    echo  [!] npm ci نشد؛ npm install را امتحان می‌کنم.
    call npm install --omit=dev
  )
) else (
  call npm install --omit=dev
)

if not exist "node_modules\express\package.json" (
  echo.
  echo  [X] نصب کامل نشد. متن خطای بالا را ببین.
  echo      اگر خطای شبکه بود:  npm config set registry https://registry.npmjs.org/
  pause
  exit /b 1
)

echo.
echo  [OK] همه‌چیز نصب شد.
echo  حالا این را اجرا کن:  deploy\windows\start-lucky.bat
pause
