// public/js/views/schedule.js — برنامه هفتگی (نسخهٔ جمع‌وجور)
//
// به‌جای جدول بزرگ ساعتی، یک فهرست روزانه‌ی فشرده: هفت روز در یک نوار کوچک،
// و زیر آن فقط روزهای دارای کلاس با ردیف‌های کوتاه. کلیک روی هر ردیف = ویرایش.

import * as ui from '../ui.js';
import { sessionModal } from '../forms.js';

export async function scheduleView(root, route, app) {
  const d = app.data;
  const today = ui.weekToday();
  const sessions = d.sessions;

  app.setHeader(
    'برنامه هفتگی',
    sessions.length ? `${ui.faNum(sessions.length)} جلسه در هفته` : 'اولین کلاس را اضافه کن',
    `<a class="btn btn-sm" href="/api/calendar.ics">افزودن به تقویم</a>
     <button class="btn btn-sm btn-primary" id="add-session">+ کلاس</button>`,
  );

  const totalMinutes = sessions.reduce((sum, s) => sum + (ui.toMin(s.end) - ui.toMin(s.start)), 0);

  /* نوار هفت‌روزه */
  const strip = `
    <div class="week-strip">
      ${ui.DAYS.map((day, i) => {
        const count = sessions.filter((s) => s.weekday === i).length;
        return `<div class="week-day ${i === today ? 'today' : ''} ${count ? 'has' : ''}" data-day="${i}">
          <span class="d">${day}</span>
          <span class="n">${count ? ui.faNum(count) : '—'}</span>
        </div>`;
      }).join('')}
    </div>`;

  /* فهرست روزها — فقط روزهای دارای کلاس (به‌علاوهٔ امروز) */
  let freeDays = 0;
  const agenda = ui.DAYS.map((day, i) => {
    const items = sessions
      .filter((s) => s.weekday === i)
      .sort((a, b) => ui.toMin(a.start) - ui.toMin(b.start));

    if (!items.length) {
      freeDays += 1;
      if (i !== today) return '';
      return `<div class="agenda-day muted" data-day="${i}">
        <div class="agenda-day-head"><span class="d">${day}<span class="badge badge-brand">امروز</span></span><span class="meta">کلاسی نداری</span></div>
      </div>`;
    }

    return `<div class="agenda-day ${i === today ? 'today' : ''}" data-day="${i}">
      <div class="agenda-day-head">
        <span class="d">${day}${i === today ? '<span class="badge badge-brand">امروز</span>' : ''}</span>
        <span class="meta">${ui.faNum(items.length)} کلاس</span>
      </div>
      ${items.map((s) => {
        const c = app.course(s.courseId);
        const live = ui.classStatus(s) === 'live';
        return `<div class="agenda-row" data-id="${s.id}">
          <span class="time">${ui.faNum(s.start)}<small>${ui.faNum(s.end)}</small></span>
          <span class="tag" style="background:${c?.color ?? 'var(--line-strong)'}"></span>
          <span class="body">
            <span class="t">${ui.esc(c?.title ?? 'درس حذف‌شده')}</span>
            <span class="m">${[s.place, c?.teacher].filter(Boolean).map((x) => ui.esc(x)).join(' • ') || '—'}</span>
          </span>
          ${live ? '<span class="badge badge-ok">در حال برگزاری</span>' : ''}
          ${s.link ? `<a class="btn btn-sm" href="${ui.esc(s.link)}" target="_blank" rel="noopener">ورود</a>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  const emptyWeek = `<div class="empty" style="padding:26px 8px">
      <p>این هفته کلاسی ثبت نشده است.</p>
      <button class="btn btn-sm" id="add-session-3">افزودن اولین کلاس</button>
    </div>`;

  const summary = `
    <div class="card card-pad" style="display:flex;gap:18px;flex-wrap:wrap;align-items:center">
      <div class="mini-stat"><span class="v">${ui.faNum(sessions.length)}</span><span class="l">جلسه در هفته</span></div>
      <div class="mini-stat"><span class="v">${ui.faNum(Math.round((totalMinutes / 60) * 10) / 10)}</span><span class="l">ساعت کلاس</span></div>
      <div class="mini-stat"><span class="v">${ui.faNum(d.courses.length)}</span><span class="l">درس</span></div>
      <div style="flex:1"></div>
      <button class="btn btn-sm" id="add-session-2">افزودن کلاس</button>
    </div>`;

  root.innerHTML = `
    <div class="grid" style="gap:12px">
      ${strip}
      ${summary}
      <div class="card card-pad agenda">${agenda || emptyWeek}
        ${freeDays ? `<p class="hint agenda-free">${ui.faNum(freeDays)} روز بدون کلاس</p>` : ''}
      </div>
    </div>`;

  document.getElementById('add-session')?.addEventListener('click', () => sessionModal({}));
  root.querySelector('#add-session-2')?.addEventListener('click', () => sessionModal({}));
  root.querySelector('#add-session-3')?.addEventListener('click', () => sessionModal({}));

  root.querySelectorAll('.agenda-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const s = app.data.sessions.find((x) => x.id === row.dataset.id);
      if (s) sessionModal({ session: s });
    });
  });

  /* کلیک روی روز در نوار بالا = افزودن کلاس در همان روز */
  root.querySelectorAll('.week-day').forEach((el) => {
    el.addEventListener('click', () => sessionModal({ defaults: { weekday: Number(el.dataset.day) } }));
  });
}
