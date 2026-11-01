// public/js/app.js — هسته‌ی برنامه: مسیریابی، وضعیت و قالب

import { api } from './api.js';
import * as ui from './ui.js';
import { dashboardView } from './views/dashboard.js';
import { scheduleView } from './views/schedule.js';
import { coursesView } from './views/courses.js';
import { chapterView } from './views/chapter.js';
import { examsView } from './views/exams.js';
import { reviewView } from './views/review.js';
import { settingsView } from './views/settings.js';
import { startReminders, examStart } from './reminders.js';
import { courseModal, sessionModal, examModal, uploadModal } from './forms.js';
import { initTheme } from './theme.js';
import { initPWA, promptInstall } from './pwa.js';

const ROUTES = {
  dashboard: { view: dashboardView, title: 'داشبورد', sub: 'خلاصه‌ی وضعیت مطالعه‌ی تو' },
  schedule: { view: scheduleView, title: 'برنامه هفتگی', sub: 'کلاس‌های آنلاین و حضوری این هفته' },
  courses: { view: coursesView, title: 'دروس و کتاب‌ها', sub: 'مدیریت درس‌ها و فایل PDF کتاب' },
  // فصل‌ها زیرمجموعهٔ کتاب‌ها شدند؛ مسیر قدیمی برای لینک‌های قبلی سرجایش است
  library: { view: coursesView, title: 'درس‌ها و کتاب‌ها', sub: 'فصل، خلاصه، تست و پاورپوینت هر کتاب' },
  chapter: { view: chapterView, title: 'فصل', sub: '' },
  exams: { view: examsView, title: 'آزمون‌ها و یادآورها', sub: 'تاریخ آزمون‌ها و زمان یادآوری' },
  review: { view: reviewView, title: 'مرور امروز', sub: 'فلش‌کارت‌های فاصله‌دار از سؤال‌های فصل‌ها' },
  settings: { view: settingsView, title: 'تنظیمات', sub: 'مشخصات و اتصال هوش مصنوعی' },
};

export const app = {
  data: null,

  async init() {
    initTheme();
    initPWA();
    try {
      this.data = await api.state();
    } catch (e) {
      document.getElementById('view').innerHTML = `
        <div class="card card-pad empty">
          <span class="emoji">⚠️</span>
          <h3>ارتباط با سرور برقرار نشد</h3>
          <p>${ui.esc(e.message)}</p>
          <button class="btn btn-primary" onclick="location.reload()">تلاش دوباره</button>
        </div>`;
      return;
    }
    this.paintSidebar();
    this.paintDrawerBooks();
    this.paintExamBadge();
    this.paintReviewBadge();
    render();
    startReminders(this);
  },

  async refresh() {
    this.data = await api.state();
    this.paintSidebar();
    this.paintDrawerBooks();
    this.paintExamBadge();
    this.paintReviewBadge();
  },

  /** فهرست کتاب‌ها زیر آیتم «درس‌ها و کتاب‌ها» در کشو */
  paintDrawerBooks() {
    const box = document.getElementById('drawer-books');
    if (!box) return;
    const books = this.data?.books ?? [];
    if (!books.length) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = books.map((b) => {
      const c = this.course(b.courseId);
      const active = location.hash.includes(`book=${b.id}`);
      return `<button class="drawer-book ${active ? 'active' : ''}" data-book="${b.id}">
        <span class="dot" style="background:${c?.color ?? 'var(--line-strong)'}"></span>
        <span class="t">${ui.esc(b.title)}</span>
      </button>`;
    }).join('');
  },

  /** نشانگر تعداد کارت‌های آماده‌ی مرور در منو */
  paintReviewBadge() {
    const el = document.getElementById('nav-review-count');
    if (!el) return;
    const due = this.data?.review?.due ?? 0;
    el.textContent = due ? String(due).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]) : '';
    el.className = due ? 'badge badge-brand badge-count' : 'badge-count';
  },

  /** نشانگر تعداد آزمون‌های پیش‌رو در منو */
  paintExamBadge() {
    const el = document.getElementById('nav-exam-count');
    if (!el) return;
    const now = Date.now();
    const soon = (this.data.exams ?? []).filter((e) => {
      const diff = examStart(e).getTime() - now;
      return diff > -6 * 3600 * 1000 && diff < 7 * 24 * 3600 * 1000;
    }).length;
    el.textContent = soon ? String(soon).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]) : '';
    el.className = soon ? 'badge badge-warn badge-count' : 'badge-count';
  },

  navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  },

  paintSidebar() {
    const d = this.data;
    const nameEl = document.getElementById('side-name');
    const subEl = document.getElementById('side-sub');
    const avatarEl = document.getElementById('side-avatar');
    if (avatarEl) {
      avatarEl.textContent = d.profile?.name ? d.profile.name.trim().charAt(0) : 'ل';
    }
    if (d.profile?.name) {
      nameEl.textContent = d.profile.name;
      subEl.textContent = [d.profile.university, d.profile.term].filter(Boolean).join(' • ') || 'دانشجو';
    } else {
      nameEl.textContent = 'خوش آمدید';
      subEl.textContent = 'نامت را در تنظیمات وارد کن';
    }
  },

  setHeader(title, sub, actionsHtml = '') {
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-sub').textContent = sub || '';
    document.getElementById('topbar-actions').innerHTML = actionsHtml;
  },

  course(id) { return this.data.courses.find((c) => c.id === id) ?? null; },
  book(id) { return this.data.books.find((b) => b.id === id) ?? null; },
  chapter(id) {
    for (const b of this.data.books) {
      const c = (b.chapters ?? []).find((x) => x.id === id);
      if (c) return { chapter: c, book: b, course: this.course(b.courseId) };
    }
    return null;
  },

  /** دکمه‌ی در حال انجام */
  async busy(button, fn, label = 'در حال انجام…') {
    const html = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner dark"></span> ${label}`;
    try {
      return await fn();
    } finally {
      button.disabled = false;
      button.innerHTML = html;
    }
  },
};

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [name, query] = raw.split('?');
  const params = new URLSearchParams(query ?? '');
  const parts = name.split('/');
  if (parts[0] === 'chapter' && parts[1]) return { name: 'chapter', id: parts[1], params };
  return { name: ROUTES[parts[0]] ? parts[0] : 'dashboard', params };
}

