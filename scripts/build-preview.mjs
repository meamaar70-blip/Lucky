// scripts/build-preview.mjs
// ساخت پیش‌نمایش HTML خودکفا از رابط واقعی برنامه (بدون نیاز به سرور)
// اجرا: node scripts/build-preview.mjs   (سرور باید روی ۳۰۰۰ بالا باشد)
//
// خروجی: preview.html — همه‌ی صفحه‌ها، CSS و فونت‌ها درون یک فایل.

import { JSDOM } from 'jsdom';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = path.join(ROOT, 'preview.html');

const read = (p) => fs.readFile(path.join(ROOT, p), 'utf8');

/* ---------- بررسی در دسترس بودن سرور ---------- */
try {
  const res = await fetch(`${BASE}/api/health`);
  if (!res.ok) throw new Error(String(res.status));
} catch {
  console.error(`✗ سرور روی ${BASE} پاسخ نمی‌دهد. اول \`npm start\` را اجرا کن.`);
  process.exit(1);
}

/* ---------- آماده‌سازی jsdom ---------- */
const html = await read('public/index.html');
const dom = new JSDOM(html, { url: `${BASE}/#/dashboard`, pretendToBeVisual: true });
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.location = window.location;
globalThis.history = window.history;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.XMLHttpRequest = window.XMLHttpRequest;
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true }); } catch { /* ignore */ }
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
window.scrollTo = () => {};
window.print = () => {};

const nativeFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => nativeFetch(String(url).startsWith('http') ? url : BASE + url, opts);
window.fetch = globalThis.fetch;

const errors = [];
console.error = (...a) => errors.push(a.map(String).join(' '));

await import('../public/js/app.js').catch((e) => errors.push(String(e.stack)));
await new Promise((r) => setTimeout(r, 1200));

const state = await (await globalThis.fetch('/api/state')).json();
const chapterId = state.books?.[0]?.chapters?.[0]?.id ?? null;

/* ---------- ضبط صفحه‌ها ---------- */
const SCREENS = [
  { id: 'dashboard', hash: '#/dashboard', label: 'داشبورد', nav: 'dashboard', icon: '🏠' },
  { id: 'schedule', hash: '#/schedule', label: 'برنامه هفتگی', nav: 'schedule', icon: '🗓️' },
  { id: 'courses', hash: '#/courses', label: 'دروس و کتاب‌ها', nav: 'courses', icon: '📚' },
  { id: 'library', hash: '#/library', label: 'فصل‌ها و مطالعه', nav: 'library', icon: '📑' },
  ...(chapterId ? [
    { id: 'chapter-summary', hash: `#/chapter/${chapterId}?tab=summary`, label: 'فصل — خلاصه', nav: 'library', icon: '📝', chapter: true },
    { id: 'chapter-quiz', hash: `#/chapter/${chapterId}?tab=quiz`, label: 'فصل — تست', nav: 'library', icon: '✅', chapter: true },
    { id: 'chapter-pptx', hash: `#/chapter/${chapterId}?tab=pptx`, label: 'فصل — پاورپوینت', nav: 'library', icon: '📊', chapter: true },
    { id: 'chapter-text', hash: `#/chapter/${chapterId}?tab=text`, label: 'فصل — متن', nav: 'library', icon: '📖', chapter: true },
  ] : []),
  { id: 'exams', hash: '#/exams', label: 'آزمون‌ها و یادآورها', nav: 'exams', icon: '📝' },
  { id: 'settings', hash: '#/settings', label: 'تنظیمات', nav: 'settings', icon: '⚙️' },
];

const captured = [];
for (const s of SCREENS) {
  location.hash = s.hash;
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await new Promise((r) => setTimeout(r, s.id === 'chapter-text' ? 1100 : 750));
  const view = document.getElementById('view');
  captured.push({
    ...s,
    html: view?.innerHTML ?? '',
    title: document.getElementById('page-title')?.textContent ?? s.label,
    sub: document.getElementById('page-sub')?.textContent ?? '',
    actions: document.getElementById('topbar-actions')?.innerHTML ?? '',
    navHtml: document.getElementById('nav')?.innerHTML ?? '',
    sideName: document.getElementById('side-name')?.textContent ?? '',
    sideSub: document.getElementById('side-sub')?.textContent ?? '',
    nodes: view?.querySelectorAll('*').length ?? 0,
  });
  process.stdout.write(`  ✓ ${s.label} (${captured.at(-1).nodes} node)\n`);
}

