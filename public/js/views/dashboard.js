// public/js/views/dashboard.js

import * as ui from '../ui.js';
import { courseModal, uploadModal, sessionModal, examModal } from '../forms.js';
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

  const allChapters = d.books.flatMap((b) => b.chapters ?? []);
  const readyChapters = allChapters.filter((c) => c.hasSummary || c.hasQuiz).length;
  const weeklyMinutes = sessions.reduce((sum, s) => sum + (ui.toMin(s.end) - ui.toMin(s.start)), 0);
  const attempts = [...d.attempts].reverse().slice(0, 5);

  app.setHeader(
    'داشبورد',
    `${ui.faDate()}${d.profile?.name ? ` • ${greeting()} ${d.profile.name}` : ''}`,
    `<button class="btn btn-sm" id="dash-upload">📄 افزودن کتاب</button>
     <button class="btn btn-sm btn-primary" id="dash-course">＋ درس جدید</button>`,
  );

  const hero = nextSession && nextCourse
    ? `<div class="next-class">
        <div class="k">${next.live ? 'همین حالا در حال برگزاری' : 'کلاس بعدی'}</div>
        <div class="t">${ui.esc(nextCourse.title)}</div>
        <div class="m">
          <span>🕐 ${ui.faNum(nextSession.start)} تا ${ui.faNum(nextSession.end)}</span>
          <span>📅 ${ui.DAYS[nextSession.weekday]}</span>
          ${nextSession.place ? `<span>📍 ${ui.esc(nextSession.place)}</span>` : ''}
          ${nextCourse.teacher ? `<span>👤 ${ui.esc(nextCourse.teacher)}</span>` : ''}
        </div>
        <div class="count">${next.live ? 'کلاس شروع شده' : ui.humanCountdown(next.total)}</div>
        ${nextSession.link ? `<a class="join" href="${ui.esc(nextSession.link)}" target="_blank" rel="noopener">🎥 ورود به کلاس آنلاین</a>` : ''}
      </div>`
    : `<div class="next-class is-empty">
        <div class="k">برنامه‌ی هفتگی</div>
        <div class="t">هنوز کلاسی ثبت نشده</div>
        <div class="m"><span>برنامه‌ات را وارد کن تا کلاس بعدی و لینک‌های ورود این‌جا نمایش داده شود.</span></div>
        <div style="margin-top:14px"><button class="btn btn-sm" id="hero-add">＋ افزودن کلاس</button></div>
      </div>`;

  const stats = `
    <div class="grid cols-4">
      <div class="card stat">
        <div class="icon">📚</div>
        <div><div class="value">${ui.faNum(d.courses.length)}</div><div class="label">درس فعال</div></div>
      </div>
      <div class="card stat">
        <div class="icon icon-ok">🗓️</div>
        <div><div class="value">${ui.faNum(sessions.length)}</div><div class="label">جلسه در هفته • ${ui.faNum(Math.round(weeklyMinutes / 60))} ساعت</div></div>
      </div>
      <div class="card stat">
        <div class="icon icon-warn">📄</div>
        <div><div class="value">${ui.faNum(d.books.length)}</div><div class="label">کتاب PDF</div></div>
      </div>
      <div class="card stat">
        <div class="icon icon-pink">✨</div>
        <div><div class="value">${ui.faNum(readyChapters)}</div><div class="label">فصل آماده‌ی مطالعه از ${ui.faNum(allChapters.length)}</div></div>
      </div>
    </div>`;

  const todayCard = `
    <div class="card">
      <div class="card-pad" style="padding-bottom:6px">
        <div class="section-head" style="margin-bottom:6px">
          <h2>کلاس‌های امروز <span class="badge">${ui.DAYS[today]}</span></h2>
          <button class="btn btn-sm btn-ghost" id="go-schedule">برنامه کامل →</button>
        </div>
      </div>
      <div class="card-pad" style="padding-top:0">
        ${todays.length
          ? todays.map((s) => {
              const c = app.course(s.courseId);
              const status = ui.classStatus(s);
              return `<div style="display:flex;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line-2)">
                <div style="width:5px;height:38px;border-radius:4px;background:${c?.color ?? '#6366f1'}"></div>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600">${ui.esc(c?.title ?? 'درس حذف‌شده')}</div>
                  <div style="font-size:12.5px;color:var(--muted)">
                    ${ui.faNum(s.start)}–${ui.faNum(s.end)} ${s.place ? `• ${ui.esc(s.place)}` : ''}
                  </div>
                </div>
                ${status === 'live' ? '<span class="badge badge-ok">در حال برگزاری</span>' : ''}
                ${s.link ? `<a class="btn btn-sm" href="${ui.esc(s.link)}" target="_blank" rel="noopener">ورود</a>` : ''}
              </div>`;
            }).join('')
          : `<div class="empty" style="padding:26px 10px">
              <span class="emoji">☕</span>
              <p>امروز کلاسی نداری. فرصت خوبی برای مرور یک فصل است.</p>
              <button class="btn btn-sm" id="empty-library">رفتن به فصل‌ها</button>
            </div>`}
      </div>
    </div>`;

  const activityCard = `
    <div class="card card-pad">
      <div class="section-head"><h2>آخرین فعالیت‌ها</h2></div>
      ${attempts.length
        ? attempts.map((a) => `
          <div style="display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line-2)">
            <span class="badge ${a.percent >= 70 ? 'badge-ok' : a.percent >= 40 ? 'badge-warn' : 'badge-danger'}">${ui.faNum(a.percent)}٪</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ui.esc(a.chapterTitle ?? 'تست فصل')}</div>
              <div style="font-size:11.5px;color:var(--muted)">${ui.faNum(a.score)} از ${ui.faNum(a.total)} • ${ui.timeAgo(a.at)}</div>
            </div>
            <a class="btn btn-sm btn-ghost" href="#/chapter/${a.chapterId}">مرور</a>
          </div>`).join('')
        : `<div class="empty" style="padding:26px 10px">
            <span class="emoji">📊</span>
            <p>هنوز تستی نداده‌ای. بعد از هر فصل یک تست بساز تا پیشرفتت ثبت شود.</p>
          </div>`}
    </div>`;

  const nx = nextExam(d);
  const perm = permissionState();
  const upcomingExams = (d.exams ?? [])
    .map((e) => ({ e, start: examStart(e) }))
    .filter((x) => x.start.getTime() > Date.now() - 6 * 3600 * 1000)
    .sort((a, b) => a.start - b.start)
    .slice(0, 3);

  const examCard = nx ? `
    <div class="card card-pad card-exam">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <div style="font-size:30px">📝</div>
        <div style="flex:1;min-width:220px">
          <div class="exam-tone-1" style="font-size:12px;font-weight:600">آزمون بعدی</div>
          <div style="font-weight:800;font-size:17px">${ui.esc(nx.exam.title || 'آزمون')} <span class="exam-tone-2" style="font-size:12.5px;font-weight:500">• ${ui.esc(d.courses.find((c) => c.id === nx.exam.courseId)?.title ?? '')}</span></div>
          <div class="exam-tone-2" style="font-size:12.5px">
            ${ui.esc(ui.faFullDate(nx.start))} • ساعت ${ui.faNum(nx.exam.time)}${nx.exam.place ? ` • ${ui.esc(nx.exam.place)}` : ''}
          </div>
        </div>
        <div style="text-align:center">
          <div class="exam-tone-1" style="font-size:24px;font-weight:800">${(() => {
            const days = examDaysLeft(nx.start);
            return days <= 0 ? 'امروز' : days === 1 ? 'فردا' : `${ui.faNum(days)} روز`;
          })()}</div>
          <div class="exam-tone-2" style="font-size:11px">${nx.start - Date.now() <= 7 * 86400000 ? 'زمان مرور' : 'مانده'}</div>
        </div>
        ${upcomingExams.length > 1 ? `<div class="exam-tone-1" style="font-size:12px;min-width:150px">
          ${upcomingExams.slice(1).map((x) => `<div>• ${ui.esc(ui.faShortDate(x.start))}: ${ui.esc(x.e.title || 'آزمون')}</div>`).join('')}
        </div>` : ''}
        <a class="btn" href="#/exams">مدیریت آزمون‌ها →</a>
      </div>
      ${perm !== 'granted' ? `<div class="exam-tone-1" style="margin-top:10px;font-size:12px">
        🔔 برای دریافت اعلان یادآور، اعلان مرورگر را فعال کن. <button class="btn btn-sm" id="dash-perm" style="margin-inline-start:6px">فعال‌سازی</button>
      </div>` : ''}
    </div>` : `
    <div class="card card-pad" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      <div style="font-size:24px">📝</div>
      <div style="flex:1;min-width:200px">
        <div style="font-weight:600">آزمونی ثبت نشده</div>
        <div style="font-size:12.5px;color:var(--muted)">تاریخ آزمون‌ها را وارد کن تا چند روز قبل یادآوری دریافت کنی.</div>
      </div>
      <button class="btn btn-sm" id="dash-add-exam">＋ افزودن آزمون</button>
    </div>`;

  const onboarding = d.courses.length ? '' : `
    <div class="card card-pad card-soft-brand">
      <h2 style="margin-bottom:8px">👋 خوش آمدی! سه قدم تا شروع</h2>
      <div class="grid cols-3" style="margin-top:14px;gap:12px">
        <div class="card card-pad"><strong>۱. درس‌هایت را بساز</strong><p style="font-size:12.5px;color:var(--muted);margin-top:4px">نام درس و استاد را وارد کن.</p></div>
        <div class="card card-pad"><strong>۲. برنامه کلاسی را ثبت کن</strong><p style="font-size:12.5px;color:var(--muted);margin-top:4px">روز و ساعت و لینک کلاس آنلاین.</p></div>
        <div class="card card-pad"><strong>۳. PDF کتاب را بده</strong><p style="font-size:12.5px;color:var(--muted);margin-top:4px">فصل‌ها خودکار تفکیک می‌شوند.</p></div>
      </div>
      <button class="btn btn-primary" style="margin-top:16px" id="onb-start">شروع کن</button>
    </div>`;

  const review = d.review ?? { due: 0, total: 0, learned: 0, todayReviews: 0 };
  const reviewCard = `
    <div class="card card-pad review-cta">
      <div class="review-cta-icon">🔁</div>
      <div style="flex:1;min-width:0">
        <h2 style="font-size:16px;margin-bottom:4px">${review.due > 0 ? 'مرور امروز آماده است' : 'مرور امروز'}</h2>
        <p style="font-size:13px;color:var(--muted)">
          ${review.total === 0
            ? 'با ساختن تست برای هر فصل، سؤال‌هایش خودکار به فلش‌کارت تبدیل می‌شود.'
            : review.due > 0
              ? `${ui.faNum(review.due)} کارت امروز نوبتش است${review.todayReviews ? ` • امروز ${ui.faNum(review.todayReviews)} مرور کرده‌ای` : ''}`
              : 'همه‌ی کارت‌های امروز مرور شده‌اند. 👏'}
        </p>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${review.due > 0 ? `<span class="badge badge-brand">${ui.faNum(review.due)}</span>` : ''}
        <button class="btn ${review.due > 0 ? 'btn-primary' : ''} btn-sm" id="dash-review">
          ${review.due > 0 ? 'شروع مرور' : review.total ? 'مرور' : 'ساختن تست'}
        </button>
      </div>
    </div>`;

  root.innerHTML = `
    <div class="grid" style="gap:18px">
      ${onboarding}
      <div class="grid cols-2" style="grid-template-columns:1.6fr 1fr;align-items:stretch">
        ${hero}
        <div class="card card-pad">
          <div class="section-head"><h2>دسترسی سریع</h2></div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-block" id="qa-course">📚 افزودن درس</button>
            <button class="btn btn-block" id="qa-session">🗓️ افزودن کلاس</button>
            <button class="btn btn-block" id="qa-upload">📄 بارگذاری PDF کتاب</button>
            <button class="btn btn-block" id="qa-exam">📝 افزودن آزمون</button>
            <a class="btn btn-block" href="/api/calendar.ics">📥 خروجی تقویم (ICS)</a>
          </div>
          <p class="hint" style="margin-top:12px">${
            d.ai.enabled ? 'هوش مصنوعی متصل است؛ خلاصه‌ها با کیفیت بالاتر ساخته می‌شوند.' : 'با موتور محلی (آفلاین) کار می‌کند. برای خلاصه‌های پیشرفته‌تر، در تنظیمات هوش مصنوعی را وصل کن.'
          }</p>
        </div>
      </div>
      ${stats}
      ${reviewCard}
      ${examCard}
      <div class="grid cols-2">
        ${todayCard}
        ${activityCard}
      </div>
    </div>`;

  /* رویدادها */
  document.getElementById('dash-course')?.addEventListener('click', () => courseModal());
  document.getElementById('dash-upload')?.addEventListener('click', () => uploadModal());
  root.querySelector('#hero-add')?.addEventListener('click', () => sessionModal({}));
  root.querySelector('#qa-course')?.addEventListener('click', () => courseModal());
  root.querySelector('#qa-session')?.addEventListener('click', () => sessionModal({}));
  root.querySelector('#qa-upload')?.addEventListener('click', () => uploadModal());
  root.querySelector('#qa-exam')?.addEventListener('click', () => examModal());
  root.querySelector('#dash-add-exam')?.addEventListener('click', () => examModal());
  root.querySelector('#dash-review')?.addEventListener('click', () => {
    const due = (app.data?.review?.due ?? 0) > 0;
    app.navigate(due ? '#/review' : '#/library');
  });
  root.querySelector('#dash-perm')?.addEventListener('click', async (e) => {
    const state = await ensurePermission();
    ui.toast(state === 'granted' ? 'اعلان یادآور فعال شد' : 'مرورگر اجازه نداد', state === 'granted' ? 'ok' : 'warn');
    dashboardView(root, route, app);
  });
  root.querySelector('#go-schedule')?.addEventListener('click', () => app.navigate('#/schedule'));
  root.querySelector('#empty-library')?.addEventListener('click', () => app.navigate('#/library'));
  root.querySelector('#onb-start')?.addEventListener('click', () => courseModal());
}
