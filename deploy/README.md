# اجرای Lucky روی سرور

## سریع‌ترین راه: یک دستور

روی VPS (اوبونتو/دبیان)، داخل پوشهٔ مخزن:

```bash
bash deploy/install-vps.sh                  # اگر دامنه نداری (از sslip.io استفاده می‌کند)
bash deploy/install-vps.sh --domain lucky.ir  # اگر دامنه داری
```

اسکریپت خودش داکر را نصب می‌کند، پورت‌ها را باز می‌کند، تصویر را می‌سازد،
HTTPS را می‌گیرد و در آخر آدرس نهایی را چاپ می‌کند. بعد فقط همان آدرس را در اپ
اندروید وارد کن.

اگر می‌خواهی APK از پیش پر باشد، در گیت‌هاب:

**Settings → Secrets and variables → Actions → Variables → New variable**
نام: `LUCKY_SERVER_URL` — مقدار: `https://<همان آدرس>`

و بعد یک تغییر کوچک در `android/**` پوش کن؛ APK تازه در Releases آماده می‌شود.

---

بقیهٔ راه‌ها (دستی) در ادامه آمده است. اگر داکر داری، **راه ۱** کامل‌ترین است.

پیش‌نیاز همهٔ راه‌ها: یک دامنه که رکورد `A` آن به آی‌پی سرور اشاره کند.
HTTPS لازم است، نه فقط برای امنیت: نصب PWA، Service Worker و اعلان‌های مرورگر
فقط روی `https` کار می‌کنند.

---

## راه ۱ — داکر + Caddy (HTTPS خودکار)

```bash
git clone https://github.com/meamaar70-blip/Lucky.git
cd Lucky

cp deploy/.env.example .env
nano .env            # DOMAIN=lucky.example.com  و  EMAIL=you@example.com

docker compose up -d --build
docker compose logs -f
```

Caddy خودش گواهی Let's Encrypt می‌گیرد. بعد از چند ثانیه:

```bash
curl https://lucky.example.com/api/health
# {"ok":true,...}
```

فایروال: پورت‌های ۸۰ و ۴۴۳ باز باشند. پورت ۳۰۰۰ فقط روی `127.0.0.1` باز است.

---

## راه ۲ — داکر بدون Caddy (خودت nginx/SSL داری)

در `docker-compose.yml` سرویس `caddy` را پاک کن (یا `docker compose up -d lucky`)،
بعد `deploy/nginx.conf` را در nginx بگذار و دامنه/مسیر گواهی را عوض کن:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/lucky
sudo ln -s /etc/nginx/sites-available/lucky /etc/nginx/sites-enabled/
sudo certbot --nginx -d lucky.example.com
sudo nginx -t && sudo systemctl reload nginx
```

`client_max_body_size 200m` را حتماً نگه دار؛ PDFها بزرگ‌اند.

---

## راه ۳ — بدون داکر (Node 20 + systemd)

```bash
sudo useradd -r -m -d /opt/lucky lucky
sudo -u lucky git clone https://github.com/meamaar70-blip/Lucky.git /opt/lucky
cd /opt/lucky
sudo -u lucky npm ci --omit=dev
sudo mkdir -p /var/lib/lucky && sudo chown lucky:lucky /var/lib/lucky

sudo cp deploy/lucky.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lucky
systemctl status lucky
```

بعد nginx را طبق راه ۲ تنظیم کن. برنامه روی `127.0.0.1:3000` گوش می‌دهد.

---

## اتصال اپ اندروید

دو حالت دارد:

**الف) آدرس را در خود اپ می‌زنی** (بدون ساخت دوباره):
اپ را نصب کن، در اولین اجرا `https://lucky.example.com` را وارد کن. تمام.

**ب) آدرس از پیش پر باشد:**
در گیت‌هاب → Settings → Secrets and variables → Actions → تب **Variables** →
`New repository variable` با نام `LUCKY_SERVER_URL` و مقدار `https://lucky.example.com`.
بعد:

```bash
cd Lucky
git commit --allow-empty -m "بازسازی APK با آدرس سرور"   # یا هر تغییری در android/**
git push
```

ورک‌فلو `ساخت APK` اجرا می‌شود و APK با آدرس از پیش پرشده در Releases می‌آید.
(همین حالا هم می‌توانی APK فعلی را نصب کنی و آدرس را دستی بدهی.)

---

## پشتیبان‌گیری

همهٔ داده‌ها در والیوم `lucky-data` (یا `LUCKY_DATA_DIR`) هستند: `db.json`،
PDFهای اصلی، متن استخراج‌شده و پاورپوینت‌های ساخته‌شده.

```bash
# نسخهٔ داکری
docker run --rm -v lucky-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/lucky-$(date +%F).tgz -C /data .

# نسخهٔ systemd
sudo tar czf ~/lucky-$(date +%F).tgz -C /var/lib/lucky .
```

برگرداندن: همان دستور با `tar xzf` به مقصد.

---

## به‌روزرسانی

```bash
cd Lucky && git pull
docker compose up -d --build      # یا: sudo systemctl restart lucky
```

داده‌ها دست نمی‌خورند؛ برنامه هیچ‌وقت روی `data/` نمی‌نویسد مگر با درخواست خودت.

---

## امنیت (مهم)

Lucky **احراز هویت ندارد**؛ هر کسی که آدرس را بداند می‌تواند درس‌ها، کتاب‌ها و
آزمون‌ها را ببیند یا پاک کند. اگر آدرس عمومی است، یکی از این‌ها را انجام بده:

- **محدود کردن به آی‌پی** (در Caddy):

  ```caddy
  @blocked not remote_ip 1.2.3.4/32
  respond @blocked "دسترسی ندارید" 403
  ```

- **رمز با Basic Auth** (Caddy):

  ```caddy
  basic_auth {
      sara $2a$14$...   # caddy hash-password --plaintext "رمز"
  }
  ```

  ⚠️ Basic Auth را با اپ اندروید استفاده نکن (WebView هنوز رمز را نمی‌پرسد)؛
  در این حالت از مرورگر یا PWA استفاده کن، یا از محدودیت آی‌پی بهره ببر.

- یا کل برنامه را پشت یک VPN/Tailscale بگذار و آدرس داخلی را در اپ بده.

---

## کارهایی که روی سرور معنی دارند

| کار | نیاز به سرور |
|---|---|
| برنامهٔ کلاسی، آزمون‌ها، یادآورها، فلش‌کارت | فقط برای همگام‌سازی |
| بارگذاری PDF و استخراج متن | ✅ |
| ساخت خلاصه/تست/پاورپوینت | ✅ |
| مرور آفلاین (PWA) | آخرین وضعیت کش می‌شود |

هوش مصنوعی اختیاری است و کلیدش روی همان سرور نگه داشته می‌شود؛ اگر سرور مشترک
است، `data/db.json` شامل آن کلید می‌شود — پشتیبان‌ها را عمومی نکن.
