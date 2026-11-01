// server/lib/analyze.js
// تحلیل متن فصل: آمار، کلمات کلیدی، امتیازدهی جمله‌ها

import { words, sentencesWithPages, normalizePdfText, normalize, isStopword, isLightVerb, jaccard } from './persian.js';

const CUE_PATTERNS = [
  /تعریف|به معنای|یعنی|عبارت است از|به کار می‌رود|گویند|می‌نامیم|می‌نامند/i,
  /مهم|اهمیت|اساسی|کلیدی|اصلی|بنیادی/i,
  /نتیجه|خلاصه|بنابراین|در مجموع|به طور کلی/i,
  /قانون|فرمول|رابطه|معادله|قضیه|اصل|نظریه|مدل/i,
  /مراحل|مرحله|انواع|اقسام|دسته|طبقه‌بندی|ویژگی|مزیت|عیب/i,
];

/** واژه‌ی «معنادار» برای استخراج کلیدواژه */
function usefulWord(w) {
  if (w.length < 3) return false;
  if (isStopword(w)) return false;
  if (isLightVerb(w)) return false;
  if (/^[0-9]+$/.test(w)) return false;
  return true;
}

/** آمار ساده‌ی خواندن */
export function readingStats(text) {
  const ws = words(text);
  return {
    chars: String(text ?? '').length,
    words: ws.length,
    // سرعت متوسط مطالعه‌ی فارسی: ~۲۰۰ کلمه در دقیقه
    minutes: Math.max(1, Math.round(ws.length / 200)),
  };
}

/**
 * ساخت پروفایل آماری متن
 */
