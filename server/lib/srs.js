// server/lib/srs.js — مرور فاصله‌دار (Spaced Repetition) بر پایهٔ SM-2
//
// کارت‌ها از سؤال‌های تستی که برای هر فصل ساخته شده‌اند ساخته می‌شوند؛ هر کارت
// یک برنامهٔ مرور دارد (فاصله، سهولت، زمان مرور بعدی) که با نمره‌دهی کاربر
// به‌روز می‌شود. کلید کارت از «شناسهٔ فصل + هش متن سؤال» ساخته می‌شود تا اگر
// تست فصل دوباره ساخته شد، تاریخچهٔ مرور سؤال‌های یکسان از دست نرود.

import { updateDb, newId } from './store.js';
import { normalize } from './persian.js';

const DAY = 24 * 60 * 60 * 1000;
const RELEARN_MINUTES = 10; // «یادم نبود» → همین امروز دوباره

/** هش کوتاه و پایدار (FNV-1a) */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** متن پایدار و قابل مقایسه برای ساختن کلید کارت */
function cardText(q) {
  return normalize(`${q.statement ?? ''} ${q.prompt ?? ''} ${(q.options ?? []).join(' ')}`).slice(0, 400);
}

export function cardKey(chapterId, question) {
  return `${chapterId}:${hash(cardText(question))}`;
}

/**
 * هم‌گام‌سازی کارت‌ها با تست‌های موجود.
 * - کارت تازه برای هر سؤال تازه ساخته می‌شود (سررسید: همین حالا)
 * - متن کارت‌های موجود با نسخهٔ تازهٔ تست به‌روز می‌شود، ولی برنامهٔ مرور می‌ماند
 * - کارت‌هایی که سؤالشان دیگر وجود ندارد حذف می‌شوند
 * @param {object} db
 * @param {string[]} [onlyChapterIds]
 */
export function syncCards(db, onlyChapterIds = null) {
  if (!Array.isArray(db.cards)) db.cards = [];
  const now = Date.now();
  const seen = new Set();
  let added = 0;
  let updated = 0;

  const books = (db.books ?? []).filter((b) => b.status === 'ready');
  for (const book of books) {
    for (const chapter of book.chapters ?? []) {
      if (onlyChapterIds && !onlyChapterIds.includes(chapter.id)) continue;
      const quiz = db.artifacts?.[chapter.id]?.quiz;
      if (!quiz?.questions?.length) continue;

      for (const q of quiz.questions) {
        if (!q || !(q.statement || q.prompt)) continue;
        if (q.options && (!Number.isInteger(q.answerIndex) || q.answerIndex < 0)) continue;
        const key = cardKey(chapter.id, q);
        seen.add(key);

        let card = db.cards.find((c) => c.key === key);
        if (!card) {
          card = {
            id: newId('crd'),
            key,
            chapterId: chapter.id,
            bookId: book.id,
            courseId: book.courseId,
            chapterTitle: chapter.title,
            type: q.type ?? 'mcq',
            prompt: q.prompt ?? '',
            statement: q.statement ?? '',
            options: q.options ?? [],
            answerIndex: q.answerIndex ?? -1,
            answer: q.answer ?? '',
            explanation: q.explanation ?? '',
            difficulty: q.difficulty ?? '',
            ease: 2.5,
            intervalDays: 0,
            reps: 0,
            lapses: 0,
            reviews: 0,
            correct: 0,
            dueAt: new Date(now).toISOString(),
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
          };
          db.cards.push(card);
          added += 1;
        } else {
          // متن را با نسخهٔ تازه هم‌گام کن (برنامهٔ مرور دست نمی‌خورد)
          const changed =
            card.statement !== (q.statement ?? '') ||
            card.answerIndex !== (q.answerIndex ?? -1) ||
            (card.options ?? []).join('|') !== (q.options ?? []).join('|');
          card.chapterTitle = chapter.title;
          card.courseId = book.courseId;
          card.bookId = book.id;
          card.prompt = q.prompt ?? card.prompt;
          card.statement = q.statement ?? card.statement;
          card.options = q.options ?? card.options;
          card.answerIndex = q.answerIndex ?? card.answerIndex;
          card.answer = q.answer ?? card.answer;
          card.explanation = q.explanation ?? card.explanation;
          if (changed) { card.ease = 2.5; card.intervalDays = 0; card.reps = 0; }
          updated += 1;
        }
      }
    }
  }

  // حذف کارت‌های یتیم — ولی وقتی فقط چند فصل هم‌گام می‌شوند، کارت‌های بقیهٔ فصل‌ها دست‌نخورده می‌مانند
  const before = db.cards.length;
  db.cards = db.cards.filter(
    (c) => seen.has(c.key) || (onlyChapterIds && !onlyChapterIds.includes(c.chapterId)),
  );
  const removed = before - db.cards.length;

  return { added, updated, removed, total: db.cards.length };
}

