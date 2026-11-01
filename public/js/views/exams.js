// public/js/views/exams.js — آزمون‌های نزدیک و یادآورها

import { api } from '../api.js';
import * as ui from '../ui.js';
import { examModal } from '../forms.js';
import { examStart, examDaysLeft, permissionState, ensurePermission } from '../reminders.js';

function daysLabel(days) {
  if (days < 0) return `${ui.faNum(-days)} روز پیش`;
  if (days === 0) return 'امروز';
  if (days === 1) return 'فردا';
  if (days < 7) return `${ui.faNum(days)} روز دیگر`;
  if (days < 31) return `${ui.faNum(Math.round(days / 7))} هفته دیگر`;
  return `${ui.faNum(Math.round(days / 30))} ماه دیگر`;
}

export async function examsView(root, route, app) {
  const d = app.data;
  const now = new Date();
  const all = (d.exams ?? [])
    .map((e) => ({ ...e, start: examStart(e), days: examDaysLeft(examStart(e), now) }))
    .sort((a, b) => a.start - b.start);
  const upcoming = all.filter((e) => e.start.getTime() + (Number(e.duration) || 90) * 60000 > now.getTime());
  const past = all.filter((e) => !upcoming.includes(e)).reverse();
  const reminders = d.reminders ?? {};
  const perm = permissionState();

  const next = upcoming[0];

  app.setHeader(
    'آزمون‌ها و یادآورها',
    upcoming.length ? `${ui.faNum(upcoming.length)} آزمون پیش‌رو` : 'تاریخ آزمون‌هایت را ثبت کن',
    `<button class="btn btn-sm" id="ex-rem">🔔 تنظیم یادآور</button>
     <button class="btn btn-sm btn-primary" id="ex-add">＋ افزودن آزمون</button>`,
  );

  const examRow = (e) => {
    const course = app.course(e.courseId);
    const isPast = !upcoming.includes(e);
    const lead = e.remindBefore ?? reminders.examLead ?? 1440;
    const leadText = Number(lead) >= 1440
      ? `${ui.faNum(Math.round(Number(lead) / 1440))} روز قبل`
      : `${ui.faNum(Number(lead))} دقیقه قبل`;
    return `<div class="exam-card ${isPast ? 'past' : ''}" style="--c:${course?.color ?? '#6366f1'}">
      <div class="exam-date">
        <div class="day">${ui.faNum(ui.faShortDate(e.start).split(' ')[0] ?? '')}</div>
        <div class="month">${ui.esc(ui.faShortDate(e.start).split(' ').slice(1).join(' '))}</div>
      </div>
      <div class="exam-body">
        <div class="exam-title">${ui.esc(e.title || `آزمون ${course?.title ?? ''}`)}</div>
        <div class="exam-meta">
          <span>📚 ${ui.esc(course?.title ?? 'درس حذف‌شده')}</span>
          <span>🕐 ${ui.faNum(e.time)}</span>
          <span>⏳ ${ui.faNum(e.duration ?? 90)} دقیقه</span>
          ${e.place ? `<span>📍 ${ui.esc(e.place)}</span>` : ''}
          ${isPast ? '' : `<span>🔔 ${leadText}</span>`}
        </div>
        ${e.note ? `<div class="exam-note">📝 ${ui.esc(e.note)}</div>` : ''}
      </div>
      <div class="exam-side">
        <div class="exam-days ${e.days <= 3 && !isPast ? 'urgent' : ''}">${isPast ? 'گذشته' : daysLabel(e.days)}</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-ghost ex-edit" data-id="${e.id}">✏️</button>
          <button class="btn btn-sm btn-ghost ex-del" data-id="${e.id}" data-title="${ui.esc(e.title)}">🗑</button>
        </div>
      </div>
    </div>`;
  };

  root.innerHTML = `
    ${next ? `
      <div class="card card-pad card-exam" style="margin-bottom:16px">
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
          <div style="font-size:30px">📝</div>
          <div style="flex:1;min-width:220px">
            <div class="exam-tone-1" style="font-size:12px;font-weight:500">آزمون بعدی</div>
            <div style="font-weight:800;font-size:18px">${ui.esc(next.title || 'آزمون')}</div>
            <div class="exam-tone-2" style="font-size:13px">
              ${ui.esc(ui.faFullDate(next.start))} • ساعت ${ui.faNum(next.time)}
              ${next.place ? ` • ${ui.esc(next.place)}` : ''}
            </div>
          </div>
          <div style="text-align:center">
            <div class="exam-tone-1" style="font-size:26px;font-weight:800">${daysLabel(next.days)}</div>
            <div class="exam-tone-2" style="font-size:11.5px">${next.days <= 7 ? 'زمان مرور است!' : 'برنامه‌ریزی کن'}</div>
          </div>
          <a class="btn" href="#/library">📑 رفتن به فصل‌ها</a>
        </div>
      </div>` : ''}

    <div class="card card-pad" style="margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <span class="badge ${reminders.enabled ? 'badge-ok' : 'badge-danger'}">${reminders.enabled ? '🔔 یادآور فعال' : '🔕 یادآور خاموش'}</span>
      <span class="badge">کلاس: ${ui.faNum(reminders.classLead ?? 15)} دقیقه قبل</span>
      <span class="badge">آزمون: ${Number(reminders.examLead ?? 1440) >= 1440 ? `${ui.faNum(Math.round(Number(reminders.examLead) / 1440))} روز قبل` : `${ui.faNum(reminders.examLead ?? 0)} دقیقه قبل`}</span>
      <span class="badge ${perm === 'granted' ? 'badge-ok' : 'badge-warn'}">
        ${perm === 'granted' ? 'اعلان مرورگر مجاز است' : perm === 'denied' ? 'اعلان مرورگر مسدود است' : 'اعلان مرورگر فعال نشده'}
      </span>
      <button class="btn btn-sm" id="ex-ask-perm" style="margin-inline-start:auto">🔔 فعال‌سازی اعلان‌ها</button>
    </div>

    <div class="section-head"><h2>آزمون‌های پیش‌رو</h2></div>
    ${upcoming.length
      ? `<div class="grid" style="gap:10px">${upcoming.map(examRow).join('')}</div>`
      : `<div class="card card-pad empty">
          <span class="emoji">📝</span>
          <h3>آزمونی ثبت نشده</h3>
          <p>تاریخ و ساعت آزمون‌ها را وارد کن تا Lucky چند روز قبل و چند ساعت قبل به تو یادآوری کند.</p>
          <button class="btn btn-primary" id="ex-empty-add">＋ افزودن اولین آزمون</button>
        </div>`}

    ${past.length ? `
      <div class="section-head" style="margin-top:22px"><h2>گذشته</h2><span class="badge">${ui.faNum(past.length)}</span></div>
      <div class="grid" style="gap:10px">${past.slice(0, 8).map(examRow).join('')}</div>` : ''}

    <p class="hint" style="margin-top:18px">
      یادآورها تا وقتی این صفحه یا تب مرورگر باز است کار می‌کنند (اعلان مرورگر + اعلان داخل برنامه + صدا).
      برای یادآوری روی گوشی، از «خروجی تقویم» در برنامه‌ی هفتگی استفاده کن؛ فایل <code>.ics</code> شامل هشدار کلاس‌ها و آزمون‌ها است.
    </p>`;

  document.getElementById('ex-add').onclick = () => examModal();
  document.getElementById('ex-rem').onclick = () => app.navigate('#/settings');
  root.querySelector('#ex-empty-add')?.addEventListener('click', () => examModal());
  root.querySelectorAll('.ex-edit').forEach((b) => {
    b.onclick = () => examModal(app.data.exams.find((e) => e.id === b.dataset.id));
  });
  root.querySelectorAll('.ex-del').forEach((b) => {
    b.onclick = async () => {
      const ok = await ui.confirmDialog({ message: `آزمون «${b.dataset.title || 'بدون عنوان'}» حذف شود؟` });
      if (!ok) return;
      try {
        await api.deleteExam(b.dataset.id);
        await app.refresh();
        examsView(root, route, app);
        ui.toast('آزمون حذف شد', 'ok');
      } catch (e) { ui.toast(e.message, 'err'); }
    };
  });

  document.getElementById('ex-ask-perm').onclick = async (e) => {
    const state = await ensurePermission();
    if (state === 'granted') ui.toast('اعلان مرورگر فعال شد', 'ok');
    else if (state === 'denied') ui.toast('مرورگر اجازه‌ی اعلان را رد کرده؛ از تنظیمات مرورگر اجازه بده', 'warn');
    else ui.toast('مرورگر از اعلان پشتیبانی نمی‌کند', 'warn');
    examsView(root, route, app);
  };
}
