// server/index.js
// Lucky Study — دستیار مطالعه‌ی دانشجو
import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  readDb, updateDb, newId, DIRS, writeChapterText, readChapterText, safeJoin,
  getAiConfig, publicAiConfig,
} from './lib/store.js';
import { extractPdf, detectChapters, chapterText, toFaDigits } from './lib/pdf.js';
import { buildProfile, summarizeProfile, DEPTHS } from './lib/analyze.js';
import { generateQuiz, isShortAnswerCorrect } from './lib/quizgen.js';
import { buildPresentation } from './lib/pptx.js';
import { llmSummary, llmQuiz, testConnection } from './lib/llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = express();
app.use(express.json({ limit: '5mb' }));

/* ---------------- آپلود ---------------- */
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(DIRS.uploads, { recursive: true });
      cb(null, DIRS.uploads);
    } catch (e) { cb(e); }
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.pdf`),
});
const upload = multer({
  storage,
  limits: { fileSize: 120 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    cb(ok ? null : new Error('فقط فایل PDF مجاز است'), ok);
  },
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------------- وضعیت کلی ---------------- */
app.get('/api/state', wrap(async (req, res) => {
  const db = await readDb();
  const ai = await getAiConfig();
  res.json({
    profile: db.profile,
    courses: db.courses,
    sessions: db.sessions,
    books: db.books.map((b) => ({
      ...b,
      chapters: (b.chapters ?? []).map((c) => ({
        ...c,
        hasSummary: Boolean(db.artifacts[c.id]?.summary),
        hasQuiz: Boolean(db.artifacts[c.id]?.quiz),
      })),
    })),
    attempts: db.attempts.slice(-40),
    exams: db.exams,
    reminders: db.settings.reminders,
    ai: publicAiConfig(ai),
    depths: Object.entries(DEPTHS).map(([k, v]) => ({ key: k, label: v.label })),
  });
}));

app.put('/api/profile', wrap(async (req, res) => {
  const { name = '', university = '', field = '', term = '' } = req.body ?? {};
  const profile = await updateDb((db) => {
    db.profile = { name: String(name).slice(0, 80), university: String(university).slice(0, 80), field: String(field).slice(0, 80), term: String(term).slice(0, 80) };
    return db.profile;
  });
  res.json(profile);
}));

/* ---------------- دروس ---------------- */
const PALETTE = ['#6366f1', '#0d9488', '#f59e0b', '#ec4899', '#8b5cf6', '#0ea5e9', '#ef4444', '#22c55e'];

app.post('/api/courses', wrap(async (req, res) => {
  const { title, teacher = '', code = '', color = '', note = '' } = req.body ?? {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'نام درس الزامی است' });
  const course = await updateDb((db) => {
    const c = {
      id: newId('crs'),
      title: String(title).trim().slice(0, 120),
      teacher: String(teacher).slice(0, 80),
      code: String(code).slice(0, 40),
      note: String(note).slice(0, 300),
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : PALETTE[db.courses.length % PALETTE.length],
      createdAt: new Date().toISOString(),
    };
    db.courses.push(c);
    return c;
  });
  res.status(201).json(course);
}));

app.put('/api/courses/:id', wrap(async (req, res) => {
  const { title, teacher, code, note, color } = req.body ?? {};
  const updated = await updateDb((db) => {
    const c = db.courses.find((x) => x.id === req.params.id);
    if (!c) return null;
    if (title !== undefined) c.title = String(title).trim().slice(0, 120);
    if (teacher !== undefined) c.teacher = String(teacher).slice(0, 80);
    if (code !== undefined) c.code = String(code).slice(0, 40);
    if (note !== undefined) c.note = String(note).slice(0, 300);
    if (color !== undefined && /^#[0-9a-f]{6}$/i.test(color)) c.color = color;
    return c;
  });
  if (!updated) return res.status(404).json({ error: 'درس پیدا نشد' });
  res.json(updated);
}));

app.delete('/api/courses/:id', wrap(async (req, res) => {
  const removedBooks = [];
  await updateDb((db) => {
    const id = req.params.id;
    db.courses = db.courses.filter((c) => c.id !== id);
    db.sessions = db.sessions.filter((s) => s.courseId !== id);
    for (const b of db.books.filter((x) => x.courseId === id)) {
      removedBooks.push(b);
      for (const ch of b.chapters ?? []) delete db.artifacts[ch.id];
    }
    db.books = db.books.filter((b) => b.courseId !== id);
  });
  for (const b of removedBooks) {
    await fs.rm(path.join(DIRS.text, b.id), { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(DIRS.uploads, b.storedName), { force: true }).catch(() => {});
  }
  res.json({ ok: true });
}));

/* ---------------- جلسه‌های کلاس ---------------- */
const WEEKDAYS = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function validateSession(body) {
  const { courseId, weekday, start, end, place = '', link = '' } = body ?? {};
  if (!courseId) return { error: 'درس را انتخاب کنید' };
  const wd = Number(weekday);
  if (!Number.isInteger(wd) || wd < 0 || wd > 6) return { error: 'روز هفته نامعتبر است' };
  if (!TIME_RE.test(String(start)) || !TIME_RE.test(String(end))) return { error: 'ساعت باید به شکل 08:00 باشد' };
  if (start >= end) return { error: 'ساعت پایان باید بعد از شروع باشد' };
  const url = String(link || '').trim();
  if (url && !/^https?:\/\//i.test(url)) return { error: 'لینک کلاس باید با http یا https شروع شود' };
  return {
    data: {
      courseId: String(courseId),
      weekday: wd,
      start: String(start),
      end: String(end),
      place: String(place).slice(0, 80),
      link: url.slice(0, 500),
    },
  };
}

app.post('/api/sessions', wrap(async (req, res) => {
  const { error, data } = validateSession(req.body);
  if (error) return res.status(400).json({ error });
  const db = await readDb();
  if (!db.courses.some((c) => c.id === data.courseId)) return res.status(400).json({ error: 'درس پیدا نشد' });
  const session = await updateDb((d) => {
    const s = { id: newId('ses'), ...data };
    d.sessions.push(s);
    return s;
  });
  res.status(201).json(session);
}));

app.put('/api/sessions/:id', wrap(async (req, res) => {
  const { error, data } = validateSession(req.body);
  if (error) return res.status(400).json({ error });
  const updated = await updateDb((db) => {
    const s = db.sessions.find((x) => x.id === req.params.id);
    if (!s) return null;
    Object.assign(s, data);
    return s;
  });
  if (!updated) return res.status(404).json({ error: 'جلسه پیدا نشد' });
  res.json(updated);
}));

app.delete('/api/sessions/:id', wrap(async (req, res) => {
  await updateDb((db) => { db.sessions = db.sessions.filter((s) => s.id !== req.params.id); });
  res.json({ ok: true });
}));

/* ---------------- آزمون‌ها ---------------- */
const EXAM_TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function validateExam(body) {
  const {
    courseId, title = '', date, time, duration = 90, place = '', note = '', remindBefore = null,
  } = body ?? {};
  if (!courseId) return { error: 'درس را انتخاب کنید' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) return { error: 'تاریخ آزمون نامعتبر است' };
  const dt = new Date(`${date}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return { error: 'تاریخ آزمون نامعتبر است' };
  if (!EXAM_TIME_RE.test(String(time ?? ''))) return { error: 'ساعت آزمون نامعتبر است' };
  const dur = Number(duration);
  if (!Number.isFinite(dur) || dur < 15 || dur > 480) return { error: 'مدت آزمون باید بین ۱۵ تا ۴۸۰ دقیقه باشد' };
  let lead = null;
  if (remindBefore !== null && remindBefore !== '' && remindBefore !== undefined) {
    const l = Number(remindBefore);
    if (!Number.isFinite(l) || l < 0 || l > 20160) return { error: 'زمان یادآوری نامعتبر است' };
    lead = Math.round(l);
  }
  return {
    data: {
      courseId: String(courseId),
      title: String(title).trim().slice(0, 120),
      date: String(date),
      time: String(time),
      duration: Math.round(dur),
      place: String(place).slice(0, 100),
      note: String(note).slice(0, 300),
      remindBefore: lead,
    },
  };
}

