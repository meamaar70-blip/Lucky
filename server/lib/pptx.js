// server/lib/pptx.js
// ساخت پاورپوینت راست‌به‌چپ از روی خلاصه و تست‌های فصل

import pptxgen from 'pptxgenjs';
import { toFaDigits } from './persian.js';

const FONT = 'Tahoma';
const C = {
  brand: '4F46E5',
  brandDark: '312E81',
  ink: '111827',
  muted: '4B5563',
  line: 'E5E7EB',
  soft: 'EEF2FF',
  accent: '0D9488',
  warn: 'B45309',
  white: 'FFFFFF',
  bg: 'FFFFFF',
  card: 'F8FAFC',
};

const W = 10;
const H = 5.625;
const M = 0.6;

function todayFa() {
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long' }).format(new Date());
  } catch {
    return '';
  }
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function trimTo(text, n) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * @param {object} p
 * @param {string} p.courseTitle
 * @param {object} p.chapter  {title, startPage, endPage}
 * @param {object} p.summary  {paragraph, keyPoints, terms, sections}
 * @param {object} p.quiz     {questions}
 * @param {object} p.profile  {name, university, term}
 */
export async function buildPresentation({ courseTitle, chapter, summary, quiz, profile = {} }) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = profile.name || 'Lucky Study';
  pptx.company = profile.university || '';
  pptx.title = `${courseTitle} — ${chapter.title}`;
  pptx.rtlMode = true;
  pptx.theme = {
    headFontFace: FONT,
    bodyFontFace: FONT,
    lang: 'fa-IR',
  };

  const chapterNo = chapter.order ? `فصل ${toFaDigits(chapter.order)}` : 'فصل';
  const slideTitleStyle = {
    fontFace: FONT, fontSize: 26, bold: true, color: C.ink, align: 'right', rtlMode: true,
  };
  const header = (slide, title, kicker) => {
    slide.background = { color: C.bg };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.12, fill: { color: C.brand } });
    slide.addText(kicker ?? courseTitle, {
      x: M, y: 0.28, w: W - 2 * M, h: 0.32, fontSize: 12, color: C.brand,
      fontFace: FONT, align: 'right', rtlMode: true, bold: true,
    });
    slide.addText(title, {
      x: M, y: 0.6, w: W - 2 * M, h: 0.62, ...slideTitleStyle,
    });
    slide.addShape(pptx.ShapeType.line, {
      x: M, y: 1.32, w: W - 2 * M, h: 0,
      line: { color: C.line, width: 1 },
    });
  };
  const footer = (slide, n) => {
    slide.addText(`${courseTitle} • ${chapter.title}`, {
      x: M, y: H - 0.46, w: 6, h: 0.3, fontSize: 9, color: C.muted, fontFace: FONT, align: 'right', rtlMode: true });
    slide.addText(String(n), {
      x: W - M - 0.6, y: H - 0.46, w: 0.6, h: 0.3, fontSize: 9, color: C.muted,
      fontFace: FONT, align: 'left',
    });
  };

  let slideNo = 1;

  /* ---------- ۱. جلد ---------- */
  const cover = pptx.addSlide();
  cover.background = { color: C.brandDark };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.28, h: H, fill: { color: C.accent } });
  cover.addText(chapterNo, {
    x: M + 0.2, y: 1.05, w: 6, h: 0.4, fontSize: 14, color: 'C7D2FE', fontFace: FONT, align: 'right', rtlMode: true, charSpacing: 2,
  });
  cover.addText(trimTo(chapter.title, 90), {
    x: M, y: 1.55, w: W - 2 * M, h: 1.5, fontSize: 38, bold: true, color: C.white,
    fontFace: FONT, align: 'right', rtlMode: true, fit: 'shrink',
  });
  cover.addShape(pptx.ShapeType.line, { x: W / 2, y: 3.15, w: 3.2, h: 0, line: { color: C.accent, width: 3 } });
  cover.addText(courseTitle, {
    x: M, y: 3.35, w: W - 2 * M, h: 0.45, fontSize: 20, color: 'E0E7FF',
    fontFace: FONT, align: 'right', rtlMode: true,
  });
  const meta = [
    profile.name ? `تهیه‌کننده: ${profile.name}` : '',
    profile.term ? profile.term : '',
    todayFa(),
  ].filter(Boolean).join('  •  ');
  cover.addText(meta, {
    x: M, y: 3.95, w: W - 2 * M, h: 0.35, fontSize: 12, color: 'A5B4FC', fontFace: FONT, align: 'right', rtlMode: true,
  });
  cover.addText('ساخته‌شده با Lucky', {
    x: M, y: H - 0.65, w: W - 2 * M, h: 0.3, fontSize: 10, color: '818CF8', fontFace: FONT, align: 'left',
  });

  /* ---------- ۲. نقشه‌ی فصل ---------- */
  const sections = (summary.sections ?? []).filter((s) => s.title);
  const termTitles = (summary.terms ?? []).map((t) => t.term).filter(Boolean);
  const agendaTitles = sections.length
    ? sections.map((s) => s.title)
    : (termTitles.length >= 3
      ? termTitles.slice(0, 8)
      : (summary.keyPoints ?? []).slice(0, 6).map((p) => String(typeof p === 'string' ? p : p.text).split(/\s+/).slice(0, 6).join(' ')));

  if (agendaTitles.length) {
    const s = pptx.addSlide();
    slideNo += 1;
    header(s, sections.length ? 'نقشه‌ی فصل' : 'موضوعات کلیدی فصل');
    const items = agendaTitles.slice(0, 8);
    items.forEach((t, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = col === 0 ? W / 2 + 0.1 : M;
      const y = 1.65 + row * 0.72;
      s.addShape(pptx.ShapeType.roundRect, {
        x, y, w: W / 2 - 0.7, h: 0.58, fill: { color: C.soft }, line: { color: C.line, width: 1 }, rectRadius: 0.1,
      });
      s.addText(String(i + 1), {
        x: x + W / 2 - 1.25, y, w: 0.45, h: 0.58, fontSize: 16, bold: true, color: C.brand,
        fontFace: FONT, align: 'center', valign: 'middle',
      });
      s.addText(trimTo(t, 55), {
        x: x + 0.15, y, w: W / 2 - 1.4, h: 0.58, fontSize: 13, color: C.ink,
        fontFace: FONT, align: 'right', rtlMode: true, valign: 'middle', fit: 'shrink',
      });
    });
    footer(s, slideNo);
  }

  /* ---------- ۳. بخش‌ها ---------- */
  for (const sec of sections) {
    const s = pptx.addSlide();
    slideNo += 1;
    header(s, trimTo(sec.title, 70));
    const bodyChunks = chunk(
      String(sec.body).split(/(?<=[.؟!])\s+/).filter(Boolean),
      5,
    );
    bodyChunks.slice(0, 2).forEach((lines, idx) => {
      const y = 1.55 + idx * 2.0;
      s.addShape(pptx.ShapeType.rect, {
        x: M, y, w: W - 2 * M, h: 1.8, fill: { color: C.card }, line: { color: C.line, width: 1 },
      });
      s.addText(lines.join(' '), {
        x: M + 0.2, y: y + 0.15, w: W - 2 * M - 0.4, h: 1.5, fontSize: 14, color: C.ink,
        fontFace: FONT, align: 'right', rtlMode: true, valign: 'top', fit: 'shrink', lineSpacing: 24,
      });
    });
    if (!bodyChunks.length) {
      s.addText('—', { x: M, y: 1.6, w: W - 2 * M, h: 0.6, fontSize: 14, color: C.muted, fontFace: FONT, align: 'right' });
    }
    footer(s, slideNo);
  }

  /* ---------- ۴. نکات کلیدی ---------- */
  const points = (summary.keyPoints ?? []).map((p) => (typeof p === 'string' ? p : p.text)).filter(Boolean);
  const pointPages = chunk(points, 4);
  pointPages.slice(0, 5).forEach((group, gi) => {
    const s = pptx.addSlide();
    slideNo += 1;
    header(s, `نکات کلیدی${pointPages.length > 1 ? ` (${toFaDigits(gi + 1)} از ${toFaDigits(pointPages.length)})` : ''}`);
    group.forEach((p, i) => {
      const y = 1.55 + i * 0.95;
      s.addShape(pptx.ShapeType.roundRect, {
        x: M, y, w: W - 2 * M, h: 0.8, fill: { color: 'FFFFFF' }, line: { color: C.line, width: 1 }, rectRadius: 0.08,
      });
      s.addShape(pptx.ShapeType.ellipse, {
        x: W - M - 0.55, y: y + 0.17, w: 0.45, h: 0.45, fill: { color: C.brand },
      });
      s.addText(String(i + 1 + gi * 4), {
        x: W - M - 0.55, y: y + 0.17, w: 0.45, h: 0.45, fontSize: 12, bold: true, color: C.white,
        fontFace: FONT, align: 'center', valign: 'middle',
      });
      s.addText(trimTo(p, 190), {
        x: M + 0.15, y: y + 0.05, w: W - 2 * M - 0.9, h: 0.7, fontSize: 13, color: C.ink,
        fontFace: FONT, align: 'right', rtlMode: true, valign: 'middle', fit: 'shrink',
      });
    });
    footer(s, slideNo);
  });

  /* ---------- ۵. اصطلاحات ---------- */
  const terms = (summary.terms ?? []).filter((t) => t.term);
  if (terms.length) {
    for (const group of chunk(terms, 6)) {
      const s = pptx.addSlide();
      slideNo += 1;
      header(s, 'اصطلاح‌ها و مفاهیم مهم', 'واژه‌نامه‌ی فصل');
      const rows = [[
        { text: 'اصطلاح', options: { bold: true, color: C.white, fill: { color: C.brand }, align: 'center' } },
        { text: 'توضیح کوتاه', options: { bold: true, color: C.white, fill: { color: C.brand }, align: 'center' } },
      ]];
      for (const t of group) {
        rows.push([
          { text: t.term, options: { bold: true, color: C.ink, align: 'right', rtlMode: true } },
          { text: trimTo(t.context || t.definition || '—', 130), options: { color: C.muted, align: 'right', rtlMode: true } },
        ]);
      }
      s.addTable(rows, {
        x: M, y: 1.5, w: W - 2 * M, colW: [2.2, W - 2 * M - 2.2],
        border: { type: 'solid', color: C.line, pt: 1 },
        fontFace: FONT, fontSize: 11, valign: 'middle', rowH: 0.5,
        margin: 6,
      });
      footer(s, slideNo);
    }
  }

  /* ---------- ۶. خلاصه ---------- */
  const para = String(summary.paragraph ?? '').trim();
  if (para) {
    const sentences = para.split(/(?<=[.؟!])\s+/).filter(Boolean);
    for (const group of chunk(sentences, 5)) {
      const s = pptx.addSlide();
      slideNo += 1;
      header(s, 'خلاصه‌ی فصل', 'جمع‌بندی');
      s.addShape(pptx.ShapeType.rect, { x: M, y: 1.55, w: 0.06, h: 3.2, fill: { color: C.accent } });
      s.addText(group.join(' '), {
        x: M + 0.25, y: 1.55, w: W - 2 * M - 0.3, h: 3.2, fontSize: 14, color: C.ink,
        fontFace: FONT, align: 'right', rtlMode: true, valign: 'top', fit: 'shrink', lineSpacing: 26,
      });
      footer(s, slideNo);
    }
  }

  /* ---------- ۷. پرسش‌های مرور ---------- */
  const questions = (quiz?.questions ?? []).slice(0, 8);
  const questionPages = chunk(questions, 3);
  questionPages.forEach((group, gi) => {
    const s = pptx.addSlide();
    slideNo += 1;
    header(s, `پرسش‌های مرور${questionPages.length > 1 ? ` (${toFaDigits(gi + 1)})` : ''}`, 'خودآزمایی');
    group.forEach((q, i) => {
      const y = 1.55 + i * 1.15;
      s.addText(`سؤال ${toFaDigits(gi * 3 + i + 1)}.`, {
        x: W - M - 0.9, y, w: 0.9, h: 0.3, fontSize: 12, bold: true, color: C.accent,
        fontFace: FONT, align: 'right', rtlMode: true,
      });
      s.addText(trimTo(q.statement ?? '', 150), {
        x: M, y: y + 0.28, w: W - 2 * M, h: 0.5, fontSize: 12, color: C.ink,
        fontFace: FONT, align: 'right', rtlMode: true, fit: 'shrink',
      });
      if (q.options?.length) {
        s.addText(q.options.map((o, oi) => `${toFaDigits(oi + 1)}) ${trimTo(o, 40)}`).join('    '), {
          x: M, y: y + 0.78, w: W - 2 * M, h: 0.3, fontSize: 10, color: C.muted,
          fontFace: FONT, align: 'right', rtlMode: true,
        });
      }
    });
    footer(s, slideNo);
  });

  if (questions.length) {
    const s = pptx.addSlide();
    slideNo += 1;
    header(s, 'پاسخ‌نامه', 'پاسخ‌های کوتاه');
    const answers = questions.map((q, i) => `${toFaDigits(i + 1)}. ${trimTo(q.answer ?? '', 60)}`).join('\n');
    s.addText(answers, {
      x: M, y: 1.55, w: W - 2 * M, h: 3.4, fontSize: 12, color: C.ink,
      fontFace: FONT, align: 'right', rtlMode: true, lineSpacing: 22, fit: 'shrink',
    });
    footer(s, slideNo);
  }

  /* ---------- ۸. پایان ---------- */
  const end = pptx.addSlide();
  slideNo += 1;
  end.background = { color: C.brandDark };
  end.addText('پایان', {
    x: M, y: 2.0, w: W - 2 * M, h: 1.0, fontSize: 40, bold: true, color: C.white,
    fontFace: FONT, align: 'center', rtlMode: true,
  });
  end.addText(`${courseTitle} • ${chapter.title}`, {
    x: M, y: 3.0, w: W - 2 * M, h: 0.5, fontSize: 14, color: 'C7D2FE',
    fontFace: FONT, align: 'center', rtlMode: true,
  });

  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  return { buffer, slides: slideNo };
}
