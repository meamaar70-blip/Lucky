// public/js/reminders.js — موتور یادآور کلاس و آزمون (در مرورگر، بدون سرور)

import * as ui from './ui.js';

const FIRED_KEY = 'lucky:fired-reminders';
const CHECK_MS = 20_000;

let timer = null;
let audioCtx = null;

/* ---------------- ذخیره‌ی یادآورهای انجام‌شده ---------------- */
function loadFired() {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function saveFired(map) {
  const cutoff = Date.now() - 3 * 24 * 3600 * 1000;
  const pruned = {};
  for (const [k, v] of Object.entries(map)) if (v > cutoff) pruned[k] = v;
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(pruned)); } catch { /* ignore */ }
}

/* ---------------- محاسبه‌ی رویدادهای آینده ---------------- */
export function examStart(exam) {
  const [y, m, d] = String(exam.date).split('-').map(Number);
  const [hh, mm] = String(exam.time ?? '00:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

function nextClassStart(session, now) {
  const [hh, mm] = String(session.start).split(':').map(Number);
  const d = new Date(now);
  d.setHours(hh || 0, mm || 0, 0, 0);
  const today = (now.getDay() + 1) % 7; // شنبه = ۰
  let diff = (session.weekday - today + 7) % 7;
  if (diff === 0 && d.getTime() <= now.getTime()) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function classEnd(start, session) {
  const [eh, em] = String(session.end).split(':').map(Number);
  const e = new Date(start);
  e.setHours(eh || 0, em || 0, 0, 0);
  return e;
}

/**
 * رویدادهایی که پیش رو داریم (کلاس بعدی هر جلسه + آزمون‌های آینده)
 * @returns {Array<{key,type,id,title,subtitle,startsAt,endsAt,link,place,course}>}
 */
export function upcomingEvents(data, now = new Date()) {
  const events = [];

  for (const s of data.sessions ?? []) {
    const course = (data.courses ?? []).find((c) => c.id === s.courseId);
    const start = nextClassStart(s, now);
    const end = classEnd(start, s);
    events.push({
      key: `class:${s.id}:${start.toISOString()}`,
      type: 'class',
      id: s.id,
      title: course?.title ?? 'کلاس',
      subtitle: [ui.DAYS[s.weekday], `${ui.faNum(s.start)} تا ${ui.faNum(s.end)}`].join(' • '),
      startsAt: start,
      endsAt: end,
      link: s.link,
      place: s.place,
      course,
    });
  }

  for (const e of data.exams ?? []) {
    const course = (data.courses ?? []).find((c) => c.id === e.courseId);
    const start = examStart(e);
    const end = new Date(start.getTime() + (Number(e.duration) || 90) * 60000);
    if (end.getTime() < now.getTime() - 6 * 3600 * 1000) continue; // گذشته
    events.push({
      key: `exam:${e.id}:${start.toISOString()}`,
      type: 'exam',
      id: e.id,
      title: e.title || `آزمون ${course?.title ?? ''}`.trim(),
      subtitle: [course?.title, ui.faNum(e.time), e.place].filter(Boolean).join(' • '),
      startsAt: start,
      endsAt: end,
      link: '',
      place: e.place,
      course,
      exam: e,
    });
  }

  return events.sort((a, b) => a.startsAt - b.startsAt);
}

/** نزدیک‌ترین آزمون آینده */
export function nextExam(data, now = new Date()) {
  const exams = (data.exams ?? [])
    .map((e) => ({ exam: e, start: examStart(e) }))
    .filter((x) => x.start.getTime() + (Number(x.exam.duration) || 90) * 60000 > now.getTime())
    .sort((a, b) => a.start - b.start);
  return exams[0] ?? null;
}

export function examDaysLeft(examStartDate, now = new Date()) {
  const a = new Date(examStartDate); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / 86400000);
}

/* ---------------- اعلان و صدا ---------------- */
export function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    [880, 1240].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const at = t + i * 0.26;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.16, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(at);
      osc.stop(at + 0.22);
    });
  } catch { /* بی‌صدا */ }
}

export async function ensurePermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