app.post('/api/exams', wrap(async (req, res) => {
  const { error, data } = validateExam(req.body);
  if (error) return res.status(400).json({ error });
  const db = await readDb();
  const course = db.courses.find((c) => c.id === data.courseId);
  if (!course) return res.status(400).json({ error: 'درس پیدا نشد' });
  const exam = await updateDb((d) => {
    const e = {
      id: newId('exm'),
      ...data,
      title: data.title || `آزمون ${course.title}`,
      createdAt: new Date().toISOString(),
    };
    d.exams.push(e);
    return e;
  });
  res.status(201).json(exam);
}));

app.put('/api/exams/:id', wrap(async (req, res) => {
  const { error, data } = validateExam(req.body);
  if (error) return res.status(400).json({ error });
  const updated = await updateDb((db) => {
    const e = db.exams.find((x) => x.id === req.params.id);
    if (!e) return null;
    Object.assign(e, data);
    if (!e.title) e.title = 'آزمون';
    return e;
  });
  if (!updated) return res.status(404).json({ error: 'آزمون پیدا نشد' });
  res.json(updated);
}));

app.delete('/api/exams/:id', wrap(async (req, res) => {
  await updateDb((db) => { db.exams = db.exams.filter((e) => e.id !== req.params.id); });
  res.json({ ok: true });
}));

