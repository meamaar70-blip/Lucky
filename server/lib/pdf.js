// server/lib/pdf.js
// استخراج متن، حذف سرصفحه/پاصفحه و تشخیص خودکار فصل‌ها

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePdfText, normalize, toEnDigits, toFaDigits } from './persian.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDFJS_DIR = path.resolve(__dirname, '../../node_modules/pdfjs-dist/legacy/build');

let pdfjsPromise = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(path.join(PDFJS_DIR, 'pdf.mjs'));
  }
  return pdfjsPromise;
}

async function openDoc(filePath) {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(await fs.readFile(filePath));
  return pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
    standardFontDataUrl: path.join(PDFJS_DIR, '../standard_fonts/'),
  }).promise;
}

/** تبدیل آیتم‌های متنی صفحه به سطرهای خوانا */
function itemsToLines(items) {
  const lines = [];
  let current = { y: null, parts: [] };
  const flush = () => {
    const text = normalizePdfText(current.parts.join(' ')).replace(/\s+/g, ' ').trim();
    if (text) lines.push(text);
    current = { y: null, parts: [] };
  };
  for (const it of items) {
    if (!it.str) continue;
    const y = Math.round(it.transform[5]);
    if (current.y === null) current.y = y;
    if (Math.abs(y - current.y) > 3) {
      flush();
      current.y = y;
    }
    current.parts.push(it.str);
    if (it.hasEOL) {
      flush();
      current.y = null;
    }
  }
  flush();
  return lines;
}

/** حذف سرصفحه و پاصفحه‌های تکراری */
function stripRunningHeads(pagesLines) {
  const counter = new Map();
  for (const lines of pagesLines) {
    for (const line of new Set([lines[0], lines[1], lines.at(-1), lines.at(-2)].filter(Boolean))) {
      const key = normalize(line).replace(/[0-9۰-۹]/g, '#').slice(0, 80);
      if (!key) continue;
      counter.set(key, (counter.get(key) ?? 0) + 1);
    }
  }
  const threshold = Math.max(3, Math.ceil(pagesLines.length * 0.4));
  const running = new Set();
  for (const [key, n] of counter) {
    if (n >= threshold && key.length < 90) running.add(key);
  }
  return pagesLines.map((lines) =>
    lines.filter((line, i) => {
      const isEdge = i < 2 || i >= lines.length - 2;
      const key = normalize(line).replace(/[0-9۰-۹]/g, '#').slice(0, 80);
      if (running.has(key)) return false;
      // شماره‌ی صفحه‌ی تنها
      if (isEdge && /^[\s\-–—]*[0-9۰-۹]{1,4}[\s\-–—]*$/.test(line)) return false;
      // خط‌چین فهرست
      if (/^[.\u2026\s]{6,}$/.test(line)) return false;
      return true;
    }),
  );
}

export async function extractPdf(filePath) {
  const doc = await openDoc(filePath);
  const numPages = doc.numPages;
  const pagesLines = [];

  for (let p = 1; p <= numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pagesLines.push(itemsToLines(content.items));
    page.cleanup();
  }

  const cleaned = stripRunningHeads(pagesLines);
  const pages = cleaned.map((lines, i) => ({
    page: i + 1,
    lines,
    text: lines.join('\n'),
  }));

  let outline = [];
  try {
    const raw = await doc.getOutline();
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const pageNum = await resolveDestPage(doc, item);
        if (pageNum) outline.push({ title: String(item.title ?? '').trim(), page: pageNum });
      }
    }
  } catch {
    outline = [];
  }

  let meta = {};
  try {
    const m = await doc.getMetadata();
    meta = { title: m?.info?.Title ?? '', author: m?.info?.Author ?? '' };
  } catch { /* ignore */ }

  await doc.destroy();
  return { numPages, pages, outline, meta };
}

async function resolveDestPage(doc, item) {
  try {
    let dest = item.dest;
    if (typeof dest === 'string') dest = await doc.getDestination(dest);
    if (!Array.isArray(dest) || !dest.length) return null;
    const ref = dest[0];
    if (typeof ref === 'number') return ref + 1;
    const index = await doc.getPageIndex(ref);
    return index + 1;
  } catch {
    return null;
  }
}

