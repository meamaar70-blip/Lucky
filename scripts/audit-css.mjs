// scripts/audit-css.mjs — هر کلاسی که در HTML/JS استفاده می‌شود باید در CSS تعریف شده باشد
// اجرا: node scripts/audit-css.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const css = fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8');

/** کلاس‌های تعریف‌شده در CSS */
const defined = new Set();
for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) defined.add(m[1]);

/** فایل‌های مصرف‌کننده */
const files = ['public/index.html'];
for (const dir of ['public/js', 'public/js/views']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    if (f.endsWith('.js')) files.push(path.join(dir, f));
  }
}

const used = new Map(); // class → [files]
for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // class="..." و class='...' و قالب‌های ساده با ${}
  const re = /class\s*=\s*(["'`])([\s\S]*?)\1/g;
  for (const m of src.matchAll(re)) {
    for (const raw of m[2].split(/\s+/)) {
      if (!raw || raw.includes('${') || raw.includes('}')) continue;
      if (!/^[a-zA-Z][\w-]*$/.test(raw)) continue;
      if (!used.has(raw)) used.set(raw, new Set());
      used.get(raw).add(rel);
    }
  }
}

const IGNORE = new Set(['i']); // false positive از قالب‌های ${}
const missing = [...used.entries()].filter(([c]) => !defined.has(c) && !IGNORE.has(c));
console.log(`کلاس‌های استفاده‌شده: ${used.size} | تعریف‌نشده در CSS: ${missing.length}`);
for (const [c, fs_] of missing.sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ✗ .${c}  (${[...fs_].join(', ')})`);
}
process.exit(missing.length ? 1 : 0);
