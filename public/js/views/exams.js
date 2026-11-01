// public/js/views/exams.js — آزمون‌ها و یادآورها (نمای فشرده)

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

function leadLabel(minutes) {
  const m = Number(minutes) || 0;
  return m >= 1440 ? `${ui.faNum(Math.round(m / 1440))} روز قبل` : `${ui.faNum(m)} دقیقه قبل`;
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
    'آزمون‌ها',
    upcoming.length ? `${ui.faNum(upcoming.length)} آزمون پیش‌رو` : 'تاریخ آزمون‌هایت را ثبت کن',
    `<button class="btn btn-sm" id="ex-rem">یادآورها</button>
     <button class="btn btn-sm btn-primary" id="ex-add">+ آزمون</button>`,
  );

  const row = (e) => {
    const course = app.course(e.courseId);
    const isPast = !upcoming.includes(e);
    const lead = e.remindBefore ?? reminders.examLead ?? 1440;
    return `<div class="exam-row ${isPast ? 'past' : ''}">
      <span class="date-chip">
        <span class="d">${ui.faNum(ui.faShortDate(e.start).split(' ')[0] ?? '')}</span>
        <span class="m">${ui.esc(ui.faShortDate(e.start).split(' ').slice(1).join(' '))}</span>
      </span>
      <span class="tag" style="background:${course?.color ?? 'var(--line-strong)'}"></span>
      <div class="body">
        <div class="t">${ui.esc(e.title || `آزمون ${course?.title ?? ''}`)}</div>
        <div class="meta">
          ${[course?.title, `ساعت ${ui.faNum(e.time)}`, e.place, `${ui.faNum(e.duration ?? 90)} دقیقه`]
            .filter(Boolean).map((x) => ui.esc(x)).join(' • ')}
        </div>
        ${e.note ? `<div class="meta">${ui.esc(e.note)}</div>` : ''}
      </div>
      <span class="count">${isPast ? 'گذشته' : daysLabel(e.days)}</span>
      ${isPast ? '' : `<span class="badge">${leadLabel(lead)}</span>`}
      <span class="actions">
        <button class="btn btn-sm btn-ghost ex-edit" data-id="${e.id}">ویرایش</button>
        <button class="btn btn-sm btn-ghost ex-del" data-id="${e.id}" data-title="${ui.esc(e.title)}">حذف</button>
      </span>
    </div>`;
  };

  const nextCard = next
    ? `<div class="card card-pad next-exam">
        <div style="flex:1;min-width:0">
          <div class="meta">آزمون بعدی</div>
          <div class="t">${ui.esc(next.title || 'آزمون')}</div>
          <div class="meta">${ui.esc(ui.faFullDate(next.start))} • ساعت ${ui.faNum(next.time)}${next.place ? ` • ${ui.esc(next.place)}` : ''}</div>
        </div>
        <div class="days" role="timer" aria-live="polite">
          <span class="v">${daysLabel(next.days)}</span>
          <span class="l">${next.days <= 7 ? 'زمان مرور' : 'برنامه‌ریزی کن'}</span>
        </div>
        <button class="btn btn-sm" id="ex-go-library">فصل‌ها</button>
      </div>`
    : '';

  const reminderRow = `
    <div class="card card-pad" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span class="badge ${reminders.enabled ? 'badge-ok' : 'badge-danger'}">${reminders.enabled ? 'یادآور فعال' : 'یادآور خاموش'}</span>
      <span class="badge">کلاس ${leadLabel(reminders.classLead ?? 15)}</span>
      <span class="badge">آزمون ${leadLabel(reminders.examLead ?? 1440)}</span>
      <span class="badge ${perm === 'granted' ? 'badge-ok' : 'badge-warn'}">${
        perm === 'granted' ? 'اعلان مرورگر مجاز' : perm === 'denied' ? 'اعلان مسدود' : 'اعلان فعال نشده'
      }</span>
      ${perm === 'granted' ? '' : '<button class="btn btn-sm" id="ex-ask-perm" style="margin-inline-start:auto">فعال‌سازی اعلان</button>'}
    </div>`;

  root.innerHTML = `
    <div class="grid" style="gap:12px">
      ${nextCard}
      ${reminderRow}
      <div class="card card-pad">
        <div class="section-head"><h2>پیش‌رو</h2><span class="meta">${ui.faNum(upcoming.length)} آزمون</span></div>
        ${upcoming.length
          ? `<div class="exam-rows">${upcoming.map(row).join('')}</div>`
          : `<div class="empty" style="padding:22px 8px">
              <h3>آزمونی ثبت نشده</h3>
              <p>تاریخ و ساعت آزمون را وارد کن تا از چند روز قبل یادآوری بگیری.</p>
              <button class="btn btn-primary" id="ex-empty-add">افزودن آزمون</button>
            </div>`}
      </div>
      ${past.length
        ? `<div class="card card-pad">
            <div class="section-head"><h2>گذشته</h2><span class="meta">${ui.faNum(past.length)}</span></div>
            <div class="exam-rows">${past.slice(0, 8).map(row).join('')}</div>
          </div>`
        : ''}
      <p class="hint">یادآورها تا وقتی صفحه باز است کار می‌کنند (اعلان مرورگر + بنر داخل برنامه + صدا).
        برای یادآوری روی گوشی، از «افزودن به تقویم» در برنامه‌ی هفتگی استفاده کن؛ فایل <code>.ics</code> هشدار کلاس‌ها و آزمون‌ها را دارد.</p>
    </div>`;

  document.getElementById('ex-add').onclick = () => examModal();
  document.getElementById('ex-rem').onclick = () => app.navigate('#/settings');
  root.querySelector('#ex-go-library')?.addEventListener('click', () => app.navigate('#/library'));
  root.querySelector('#ex-empty-add')?.addEventListener('click', () => examModal());
  root.querySelector('#ex-ask-perm')?.addEventListener('click', async () => {
    const state = await ensurePermission();
    ui.toast(state === 'granted' ? 'اعلان فعال شد' : 'مرورگر اجازه نداد', state === 'granted' ? 'ok' : 'warn');
    examsView(root, route, app);
  });

  root.querySelectorAll('.ex-edit').forEach((b) => {
    b.onclick = () => examModal(app.data.exams.find((e) => e.id === b.dataset.id));
  });
  root.querySelectorAll('.ex-del').forEach((b) => {
    b.onclick = async () => {
      const ok = await ui.confirmDialog({ message: `آزمون «${b.dataset.title}» حذف شود؟` });
      if (!ok) return;
      try {
        await api.deleteExam(b.dataset.id);
        await app.refresh();
        ui.toast('آزمون حذف شد', 'ok');
        examsView(root, route, app);
      } catch (e) { ui.toast(e.message, 'err'); }
    };
  });
}
