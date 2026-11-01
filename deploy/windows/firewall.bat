@echo off
chcp 65001 >nul 2>nul
REM باز کردن پورت‌های لازم در فایروال ویندوز (Run as administrator)

netsh advfirewall firewall add rule name="Lucky HTTP 80" dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="Lucky HTTPS 443" dir=in action=allow protocol=TCP localport=443
netsh advfirewall firewall add rule name="Lucky app 3000" dir=in action=allow protocol=TCP localport=3000

echo.
echo پورت‌های 80 و 443 (برای HTTPS) و 3000 (برای تست) باز شدند.
echo یادت باشد در پنل ارائه‌دهندهٔ VPS هم همین پورت‌ها را باز کنی.
pause
