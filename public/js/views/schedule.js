// public/js/views/schedule.js — برنامه هفتگی

import * as ui from '../ui.js';
import { sessionModal } from '../forms.js';

const ROW_H = 54;

export async function scheduleView(root, route, app) {
  const d = app.data;

  app.setHeader(
    'برنامه هفتگی',
    d.sessions.length ? `${ui.faNum(d.sessions.length)} جلسه در هفته` : 'اولین کلاس را اضافه کن',
    `<a class="btn btn-sm" href="/api/calendar.ics">📥 افزودن به تقویم</a>
     <button class="btn btn-sm btn-primary" id="add-session">＋ افزودن کلاس</button>`,
  );

  const sessions = d.sessions;
  const starts = sessions.map((s) => ui.toMin(s.start));
  const ends = sessions.map((s) => ui.toMin(s.end));
  const from = Math.min(7, ...(starts.length ? starts.map((m) => Math.floor(m / 60)) : [7]));
  const to = Math.max(21, ...(ends.length ? ends.map((m) => Math.ceil(m / 60)) : [21]));
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const today = ui.weekToday();

  const slotsFor = (day) => sessions
    .filter((s) => s.weekday === day)
    .map((s) => {
      const course = app.course(s.courseId);
      const top = ((ui.toMin(s.start) - from * 60) / 60) * ROW_H;
      const height = Math.max(30, ((ui.toMin(s.end) - ui.toMin(s.start)) / 60) * ROW_H - 4);
      const color = course?.color ?? '#6366f1';
      const live = ui.classStatus(s) === 'live';
      return `<div class="tt-slot" data-id="${s.id}" style="top:${top}px;height:${height}px;background:linear-gradient(135deg,${color},${color}dd)">
        <div class="t">${ui.esc(course?.title ?? 'درس')}</div>
        <div class="m">${ui.faNum(s.start)}–${ui.faNum(s.end)}${s.place ? ` • ${ui.esc(s.place)}` : ''}${live ? ' • 🔴' : ''}</div>
        ${s.link && height > 62 ? `<div class="m"><a href="${ui.esc(s.link)}" target="_blank" rel="noopener">ورود به کلاس</a></div>` : ''}
      </div>`;
    }).join('');

  root.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden">
      <div class="timetable" style="border:none">
        <div class="tt-head">
          <div></div>
          ${ui.DAYS.map((day, i) => `<div class="${i === today ? 'today' : ''}">${day}</div>`).join('')}
        </div>
        <div class="tt-body" style="height:${hours.length * ROW_H}px">
          <div class="tt-col tt-hours">
            ${hours.map((hr) => `<div class="tt-hour">${ui.faNum(String(hr).padStart(2, '0'))}</div>`).join('')}
          </div>
          ${ui.DAYS.map((_, day) => `
            <div class="tt-col" data-day="${day}" style="height:${hours.length * ROW_H}px">
              ${slotsFor(day)}
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <div class="card card-pad">
        <div class="section-head"><h2>خلاصه‌ی دروس</h2></div>
        ${d.courses.length
          ? d.courses.map((c) => {
              const cs = sessions.filter((s) => s.courseId === c.id);
              const mins = cs.reduce((a, s) => a + (ui.toMin(s.end) - ui.toMin(s.start)), 0);
              return `<div style="display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line-2)">
                <span style="width:10px;height:10px;border-radius:50%;background:${c.color};flex:0 0 auto"></span>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:500">${ui.esc(c.title)}</div>
                  <div style="font-size:12px;color:var(--muted)">${cs.length ? cs.map((s) => `${ui.DAYS[s.weekday]} ${ui.faNum(s.start)}`).join(' • ') : 'بدون جلسه'}</div>
                </div>
                <span class="badge">${mins ? `${ui.faNum(Math.round((mins / 60) * 10) / 10)} ساعت` : '—'}</span>
              </div>`;
            }).join('')
          : '<p class="hint">هنوز درسی نساخته‌ای.</p>'}
      </div>
      <div class="card card-pad">
        <div class="section-head"><h2>راهنما</h2></div>
        <ul style="margin:0;padding-inline-start:18px;color:var(--ink-2);font-size:13.5px;line-height:2.1">
          <li>روی هر جای خالی جدول کلیک کن تا کلاس همان ساعت اضافه شود.</li>
          <li>روی هر کلاس کلیک کن تا ساعت، استاد یا <strong>لینک کلاس آنلاین</strong> را ویرایش کنی.</li>
          <li>با دکمه‌ی «افزودن به تقویم» یک فایل ICS بگیر و در Google Calendar یا گوشی وارد کن.</li>
          <li>لینک کلاس آنلاین در داشبورد به‌صورت دکمه‌ی «ورود» نشان داده می‌شود.</li>
        </ul>
      </div>
    </div>`;

  document.getElementById('add-session')?.addEventListener('click', () => sessionModal({}));

  root.querySelectorAll('.tt-slot').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const s = app.data.sessions.find((x) => x.id === el.dataset.id);
      if (s) sessionModal({ session: s });
    });
  });

  root.querySelectorAll('.tt-col[data-day]').forEach((col) => {
    col.addEventListener('click', (e) => {
      if (e.target.closest('.tt-slot')) return;
      const rect = col.getBoundingClientRect();
      const offset = e.clientY - rect.top;
      const hour = Math.floor(offset / ROW_H) + from;
      const day = Number(col.dataset.day);
      sessionModal({
        defaults: {
          weekday: day,
          start: `${String(Math.min(23, hour)).padStart(2, '0')}:00`,
          end: `${String(Math.min(23, hour + 1)).padStart(2, '0')}:30`,
        },
      });
    });
  });
}
