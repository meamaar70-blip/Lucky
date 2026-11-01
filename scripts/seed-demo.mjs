// scripts/seed-demo.mjs
// پر کردن برنامه با دادهٔ نمونه: پروفایل، دو درس، جلسات هفتگی، دو آزمون،
// یک کتاب PDF (نمونه‌ای که خودمان می‌سازیم)، فصل‌بندی، و ساخت خلاصه/آزمون/پاورپوینت برای فصل اول.
//
// استفاده:  npm start  (در یک ترمینال)   سپس   node scripts/seed-demo.mjs [--force]
// متغیرها:  BASE_URL (پیش‌فرض http://localhost:3000)

import fs from 'node:fs';
import path from 'node:path';
import { makeSamplePdf, SAMPLE_CHAPTERS } from './sample-book.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const FORCE = process.argv.includes('--force');
const SAMPLE = 'samples/sample-book.pdf';

async function api(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const state = await api('GET', '/api/state');
  if (state.courses.length && !FORCE) {
    console.log(`ℹ️  داده از قبل وجود دارد (${state.courses.length} درس). برای بازنویسی: node scripts/seed-demo.mjs --force`);
    return;
  }
  if ((state.courses.length || state.exams.length) && FORCE) {
    for (const e of state.exams) await api('DELETE', `/api/exams/${e.id}`);
    for (const c of state.courses) await api('DELETE', `/api/courses/${c.id}`);
    console.log('• دادهٔ قبلی پاک شد');
  }

  // ---------- پروفایل ----------
  await api('PUT', '/api/profile', {
    name: 'سارا محمدی',
    university: 'دانشگاه تهران',
    field: 'روان‌شناسی',
    term: 'نیم‌سال اول ۱۴۰۴',
  });
  console.log('• پروفایل ثبت شد');

  // ---------- درس‌ها ----------
  const c1 = await api('POST', '/api/courses', {
    title: 'روان‌شناسی یادگیری',
    teacher: 'دکتر رضایی',
    code: 'PSY-201',
    note: 'کلاس‌ها سه‌شنبه و پنج‌شنبه صبح',
  });
  const c2 = await api('POST', '/api/courses', {
    title: 'آمار و روش تحقیق',
    teacher: 'دکتر کاظمی',
    code: 'STA-110',
    note: 'تمرین‌ها هر هفته تحویل داده شود',
  });
  console.log('• دو درس ساخته شد');

  // ---------- جلسات هفتگی ----------
  const sessions = [
    { courseId: c1.id, weekday: 2, start: '08:00', end: '10:00', place: 'کلاس ۲۰۳', link: '' },
    { courseId: c1.id, weekday: 4, start: '10:00', end: '12:00', place: 'کلاس ۲۰۳', link: '' },
    { courseId: c2.id, weekday: 1, start: '14:00', end: '16:00', place: 'کلاس ۱۰۵', link: '' },
    { courseId: c2.id, weekday: 3, start: '16:00', end: '17:30', place: 'آزمایشگاه آمار', link: 'https://meet.example.com/stat' },
  ];
  for (const s of sessions) await api('POST', '/api/sessions', s);
  console.log('• ۴ جلسه هفتگی ثبت شد');

  // ---------- آزمون‌ها ----------
  const inDays = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  await api('POST', '/api/exams', {
    courseId: c1.id,
    title: 'میان‌ترم روان‌شناسی یادگیری',
    date: inDays(4),
    time: '10:00',
    duration: 90,
    place: 'سالن ۱',
    remindBefore: 1440,
    note: 'فصل ۱ تا ۳',
  });
  await api('POST', '/api/exams', {
    courseId: c2.id,
    title: 'کوییز آمار',
    date: inDays(9),
    time: '16:00',
    duration: 45,
    place: 'کلاس ۱۰۵',
    remindBefore: 120,
  });
  console.log('• ۲ آزمون ثبت شد');

  // ---------- کتاب PDF ----------
  if (!fs.existsSync(SAMPLE)) {
    console.log('… ساخت PDF نمونه');
    await makeSamplePdf(SAMPLE);
  }
  const buf = fs.readFileSync(SAMPLE);
  const form = new FormData();
  form.append('courseId', c1.id);
  form.append('title', 'مبانی یادگیری و مطالعه');
  form.append('file', new Blob([buf], { type: 'application/pdf' }), 'نمونه-کتاب.pdf');
  const up = await fetch(BASE + '/api/books', { method: 'POST', body: form });
  if (!up.ok) throw new Error(`آپلود کتاب ناموفق: ${up.status} ${await up.text()}`);
  const book = await up.json();
  console.log(`• کتاب آپلود شد (${book.id})`);

  // ---------- انتظار برای پردازش ----------
  let full = book;
  for (let i = 0; i < 90; i += 1) {
    await sleep(700);
    full = await api('GET', `/api/books/${book.id}`);
    if (full.status === 'ready' || full.status === 'error') break;
  }
  if (full.status !== 'ready') throw new Error(`پردازش کتاب ناموفق بود: ${full.status} ${full.error ?? ''}`);
  console.log(`• پردازش تمام شد: ${full.numPages} صفحه، ${(full.chapters ?? []).length} فصل خودکار`);

  // ---------- فصل‌بندی بر اساس عنوان فصل‌ها ----------
  const { extractPdf } = await import('../server/lib/pdf.js');
  const { normalize } = await import('../server/lib/persian.js');
  const extracted = await extractPdf(full.path ?? path.join('data', 'uploads', full.storedName));
  const pageText = extracted.pages.map((p) => normalize(p.lines.join(' ')));

  const starts = SAMPLE_CHAPTERS.map((ch) => {
    const probe = normalize(ch.title).split(' ').slice(0, 2).join(' ');
    const idx = pageText.findIndex((t) => t.includes(probe));
    return { title: ch.title, page: idx >= 0 ? idx + 1 : 1 };
  });

  const chapters = starts.map((s, i) => ({
    title: s.title,
    startPage: s.page,
    endPage: (starts[i + 1]?.page ?? (full.numPages + 1)) - 1,
  }));
  await api('PUT', `/api/books/${book.id}/chapters`, { chapters });
  console.log(`• ${chapters.length} فصل ثبت شد: ` + chapters.map((c) => `${c.startPage}-${c.endPage}`).join(' | '));

  // ---------- ساخت محتوا برای همهٔ فصل‌ها ----------
  const after = await api('GET', '/api/state');
  const freshBook = after.books.find((b) => b.id === book.id);
  const firstChapter = freshBook.chapters[0];
  await api('POST', `/api/chapters/${firstChapter.id}/summary`, {});
  console.log('• خلاصهٔ فصل اول ساخته شد');

  // برای هر فصل تست می‌سازیم؛ هر تست خودکار به کارت مرور تبدیل می‌شود
  let cardCount = 0;
  for (const [i, ch] of freshBook.chapters.entries()) {
    const res = await api('POST', `/api/chapters/${ch.id}/quiz`, { count: 6 });
    cardCount += res.cards?.added ?? 0;
    console.log(`• تست ${i + 1} فصل ساخته شد${res.cards ? ` (${res.cards.added} کارت تازه)` : ''}`);
  }
  try {
    await api('POST', `/api/chapters/${firstChapter.id}/pptx`, {});
    console.log('• پاورپوینت فصل اول ساخته شد');
  } catch (err) {
    console.log('⚠️ پاورپوینت ساخته نشد:', err.message);
  }

  const final = await api('GET', '/api/state');
  console.log('\n✓ دادهٔ نمونه آماده است:');
  console.log(`   درس‌ها: ${final.courses.length} | جلسات: ${final.sessions.length} | کتاب‌ها: ${final.books.length} | آزمون‌ها: ${final.exams.length}`);
  console.log(`   کارت‌های مرور: ${final.review?.total ?? cardCount} (${final.review?.due ?? 0} آمادهٔ مرور امروز)`);
  console.log('   آدرس برنامه: ' + BASE);
}

main().catch((err) => {
  console.error('✗ خطا:', err.message);
  process.exit(1);
});
