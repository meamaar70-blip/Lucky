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
{
  const viewText = document.getElementById('view').textContent;
  const hasExamCard = viewText.includes('آزمون بعدی') || viewText.includes('آزمونی ثبت نشده');
  console.log('کارت آزمون در داشبورد:', hasExamCard ? '✓' : '✗');
  if (!hasExamCard) errors.push('dashboard: کارت آزمون نمایش داده نشد');
}
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

await go('#/exams', 700);
snapshot('آزمون‌ها');

/* ---------- یادآور ---------- */
const soon = new Date(Date.now() + 30 * 60000);
const pad = (n) => String(n).padStart(2, '0');
const soonISO = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`;
const courses = (await (await globalThis.fetch('/api/state')).json()).courses;
const mkExam = await globalThis.fetch('/api/exams', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    courseId: courses[0].id,
    title: 'آزمون آزمایشی یادآور',
    date: soonISO,
    time: `${pad(soon.getHours())}:${pad(soon.getMinutes())}`,
    duration: 60,
    remindBefore: 120,
  }),
}).then((r) => r.json());

const { app: appInstance } = await import('../public/js/app.js');
const reminders = await import('../public/js/reminders.js');
await appInstance.refresh();
const fired = reminders.checkNow(appInstance);
const banner = document.querySelector('#reminders .reminder');
console.log('\n=== یادآور ===');
console.log('رویدادهای یادآوری‌شده:', fired, '| بنر:', banner ? '✓' : '✗');
if (!banner) errors.push('reminders: بنر یادآور نمایش داده نشد');
else console.log('متن بنر:', banner.textContent.replace(/\s+/g, ' ').trim().slice(0, 100));

const events = reminders.upcomingEvents(appInstance.data);
console.log('رویدادهای پیش‌رو:', events.length, '| نوع‌ها:', [...new Set(events.map((e) => e.type))].join(', '));
if (!events.some((e) => e.type === 'exam')) errors.push('reminders: آزمون در رویدادها نیست');
if (!events.some((e) => e.type === 'class')) errors.push('reminders: کلاس در رویدادها نیست');

await globalThis.fetch(`/api/exams/${mkExam.id}`, { method: 'DELETE' });
await appInstance.refresh();

await go('#/settings', 700);
snapshot('تنظیمات');
const remCard = document.querySelector('#r-save');
if (!remCard) errors.push('settings: کارت یادآور رندر نشد');

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



/* کشوی منو */
{
  console.log('\n=== کشوی منو ===');
  const menuBtn = document.getElementById('menu-btn');
  const backdrop = document.getElementById('drawer-backdrop');
  const drawer = document.getElementById('drawer');
  const navRoutes = [...document.querySelectorAll('#nav .nav-item')].map((n) => n.dataset.route);
  console.log('آیتم‌های منو:', navRoutes.join(' | '));
  if (!menuBtn || !drawer) errors.push('drawer: دکمهٔ منو یا کشو در صفحه نیست');
  if (navRoutes.includes('dashboard')) errors.push('drawer: «خانه» باید از منو حذف شده باشد و روی اکانت باشد');
  if (!document.getElementById('account-btn')) errors.push('drawer: بلوک اکانت بالای کشو نیست');

  menuBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  const opened = document.body.classList.contains('drawer-open') && !backdrop.hidden;
  console.log('باز شدن کشو:', opened);
  if (!opened) errors.push('drawer: کشو باز نشد');

  // کلیک روی «آزمون‌ها» باید کشو را ببندد و مسیر را عوض کند
  document.querySelector('#nav .nav-item[data-route="exams"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  console.log('بستن پس از انتخاب:', !document.body.classList.contains('drawer-open'), '| مسیر:', location.hash);
  if (document.body.classList.contains('drawer-open')) errors.push('drawer: بعد از انتخاب مسیر بسته نشد');
  if (location.hash !== '#/exams') errors.push('drawer: ناوبری از منو کار نکرد');

  // اکانت = خانه
  document.getElementById('account-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  console.log('اکانت → خانه:', location.hash);
  if (location.hash !== '#/dashboard') errors.push('drawer: کلیک روی اکانت به خانه نبرد');
}

/* مرور فاصله‌دار */
await go('#/review', 1100);
{
  console.log('\n=== مرور امروز ===');
  const card = document.querySelector('.flashcard');
  const reveal = document.getElementById('reveal');
  console.log('کارت:', Boolean(card), '| دکمه نمایش پاسخ:', Boolean(reveal));
  if (!card) errors.push('review: کارت مرور نمایش داده نشد');
  if (!reveal) errors.push('review: دکمه «نمایش پاسخ» نیست');

  if (reveal) {
    reveal.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const answer = document.querySelector('.flash-answer');
    const grades = document.querySelectorAll('[data-grade]');
    console.log('پاسخ نمایش داده شد:', Boolean(answer), '| دکمه‌های نمره:', grades.length);
    if (!answer) errors.push('review: پاسخ کارت نمایش داده نشد');
    if (grades.length !== 4) errors.push(`review: انتظار ۴ دکمه نمره، ${grades.length} دیده شد`);

    const before = await (await globalThis.fetch('/api/state')).json();
    const beforeCount = before.review?.todayReviews ?? 0;
    const goodBtn = document.querySelector('[data-grade="4"]');
    goodBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    const after = await (await globalThis.fetch('/api/state')).json();
    const grew = (after.review?.todayReviews ?? 0) > beforeCount;
    console.log('ثبت نمره در سرور:', grew, `(${beforeCount} → ${after.review?.todayReviews ?? 0})`);
    if (!grew) errors.push('review: نمره‌ی کارت در سرور ثبت نشد');

    const stillCard = Boolean(document.querySelector('.flashcard')) || Boolean(document.querySelector('.review-done'));
    console.log('ادامه‌ی جلسه یا صفحه‌ی پایان:', stillCard);
    if (!stillCard) errors.push('review: بعد از نمره‌دهی کارت بعدی/پایان نمایش داده نشد');

    // کلید Space باید پاسخ را نمایش دهد
    const beforeReveal = Boolean(document.querySelector('#reveal'));
    document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    if (beforeReveal && !document.querySelector('.flash-answer') && !document.querySelector('.review-done')) {
      errors.push('review: کلید Space پاسخ را نمایش نداد');
    }
    console.log('کلید Space:', document.querySelector('.flash-answer') ? 'پاسخ نمایش داده شد' : '—');
  }
}

/* حالت تاریک */
await go('#/settings', 500);
const root = document.documentElement;
const choice = (name) => document.querySelector(`[data-theme-choice="${name}"]`);
console.log('\n=== تم تاریک ===');
console.log('انتخاب تم در تنظیمات:', Boolean(choice('dark')), '| کلید تاگل در نوار بالا:', Boolean(document.querySelector('[data-theme-btn]')));
if (!choice('dark')) errors.push('theme: دکمه‌های انتخاب تم در تنظیمات نیست');
if (!document.querySelector('[data-theme-btn]')) errors.push('theme: کلید تم در نوار بالا نیست');

choice('dark')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 250));
console.log('پس از انتخاب تاریک → data-theme:', root.dataset.theme, '| pref:', root.dataset.themePref, '| localStorage:', window.localStorage.getItem('lucky:theme'));
if (root.dataset.theme !== 'dark') errors.push('theme: انتخاب «تاریک» تم را عوض نکرد');
if (window.localStorage.getItem('lucky:theme') !== 'dark') errors.push('theme: انتخاب تم ذخیره نشد');

const btn = document.querySelector('[data-theme-btn]');
btn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 250));
console.log('پس از کلیک روی تاگل → data-theme:', root.dataset.theme, '| localStorage:', window.localStorage.getItem('lucky:theme'));
if (root.dataset.theme !== 'light') errors.push('theme: تاگل نوار بالا بین روشن/تاریک جابه‌جا نکرد');
// در حالت روشن، دکمه پیشنهاد رفتن به «حالت تاریک» را می‌دهد (آیکن ماه)
console.log('برچسب دکمه:', btn?.getAttribute('aria-label'), '| آیکن:', btn?.textContent);
if (!/تاریک/.test(btn?.getAttribute('aria-label') ?? '')) errors.push('theme: برچسب دکمه پس از تغییر به‌روز نشد');
if (btn?.textContent?.trim() !== '🌙') errors.push('theme: آیکن دکمه پس از تغییر به‌روز نشد');

// بررسی این‌که هیچ استایل درون‌خطی رنگی در نماها باقی نمانده باشد
const inlineColors = [...document.querySelectorAll('#view [style]')]
  .map((el) => el.getAttribute('style'))
  .filter((st) => /(color|background)\s*:\s*(#[0-9a-f]{3,8}|rgb)/i.test(st));
console.log('استایل درون‌خطی رنگی در تنظیمات:', inlineColors.length);
if (inlineColors.length) errors.push(`theme: ${inlineColors.length} استایل درون‌خطی رنگی در تنظیمات`);

// بازگشت به حالت روشن برای بقیهٔ تست‌ها
choice('light')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
if (root.dataset.theme !== 'light') errors.push('theme: بازگشت به روشن انجام نشد');


console.log(`\n--- ${errors.length} خطا ---`);
errors.slice(0, 25).forEach((e) => console.log('✗', e));
process.exit(errors.length ? 1 : 0);
