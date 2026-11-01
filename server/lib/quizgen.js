// server/lib/quizgen.js
// تولید خودکار تست چهارگزینه‌ای، درست/نادرست و پاسخ کوتاه از متن فصل

import { words, isStopword, isLightVerb, jaccard, normalize } from './persian.js';
import { pickSentences } from './analyze.js';

/** تولید‌کننده‌ی شبه‌تصادفی با دانه‌ی ثابت (تا خروجی برای یک فصل تکرارپذیر باشد) */
function rng(seedStr) {
  let h = 2166136261;
  for (const ch of String(seedStr)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    return (h >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BAD_TERM = /^(مثال|شکل|جدول|فصل|بخش|صفحه|تمرین|پرسش|نکته|توجه|ادامه|فهرست|مقدمه)$/;

/**
 * @param {object} profile خروجی buildProfile
 * @param {object} opts
 */
export function generateQuiz(profile, { count = 10, seed = 'chapter', mix = { mcq: 0.6, tf: 0.25, short: 0.15 } } = {}) {
  const rand = rng(seed);
  // واژه‌های قابل استفاده به‌عنوان گزینه: ترکیب‌های دوکلمه‌ای و واژه‌های معنادار
  const termObjs = profile.terms.filter(
    (t) => (t.kind === 'bi' || t.term.length >= 5)
      && !BAD_TERM.test(t.term)
      && !t.term.split(' ').some(isLightVerb),
  );
  const terms = termObjs.map((t) => t.term);
  const biTerms = termObjs.filter((t) => t.kind === 'bi').map((t) => t.term);
  const sameKind = (a, b) => termObjs.find((t) => t.term === a)?.kind === termObjs.find((t) => t.term === b)?.kind;

  const usable = profile.sentences.filter((s) => s.wc >= 8 && s.wc <= 42);
  const withTerm = usable
    .map((s) => {
      const found = terms.filter((t) => new RegExp(`(^|\\s)${escapeRe(t)}(\\s|$)`, 'i').test(s.text));
      return { ...s, hitTerms: found };
    })
    .filter((s) => s.hitTerms.length > 0)
    .sort((a, b) => b.score - a.score);

  const quiz = [];
  const usedSentences = new Set();
  const nMcq = Math.max(2, Math.round(count * mix.mcq));
  const nTf = Math.max(1, Math.round(count * mix.tf));
  const nShort = Math.max(0, count - nMcq - nTf);

  const takeSentence = (pool) => {
    for (const s of pool) {
      if (usedSentences.has(s.index)) continue;
      usedSentences.add(s.index);
      return s;
    }
    return null;
  };

  const distractors = (answer, sentenceText) => {
    const inSentence = new Set(words(sentenceText));
    const ok = (t) => t !== answer && !inSentence.has(t.split(' ')[0]);
    const near = (t) => Math.abs(t.length - answer.length) <= 10;
    const order = [
      ...shuffle(terms.filter((t) => ok(t) && near(t) && sameKind(t, answer)), rand),
      ...shuffle(terms.filter((t) => ok(t) && near(t)), rand),
      ...shuffle(terms.filter(ok), rand),
    ];
    return [...new Set(order)].slice(0, 3);
  };

  // ۱) چهارگزینه‌ای جای‌خالی
  for (let i = 0; i < nMcq * 3 && quiz.length < nMcq; i++) {
    const s = takeSentence(withTerm);
    if (!s) break;
    const term = s.hitTerms.sort((a, b) => b.length - a.length)[0];
    const re = new RegExp(escapeRe(term), 'i');
    const masked = s.text.replace(re, '«ـــ...ـــ»');
    if (masked === s.text) continue;
    const opts = shuffle([term, ...distractors(term, s.text)], rand);
    quiz.push({
      id: `q${quiz.length + 1}`,
      type: 'mcq',
      prompt: 'جای خالی را با گزینه‌ی درست کامل کنید:',
      statement: masked,
      options: opts,
      answerIndex: opts.indexOf(term),
      answer: term,
      explanation: s.text,
      difficulty: term.length > 10 ? 'سخت' : term.length > 6 ? 'متوسط' : 'آسان',
    });
  }

  // ۲) درست / نادرست
  const tfPool = shuffle(usable.filter((s) => s.wc >= 10 && s.wc <= 34), rand);
  for (let i = 0; i < nTf; i++) {
    const s = takeSentence(tfPool);
    if (!s) break;
    const makeFalse = rand() < 0.5;
    let statement = s.text;
    if (makeFalse) {
      const found = terms.filter((t) => new RegExp(`(^|\\s)${escapeRe(t)}(\\s|$)`, 'i').test(s.text));
      if (found.length) {
        const target = found[0];
        const usable = terms.filter((t) => !s.text.includes(t) && t.length >= Math.max(4, target.length - 3));
        const swapPool = usable.filter((t) => sameKind(t, target) && Math.abs(t.length - target.length) <= 8);
        const pool = swapPool.length ? swapPool : usable;
        const swap = pool[Math.floor(rand() * Math.max(1, pool.length))];
        if (swap) statement = statement.replace(new RegExp(escapeRe(target), 'i'), swap);
      } else {
        continue; // جایگزینی ممکن نبود، از این جمله صرف‌نظر می‌کنیم
      }
    }
    quiz.push({
      id: `q${quiz.length + 1}`,
      type: 'tf',
      prompt: 'این جمله را با توجه به متن درس بسنجید:',
      statement,
      options: ['درست', 'نادرست'],
      answerIndex: makeFalse ? 1 : 0,
      answer: makeFalse ? 'نادرست' : 'درست',
      explanation: makeFalse ? `متن اصلی: ${s.text}` : s.text,
      difficulty: 'متوسط',
    });
  }

  // ۳) پاسخ کوتاه (تشخیص اصطلاح از روی تعریف)
  const definitional = profile.sentences
    .filter((s) => s.wc >= 8 && s.wc <= 45)
    .map((s) => {
      const found = terms.filter((t) => new RegExp(`^${escapeRe(t)}(\\s|$|،|,)`, 'i').test(s.text.trim()))
        .concat(terms.filter((t) => new RegExp(`(^|\\s)${escapeRe(t)}\\s+(فرایندی|مفهومی|اصطلاحی|عبارت|به)`, 'i').test(s.text)));
      return { ...s, hitTerms: [...new Set(found)] };
    })
    .filter((s) => s.hitTerms.length > 0)
    .sort((a, b) => b.score - a.score);

  for (let i = 0; i < nShort * 4 && quiz.length < count; i++) {
    const s = takeSentence(definitional);
    if (!s) continue;
    const term = s.hitTerms.sort((a, b) => b.length - a.length)[0];
    const masked = s.text.replace(new RegExp(escapeRe(term), 'i'), '«آنچه باید پاسخ دهید»');
    quiz.push({
      id: `q${quiz.length + 1}`,
      type: 'short',
      prompt: 'اصطلاح یا مفهومی که در جای خالی آمده چیست؟',
      statement: masked,
      answer: term,
      explanation: s.text,
      difficulty: 'سخت',
    });
  }

  // اگر کم آمد، از نکات کلیدی چهارگزینه‌ای بساز
  if (quiz.length < count) {
    const extra = pickSentences(profile, count * 2, { dedupe: 0.5 });
    for (const s of extra) {
      if (quiz.length >= count) break;
      if (usedSentences.has(s.index)) continue;
      const toks = s.tokens.filter((t) => t.length > 4);
      if (!toks.length) continue;
      const term = toks.sort((a, b) => b.length - a.length)[0];
      const opts = shuffle([term, ...distractors(term, s.text)], rand);
      usedSentences.add(s.index);
      quiz.push({
        id: `q${quiz.length + 1}`,
        type: 'mcq',
        prompt: 'جای خالی را کامل کنید:',
        statement: s.text.replace(new RegExp(escapeRe(term), 'i'), '«ـــ...ـــ»'),
        options: opts,
        answerIndex: opts.indexOf(term),
        answer: term,
        explanation: s.text,
        difficulty: 'متوسط',
      });
    }
  }

  return {
    questions: quiz.map((q, i) => ({ ...q, id: `q${i + 1}` })),
    meta: {
      count: quiz.length,
      mcq: quiz.filter((q) => q.type === 'mcq').length,
      tf: quiz.filter((q) => q.type === 'tf').length,
      short: quiz.filter((q) => q.type === 'short').length,
      engine: 'local',
    },
  };
}

/** بررسی پاسخ تشریحی کوتاه */
export function isShortAnswerCorrect(given, answer) {
  const g = normalize(given).toLowerCase().replace(/[^\p{L}\p{N}\u200c\s]/gu, '').trim();
  const a = normalize(answer).toLowerCase().replace(/[^\p{L}\p{N}\u200c\s]/gu, '').trim();
  if (!g) return false;
  if (g === a) return true;
  const gt = new Set(words(g).filter((w) => !isStopword(w)));
  const at = new Set(words(a).filter((w) => !isStopword(w)));
  if (!gt.size || !at.size) return false;
  return jaccard([...gt], [...at]) >= 0.5 || g.includes(a) || a.includes(g);
}