/* ---------- درون‌ریزی CSS و فونت‌ها ---------- */
let css = await read('public/css/app.css');
const fontFiles = [
  'vazirmatn-arabic-400-normal.woff2', 'vazirmatn-arabic-500-normal.woff2', 'vazirmatn-arabic-700-normal.woff2',
  'vazirmatn-latin-400-normal.woff2', 'vazirmatn-latin-500-normal.woff2', 'vazirmatn-latin-700-normal.woff2',
];
for (const f of fontFiles) {
  const buf = await fs.readFile(path.join(ROOT, 'node_modules/@fontsource/vazirmatn/files', f));
  css = css.split(`url('/fonts/${f}')`).join(`url(data:font/woff2;base64,${buf.toString('base64')})`);
}
// فونت‌های درون‌ریزی‌نشده (اگر بود) به فونت سیستم برمی‌گردند
css = css.replace(/url\('\/fonts\/[^']+'\)/g, 'local(Tahoma)');

const PREVIEW_CSS = `
/* ---------- نوار بالای پیش‌نمایش ---------- */
.pv-bar {
  position: sticky; top: 0; z-index: 400;
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 10px 18px;
  background: #0f172a; color: #e2e8f0;
  font-family: 'Vazirmatn', Tahoma, sans-serif; font-size: 12.5px;
}
.pv-bar .dot { width: 8px; height: 8px; border-radius: 50%; background: #34d399; box-shadow: 0 0 0 3px rgba(52,211,153,.2); }
.pv-bar strong { color: #fff; font-weight: 700; }
.pv-bar .spacer { flex: 1; }
.pv-bar .pv-chip {
  background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.14);
  border-radius: 999px; padding: 2px 10px; font-size: 11.5px; color: #cbd5e1;
}
.pv-theme {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(255,255,255,.1); color: #fff;
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 999px; padding: 5px 14px;
  font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
  transition: all .15s;
}
.pv-theme:hover { background: rgba(255,255,255,.2); }
.pv-screens {
  display: flex; gap: 6px; flex-wrap: wrap;
  padding: 12px 18px; background: var(--card); border-bottom: 1px solid var(--line);
  font-family: 'Vazirmatn', Tahoma, sans-serif;
}
.pv-screens button {
  border: 1px solid var(--line); background: var(--card); color: var(--ink-2); cursor: pointer;
  border-radius: 999px; padding: 6px 13px; font-size: 12.5px; font-family: inherit;
  transition: all .15s;
}
.pv-screens button:hover { border-color: var(--brand-line); background: var(--hover); }
.pv-screens button.active { background: linear-gradient(135deg,var(--brand),var(--brand-2)); border-color: transparent; color: #fff; font-weight: 600; }
.pv-shell .app { min-height: calc(100vh - 96px); }
.pv-shell .sidebar { height: calc(100vh - 96px); top: 96px; }
[data-view] { display: none; }
[data-view].active { display: block; }
.pv-foot {
  padding: 16px 20px; font-size: 12px; color: var(--muted); text-align: center;
  border-top: 1px solid var(--line); background: var(--surface);
  font-family: 'Vazirmatn', Tahoma, sans-serif;
}
.pv-foot code { background: var(--line-2); padding: 1px 6px; border-radius: 5px; }
@media (max-width: 860px) {
  .pv-shell .app { min-height: auto; }
  .pv-shell .sidebar { position: static; height: auto; transform: none; width: 100%; }
  .pv-shell .sidebar nav { display: none; }
}
`;

/* ---------- ساخت HTML نهایی ---------- */
const first = captured[0];
const screenButtons = captured.map((s, i) => `
  <button data-go="${s.id}" class="${i === 0 ? 'active' : ''}">${s.icon} ${s.label}</button>`).join('');

const viewSections = captured.map((s, i) => `
<section data-view="${s.id}" class="${i === 0 ? 'active' : ''}"
  data-title="${escapeAttr(s.title)}" data-sub="${escapeAttr(s.sub)}"
  data-actions="${escapeAttr(s.actions)}" data-nav="${s.nav}">
${s.html}
</section>`).join('\n');

function escapeAttr(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, ' ');
}

