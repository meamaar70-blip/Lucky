@echo off
REM ساخت تسک ویندوز برای اجرای خودکار Lucky پس از هر بوت
REM کلیک راست → Run as administrator

setlocal
set "APP=%~dp0..\.."
for %%I in ("%APP%") do set "APP=%%~fI"
set "PS=%TEMP%\lucky-task.ps1"

> "%PS%" echo $ErrorActionPreference = 'Stop'
>> "%PS%" echo $action  = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c ""%APP%\deploy\windows\start-service.bat""' -WorkingDirectory '%APP%'
>> "%PS%" echo $trigger = New-ScheduledTaskTrigger -AtStartup
>> "%PS%" echo $set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
>> "%PS%" echo Register-ScheduledTask -TaskName 'Lucky' -Action $action -Trigger $trigger -Settings $set -RunLevel Highest -User 'SYSTEM' -Force ^| Out-Null
>> "%PS%" echo Start-ScheduledTask -TaskName 'Lucky'
>> "%PS%" echo Write-Host 'تسک Lucky ساخته و اجرا شد.'

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS%"
del "%PS%" >nul 2>nul

echo.
echo بعد از بوت، Lucky خودکار اجرا می‌شود.
echo   اجرای فوری:  schtasks /Run    /TN "Lucky"
echo   توقف:        schtasks /End    /TN "Lucky"
echo   حذف:         schtasks /Delete /TN "Lucky" /F
pause
