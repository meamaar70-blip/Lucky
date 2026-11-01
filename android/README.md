# APK اندروید Lucky

این پوشه یک پوستهٔ WebView است: برنامه را از آدرس سرور Lucky باز می‌کند.

## ساخت خودکار (GitHub Actions)

با هر تغییر در `android/**` فایل `apk.yml` اجرا می‌شود و APK را به‌عنوان
artifact با نام `lucky-apk` می‌گذارد:

```bash
gh run list --workflow apk.yml
gh run download <run-id> -n lucky-apk
```

## ساخت دستی

```bash
cd android
gradle assembleDebug      # خروجی: app/build/outputs/apk/debug/
gradle assembleRelease    # با کلید دیباگ امضا می‌شود
```

## نصب روی گوشی

1. APK را منتقل کن و نصب کن (نصب از منابع ناشناس را اجازه بده).
2. آدرس سرور را وارد کن:
   - سرور روی همان وای‌فای: `http://192.168.1.5:3000`
   - نسخهٔ اینترنتی: `https://example.com`
3. دکمهٔ «باز کردن».

آدرس را بعداً می‌توانی با دکمهٔ بازگشت گوشی، وقتی در صفحهٔ اصلی هستی، عوض کنی.
