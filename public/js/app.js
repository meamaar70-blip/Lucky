// public/js/app.js — هسته‌ی برنامه: مسیریابی، وضعیت و قالب

import { api } from './api.js';
import * as ui from './ui.js';
import { dashboardView } from './views/dashboard.js';
import { scheduleView } from './views/schedule.js';
import { coursesView } from './views/courses.js';
import { libraryView } from './views/library.js';
import { chapterView } from './views/chapter.js';
import { examsView } from './views/exams.js';
import { settingsView } from './views/settings.js';
import { startReminders, examStart } from './reminders.js';
import { initTheme } from './theme.js';

const ROUTES = {
  dashboard: { view: dashboardView, title: 'داشبورد', sub: 'خلاصه‌ی وضعیت مطالعه‌ی تو' },
  schedule: { view: scheduleView, title: 'برنامه هفتگی', sub: 'کلاس‌های آنلاین و حضوری این هفته' },
  courses: { view: coursesView, title: 'دروس و کتاب‌ها', sub: 'مدیریت درس‌ها و فایل PDF کتاب' },
  library: { view: libraryView, title: 'فصل‌ها و مطالعه', sub: 'خلاصه، تست و پاورپوینت هر فصل' },
  chapter: { view: chapterView, title: 'فصل', sub: '' },
  exams: { view: examsView, title: 'آزمون‌ها و یادآورها', sub: 'تاریخ آزمون‌ها و زمان یادآوری' },
  settings: { view: settingsView, title: 'تنظیمات', sub: 'مشخصات و اتصال هوش مصنوعی' },
};

export const app = {
  data: null,

  async init() {
    initTheme();
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
    this.paintExamBadge();
    render();
    startReminders(this);
  },

  async refresh() {
    this.data = await api.state();
    this.paintSidebar();
    this.paintExamBadge();
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
    const target = route.name === 'chapter' ? 'library' : route.name;
    n.classList.toggle('active', n.dataset.route === target);
  });
  document.body.classList.remove('nav-open');

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

document.getElementById('menu-btn').addEventListener('click', () => {
  document.body.classList.toggle('nav-open');
  if (document.body.classList.contains('nav-open')) {
    setTimeout(() => {
      document.addEventListener('click', function onDoc(e) {
        if (!e.target.closest('#sidebar') && !e.target.closest('#menu-btn')) {
          document.body.classList.remove('nav-open');
          document.removeEventListener('click', onDoc);
        }
      });
    }, 10);
  }
});

document.getElementById('nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (btn) app.navigate(`#/${btn.dataset.route}`);
});

window.addEventListener('hashchange', () => {
  if (app.data) render();
});

app.init();
