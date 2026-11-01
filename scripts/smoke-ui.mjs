// scripts/smoke-ui.mjs
// تست دودی رابط کاربری با jsdom (بدون مرورگر): هر مسیر رندر می‌شود و خطای JS بررسی می‌گردد.
// اجرا: node scripts/smoke-ui.mjs   (سرور باید روی پورت 3000 بالا باشد)

import { JSDOM } from 'jsdom';
import fs from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');

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
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
const origError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); };

await import('../public/js/app.js').catch((e) => errors.push(`import: ${e.stack}`));
await new Promise((r) => setTimeout(r, 900));

function snapshot(label) {
  const view = document.getElementById('view');
  const text = (view?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const nodes = view?.querySelectorAll('*').length ?? 0;
  console.log(`\n=== ${label} ===`);
  console.log(`title: ${document.getElementById('page-title')?.textContent}`);
  console.log(`nodes: ${nodes}`);
  console.log(`text: ${text.slice(0, 300)}`);
  if (nodes === 0) errors.push(`${label}: view خالی است`);
}

const go = async (hash, wait = 700) => {
  location.hash = hash;
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await new Promise((r) => setTimeout(r, wait));
};

snapshot('داشبورد');
await go('#/schedule');
snapshot('برنامه هفتگی');
await go('#/courses');
snapshot('دروس');
await go('#/library');
snapshot('کتابخانه');

const state = await (await globalThis.fetch('/api/state')).json();
const chapter = state.books[0]?.chapters?.[0];
if (chapter) {
  await go(`#/chapter/${chapter.id}?tab=summary`, 900);
  snapshot('فصل - خلاصه');
  await go(`#/chapter/${chapter.id}?tab=quiz`, 900);
  snapshot('فصل - تست');
  await go(`#/chapter/${chapter.id}?tab=pptx`, 700);
  snapshot('فصل - پاورپوینت');
  await go(`#/chapter/${chapter.id}?tab=text`, 900);
  snapshot('فصل - متن');
} else {
  console.log('هیچ فصلی برای تست صفحه‌ی فصل وجود ندارد');
}

await go('#/settings');
snapshot('تنظیمات');

/* ---------- آزمون تعاملی ---------- */
const chResp = await (await globalThis.fetch(`/api/chapters/${chapter?.id}`)).json();
const quizData = chResp.artifacts?.quiz;
await go(`#/chapter/${chapter?.id}?tab=quiz`, 900);
if (quizData?.questions?.length) {
  const q1 = quizData.questions.find((q) => q.type !== 'short' && q.options?.length);
  const optEl = document.querySelector(`.opt[data-qid="${q1.id}"][data-opt="${q1.answerIndex}"]`);
  optEl?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const selected = Boolean(optEl?.classList.contains('sel'));
  console.log('\n=== انتخاب گزینه ===');
  console.log(selected ? '✓ ثبت شد' : '✗ ثبت نشد');
  if (!selected) errors.push('quiz: انتخاب گزینه ثبت نشد');

  document.querySelector('#quiz-submit')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 900));
  const result = document.querySelector('.quiz-result');
  console.log('=== نتیجه آزمون ===');
  console.log(result ? result.textContent.replace(/\s+/g, ' ').trim().slice(0, 140) : '✗ نتیجه نمایش داده نشد');
  if (!result) errors.push('quiz: نتیجه بعد از ثبت نمایش داده نشد');
  else if (!/۱ پاسخ درست|[۱-۹] پاسخ درست/.test(result.textContent)) errors.push('quiz: امتیاز درست محاسبه نشد');
  const explained = document.querySelectorAll('.explain').length;
  console.log('توضیح‌های نمایش‌داده‌شده:', explained);
  if (!explained) errors.push('quiz: توضیح پاسخ‌ها نمایش داده نشد');
} else {
  errors.push('quiz: داده‌ای برای آزمون نیست');
}

/* مودال درس */
await go('#/courses', 500);
document.getElementById('add-course').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
const modal = document.querySelector('.modal');
console.log('\n=== مودال درس ===');
console.log(modal ? modal.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : '✗ باز نشد');
if (!modal) errors.push('forms: مودال درس باز نشد');
else {
  modal.querySelector('#c-title').value = 'درس آزمایشی';
  modal.querySelector('#c-save').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 900));
  const st = await (await globalThis.fetch('/api/state')).json();
  const created = st.courses.find((c) => c.title === 'درس آزمایشی');
  console.log('ساخته شد:', Boolean(created));
  if (!created) errors.push('forms: درس ساخته نشد');
  else await globalThis.fetch(`/api/courses/${created.id}`, { method: 'DELETE' });
}

console.log(`\n--- ${errors.length} خطا ---`);
errors.slice(0, 25).forEach((e) => console.log('✗', e));
process.exit(errors.length ? 1 : 0);
