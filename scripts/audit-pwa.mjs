// scripts/audit-pwa.mjs — بررسی کامل بودن PWA (بی‌نیاز از مرورگر)
// اجرا: node scripts/audit-pwa.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const problems = [];
const ok = (label, extra = '') => console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ''}`);
const bad = (label) => { problems.push(label); console.log(`  ✗ ${label}`); };

/* ---------- manifest ---------- */
console.log('\n=== manifest ===');
const manifestPath = path.join(ROOT, 'public/manifest.webmanifest');
if (!fs.existsSync(manifestPath)) bad('public/manifest.webmanifest وجود ندارد');
else {
  let m = null;
  try { m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { bad(`manifest معتبر نیست: ${e.message}`); }
  if (m) {
    for (const key of ['name', 'short_name', 'start_url', 'display', 'theme_color', 'background_color', 'icons']) {
      if (!m[key]) bad(`کلید ${key} در manifest نیست`);
    }
    if (m) {
      ok('فیلدهای اصلی', `${m.short_name} — ${m.display}`);
      const png = (m.icons ?? []).filter((i) => i.type === 'image/png');
      if (!png.some((i) => i.sizes === '192x192')) bad('آیکن ۱۹۲×۱۹۲ نیست');
      if (!png.some((i) => i.sizes === '512x512')) bad('آیکن ۵۱۲×۵۱۲ نیست');
      if (!(m.icons ?? []).some((i) => i.purpose === 'maskable')) bad('آیکن maskable نیست');
      for (const icon of m.icons ?? []) {
        const file = path.join(ROOT, 'public', icon.src.replace(/^\//, ''));
        if (!fs.existsSync(file)) bad(`فایل آیکن نیست: ${icon.src}`);
      }
      ok('آیکن‌ها', `${(m.icons ?? []).length} مورد`);
      if (m.dir !== 'rtl') bad('dir باید rtl باشد');
      if (m.lang !== 'fa') bad('lang باید fa باشد');
      ok('زبان و جهت', `${m.lang} / ${m.dir}`);
    }
  }
}

/* ---------- service worker ---------- */
console.log('\n=== service worker ===');
const swPath = path.join(ROOT, 'public/sw.js');
if (!fs.existsSync(swPath)) bad('public/sw.js وجود ندارد');
else {
  const sw = fs.readFileSync(swPath, 'utf8');
  ok('sw.js موجود');
  const listMatch = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  if (!listMatch) bad('فهرست SHELL در sw.js پیدا نشد');
  else {
    const urls = [...listMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const missing = urls.filter((u) => {
      if (u === '/') return !fs.existsSync(path.join(ROOT, 'public/index.html'));
      const clean = u.split('?')[0];
      if (clean.startsWith('/fonts/')) return !fs.existsSync(path.join(ROOT, 'node_modules/@fontsource/vazirmatn/files', clean.replace('/fonts/', '')));
      return !fs.existsSync(path.join(ROOT, 'public', clean.replace(/^\//, '')));
    });
    if (missing.length) missing.forEach((u) => bad(`فایل پیش‌کش‌شده نیست: ${u}`));
    else ok('همهٔ فایل‌های پیش‌کش موجودند', `${urls.length} فایل`);
  }
  if (!/addEventListener\('fetch'/.test(sw)) bad('رویداد fetch در sw.js نیست');
  if (!/caches\.delete/.test(sw)) bad('پاک‌سازی کش‌های قدیمی در sw.js نیست');
}

/* ---------- اتصال در HTML/JS ---------- */
console.log('\n=== اتصال در برنامه ===');
const index = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
if (!/rel="manifest"/.test(index)) bad('لینک manifest در index.html نیست');
else ok('لینک manifest');
if (!/id="install-btn"/.test(index)) bad('دکمهٔ نصب در index.html نیست');
else ok('دکمهٔ نصب');

const appJs = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
if (!/initPWA\(\)/.test(appJs)) bad('initPWA در app.js صدا زده نشده');
else ok('راه‌اندازی PWA در app.js');

const pwaJs = fs.readFileSync(path.join(ROOT, 'public/js/pwa.js'), 'utf8');
if (!/serviceWorker\.register\('\/sw\.js'/.test(pwaJs)) bad('ثبت sw.js در pwa.js نیست');
else ok('ثبت Service Worker');

console.log(`\n${problems.length ? `✗ ${problems.length} مورد` : '✓ همه‌چیز مرتب است'}`);
process.exit(problems.length ? 1 : 0);