/** تاریخ سررسید بعدی بر اساس نمره */
export function schedule(card, grade, now = Date.now()) {
  const g = Math.max(0, Math.min(5, Number(grade)));
  const ease = Number(card.ease) || 2.5;
  const interval = Number(card.intervalDays) || 0;
  const reps = Number(card.reps) || 0;

  let nextEase = ease + (0.1 - (5 - g) * (0.08 + (5 - g) * 0.02));
  nextEase = Math.max(1.3, Math.min(2.9, Number(nextEase.toFixed(2))));

  let nextInterval;
  let nextReps = reps;
  let lapses = Number(card.lapses) || 0;

  if (g < 3) {
    // یادم نبود → فردا و با فاصلهٔ کوتاه دوباره
    lapses += 1;
    nextReps = 0;
    nextInterval = 0;
  } else {
    nextReps = reps + 1;
    if (nextReps === 1) nextInterval = g === 3 ? 1 : g === 4 ? 2 : 4;
    else if (nextReps === 2) nextInterval = g === 3 ? 3 : g === 4 ? 6 : 10;
    else nextInterval = Math.max(1, Math.round(interval * nextEase * (g === 3 ? 0.7 : 1)));
    nextInterval = Math.min(365, nextInterval);
  }

  const dueAt = g < 3
    ? new Date(now + RELEARN_MINUTES * 60 * 1000).toISOString()
    : new Date(now + nextInterval * DAY).toISOString();

  return {
    ease: nextEase,
    intervalDays: nextInterval,
    reps: nextReps,
    lapses,
    dueAt,
    lastGrade: g,
    lastReviewedAt: new Date(now).toISOString(),
    reviews: (Number(card.reviews) || 0) + 1,
    correct: (Number(card.correct) || 0) + (g >= 3 ? 1 : 0),
  };
}

/** کارت‌های سررسیدشده، مرتب بر اساس فوریت */
export function pickDue(cards, { limit = 20, now = Date.now(), courseId = '' } = {}) {
  return (cards ?? [])
    .filter((c) => new Date(c.dueAt).getTime() <= now)
    .filter((c) => !courseId || c.courseId === courseId)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt) || (a.reps ?? 0) - (b.reps ?? 0))
    .slice(0, Math.max(1, Math.min(100, limit)));
}

/** آمار کلی برای داشبورد و نشان کنار منو */
export function reviewStats(db, now = Date.now()) {
  const cards = db.cards ?? [];
  const due = cards.filter((c) => new Date(c.dueAt).getTime() <= now);
  const learned = cards.filter((c) => (c.reps ?? 0) > 0);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const todayReviews = (db.reviews ?? []).filter((r) => new Date(r.at).getTime() >= startOfDay.getTime());
  const nextDue = cards
    .map((c) => new Date(c.dueAt).getTime())
    .filter((t) => t > now)
    .sort((a, b) => a - b)[0];

  return {
    total: cards.length,
    due: due.length,
    learned: learned.length,
    dueSoon: cards.filter((c) => {
      const t = new Date(c.dueAt).getTime();
      return t > now && t <= now + DAY;
    }).length,
    todayReviews: todayReviews.length,
    todayCorrect: todayReviews.filter((r) => r.grade >= 3).length,
    nextDueAt: nextDue ? new Date(nextDue).toISOString() : null,
    accuracy: learned.length
      ? Math.round((cards.reduce((s, c) => s + (c.correct ?? 0), 0) /
          Math.max(1, cards.reduce((s, c) => s + (c.reviews ?? 0), 0))) * 100)
      : 0,
  };
}

/** نمره‌دهی به یک کارت + ثبت در گزارش روزانه */
export async function gradeByKey(key, grade, { responseMs = 0 } = {}) {
  const now = Date.now();
  return updateDb((db) => {
    if (!Array.isArray(db.cards)) db.cards = [];
    const card = db.cards.find((c) => c.key === key);
    if (!card) return null;
    Object.assign(card, schedule(card, grade, now), { updatedAt: new Date(now).toISOString() });

    if (!Array.isArray(db.reviews)) db.reviews = [];
    db.reviews.push({
      id: newId('rev'),
      key,
      chapterId: card.chapterId,
      courseId: card.courseId,
      grade: Number(grade),
      intervalDays: card.intervalDays,
      dueAt: card.dueAt,
      responseMs: Math.max(0, Math.min(600000, Number(responseMs) || 0)),
      at: new Date(now).toISOString(),
    });
    // گزارش تا ۵۰۰۰ رویداد نگه داشته می‌شود
    if (db.reviews.length > 5000) db.reviews = db.reviews.slice(-5000);

    return {
      card: {
        key: card.key,
        dueAt: card.dueAt,
        intervalDays: card.intervalDays,
        ease: card.ease,
        reps: card.reps,
      },
      stats: reviewStats(db, now),
    };
  });
}

/** برچسب انسانی فاصلهٔ بعدی (برای دکمه‌های نمره‌دهی) */
export function previewInterval(card, grade) {
  const next = schedule(card, grade, Date.now());
  const g = Number(grade);
  if (g < 3) return `${RELEARN_MINUTES} دقیقه`;
  if (next.intervalDays === 1) return 'فردا';
  if (next.intervalDays < 30) return `${next.intervalDays} روز`;
  if (next.intervalDays < 365) return `${Math.round(next.intervalDays / 30)} ماه`;
  return 'بیش از یک سال';
}