/* ---------------- تنظیمات یادآور ---------------- */
app.put('/api/settings/reminders', wrap(async (req, res) => {
  const body = req.body ?? {};
  const num = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  };
  const saved = await updateDb((db) => {
    const cur = db.settings.reminders;
    const next = {
      enabled: body.enabled === undefined ? cur.enabled : Boolean(body.enabled),
      browser: body.browser === undefined ? cur.browser : Boolean(body.browser),
      sound: body.sound === undefined ? cur.sound : Boolean(body.sound),
      classLead: body.classLead === undefined ? cur.classLead : num(body.classLead, 0, 180, 15),
      examLead: body.examLead === undefined ? cur.examLead : num(body.examLead, 0, 20160, 1440),
    };
    db.settings.reminders = next;
    return next;
  });
  res.json(saved);
}));

/* ---------------- خروجی تقویم ---------------- */
function icsEscape(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** زمان «شناور» محلی (بدون Z) تا تقویم مقصد از وقت محلی کاربر استفاده کند */
function icsStamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}T${p(date.getHours())}${p(date.getMinutes())}00`;
}

function valarm(minutes, description) {
  if (!Number.isFinite(minutes) || minutes <= 0) return [];
  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(description)}`,
    `TRIGGER:-PT${Math.round(minutes)}M`,
    'END:VALARM',
  ];
}

