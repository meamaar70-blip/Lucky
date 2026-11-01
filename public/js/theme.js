// public/js/theme.js — مدیریت تم روشن / تاریک / سیستم

const KEY = 'lucky:theme';

/** دسترسی امن به localStorage (در محیط‌های بدون آن، null) */
function store() {
  try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch { return null; }
}

export const THEMES = [
  { key: 'light', label: 'روشن', icon: '☀️' },
  { key: 'dark', label: 'تاریک', icon: '🌙' },
  { key: 'system', label: 'هم‌پایه‌ی سیستم', icon: '🖥️' },
];

const media = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

export function getPref() {
  const ls = store();
  try {
    const v = ls?.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* ignore */ }
  return 'system';
}

export function resolved(pref = getPref()) {
  if (pref === 'system') return media?.matches ? 'dark' : 'light';
  return pref;
}

function paintMeta(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0e0e10' : '#fbfbfa');
}

function paintButtons(theme) {
  document.querySelectorAll('[data-theme-btn]').forEach((btn) => {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    btn.title = theme === 'dark' ? 'حالت روشن' : 'حالت تاریک';
    btn.setAttribute('aria-label', btn.title);
  });
}

export function apply(pref = getPref()) {
  const theme = resolved(pref);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePref = pref;
  paintMeta(theme);
  paintButtons(theme);
  return theme;
}

export function setTheme(pref) {
  try { store()?.setItem(KEY, pref); } catch { /* ignore */ }
  const theme = apply(pref);
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme, pref } }));
  return theme;
}

/** جابه‌جایی سریع بین روشن و تاریک */
export function toggle() {
  const current = resolved();
  return setTheme(current === 'dark' ? 'light' : 'dark');
}

export function currentTheme() {
  return document.documentElement.dataset.theme ?? resolved();
}

export function initTheme() {
  apply(getPref());
  if (media) {
    const onChange = () => { if (getPref() === 'system') apply('system'); };
    if (media.addEventListener) media.addEventListener('change', onChange);
    else if (media.addListener) media.addListener(onChange);
  }
  document.querySelectorAll('[data-theme-btn]').forEach((btn) => {
    btn.addEventListener('click', () => toggle());
  });
}
