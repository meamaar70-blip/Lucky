#!/usr/bin/env bash
# ساخت بستهٔ ویندوز (lucky-server-windows.zip) از همین مخزن
# اجرا: bash deploy/windows/bundle.sh   → خروجی در dist/

set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="dist/lucky-server-windows.zip"
STAGE="$(mktemp -d)"

mkdir -p "$STAGE" dist
cp package.json package-lock.json README.md "$STAGE"/
cp -r server public samples deploy "$STAGE"/
rm -rf "$STAGE"/deploy/windows/bundle.sh

# bat و ps1 باید CRLF باشند
find "$STAGE" -name '*.bat' -o -name '*.ps1' | while read -r f; do
  sed -i 's/\r$//; s/$/\r/' "$f"
done

rm -f "$OUT"
( cd "$STAGE" && zip -q -r "$OLDPWD/$OUT" . )
rm -rf "$STAGE"
echo "✓ $OUT — $(du -h "$OUT" | cut -f1)"