app.get('/api/calendar.ics', wrap(async (req, res) => {
  const db = await readDb();
  const reminders = db.settings.reminders ?? { enabled: true, classLead: 15, examLead: 1440 };
  const stampNow = icsStamp(new Date());

  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lucky Study//FA', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', 'X-WR-CALNAME:برنامه کلاسی و آزمون‌ها',
  ];

  /* کلاس‌های هفتگی */
  const jsDay = (wd) => (wd + 1) % 7; // شنبه = ۰ در برنامه، ۶ در جاوااسکریپت
  const now = new Date();
  for (const s of db.sessions) {
    const course = db.courses.find((c) => c.id === s.courseId);
    if (!course) continue;
    const target = jsDay(s.weekday);
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + ((target - start.getDay() + 7) % 7));
    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    const dtStart = new Date(start); dtStart.setHours(sh, sm, 0, 0);
    const dtEnd = new Date(start); dtEnd.setHours(eh, em, 0, 0);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@lucky.study`,
      `DTSTAMP:${stampNow}`,
      `DTSTART:${icsStamp(dtStart)}`,
      `DTEND:${icsStamp(dtEnd)}`,
      'RRULE:FREQ=WEEKLY;COUNT=16',
      `SUMMARY:${icsEscape(course.title)}`,
      `DESCRIPTION:${icsEscape([course.teacher ? `استاد: ${course.teacher}` : '', s.link ? `لینک کلاس: ${s.link}` : ''].filter(Boolean).join(' | '))}`,
      `LOCATION:${icsEscape(s.place || (s.link ? 'کلاس آنلاین' : ''))}`,
      ...(s.link ? [`URL:${s.link}`] : []),
      ...(reminders.enabled ? valarm(reminders.classLead, `کلاس ${course.title} تا ${toFaDigits(reminders.classLead)} دقیقه‌ی دیگر`) : []),
      'END:VEVENT',
    );
  }

  /* آزمون‌ها */
  for (const e of db.exams) {
    const course = db.courses.find((c) => c.id === e.courseId);
    const [yh, mm, dd] = String(e.date).split('-').map(Number);
    const [hh, mi] = String(e.time).split(':').map(Number);
    if (!yh || !mm || !dd || Number.isNaN(hh)) continue;
    const dtStart = new Date(yh, mm - 1, dd, hh, mi || 0, 0, 0);
    const dtEnd = new Date(dtStart.getTime() + (Number(e.duration) || 90) * 60000);
    const lead = e.remindBefore ?? reminders.examLead;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@lucky.study`,
      `DTSTAMP:${stampNow}`,
      `DTSTART:${icsStamp(dtStart)}`,
      `DTEND:${icsStamp(dtEnd)}`,
      `SUMMARY:${icsEscape(`آزمون: ${e.title || course?.title || 'آزمون'}`)}`,
      `DESCRIPTION:${icsEscape([course?.title, e.note].filter(Boolean).join(' | '))}`,
      `LOCATION:${icsEscape(e.place || '')}`,
      ...(reminders.enabled ? valarm(lead, `آزمون ${e.title || course?.title || ''} — یادآوری`) : []),
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="lucky-classes.ics"');
  res.send(lines.join('\r\n'));
}));

/* ---------------- پردازش کتاب ---------------- */
function pdfErrorMessage(err) {
  const raw = String(err?.message ?? err);
  if (/password/i.test(raw)) return 'این PDF رمزعبور دارد. ابتدا رمز فایل را بردارید و دوباره بارگذاری کنید.';
  if (/Invalid PDF|structure|Missing PDF|corrupt/i.test(raw)) return 'فایل PDF معتبر نیست یا آسیب دیده است.';
  if (/Invalid|Unexpected|format/i.test(raw)) return 'قالب فایل پشتیبانی نمی‌شود. یک PDF سالم بارگذاری کنید.';
  return raw.slice(0, 300);
}

async function processBook(bookId, filePath) {
  try {
    const { pages, outline, numPages, meta } = await extractPdf(filePath);
    if (!pages.some((p) => p.text.trim().length > 20)) {
      throw new Error('متنی در این PDF پیدا نشد. احتمالاً فایل اسکن‌شده (تصویری) است.');
    }
    const detected = detectChapters({ pages, outline, numPages });

    const chapters = [];
    for (let i = 0; i < detected.length; i++) {
      const d = detected[i];
      const id = newId('chp');
      const text = chapterText(pages, d.startPage, d.endPage);
      await writeChapterText(bookId, id, text);
      const prof = buildProfile(text, { title: d.title });
      chapters.push({
        id,
        order: i + 1,
        title: d.title,
        startPage: d.startPage,
        endPage: d.endPage,
        stats: prof.stats,
      });
    }

    await updateDb((db) => {
      const b = db.books.find((x) => x.id === bookId);
      if (!b) return;
      b.chapters = chapters;
      b.numPages = numPages;
      b.pdfTitle = meta.title || '';
      b.status = 'ready';
      b.processedAt = new Date().toISOString();
    });

    // پیش‌محاسبه‌ی سریع خلاصه‌ی هر فصل در پس‌زمینه (بدون ذخیره)
    for (const ch of chapters.slice(0, 2)) {
      // warm-up فقط برای سرعت؛ خطا مهم نیست
      try {
        const text = await readChapterText(bookId, ch.id);
        buildProfile(text, { title: ch.title });
      } catch { /* ignore */ }
    }
  } catch (err) {
    await updateDb((db) => {
      const b = db.books.find((x) => x.id === bookId);
      if (b) {
        b.status = 'error';
        b.error = pdfErrorMessage(err);
      }
    });
  }
}