export function permissionState() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

function showSystemNotification(ev, lead) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const when = lead >= 60 ? `${ui.faNum(Math.round(lead / 60))} ساعت دیگر` : `${ui.faNum(lead)} دقیقه دیگر`;
    const body = ev.type === 'exam'
      ? `${ev.subtitle} — ${when}`
      : `${ev.subtitle}${ev.place ? ` • ${ev.place}` : ''} — ${when}`;
    const n = new Notification(ev.type === 'exam' ? `📝 ${ev.title}` : `🎓 ${ev.title}`, {
      body,
      tag: ev.key,
      dir: 'rtl',
      lang: 'fa',
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      location.hash = ev.type === 'exam' ? '#/exams' : '#/schedule';
      n.close();
    };
  } catch { /* بی‌اهمیت */ }
}

/* ---------------- حلقه‌ی بررسی ---------------- */
function fire(app, ev, lead) {
  const settings = app.data.reminders ?? {};
  const fireKey = `${ev.key}:${lead}`;
  const fired = loadFired();
  if (fired[fireKey]) return;
  fired[fireKey] = Date.now();
  saveFired(fired);

  if (settings.sound) beep();
  if (settings.browser !== false) showSystemNotification(ev, lead);
  ui.pushReminder({
    key: fireKey,
    tone: ev.type,
    title: ev.title,
    body: ev.type === 'exam'
      ? `${ev.subtitle} — ${lead >= 60 ? `${ui.faNum(Math.round(lead / 60))} ساعت` : `${ui.faNum(lead)} دقیقه`} دیگر`
      : `${ev.subtitle}${ev.place ? ` • ${ev.place}` : ''} — ${ui.faNum(lead)} دقیقه دیگر`,
    actions: ev.link
      ? [{ label: 'ورود به کلاس', href: ev.link, primary: true }]
      : [{ label: ev.type === 'exam' ? 'جزئیات آزمون' : 'برنامه هفتگی', href: ev.type === 'exam' ? '#/exams' : '#/schedule' }],
  });
}

export function checkNow(app) {
  const data = app?.data;
  if (!data) return 0;
  const settings = data.reminders ?? {};
  if (!settings.enabled) return 0;

  const now = Date.now();
  let count = 0;
  for (const ev of upcomingEvents(data, new Date(now))) {
    const isLive = ev.startsAt.getTime() <= now && ev.endsAt.getTime() > now;
    if (isLive) continue;
    const baseLead = ev.type === 'exam'
      ? (ev.exam?.remindBefore ?? settings.examLead ?? 1440)
      : (settings.classLead ?? 15);
    const lead = Number(baseLead);
    if (!(lead > 0)) continue;
    const delta = ev.startsAt.getTime() - now;
    if (delta <= lead * 60000 && delta > -60000) {
      fire(app, ev, lead);
      count += 1;
    }
  }
  return count;
}

let currentApp = null;

export function startReminders(app) {
  stopReminders();
  currentApp = app;
  setTimeout(() => checkNow(currentApp), 1200);
  timer = setInterval(() => checkNow(currentApp), CHECK_MS);
  document.addEventListener('visibilitychange', onVisible);
}

function onVisible() {
  if (document.visibilityState === 'visible' && currentApp) checkNow(currentApp);
}

export function stopReminders() {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisible);
}

/** پیش‌نمایش یادآور در تنظیمات */
export function sendTestReminder(settings = {}) {
  if (settings.sound !== false) beep();
  const fake = { type: 'exam', title: 'آزمون آزمایشی', subtitle: 'این یک یادآور نمونه است', link: '' };
  showSystemNotification({ ...fake, key: `test:${Date.now()}`, subtitle: 'یادآور Lucky درست کار می‌کند' }, 15);
  ui.pushReminder({
    key: `test:${Date.now()}`,
    tone: 'exam',
    title: 'آزمون آزمایشی',
    body: 'این یک یادآور نمونه است؛ در زمان واقعی، نام درس، ساعت و لینک کلاس نمایش داده می‌شود.',
    actions: [{ label: 'باشه', href: '' }],
  });
}
