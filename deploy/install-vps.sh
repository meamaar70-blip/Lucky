#!/usr/bin/env bash
# نصب یک‌مرحله‌ای Lucky روی VPS
#
#   bash deploy/install-vps.sh                      # بدون دامنه: از sslip.io استفاده می‌کند
#   bash deploy/install-vps.sh --domain lucky.ir    # با دامنهٔ خودت
#   bash deploy/install-vps.sh --port 8080          # پورت متفاوت برای HTTPS
#
# پیش‌نیاز: اوبونتو/دبیان با دسترسی root یا sudo، و پورت‌های ۸۰/۴۴۳ باز.

set -euo pipefail

DOMAIN=""
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --help|-h) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "گزینهٔ ناشناخته: $1"; exit 1 ;;
  esac
done

say() { printf '\n\033[1;32m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
die() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  command -v sudo >/dev/null || die "بدون root و بدون sudo نمی‌شود."
  SUDO="sudo"
fi

cd "$REPO_DIR"
[[ -f docker-compose.yml ]] || die "این اسکریپت باید داخل مخزن Lucky اجرا شود."

# ---------- ۱) داکر ----------
if ! command -v docker >/dev/null 2>&1; then
  say "نصب داکر…"
  curl -fsSL https://get.docker.com | $SUDO sh
  $SUDO systemctl enable --now docker
fi
if ! $SUDO docker compose version >/dev/null 2>&1; then
  say "نصب افزونهٔ docker compose…"
  $SUDO apt-get update -y
  $SUDO apt-get install -y docker-compose-plugin
fi

# ---------- ۲) دامنه ----------
if [[ -z "$DOMAIN" ]]; then
  say "دامنه‌ای ندادی؛ آی‌پی عمومی را می‌گیرم و از sslip.io استفاده می‌کنم."
  IP="$(curl -4 -fsS https://api.ipify.org || curl -4 -fsS https://ifconfig.me/ip)"
  [[ -n "$IP" ]] || die "آی‌پی عمومی پیدا نشد. با --domain دامنه را بده."
  DOMAIN="lucky-${IP//./-}.sslip.io"
  warn "بدون دامنهٔ اختصاصی: $DOMAIN  (به همان آی‌پی resolve می‌شود)"
fi

say "دامنه: $DOMAIN"
printf 'DOMAIN=%s\n' "$DOMAIN" > .env

# ---------- ۳) فایروال ----------
if command -v ufw >/dev/null 2>&1 && $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
  say "باز کردن پورت‌های ۸۰ و ۴۴۳ در ufw…"
  $SUDO ufw allow 80/tcp >/dev/null
  $SUDO ufw allow 443/tcp >/dev/null
fi

# ---------- ۴) ساخت و اجرا ----------
say "ساخت تصویر و اجرای سرویس…"
$SUDO docker compose up -d --build

# ---------- ۵) بررسی سلامت ----------
say "صبر برای گرفتن گواهی HTTPS…"
for i in $(seq 1 30); do
  if curl -fsS --max-time 5 "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    say "آماده است: https://$DOMAIN"
    printf '\nحالا در اپ اندروید همین آدرس را وارد کن:\n  https://%s\n\n' "$DOMAIN"
    printf 'برای اینکه APK از پیش پر ساخته شود، در مخزن گیت‌هاب متغیر بساز:\n'
    printf '  Settings → Secrets and variables → Actions → Variables → LUCKY_SERVER_URL = https://%s\n\n' "$DOMAIN"
    exit 0
  fi
  sleep 4
done

warn "هنوز جواب نداد. لاگ را ببین:"
echo "  sudo docker compose logs --tail=50"
warn "اگر دامنه تازه است، ممکن است DNS یا پورت‌ها هنوز آماده نباشند."
exit 1
