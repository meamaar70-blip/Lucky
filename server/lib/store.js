// server/lib/store.js
// ذخیره‌سازی ساده و امن روی فایل JSON (بدون نیاز به دیتابیس)

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.LUCKY_DATA_DIR
  ? path.resolve(process.env.LUCKY_DATA_DIR)
  : path.resolve(__dirname, '../../data');

export const DIRS = {
  root: DATA_DIR,
  uploads: path.join(DATA_DIR, 'uploads'),
  text: path.join(DATA_DIR, 'text'),
  exports: path.join(DATA_DIR, 'exports'),
};

const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = {
  version: 1,
  profile: { name: '', university: '', field: '', term: '' },
  courses: [],
  sessions: [],
  books: [],
  artifacts: {},
  attempts: [],
  settings: { ai: { baseUrl: '', apiKey: '', model: '' } },
};

let cache = null;
let queue = Promise.resolve();

export function newId(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

async function ensureDirs() {
  for (const dir of Object.values(DIRS)) {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function load() {
  if (cache) return cache;
  await ensureDirs();
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    cache = {
      ...structuredClone(EMPTY),
      ...parsed,
      profile: { ...EMPTY.profile, ...(parsed.profile ?? {}) },
      settings: { ai: { ...EMPTY.settings.ai, ...(parsed.settings?.ai ?? {}) } },
    };
  } catch {
    cache = structuredClone(EMPTY);
    await persist(); // فقط یک‌بار در شروع
  }
  return cache;
}

async function persist() {
  await ensureDirs();
  const tmp = `${DB_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(cache, null, 2), 'utf8');
  await fs.rename(tmp, DB_FILE);
}

export async function readDb() {
  await queue;
  return load();
}

/**
 * تغییر اتمیک دیتابیس
 * @param {(db:any)=>any} mutator
 */
export async function updateDb(mutator) {
  const run = async () => {
    const db = await load();
    const result = await mutator(db);
    await persist();
    return result;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

export async function writeChapterText(bookId, chapterId, text) {
  const dir = path.join(DIRS.text, bookId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${chapterId}.txt`), text, 'utf8');
}

export async function readChapterText(bookId, chapterId) {
  try {
    return await fs.readFile(path.join(DIRS.text, bookId, `${chapterId}.txt`), 'utf8');
  } catch {
    return '';
  }
}

export function safeJoin(base, name) {
  const resolved = path.resolve(base, name);
  if (!resolved.startsWith(path.resolve(base) + path.sep)) {
    throw new Error('مسیر نامعتبر');
  }
  return resolved;
}

/** تنظیمات هوش مصنوعی؛ کلید فقط سمت سرور می‌ماند */
export async function getAiConfig() {
  const db = await readDb();
  const ai = db.settings?.ai ?? {};
  const apiKey = ai.apiKey || process.env.LUCKY_AI_KEY || '';
  const baseUrl = ai.baseUrl || process.env.LUCKY_AI_URL || '';
  const model = ai.model || process.env.LUCKY_AI_MODEL || '';
  const enabled = Boolean(baseUrl && apiKey && model);
  return { baseUrl, apiKey, model, enabled, keyFromEnv: !ai.apiKey && Boolean(process.env.LUCKY_AI_KEY) };
}

export function publicAiConfig(ai) {
  return {
    baseUrl: ai.baseUrl,
    model: ai.model,
    enabled: ai.enabled,
    hasKey: Boolean(ai.apiKey),
    keyFromEnv: ai.keyFromEnv,
  };
}