app.post('/api/books', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'فایل PDF را انتخاب کنید' });
  const { courseId, title = '' } = req.body ?? {};
  const db = await readDb();
  if (!db.courses.some((c) => c.id === courseId)) {
    await fs.rm(req.file.path, { force: true }).catch(() => {});
    return res.status(400).json({ error: 'ابتدا درس را بسازید' });
  }
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const book = await updateDb((d) => {
    const b = {
      id: newId('bok'),
      courseId: String(courseId),
      title: String(title).trim() || originalName.replace(/\.pdf$/i, '') || 'کتاب بدون عنوان',
      originalName,
      storedName: req.file.filename,
      size: req.file.size,
      status: 'processing',
      chapters: [],
      createdAt: new Date().toISOString(),
    };
    d.books.push(b);
    return b;
  });
  processBook(book.id, req.file.path); // پس‌زمینه
  res.status(202).json(book);
}));

/** افزودن کتاب از لینک اینترنتی */
app.post('/api/books/from-url', wrap(async (req, res) => {
  const { courseId, url, title = '' } = req.body ?? {};
  const db = await readDb();
  if (!db.courses.some((c) => c.id === courseId)) return res.status(400).json({ error: 'ابتدا درس را بسازید' });
  if (!/^https?:\/\//i.test(String(url ?? ''))) return res.status(400).json({ error: 'لینک باید با http یا https شروع شود' });

  const MAX = 120 * 1024 * 1024;
  let buffer;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    const resp = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`سرور مقصد پاسخ ${resp.status} داد`);
    const len = Number(resp.headers.get('content-length') ?? 0);
    if (len > MAX) throw new Error('حجم فایل بیش از ۱۲۰ مگابایت است');
    const type = resp.headers.get('content-type') ?? '';
    if (type && !/pdf|octet-stream/i.test(type)) throw new Error('لینک به یک فایل PDF اشاره نمی‌کند');
    buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length > MAX) throw new Error('حجم فایل بیش از ۱۲۰ مگابایت است');
    if (buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('فایل دریافتی PDF معتبر نیست');
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'دریافت فایل طول کشید و لغو شد' : String(err.message ?? err);
    return res.status(400).json({ error: `دریافت فایل ممکن نشد: ${msg}` });
  }

  await fs.mkdir(DIRS.uploads, { recursive: true });
  const storedName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.pdf`;
  const filePath = path.join(DIRS.uploads, storedName);
  await fs.writeFile(filePath, buffer);

  const guessed = decodeURIComponent(String(url).split(/[?#]/)[0].split('/').pop() || 'کتاب');

  const book = await updateDb((d) => {
    const b = {
      id: newId('bok'),
      courseId: String(courseId),
      title: String(title).trim() || guessed.replace(/\.pdf$/i, '') || 'کتاب بدون عنوان',
      originalName: guessed,
      storedName,
      size: buffer.length,
      sourceUrl: String(url).slice(0, 500),
      status: 'processing',
      chapters: [],
      createdAt: new Date().toISOString(),
    };
    d.books.push(b);
    return b;
  });
  processBook(book.id, filePath);
  res.status(202).json(book);
}));

app.get('/api/books/:id', wrap(async (req, res) => {
  const db = await readDb();
  const b = db.books.find((x) => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'کتاب پیدا نشد' });
  res.json({
    ...b,
    chapters: (b.chapters ?? []).map((c) => ({
      ...c,
      hasSummary: Boolean(db.artifacts[c.id]?.summary),
      hasQuiz: Boolean(db.artifacts[c.id]?.quiz),
    })),
  });
}));

app.delete('/api/books/:id', wrap(async (req, res) => {
  let removed = null;
  await updateDb((db) => {
    removed = db.books.find((b) => b.id === req.params.id) ?? null;
    if (removed) {
      for (const ch of removed.chapters ?? []) delete db.artifacts[ch.id];
      db.books = db.books.filter((b) => b.id !== req.params.id);
    }
  });
  if (removed) {
    await fs.rm(path.join(DIRS.text, removed.id), { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(DIRS.uploads, removed.storedName), { force: true }).catch(() => {});
  }
  res.json({ ok: true });
}));

/** ویرایش عنوان/محدوده‌ی فصل‌ها */
app.put('/api/books/:id/chapters', wrap(async (req, res) => {
  const incoming = Array.isArray(req.body?.chapters) ? req.body.chapters : [];
  const db = await readDb();
  const book = db.books.find((b) => b.id === req.params.id);
  if (!book) return res.status(404).json({ error: 'کتاب پیدا نشد' });

  const maxPage = book.numPages ?? 9999;
  const cleaned = incoming
    .map((c, i) => ({
      id: String(c.id || newId('chp')),
      order: i + 1,
      title: String(c.title ?? '').trim().slice(0, 150) || `بخش ${toFaDigits(i + 1)}`,
      startPage: Math.min(maxPage, Math.max(1, Number(c.startPage) || 1)),
      endPage: Math.min(maxPage, Math.max(1, Number(c.endPage) || maxPage)),
    }))
    .filter((c) => c.endPage >= c.startPage)
    .sort((a, b) => a.startPage - b.startPage)
    .map((c, i) => ({ ...c, order: i + 1 }));

  if (!cleaned.length) return res.status(400).json({ error: 'حداقل یک فصل لازم است' });

  // استخراج دوباره‌ی متن فصل‌ها
  const filePath = path.join(DIRS.uploads, book.storedName);
  const { pages } = await extractPdf(filePath);
  for (const ch of cleaned) {
    const text = chapterText(pages, ch.startPage, ch.endPage);
    await writeChapterText(book.id, ch.id, text);
    ch.stats = buildProfile(text, { title: ch.title }).stats;
  }

  const result = await updateDb((d) => {
    const b = d.books.find((x) => x.id === book.id);
    const keepIds = new Set(cleaned.map((c) => c.id));
    for (const old of b.chapters ?? []) if (!keepIds.has(old.id)) delete d.artifacts[old.id];
    b.chapters = cleaned;
    return b.chapters;
  });
  res.json(result);
}));

/* ---------------- فصل‌ها ---------------- */
async function findChapter(chapterId) {
  const db = await readDb();
  for (const book of db.books) {
    const chapter = (book.chapters ?? []).find((c) => c.id === chapterId);
    if (chapter) {
      const course = db.courses.find((c) => c.id === book.courseId) ?? null;
      return { db, book, chapter, course };
    }
  }
  return null;
}

app.get('/api/chapters/:id', wrap(async (req, res) => {
  const found = await findChapter(req.params.id);
  if (!found) return res.status(404).json({ error: 'فصل پیدا نشد' });
  const text = await readChapterText(found.book.id, found.chapter.id);
  const art = found.db.artifacts[found.chapter.id] ?? {};
  res.json({
    chapter: found.chapter,
    book: { id: found.book.id, title: found.book.title },
    course: found.course,
    preview: text.slice(0, 1200),
    artifacts: { summary: art.summary ?? null, quiz: art.quiz ?? null, pptx: art.pptx ?? null },
    stats: found.chapter.stats,
  });
}));

app.get('/api/chapters/:id/text', wrap(async (req, res) => {
  const found = await findChapter(req.params.id);
  if (!found) return res.status(404).json({ error: 'فصل پیدا نشد' });
  const text = await readChapterText(found.book.id, found.chapter.id);
  res.json({ text });
}));

async function resolveEngine(requested) {
  const ai = await getAiConfig();
  if (requested === 'local') return { engine: 'local', ai: null };
  if (requested === 'ai') {
    if (!ai.enabled) throw new Error('هوش مصنوعی تنظیم نشده است. از تنظیمات، سرویس را وصل کنید.');
    return { engine: 'ai', ai };
  }
  return ai.enabled ? { engine: 'ai', ai } : { engine: 'local', ai: null };
}

app.post('/api/chapters/:id/summary', wrap(async (req, res) => {
  const found = await findChapter(req.params.id);
  if (!found) return res.status(404).json({ error: 'فصل پیدا نشد' });
  const depth = ['short', 'medium', 'long'].includes(req.body?.depth) ? req.body.depth : 'medium';
  const text = await readChapterText(found.book.id, found.chapter.id);
  if (!text || text.trim().length < 120) return res.status(400).json({ error: 'متن این فصل کافی نیست' });

  const { engine, ai } = await resolveEngine(req.body?.engine);
  let summary;
  let warning = '';
  if (engine === 'ai') {
    try {
      summary = await llmSummary(ai, {
        chapterTitle: found.chapter.title,
        courseTitle: found.course?.title ?? 'درس',
        text,
        depth,
      });
      if (!summary.paragraph) throw new Error('خلاصه خالی بود');
      summary.stats = found.chapter.stats;
      summary.coverage = 100;
    } catch (err) {
      warning = `تولید با هوش مصنوعی ممکن نشد (${String(err.message).slice(0, 120)})؛ با موتور محلی ساخته شد.`;
      summary = null;
    }
  }
  if (!summary) {
    const profile = buildProfile(text, { title: found.chapter.title });
    summary = summarizeProfile(profile, { depth, title: found.chapter.title });
  }
  summary.depth = depth;
  summary.createdAt = new Date().toISOString();

  await updateDb((db) => {
    const art = (db.artifacts[found.chapter.id] ??= {});
    art.summary = summary;
  });
  res.json({ summary, warning });
}));

app.post('/api/chapters/:id/quiz', wrap(async (req, res) => {
  const found = await findChapter(req.params.id);
  if (!found) return res.status(404).json({ error: 'فصل پیدا نشد' });
  const count = Math.min(25, Math.max(3, Number(req.body?.count) || 10));
  const text = await readChapterText(found.book.id, found.chapter.id);
  if (!text || text.trim().length < 120) return res.status(400).json({ error: 'متن این فصل کافی نیست' });

  const { engine, ai } = await resolveEngine(req.body?.engine);
  let quiz = null;
  let warning = '';
  if (engine === 'ai') {
    try {
      quiz = await llmQuiz(ai, { chapterTitle: found.chapter.title, text, count });
    } catch (err) {
      warning = `تولید تست با هوش مصنوعی ممکن نشد (${String(err.message).slice(0, 120)})؛ با موتور محلی ساخته شد.`;
    }
  }
  if (!quiz) {
    const profile = buildProfile(text, { title: found.chapter.title });
    quiz = generateQuiz(profile, { count, seed: found.chapter.id });
  }
  quiz.createdAt = new Date().toISOString();
  quiz.count = quiz.questions.length;

  await updateDb((db) => {
    const art = (db.artifacts[found.chapter.id] ??= {});
    art.quiz = quiz;
  });
  res.json({ quiz, warning });
}));

app.post('/api/chapters/:id/pptx', wrap(async (req, res) => {
  const found = await findChapter(req.params.id);
  if (!found) return res.status(404).json({ error: 'فصل پیدا نشد' });
  const db = await readDb();
  const art = db.artifacts[found.chapter.id] ?? {};

  let summary = art.summary;
  if (!summary) {
    const text = await readChapterText(found.book.id, found.chapter.id);
    const profile = buildProfile(text, { title: found.chapter.title });
    summary = summarizeProfile(profile, { depth: 'medium', title: found.chapter.title });
  }
  const quiz = art.quiz ?? null;

  const { buffer, slides } = await buildPresentation({
    courseTitle: found.course?.title ?? found.book.title,
    chapter: found.chapter,
    summary,
    quiz,
    profile: db.profile,
  });

  const fileName = `lucky-${found.book.id}-${found.chapter.id}-${Date.now()}.pptx`;
  await fs.mkdir(DIRS.exports, { recursive: true });
  await fs.writeFile(path.join(DIRS.exports, fileName), buffer);

  const meta = {
    file: fileName,
    slides,
    url: `/api/exports/${fileName}`,
    createdAt: new Date().toISOString(),
    engine: summary.engine ?? 'local',
  };
  await updateDb((d) => {
    const a = (d.artifacts[found.chapter.id] ??= {});
    a.pptx = { ...meta };
  });
  res.json(meta);
}));

app.get('/api/exports/:name', wrap(async (req, res) => {
  const name = path.basename(req.params.name);
  const file = safeJoin(DIRS.exports, name);
  if (!fsSync.existsSync(file)) return res.status(404).json({ error: 'فایل پیدا نشد' });
  res.download(file, name);
}));

/* ---------------- آزمون‌ها ---------------- */
app.post('/api/chapters/:id/attempt', wrap(async (req, res) => {
  const found = await findChapter(req.params.id);
  if (!found) return res.status(404).json({ error: 'فصل پیدا نشد' });
  const score = Math.max(0, Number(req.body?.score) || 0);
  const total = Math.max(1, Number(req.body?.total) || 1);
  const attempt = await updateDb((db) => {
    const a = {
      id: newId('att'),
      chapterId: found.chapter.id,
      chapterTitle: found.chapter.title,
      courseId: found.course?.id ?? null,
      score, total,
      percent: Math.round((score / total) * 100),
      at: new Date().toISOString(),
    };
    db.attempts.push(a);
    if (db.attempts.length > 300) db.attempts = db.attempts.slice(-300);
    return a;
  });
  res.json(attempt);
}));

/** بررسی پاسخ تشریحی */
app.post('/api/chapters/:id/check-short', wrap(async (req, res) => {
  const { given = '', answer = '' } = req.body ?? {};
  res.json({ correct: isShortAnswerCorrect(given, answer) });
}));

/* ---------------- تنظیمات هوش مصنوعی ---------------- */
app.put('/api/settings/ai', wrap(async (req, res) => {
  const { baseUrl = '', apiKey, model = '' } = req.body ?? {};
  const url = String(baseUrl).trim().slice(0, 300);
  if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'آدرس سرویس باید با http یا https شروع شود' });
  await updateDb((db) => {
    db.settings.ai = db.settings.ai ?? {};
    if (baseUrl !== undefined) db.settings.ai.baseUrl = url;
    if (model !== undefined) db.settings.ai.model = String(model).trim().slice(0, 120);
    if (apiKey !== undefined && apiKey !== null && apiKey !== '••••••••') {
      db.settings.ai.apiKey = String(apiKey).trim().slice(0, 300);
    }
  });
  res.json(publicAiConfig(await getAiConfig()));
}));

app.post('/api/settings/ai/test', wrap(async (req, res) => {
  const ai = await getAiConfig();
  if (!ai.enabled) return res.status(400).json({ error: 'ابتدا آدرس، کلید و نام مدل را وارد کنید' });
  try {
    const out = await testConnection(ai);
    res.json({ ok: true, message: out.message ?? 'اتصال برقرار است' });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err.message).slice(0, 300) });
  }
}));

/* ---------------- سلامت ---------------- */
app.get('/api/health', (req, res) => res.json({ ok: true, weekdayNames: WEEKDAYS, version: '1.0.0' }));

/* ---------------- فایل‌های ثابت ---------------- */
app.use('/fonts', express.static(path.join(ROOT, 'node_modules/@fontsource/vazirmatn/files'), {
  maxAge: '30d',
  fallthrough: true,
}));
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(ROOT, 'public/index.html'));
});

/* ---------------- خطاها ---------------- */
app.use((err, req, res, next) => {
  const status = err.status ?? 500;
  const message = err.code === 'LIMIT_FILE_SIZE'
    ? 'حجم فایل بیش از حد مجاز (۱۲۰ مگابایت) است'
    : String(err.message ?? 'خطای ناشناخته');
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: message });
});

app.listen(PORT, HOST, () => {
  console.log(`Lucky Study روی http://${HOST}:${PORT} بالا آمد`);
  console.log(`داده‌ها در: ${DIRS.root}`);
  if (!fsSync.existsSync(path.join(ROOT, 'node_modules/@fontsource/vazirmatn/files'))) {
    console.warn('هشدار: فونت وزیرمتن نصب نیست؛ از فونت سیستم استفاده می‌شود.');
  }
});

export { app };