async function render() {
  const route = parseRoute();
  const cfg = ROUTES[route.name];
  const view = document.getElementById('view');

  document.querySelectorAll('.nav-item').forEach((n) => {
    const target = route.name === 'chapter' || route.name === 'library' ? 'courses' : route.name;
    n.classList.toggle('active', n.dataset.route === target);
  });
  document.body.classList.remove('drawer-open');
  document.getElementById('drawer-backdrop').hidden = true;
  document.getElementById('drawer').setAttribute('aria-hidden', 'true');

  app.setHeader(cfg.title, cfg.sub);
  window.scrollTo({ top: 0 });

  try {
    await cfg.view(view, route, app);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card card-pad empty">
      <span class="emoji">😕</span><h3>مشکلی پیش آمد</h3><p>${ui.esc(e.message)}</p>
      <button class="btn" onclick="location.reload()">بارگذاری دوباره</button></div>`;
  }
}

/* ---------- کشوی منو ---------- */
const drawer = document.getElementById('drawer');
const backdrop = document.getElementById('drawer-backdrop');
const menuBtn = document.getElementById('menu-btn');

function openDrawer(open) {
  const isOpen = open ?? !document.body.classList.contains('drawer-open');
  document.body.classList.toggle('drawer-open', isOpen);
  drawer.setAttribute('aria-hidden', String(!isOpen));
  menuBtn.setAttribute('aria-expanded', String(isOpen));
  backdrop.hidden = !isOpen;
}

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  openDrawer();
});
backdrop.addEventListener('click', () => openDrawer(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) openDrawer(false);
});

drawer.addEventListener('click', (e) => {
  const nav = e.target.closest('.nav-item');
  if (nav?.dataset.route) {
    app.navigate(`#/${nav.dataset.route}`);
    openDrawer(false);
    return;
  }
  const book = e.target.closest('.drawer-book');
  if (book?.dataset.book) {
    app.navigate(`#/courses?book=${book.dataset.book}`);
    openDrawer(false);
  }
});

/* اکانت بالای کشو = خانه */
document.getElementById('account-btn').addEventListener('click', () => {
  app.navigate('#/dashboard');
  openDrawer(false);
});

window.addEventListener('hashchange', () => {
  if (app.data) render();
});

app.init();