const out = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>پیش‌نمایش Lucky — دستیار مطالعه دانشجو</title>
<style>
${css}
${PREVIEW_CSS}
</style>
</head>
<body>
<div class="pv-bar">
  <span class="dot"></span>
  <strong>پیش‌نمایش Lucky</strong>
  <span class="pv-chip">فایل خودکفا — بدون سرور</span>
  <span class="spacer"></span>
  <span class="pv-chip">${captured.length} صفحه</span>
  <button class="pv-theme" id="pv-theme">☀️ روشن</button>
</div>

<div class="pv-screens">
${screenButtons}
</div>

<div class="pv-shell">
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-logo">✦</div>
        <div>
          <div class="brand-name">Lucky</div>
          <div class="brand-sub">دستیار مطالعه دانشجو</div>
        </div>
      </div>
      <nav id="pv-nav">${first.navHtml}</nav>
      <div class="sidebar-foot">
        <div class="sidebar-card">
          <strong>${first.sideName}</strong>
          <span>${first.sideSub}</span>
        </div>
      </div>
    </aside>

    <main class="main">
      <div class="topbar">
        <div class="page-title">
          <h1 id="pv-title">${first.title}</h1>
          <div class="sub" id="pv-sub">${first.sub}</div>
        </div>
        <div class="topbar-actions" id="pv-actions">${first.actions}</div>
      </div>
${viewSections}
      <div class="pv-foot">
        این پیش‌نمایش ایستا از رابط واقعی Lucky ساخته شده است؛ دکمه‌ها و فرم‌ها فقط نمایشی هستند.
        برای استفاده‌ی واقعی: <code dir="ltr">npm install && npm start</code>
      </div>
    </main>
  </div>
</div>

<script>
(function () {
  /* ---------- تم ---------- */
  const themeBtn = document.getElementById('pv-theme');
  function paintTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeBtn.textContent = theme === 'dark' ? '☀️ روشن' : '🌙 تاریک';
    try { localStorage.setItem('lucky-preview-theme', theme); } catch (e) { /* ignore */ }
  }
  let saved = 'dark';
  try { saved = localStorage.getItem('lucky-preview-theme') || 'dark'; } catch (e) { /* ignore */ }
  paintTheme(saved);
  themeBtn.addEventListener('click', () => {
    paintTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  const views = [...document.querySelectorAll('[data-view]')];
  const buttons = [...document.querySelectorAll('[data-go]')];
  const navBtns = [...document.querySelectorAll('#pv-nav .nav-item')];
  const title = document.getElementById('pv-title');
  const sub = document.getElementById('pv-sub');
  const actions = document.getElementById('pv-actions');

  function show(id) {
    const view = views.find((v) => v.dataset.view === id);
    if (!view) return;
    views.forEach((v) => v.classList.toggle('active', v === view));
    buttons.forEach((b) => b.classList.toggle('active', b.dataset.go === id));
    navBtns.forEach((b) => b.classList.toggle('active', b.dataset.route === view.dataset.nav));
    title.textContent = view.dataset.title || '';
    sub.textContent = view.dataset.sub || '';
    actions.innerHTML = view.dataset.actions || '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  buttons.forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));
  navBtns.forEach((b) => b.addEventListener('click', () => {
    const target = views.find((v) => v.dataset.view === b.dataset.route);
    if (target) show(b.dataset.route);
  }));

  // تب‌های صفحه‌ی فصل
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      const id = 'chapter-' + tab.dataset.tab;
      if (views.some((v) => v.dataset.view === id)) { show(id); return; }
    }
    const link = e.target.closest('a[href^="#/"]');
    if (link) {
      e.preventDefault();
      const route = link.getAttribute('href').replace(/^#\\//, '').split('?')[0].split('/')[0];
      const target = views.find((v) => v.dataset.view === route);
      if (target) show(route);
    }
  });
})();
</script>
</body>
</html>`;

await fs.writeFile(OUT, out, 'utf8');
const size = (await fs.stat(OUT)).size;
console.log(`\n✓ پیش‌نمایش ساخته شد: preview.html (${(size / 1024).toFixed(0)} کیلوبایت، ${captured.length} صفحه)`);
if (errors.length) {
  console.log(`هشدار: ${errors.length} پیام خطا در کنسول هنگام ضبط صفحه‌ها`);
  errors.slice(0, 5).forEach((e) => console.log('  -', e.slice(0, 160)));
}
// موتور یادآور برنامه یک setInterval فعال دارد؛ برای خروج تمیز اجرای Node را می‌بندیم
process.exit(0);