export function buildProfile(text, { title = '' } = {}) {
  const all = sentencesWithPages(text);
  const headings = [];
  let currentHeading = null;
  const sents = [];
  for (const s of all) {
    if (s.heading) {
      headings.push({ text: s.text, page: s.page });
      currentHeading = s.text;
      continue;
    }
    sents.push({
      index: sents.length,
      page: s.page,
      text: s.text,
      heading: currentHeading,
      tokens: words(s.text).filter(usefulWord),
      wc: words(s.text).length,
    });
  }

  const df = new Map();
  for (const s of sents) {
    for (const t of new Set(s.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const total = Math.max(1, sents.length);
  const weight = new Map();
  for (const [t, d] of df) {
    const base = 1 + Math.log(d);
    const idf = Math.log(1 + total / (1 + d)) + 0.35;
    weight.set(t, base * idf * (1 + Math.min(t.length, 12) / 30));
  }

  // واژه‌های عنوان فصل وزن بیشتری دارند
  for (const t of words(title).filter(usefulWord)) {
    weight.set(t, (weight.get(t) ?? 1) * 2.2);
  }

  const maxW = Math.max(1, ...weight.values());

  // دوقطعه‌ای‌ها (ترکیب‌های دوکلمه‌ای معنادار)
  const bigrams = new Map();
  for (const s of sents) {
    const w = words(s.text);
    for (let i = 0; i < w.length - 1; i++) {
      const a = w[i];
      const b = w[i + 1];
      if (!usefulWord(a) || !usefulWord(b)) continue;
      if (a.length < 3 || b.length < 3) continue;
      const bg = `${a} ${b}`;
      bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
    }
  }

  const uni = [...df.entries()]
    .filter(([t, d]) => d >= 2 && usefulWord(t))
    .map(([term, count]) => ({ term, count, kind: 'uni', score: (weight.get(term) ?? 0) / maxW }))
    .sort((a, b) => b.score - a.score || b.count - a.count);

  const bi = [...bigrams.entries()]
    .filter(([, c]) => c >= 2)
    .map(([term, count]) => ({ term, count, kind: 'bi', score: Math.min(1, count / 3) }))
    .sort((a, b) => b.count - a.count || b.term.length - a.term.length);

  // دوقطعه‌ای‌هایی که تک‌واژه‌ی پرقدرت‌شان هم جدا آمده، حذف می‌شوند تا تکرار نشود
  const uniTerms = new Set(uni.map((u) => u.term));
  const termPool = [
    ...bi,
    ...uni.filter((u) => !bi.some((b) => b.term.split(' ').includes(u.term))),
  ].filter((t, i, arr) => arr.findIndex((x) => x.term === t.term) === i);

  // امتیاز جمله
  for (const s of sents) {
    let sum = 0;
    for (const t of new Set(s.tokens)) sum += weight.get(t) ?? 0;
    let score = sum / Math.sqrt(Math.max(4, s.wc));
    if (s.index === 0) score *= 1.35;
    else if (s.index < 3) score *= 1.15;
    if (s.wc < 7) score *= 0.7;
    if (s.wc > 60) score *= 0.85;
    if (CUE_PATTERNS.some((re) => re.test(s.text))) score *= 1.18;
    if (/[0-9]{1,3}([.,][0-9]+)?%?/.test(s.text)) score *= 1.05;
    s.score = score;
  }

  const maxS = Math.max(1e-6, ...sents.map((s) => s.score));
  for (const s of sents) s.score = s.score / maxS;

  return {
    text: normalizePdfText(text),
    sentences: sents,
    headings,
    terms: termPool.slice(0, 60),
    stats: readingStats(text),
  };
}

/** انتخاب جمله‌های غیرتکراری با بالاترین امتیاز */
export function pickSentences(profile, count, { minScore = 0, dedupe = 0.45 } = {}) {
  const sorted = [...profile.sentences]
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score);
  const picked = [];
  for (const s of sorted) {
    if (picked.length >= count) break;
    if (picked.some((p) => jaccard(p.tokens, s.tokens) > dedupe)) continue;
    picked.push(s);
  }
  return picked;
}

/** جمله‌ی توضیحی برای یک اصطلاح */
export function contextFor(profile, term) {
  const needle = term.toLowerCase();
  const hit = profile.sentences.find(
    (s) => s.text.toLowerCase().includes(needle) && s.wc > 6 && s.wc < 45,
  );
  return hit ? hit.text : '';
}

export const DEPTHS = {
  short: { label: 'کوتاه', ratio: 0.1, min: 4, max: 7, points: 5 },
  medium: { label: 'متوسط', ratio: 0.18, min: 6, max: 12, points: 7 },
  long: { label: 'مفصل', ratio: 0.3, min: 9, max: 20, points: 10 },
};

/** ساخت خلاصه‌ی ساختاریافته از روی پروفایل متن */
export function summarizeProfile(profile, { depth = 'medium', title = '' } = {}) {
  const cfg = DEPTHS[depth] ?? DEPTHS.medium;
  const total = profile.sentences.length;
  const target = Math.min(cfg.max, Math.max(cfg.min, Math.round(total * cfg.ratio)));

  const core = pickSentences(profile, target).sort((a, b) => a.index - b.index);
  const paragraph = core.map((s) => s.text.trim()).join(' ');

  const points = pickSentences(profile, cfg.points, { dedupe: 0.35 }).map((s) => ({
    text: s.text.trim(),
    page: s.page,
  }));

  // بخش‌بندی بر اساس عنوان‌های میانی فصل
  const bare = (t) => normalize(String(t ?? ''))
    .replace(/^(فصل|بخش|گفتار|درس|واحد|پیوست)\s*[0-9]+\s*[:.\-–]?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const sameTitle = (a, b) => Boolean(a) && Boolean(b) && (bare(a) === bare(b) || bare(a).includes(bare(b)) || bare(b).includes(bare(a)));
  const sections = [];
  const seen = new Set();
  for (const s of profile.sentences) {
    const h = s.heading;
    if (!h || sameTitle(h, title) || seen.has(h)) continue;
    const group = profile.sentences.filter((x) => x.heading === h);
    if (group.length < 2) continue;
    const best = [...group].sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.index - b.index);
    sections.push({ title: h.replace(/^(فصل|بخش|گفتار|درس)\s*[0-9۰-۹]+\s*[:.\-–]?\s*/u, '') || h, body: best.map((b) => b.text).join(' ') });
    seen.add(h);
    if (sections.length >= 6) break;
  }

  const terms = profile.terms.slice(0, 12).map((t) => ({
    term: t.term,
    count: t.count,
    context: contextFor(profile, t.term),
  }));

  return {
    title,
    depth,
    paragraph,
    keyPoints: points,
    terms,
    sections,
    stats: profile.stats,
    coverage: Math.min(100, Math.round((core.length / Math.max(1, total)) * 100)),
    engine: 'local',
  };
}