const HEADING_RE = new RegExp(
  [
    '^\\s*(فصل|بخش|گفتار|درس|واحد|پیوست|ضمیمه|مقدمه|پیش‌گفتار|سخن نویسنده|کتاب‌نامه|واژه‌نامه)\\s*[0-9۰-۹IVX]{0,4}\\s*[:.\\-–]?',
    '^\\s*(chapter|part|unit|section|appendix|introduction|preface|contents)\\b',
  ].join('|'),
  'i',
);

const NUMBERED_TITLE_RE = /^\s*(فصل|بخش|گفتار|درس)\s*[0-9۰-۹]{1,2}\s*[:.\-–]?\s*\S+/;

function looksLikeHeading(line) {
  const raw = line.trim();
  if (!raw || raw.length > 70) return false;
  const n = normalize(raw);
  if (/^[.…\s]+$/.test(n)) return false;
  if (NUMBERED_TITLE_RE.test(n)) return true;
  if (HEADING_RE.test(n) && n.split(/\s+/).length <= 8) return true;
  return false;
}

/**
 * تشخیص فصل‌ها
 * اولویت: بوکمارک PDF → عناوین شماره‌دار «فصل n» → تقسیم یکنواخت
 */
export function detectChapters({ pages, outline, numPages }) {
  const cleanTitle = (t) => toFaDigits(normalizePdfText(t).replace(/\s+/g, ' ').trim().slice(0, 120));

  // ۱) بوکمارک‌ها
  if (outline?.length >= 2) {
    const items = outline
      .filter((o) => o.title && o.page >= 1 && o.page <= numPages)
      .filter((o) => !/^(فهرست|contents|index|cover)$/i.test(normalize(o.title)));
    const uniq = [];
    for (const it of items) {
      if (uniq.some((u) => u.page === it.page)) continue;
      uniq.push(it);
    }
    if (uniq.length >= 2) {
      return uniq.map((it, i) => ({
        title: cleanTitle(it.title) || `فصل ${toFaDigits(i + 1)}`,
        startPage: it.page,
        endPage: (uniq[i + 1]?.page ?? numPages + 1) - 1,
      })).filter((c) => c.endPage >= c.startPage);
    }
  }

  // ۲) اسکن صفحات برای عنوان فصل
  const found = [];
  for (const p of pages) {
    const headLines = p.lines.slice(0, 8);
    const hit = headLines.find(looksLikeHeading) ?? null;
    if (!hit) continue;
    // عنوان نباید تکراری با صفحه‌ی قبل باشد و صفحه باید متن کافی داشته باشد
    if (p.text.length < 120) continue;
    const title = cleanTitle(hit);
    if (found.some((f) => normalize(f.title) === normalize(title))) continue;
    found.push({ title, startPage: p.page });
  }

  // اگر عنوان‌ها فقط «فصل» تکراری بودند، شماره‌گذاری کنیم
  if (found.length >= 2) {
    const numbered = found.map((f, i) => ({
      title: /[0-9۰-۹]/.test(f.title) ? f.title : `${f.title} ${toFaDigits(i + 1)}`,
      startPage: f.startPage,
    }));
    const chapters = numbered.map((c, i) => ({
      ...c,
      endPage: (numbered[i + 1]?.startPage ?? numPages + 1) - 1,
    }));
    // اگر فصل اول از صفحه ۱ شروع نمی‌شود، مقدمه را جدا کنیم
    if (chapters[0].startPage > 2) {
      chapters.unshift({ title: 'مقدمه و آغاز کتاب', startPage: 1, endPage: chapters[0].startPage - 1 });
    }
    return chapters.filter((c) => c.endPage >= c.startPage);
  }

  // ۳) تقسیم یکنواخت
  const chunk = Math.max(8, Math.min(30, Math.ceil(numPages / 6)));
  const chapters = [];
  for (let start = 1; start <= numPages; start += chunk) {
    const end = Math.min(numPages, start + chunk - 1);
    chapters.push({ title: `بخش ${toFaDigits(chapters.length + 1)} (صفحه ${toFaDigits(start)}–${toFaDigits(end)})`, startPage: start, endPage: end });
  }
  return chapters;
}

/** متن یک فصل از روی صفحات */
export function chapterText(pages, startPage, endPage) {
  const slice = pages.filter((p) => p.page >= startPage && p.page <= endPage);
  return slice.map((p) => `\n\n[[صفحه ${toFaDigits(p.page)}]]\n${p.text}`).join('');
}

export { toFaDigits };
