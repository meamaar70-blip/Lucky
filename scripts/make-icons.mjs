// scripts/make-icons.mjs — ساخت آیکن‌های PWA بدون هیچ وابستگی بیرونی
//
// یک PNG کمینه‌نویس داریم (IHDR + IDAT + IEND با zlib خودِ Node) و شکل را
// پیکسل‌به‌پیکسل می‌کشیم: مربع گرد تیره + ستارهٔ چهارپر سفید.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/* ---------- CRC و انکودر PNG ---------- */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** RGBA raw → PNG buffer */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- شکل آیکن ---------- */
const BG = [23, 23, 27];       // #17171b
const FG = [255, 255, 255];
const SS = 4;                  // نمونه‌برداری چندگانه برای نرم‌کردن لبه‌ها

/** ستارهٔ چهارپر: |x|^(2/3) + |y|^(2/3) <= 1 */
function inStar(x, y, size) {
  const nx = Math.abs(x) / size;
  const ny = Math.abs(y) / size;
  return Math.cbrt(nx * nx) + Math.cbrt(ny * ny) <= 1;
}

/** درون مربع گرد */
function inRoundRect(x, y, size, radius) {
  const r = radius;
  const dx = Math.max(Math.abs(x) - (size - r), 0);
  const dy = Math.max(Math.abs(y) - (size - r), 0);
  return Math.hypot(dx, dy) <= r;
}

/**
 * رندر آیکن
 * @param {number} px اندازه
 * @param {boolean} maskable حاشیهٔ امن برای آیکن ماسک‌دار
 */
function renderIcon(px, maskable = false) {
  const buf = Buffer.alloc(px * px * 4);
  const half = px / 2;
  const pad = maskable ? px * 0.22 : px * 0.06;   // ماسک‌دار: فضای امن بیشتر
  const starSize = half - pad - px * 0.16;
  const radius = maskable ? 0 : px * 0.22;        // ماسک‌دار: خودِ سیستم گرد می‌کند

  for (let y = 0; y < px; y += 1) {
    for (let x = 0; x < px; x += 1) {
      const cx = x + 0.5 - half;
      const cy = y + 0.5 - half;
      let bgHits = 0;
      let fgHits = 0;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const ox = cx + (sx + 0.5) / SS - 0.5;
          const oy = cy + (sy + 0.5) / SS - 0.5;
          const insideBg = maskable ? true : inRoundRect(ox, oy, half, radius);
          if (!insideBg) continue;
          bgHits += 1;
          if (inStar(ox, oy, starSize)) fgHits += 1;
        }
      }

      const total = SS * SS;
      const alpha = Math.round((bgHits / total) * 255);
      const fgRatio = bgHits ? fgHits / bgHits : 0;
      const i = (y * px + x) * 4;
      buf[i] = Math.round(BG[0] * (1 - fgRatio) + FG[0] * fgRatio);
      buf[i + 1] = Math.round(BG[1] * (1 - fgRatio) + FG[1] * fgRatio);
      buf[i + 2] = Math.round(BG[2] * (1 - fgRatio) + FG[2] * fgRatio);
      buf[i + 3] = alpha;
    }
  }
  return encodePng(px, px, buf);
}

/* ---------- خروجی ---------- */
const outDir = path.resolve('public/icons');
fs.mkdirSync(outDir, { recursive: true });

const jobs = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
];

for (const [name, size, maskable] of jobs) {
  const png = renderIcon(size, maskable);
  fs.writeFileSync(path.join(outDir, name), png);
  console.log(`✓ ${name} — ${size}×${size} — ${(png.length / 1024).toFixed(1)} کیلوبایت`);
}

// آیکن SVG برای فاوآیکن (سبک و بی‌نیاز از باینری)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#17171b"/>
  <path d="M50 16 L56 44 L84 50 L56 56 L50 84 L44 56 L16 50 L44 44 Z" fill="#fff"/>
</svg>
`;
fs.writeFileSync(path.join(outDir, 'icon.svg'), svg);
console.log('✓ icon.svg');
