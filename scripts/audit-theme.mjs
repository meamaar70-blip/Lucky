// scripts/audit-theme.mjs
// بررسی خودکار تم روشن/تاریک: کامل بودن توکن‌ها + نسبت کنتراست WCAG برای جفت‌های کلیدی.
// اجرا: node scripts/audit-theme.mjs

import fs from 'node:fs';

const css = fs.readFileSync(new URL('../public/css/app.css', import.meta.url), 'utf8');

/** استخراج بلوک توکن‌ها */
function tokens(selector, src) {
  const start = src.indexOf(selector);
  if (start < 0) return {};
  const open = src.indexOf('{', start);
  const close = src.indexOf('}', open);
  const body = src.slice(open + 1, close);
  const out = {};
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*([^;]+);/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const light = tokens(':root {', css);
const dark = tokens('[data-theme="dark"] {', css);

const hex = (v) => {
  const s = String(v).trim();
  const m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const PAIRS = [
  ['--ink', '--bg', 'متن اصلی روی پس‌زمینه', 7],
  ['--ink', '--card', 'متن اصلی روی کارت', 7],
  ['--ink', '--surface', 'متن اصلی روی سطح', 7],
  ['--muted', '--card', 'متن کم‌رنگ روی کارت', 4.5],
  ['--muted', '--bg', 'متن کم‌رنگ روی پس‌زمینه', 4.5],
  ['--brand', '--card', 'رنگ برند روی کارت', 3],
  ['--brand-2', '--card', 'رنگ برند دوم روی کارت', 3],
  ['--ok', '--card', 'سبز وضعیت روی کارت', 3],
  ['--warn', '--card', 'نارنجی هشدار روی کارت', 3],
  ['--danger', '--card', 'قرمز خطا روی کارت', 3],
];

let problems = 0;
for (const [name, palette] of [['روشن', light], ['تاریک', dark]]) {
  console.log(`\n=== تم ${name} (${Object.keys(palette).length} توکن) ===`);
  for (const [fg, bg, label, min] of PAIRS) {
    const a = hex(palette[fg]);
    const b = hex(palette[bg]);
    if (!a || !b) {
      console.log(`  ? ${label}: توکن ${!a ? fg : bg} قابل خواندن نیست (${palette[fg] ?? '—'} / ${palette[bg] ?? '—'})`);
      problems += 1;
      continue;
    }
    const r = ratio(a, b);
    const ok = r >= min;
    if (!ok) problems += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${r.toFixed(2)}:1 (حد ${min})`);
  }
}

// توکن‌های تاریک باید همه در روشن هم تعریف شده باشند و برعکس خالی نباشد
// توکن‌های ساختاری (تایپ، فاصله، شعاع، اندازه) تم‌محور نیستند و لازم نیست در بلوک تاریک تکرار شوند
const NON_COLOR = /^--(radius|shadow|sidebar-w|fs-|lh-|sp-|tap$|btn-h$|bar$|content-)/;
const missingInDark = Object.keys(light).filter((k) => !(k in dark) && !NON_COLOR.test(k));
const extraInDark = Object.keys(dark).filter((k) => !(k in light));
console.log(`\nتوکن‌های تعریف‌نشده در تم تاریک: ${missingInDark.length ? missingInDark.join(', ') : 'هیچ'}`);
console.log(`توکن‌های فقط-تاریک (باید صفر باشد): ${extraInDark.length ? extraInDark.join(', ') : 'هیچ'}`);
if (extraInDark.length) problems += 1;

// رنگ‌های ثابت خارج از بلوک توکن (روش: دنبال‌کردن سلکتور جاری)
const lines = css.replace(/\/\*[\s\S]*?\*\//g, '').split('\n');
let inTokens = false;
let inPrint = 0;
let selector = '';
const SAFE_SEL = /sidebar|brand|btn-primary|toast|opt\b|\.point|switch-row|icon-pink|reminder|next-class|theme-choice|join|cover|course-dot|tt-slot|avatar|badge|hero|spinner/i;
const hardcoded = [];
const risky = [];
lines.forEach((line, i) => {
  const trimmed = line.trim();
  if (/^:root\s*\{|^\[data-theme="dark"\]\s*\{/.test(trimmed)) { inTokens = true; selector = trimmed; return; }
  if (inTokens) { if (/^\}/.test(trimmed)) inTokens = false; return; }
  if (/^@media print/.test(trimmed)) { inPrint += 1; return; }
  if (inPrint) {
    inPrint += (line.match(/\{/g) ?? []).length;
    inPrint -= (line.match(/\}/g) ?? []).length;
    return;
  }
  if (/\{$/.test(trimmed)) { selector = trimmed; return; }
  // قاعدهٔ یک‌خطی: سلکتور و اعلان در یک خط
  const inline = trimmed.includes('{') ? trimmed.split('{')[0].trim() : null;
  if (!/#[0-9a-f]{3,8}\b/i.test(trimmed)) return;
  const sel = inline ?? selector.replace(/\s*\{$/, '');
  const entry = `${i + 1}: ${sel} → ${trimmed}`;
  hardcoded.push(entry);
  const harmless = /color:\s*#fff|background:\s*#fff;?$/.test(trimmed) && /gradient/.test(lines[i - 1] ?? '');
  if (!SAFE_SEL.test(sel) && !harmless) risky.push(entry);
});
console.log(`رنگ ثابت خارج از توکن‌ها: ${hardcoded.length} | مشکوک: ${risky.length}`);
risky.slice(0, 10).forEach((h) => console.log('   ✗', h));
if (risky.length) problems += 1;

console.log(`\n${problems === 0 ? '✓ همه‌چیز مرتب است' : `✗ ${problems} مورد نیاز به اصلاح دارد`}`);
process.exit(problems ? 1 : 0);
