// public/js/views/dashboard.js — خانه‌ی ساده: کلاس بعدی، مرور امروز، امروز، آزمون بعدی

import * as ui from '../ui.js';
import { sessionModal, examModal } from '../forms.js';
import { nextExam, examStart, examDaysLeft, permissionState, ensurePermission } from '../reminders.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'صبح بخیر';
  if (h < 17) return 'وقت بخیر';
  return 'شب بخیر';
}

export async function dashboardView(root, route, app) {
  const d = app.data;
  const today = ui.weekToday();
  const sessions = d.sessions;
  const next = ui.nextClass(sessions);
  const nextSession = next ? sessions.find((s) => s.id === next.session.id) : null;
  const nextCourse = nextSession ? app.course(nextSession.courseId) : null;

  const todays = sessions
    .filter((s) => s.weekday === today)
    .sort((a, b) => ui.toMin(a.start) - ui.toMin(b.start));

  const review = d.review ?? { due: 0, total: 0 };
  const exam = nextExam(d.exams ?? []);
  const examCourse = exam ? app.course(exam.courseId) : null;

  app.setHeader(
    'خانه',
    `${ui.faDate()}${d.profile?.name ? ` • ${greeting()} ${d.profile.name}` : ''}`,
    '',
  );

  /* کلاس بعدی */
  const nextCard = nextSession && nextCourse
    ? `<div class="card next-class">
        <div class="k">${next.live ? 'در حال برگزاری' : 'کلاس بعدی'}</div>
        <div class="t">${ui.esc(nextCourse.title)}</div>
        <div class="m">
          <span>${ui.DAYS[nextSession.weekday]} ${ui.faNum(nextSession.start)}–${ui.faNum(nextSession.end)}</span>
          ${nextSession.place ? `<span>${ui.esc(nextSession.place)}</span>` : ''}
          ${nextCourse.teacher ? `<span>${ui.esc(nextCourse.teacher)}</span>` : ''}
        </div>
        <div class="count">${next.live ? 'همین حالا' : ui.humanCountdown(next.total)}</div>
        ${nextSession.link
          ? `<a class="join" href="${ui.esc(nextSession.link)}" target="_blank" rel="noopener">ورود به کلاس آنلاین</a>`
          : ''}
      </div>`
    : `<div class="card next-class is-empty">
        <div class="k">کلاس بعدی</div>
        <div class="t">کلاسی ثبت نشده</div>
        <div class="m"><span>با دکمه‌ی «+ افزودن» برنامه‌ی هفتگی‌ات را وارد کن.</span></div>
        <div style="margin-top:10px"><button class="btn btn-sm" id="hero-add">افزودن کلاس</button></div>
      </div>`;

  /* مرور امروز */
  const reviewCard = `
    <div class="card review-cta">
      <div class="review-cta-icon">${review.due > 0 ? ui.faNum(review.due) : '✓'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;font-weight:600">${review.due > 0 ? 'کارت آماده‌ی مرور' : 'مرور امروز'}</div>
        <div class="meta">${
          review.total === 0
            ? 'برای هر فصل تست بساز تا فلش‌کارت‌ها ساخته شوند'
            : review.due > 0
              ? `${ui.faNum(review.due)} کارت امروز نوبتش است`
              : 'همه‌ی کارت‌های امروز مرور شده'
        }</div>
      </div>
      <button class="btn btn-sm ${review.due > 0 ? 'btn-primary' : ''}" id="dash-review">
        ${review.due > 0 ? 'شروع' : review.total ? 'مرور' : 'ساختن تست'}
      </button>
    </div>`;

  /* آزمون بعدی */
  const examRow = exam
    ? `<div class="card card-pad" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div class="meta">آزمون بعدی</div>
          <div style="font-size:13.5px;font-weight:600">${ui.esc(exam.title)}</div>
          <div class="meta">${ui.esc(examCourse?.title ?? '')}${exam.place ? ` • ${ui.esc(exam.place)}` : ''}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:19px;font-weight:700">${ui.faNum(examDaysLeft(exam))}</div>
          <div class="meta">روز مانده</div>
        </div>
        <button class="btn btn-sm" id="dash-add-exam">آزمون دیگر</button>
      </div>`
    : `<div class="card card-pad" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="font-size:13.5px;font-weight:600">آزمونی ثبت نشده</div>
          <div class="meta">تاریخ آزمون‌ها را وارد کن تا یادآور بگیری.</div>
        </div>
        <button class="btn btn-sm" id="dash-add-exam">افزودن آزمون</button>
      </div>`;

  /* امروز */
  const todayCard = `
    <div class="card">
      <div class="card-pad" style="padding-bottom:6px">
        <div class="section-head" style="margin-bottom:2px">
          <h2>امروز <span class="badge">${ui.DAYS[today]}</span></h2>
          <button class="btn btn-sm btn-ghost" id="go-schedule">برنامه کامل</button>
        </div>
      </div>
      <div class="card-pad" style="padding-top:0">
        ${todays.length
          ? todays.map((s) => {
              const c = app.course(s.courseId);
              const status = ui.classStatus(s);
              return `<div style="display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line-2)">
                <div style="width:3px;height:30px;border-radius:2px;background:${c?.color ?? 'var(--line-strong)'}"></div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:500">${ui.esc(c?.title ?? 'درس حذف‌شده')}</div>
                  <div class="meta">${ui.faNum(s.start)}–${ui.faNum(s.end)}${s.place ? ` • ${ui.esc(s.place)}` : ''}</div>
                </div>
                ${status === 'live' ? '<span class="badge badge-ok">در حال برگزاری</span>' : ''}
                ${s.link ? `<a class="btn btn-sm" href="${ui.esc(s.link)}" target="_blank" rel="noopener">ورود</a>` : ''}
              </div>`;
            }).join('')
          : `<div class="empty" style="padding:22px 8px">
              <p>امروز کلاسی نداری.</p>
              <button class="btn btn-sm" id="empty-library">رفتن به فصل‌ها</button>
            </div>`}
      </div>
    </div>`;

  /* اعلان یادآور (اگر مرورگر اجازه نداده) */
  const perm = permissionState();
  const permRow = perm !== 'denied'
    ? ''
    : `<div class="card card-pad" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:0" class="meta">اعلان مرورگر خاموش است؛ یادآورها فقط داخل برنامه نشان داده می‌شوند.</div>
        <button class="btn btn-sm" id="dash-perm">فعال‌سازی اعلان</button>
      </div>`;

  root.innerHTML = `
    <div class="grid" style="gap:12px">
      <div class="grid cols-2">
        ${nextCard}
        ${reviewCard}
      </div>
      ${examRow}
      ${permRow}
      ${todayCard}
    </div>`;

  /* رویدادها */
  root.querySelector('#hero-add')?.addEventListener('click', () => sessionModal({}));
  root.querySelector('#dash-add-exam')?.addEventListener('click', () => examModal());
  root.querySelector('#go-schedule')?.addEventListener('click', () => app.navigate('#/schedule'));
  root.querySelector('#empty-library')?.addEventListener('click', () => app.navigate('#/library'));
  root.querySelector('#dash-review')?.addEventListener('click', () => {
    app.navigate((app.data?.review?.due ?? 0) > 0 ? '#/review' : '#/library');
  });
  root.querySelector('#dash-perm')?.addEventListener('click', async () => {
    const state = await ensurePermission();
    ui.toast(state === 'granted' ? 'اعلان فعال شد' : 'مرورگر اجازه نداد', state === 'granted' ? 'ok' : 'warn');
    dashboardView(root, route, app);
  });
}
