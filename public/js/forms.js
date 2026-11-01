// public/js/forms.js — فرم‌های مشترک (درس، جلسه، آپلود کتاب، ویرایش فصل‌ها)

import { api } from './api.js';
import * as ui from './ui.js';
import { app } from './app.js';

const COLORS = ['#6366f1', '#0d9488', '#f59e0b', '#ec4899', '#8b5cf6', '#0ea5e9', '#ef4444', '#22c55e'];

/* ---------------- درس ---------------- */
export function courseModal(course = null) {
  const isEdit = Boolean(course);
  const body = `
    <div class="field">
      <label>نام درس *</label>
      <input class="input" id="c-title" maxlength="120" placeholder="مثلاً: روان‌شناسی یادگیری" value="${ui.esc(course?.title ?? '')}" />
    </div>
    <div class="row">
      <div class="field">
        <label>استاد</label>
        <input class="input" id="c-teacher" maxlength="80" placeholder="نام استاد" value="${ui.esc(course?.teacher ?? '')}" />
      </div>
      <div class="field">
        <label>کد درس</label>
        <input class="input" id="c-code" maxlength="40" placeholder="اختیاری" value="${ui.esc(course?.code ?? '')}" />
      </div>
    </div>
    <div class="field">
      <label>رنگ درس</label>
      <div class="swatches" id="c-colors" style="display:flex;gap:8px;flex-wrap:wrap">
        ${COLORS.map((c) => `
          <button type="button" class="swatch" data-color="${c}"
            style="width:30px;height:30px;border-radius:9px;border:2px solid ${(course?.color ?? COLORS[0]) === c ? '#111827' : 'transparent'};background:${c};cursor:pointer"></button>
        `).join('')}
      </div>
    </div>
    <div class="field">
      <label>یادداشت</label>
      <textarea class="textarea" id="c-note" maxlength="300" placeholder="مثلاً: منابع آزمون، تمرین‌های مهم">${ui.esc(course?.note ?? '')}</textarea>
    </div>`;

  let selectedColor = course?.color ?? COLORS[0];

  ui.openModal({
    title: isEdit ? 'ویرایش درس' : 'افزودن درس جدید',
    body,
    footer: `
      <button class="btn btn-primary" id="c-save">${isEdit ? 'ذخیره تغییرات' : 'افزودن درس'}</button>
      <button class="btn btn-ghost" data-modal-close>لغو</button>`,
    onMount(modal, close) {
      modal.querySelectorAll('.swatch').forEach((b) => {
        b.onclick = () => {
          selectedColor = b.dataset.color;
          modal.querySelectorAll('.swatch').forEach((x) => { x.style.border = '2px solid transparent'; });
          b.style.border = '2px solid #111827';
        };
      });
      const save = modal.querySelector('#c-save');
      const submit = async () => {
        const payload = {
          title: modal.querySelector('#c-title').value.trim(),
          teacher: modal.querySelector('#c-teacher').value.trim(),
          code: modal.querySelector('#c-code').value.trim(),
          note: modal.querySelector('#c-note').value.trim(),
          color: selectedColor,
        };
        if (!payload.title) return ui.toast('نام درس را بنویس', 'err');
        save.disabled = true;
        save.innerHTML = '<span class="spinner"></span>';
        try {
          if (isEdit) await api.updateCourse(course.id, payload);
          else await api.createCourse(payload);
          close();
          await app.refresh();
          ui.toast(isEdit ? 'درس ویرایش شد' : 'درس اضافه شد', 'ok');
        } catch (e) {
          ui.toast(e.message, 'err');
          save.disabled = false;
          save.textContent = isEdit ? 'ذخیره تغییرات' : 'افزودن درس';
        }
      };
      save.onclick = submit;
      modal.querySelector('#c-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    },
  });
}

/* ---------------- جلسه‌ی کلاس ---------------- */
export function sessionModal({ session = null, defaults = {} } = {}) {
  const courses = app.data.courses;
  if (!courses.length) {
    ui.toast('اول یک درس بساز', 'warn');
    courseModal();
    return;
  }
  const value = {
    courseId: session?.courseId ?? defaults.courseId ?? courses[0].id,
    weekday: session?.weekday ?? defaults.weekday ?? ui.weekToday(),
    start: session?.start ?? defaults.start ?? '08:00',
    end: session?.end ?? defaults.end ?? '09:30',
    place: session?.place ?? '',
    link: session?.link ?? '',
  };

  const body = `
    <div class="field">
      <label>درس *</label>
      <select class="select" id="s-course">
        ${courses.map((c) => `<option value="${c.id}" ${value.courseId === c.id ? 'selected' : ''}>${ui.esc(c.title)}</option>`).join('')}
      </select>
    </div>
    <div class="row">
      <div class="field">
        <label>روز هفته *</label>
        <select class="select" id="s-day">
          ${ui.DAYS.map((d, i) => `<option value="${i}" ${Number(value.weekday) === i ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>ساعت شروع *</label>
        <input class="input" id="s-start" type="time" value="${value.start}" />
      </div>
      <div class="field">
        <label>ساعت پایان *</label>
        <input class="input" id="s-end" type="time" value="${value.end}" />
      </div>
    </div>
    <div class="field">
      <label>محل / کلاس</label>
      <input class="input" id="s-place" maxlength="80" placeholder="مثلاً: کلاس ۲۰۵ یا آنلاین" value="${ui.esc(value.place)}" />
    </div>
    <div class="field">
      <label>لینک کلاس آنلاین</label>
      <input class="input" id="s-link" dir="ltr" placeholder="https://meet.google.com/..." value="${ui.esc(value.link)}" />
      <span class="note">در کارت «کلاس بعدی» به‌صورت دکمه‌ی ورود نمایش داده می‌شود.</span>
    </div>`;

  ui.openModal({
    title: session ? 'ویرایش جلسه' : 'افزودن کلاس به برنامه',
    body,
    footer: `
      <button class="btn btn-primary" id="s-save">${session ? 'ذخیره' : 'افزودن به برنامه'}</button>
      ${session ? '<button class="btn btn-danger" id="s-del">حذف</button>' : ''}
      <button class="btn btn-ghost" data-modal-close>لغو</button>`,
    onMount(modal, close) {
      const save = modal.querySelector('#s-save');
      save.onclick = async () => {
        const payload = {
          courseId: modal.querySelector('#s-course').value,
          weekday: Number(modal.querySelector('#s-day').value),
          start: modal.querySelector('#s-start').value,
          end: modal.querySelector('#s-end').value,
          place: modal.querySelector('#s-place').value.trim(),
          link: modal.querySelector('#s-link').value.trim(),
        };
        if (payload.start >= payload.end) return ui.toast('ساعت پایان باید بعد از شروع باشد', 'err');
        save.disabled = true;
        save.innerHTML = '<span class="spinner"></span>';
        try {
          if (session) await api.updateSession(session.id, payload);
          else await api.createSession(payload);
          close();
          await app.refresh();
          ui.toast(session ? 'جلسه ویرایش شد' : 'کلاس به برنامه اضافه شد', 'ok');
        } catch (e) {
          ui.toast(e.message, 'err');
          save.disabled = false;
          save.textContent = session ? 'ذخیره' : 'افزودن به برنامه';
        }
      };

      const del = modal.querySelector('#s-del');
      if (del) del.onclick = async () => {
        const ok = await ui.confirmDialog({ message: 'این جلسه از برنامه هفتگی حذف شود؟' });
        if (!ok) return;
        try {
          await api.deleteSession(session.id);
          close();
          await app.refresh();
          ui.toast('جلسه حذف شد', 'ok');
        } catch (e) { ui.toast(e.message, 'err'); }
      };
    },
  });
}

/* ---------------- آپلود کتاب ---------------- */
export function uploadModal(defaultCourseId) {
  const courses = app.data.courses;
  if (!courses.length) {
    ui.toast('برای آپلود کتاب اول یک درس بساز', 'warn');
    courseModal();
    return;
  }
  const body = `
    <div class="field">
      <label>درس مربوطه *</label>
      <select class="select" id="u-course">
        ${courses.map((c) => `<option value="${c.id}" ${defaultCourseId === c.id ? 'selected' : ''}>${ui.esc(c.title)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>نام کتاب</label>
      <input class="input" id="u-title" maxlength="120" placeholder="اگر خالی بماند، از نام فایل استفاده می‌شود" />
    </div>

    <div style="display:flex;gap:6px;margin-bottom:12px">
      <button type="button" class="btn btn-sm" id="mode-file-btn" style="flex:1">📄 از فایل کامپیوتر</button>
      <button type="button" class="btn btn-sm" id="mode-url-btn" style="flex:1">🔗 از لینک اینترنتی</button>
    </div>

    <div id="mode-file">
      <label id="u-drop" style="display:block;border:2px dashed #cbd5e1;border-radius:14px;padding:26px;text-align:center;cursor:pointer;transition:.15s;background:#fbfbfe">
        <div style="font-size:28px">📄</div>
        <div style="font-weight:500;margin-top:6px" id="u-filename">فایل PDF را این‌جا بکش یا کلیک کن</div>
        <div style="font-size:12px;color:#6b7280">حداکثر ۱۲۰ مگابایت — فایل متنی (نه اسکن‌شده)</div>
        <input type="file" id="u-file" accept="application/pdf,.pdf" style="display:none" />
      </label>
    </div>

    <div id="mode-url" style="display:none">
      <div class="field" style="margin:0">
        <label>آدرس فایل PDF</label>
        <input class="input" id="u-url" dir="ltr" placeholder="https://example.com/book.pdf" />
        <span class="note">سرور فایل را دانلود می‌کند؛ لینک باید مستقیم به یک PDF معتبر اشاره کند.</span>
      </div>
    </div>

    <div id="u-progress" style="display:none;margin-top:14px">
      <div class="progress-line"><i></i></div>
      <p style="font-size:12.5px;color:#6b7280;margin-top:8px" id="u-status">در حال آپلود…</p>
    </div>`;

  ui.openModal({
    title: 'افزودن کتاب درس (PDF)',
    body,
    footer: `
      <button class="btn btn-primary" id="u-send" disabled>افزودن و تشخیص فصل‌ها</button>
      <button class="btn btn-ghost" data-modal-close>لغو</button>`,
    onMount(modal, close) {
      const fileInput = modal.querySelector('#u-file');
      const drop = modal.querySelector('#u-drop');
      const nameEl = modal.querySelector('#u-filename');
      const send = modal.querySelector('#u-send');
      const progress = modal.querySelector('#u-progress');
      const status = modal.querySelector('#u-status');
      const modeFile = modal.querySelector('#mode-file');
      const modeUrl = modal.querySelector('#mode-url');
      const btnFile = modal.querySelector('#mode-file-btn');
      const btnUrl = modal.querySelector('#mode-url-btn');
      const urlInput = modal.querySelector('#u-url');
      let file = null;
      let mode = 'file';

      const setMode = (m) => {
        mode = m;
        modeFile.style.display = m === 'file' ? 'block' : 'none';
        modeUrl.style.display = m === 'url' ? 'block' : 'none';
        btnFile.className = `btn btn-sm ${m === 'file' ? 'btn-primary' : ''}`;
        btnUrl.className = `btn btn-sm ${m === 'url' ? 'btn-primary' : ''}`;
        btnFile.style.flex = btnUrl.style.flex = '1';
        send.disabled = m === 'file' ? !file : false;
      };
      btnFile.onclick = () => setMode('file');
      btnUrl.onclick = () => setMode('url');
      setMode('file');

      const pick = (f) => {
        if (!f) return;
        if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
          ui.toast('فقط فایل PDF مجاز است', 'err');
          return;
        }
        file = f;
        nameEl.textContent = f.name;
        drop.style.borderColor = '#6366f1';
        drop.style.background = '#eef2ff';
        send.disabled = false;
      };

      fileInput.onchange = () => pick(fileInput.files[0]);
      drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = '#6366f1'; };
      drop.ondragleave = () => { drop.style.borderColor = '#cbd5e1'; };
      drop.ondrop = (e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); };

      const finish = async (book) => {
        status.textContent = 'در حال استخراج متن و تشخیص فصل‌ها…';
        const done = await waitBook(book.id, status);
        close();
        await app.refresh();
        if (done.status === 'ready') {
          ui.toast(`کتاب پردازش شد: ${ui.faNum(done.chapters.length)} فصل`, 'ok');
          app.navigate(`#/library?book=${done.id}`);
        } else {
          ui.toast(done.error || 'پردازش کتاب ناموفق بود', 'err');
        }
      };

      send.onclick = async () => {
        const title = modal.querySelector('#u-title').value.trim();
        const courseId = modal.querySelector('#u-course').value;
        send.disabled = true;
        progress.style.display = 'block';

        if (mode === 'url') {
          const url = urlInput.value.trim();
          if (!/^https?:\/\//i.test(url)) {
            send.disabled = false;
            progress.style.display = 'none';
            return ui.toast('لینک معتبر (با http یا https) وارد کن', 'err');
          }
          send.innerHTML = '<span class="spinner"></span> در حال دریافت';
          status.textContent = 'در حال دانلود فایل از لینک…';
          try {
            const book = await api.addBookFromUrl({ courseId, url, title });
            send.innerHTML = '<span class="spinner"></span> در حال پردازش';
            await finish(book);
          } catch (e) {
            ui.toast(e.message, 'err');
            status.textContent = 'خطا: ' + e.message;
            send.disabled = false;
            send.textContent = 'افزودن و تشخیص فصل‌ها';
            progress.style.display = 'none';
          }
          return;
        }

        if (!file) {
          send.disabled = false;
          progress.style.display = 'none';
          return ui.toast('فایل را انتخاب کن', 'err');
        }
        const fd = new FormData();
        fd.append('file', file);
        fd.append('courseId', courseId);
        fd.append('title', title);
        send.innerHTML = '<span class="spinner"></span> در حال آپلود';
        try {
          const book = await api.uploadBook(fd, (p) => {
            status.textContent = p < 100 ? `در حال آپلود… ${ui.faNum(p)}٪` : 'آپلود کامل شد، در حال خواندن PDF…';
          });
          send.innerHTML = '<span class="spinner"></span> در حال پردازش';
          await finish(book);
        } catch (e) {
          ui.toast(e.message, 'err');
          send.disabled = false;
          send.textContent = 'افزودن و تشخیص فصل‌ها';
          status.textContent = 'خطا: ' + e.message;
        }
      };
    },
  });
}

async function waitBook(id, statusEl) {
  for (let i = 0; i < 240; i++) {
    const book = await api.getBook(id);
    if (book.status === 'ready' || book.status === 'error') return book;
    if (statusEl) {
      const secs = Math.round((i + 1) * 1.2);
      statusEl.textContent = `در حال استخراج متن و تشخیص فصل‌ها… (${ui.faNum(secs)} ثانیه)`;
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return { status: 'error', error: 'پردازش طولانی شد' };
}

/* ---------------- ویرایش فصل‌ها ---------------- */
export function chaptersModal(book) {
  const rows = book.chapters.map((c) => ({ ...c }));
  const body = `
    <p class="hint" style="margin-bottom:14px">
      اگر فصل‌ها درست تشخیص داده نشده‌اند، محدوده‌ی صفحه‌ها را اصلاح کن. متن هر فصل دوباره استخراج می‌شود.
      برای ادغام دو فصل، پایان فصل اول را تا پایان فصل دوم ببر و فصل دوم را حذف کن.
    </p>
    <div id="ch-list"></div>
    <button class="btn btn-sm" id="ch-add" style="margin-top:10px">＋ افزودن فصل</button>`;

  ui.openModal({
    title: `ویرایش فصل‌های «${book.title}»`,
    body,
    size: 'lg',
    footer: `
      <button class="btn btn-primary" id="ch-save">ذخیره و بازسازی متن</button>
      <button class="btn btn-ghost" data-modal-close>لغو</button>`,
    onMount(modal, close) {
      const list = modal.querySelector('#ch-list');
      const renderRows = () => {
        list.innerHTML = rows.map((c, i) => `
          <div class="row" style="align-items:flex-end;margin-bottom:10px" data-i="${i}">
            <div class="field" style="flex:3;margin:0">
              <label>عنوان فصل ${ui.faNum(i + 1)}</label>
              <input class="input ch-title" value="${ui.esc(c.title)}" />
            </div>
            <div class="field" style="flex:0 0 90px;margin:0">
              <label>از صفحه</label>
              <input class="input ch-start" type="number" min="1" value="${c.startPage}" />
            </div>
            <div class="field" style="flex:0 0 90px;margin:0">
              <label>تا صفحه</label>
              <input class="input ch-end" type="number" min="1" value="${c.endPage}" />
            </div>
            <button class="btn btn-sm btn-ghost ch-del" title="حذف" style="margin-bottom:2px">🗑</button>
          </div>`).join('');

        list.querySelectorAll('[data-i]').forEach((row) => {
          const i = Number(row.dataset.i);
          row.querySelector('.ch-title').oninput = (e) => { rows[i].title = e.target.value; };
          row.querySelector('.ch-start').oninput = (e) => { rows[i].startPage = Number(e.target.value); };
          row.querySelector('.ch-end').oninput = (e) => { rows[i].endPage = Number(e.target.value); };
          row.querySelector('.ch-del').onclick = () => {
            if (rows.length <= 1) return ui.toast('حداقل یک فصل لازم است', 'warn');
            rows.splice(i, 1);
            renderRows();
          };
        });
      };
      renderRows();

      modal.querySelector('#ch-add').onclick = () => {
        const last = rows[rows.length - 1];
        const start = Math.min(book.numPages ?? 9999, (last?.endPage ?? 0) + 1);
        rows.push({ title: `فصل ${ui.faNum(rows.length + 1)}`, startPage: start, endPage: Math.min(book.numPages ?? start, start + 14) });
        renderRows();
      };

      const save = modal.querySelector('#ch-save');
      save.onclick = async () => {
        save.disabled = true;
        save.innerHTML = '<span class="spinner"></span> در حال بازسازی…';
        try {
          await api.updateChapters(book.id, rows);
          close();
          await app.refresh();
          ui.toast('فصل‌ها به‌روزرسانی شد', 'ok');
        } catch (e) {
          ui.toast(e.message, 'err');
          save.disabled = false;
          save.textContent = 'ذخیره و بازسازی متن';
        }
      };
    },
  });
}


/* ---------------- آزمون ---------------- */
const EXAM_LEADS = [
  { v: '', label: 'پیش‌فرض تنظیمات' },
  { v: '60', label: '۱ ساعت قبل' },
  { v: '180', label: '۳ ساعت قبل' },
  { v: '720', label: '۱۲ ساعت قبل' },
  { v: '1440', label: '۱ روز قبل' },
  { v: '2880', label: '۲ روز قبل' },
];

export function examModal(exam = null) {
  const courses = app.data.courses;
  if (!courses.length) {
    ui.toast('اول یک درس بساز', 'warn');
    courseModal();
    return;
  }
  const current = {
    courseId: exam?.courseId ?? courses[0].id,
    title: exam?.title ?? '',
    date: exam?.date ?? ui.todayISO(),
    time: exam?.time ?? '10:00',
    duration: exam?.duration ?? 90,
    place: exam?.place ?? '',
    note: exam?.note ?? '',
    remindBefore: exam?.remindBefore ?? '',
  };

  const body = `
    <div class="field">
      <label>درس *</label>
      <select class="select" id="e-course">
        ${courses.map((c) => `<option value="${c.id}" ${current.courseId === c.id ? 'selected' : ''}>${ui.esc(c.title)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>عنوان آزمون</label>
      <input class="input" id="e-title" maxlength="120" placeholder="مثلاً: میان‌ترم، پایان‌ترم، کوییز ۲" value="${ui.esc(current.title)}" />
    </div>
    <div class="row">
      <div class="field">
        <label>تاریخ *</label>
        <input class="input" id="e-date" type="date" value="${current.date}" />
      </div>
      <div class="field">
        <label>ساعت شروع *</label>
        <input class="input" id="e-time" type="time" value="${current.time}" />
      </div>
      <div class="field">
        <label>مدت (دقیقه)</label>
        <input class="input" id="e-duration" type="number" min="15" max="480" step="15" value="${current.duration}" />
      </div>
    </div>
    <div class="field">
      <label>محل برگزاری</label>
      <input class="input" id="e-place" maxlength="100" placeholder="مثلاً: سالن ۲ یا سامانه‌ی آنلاین" value="${ui.esc(current.place)}" />
    </div>
    <div class="field">
      <label>یادآوری</label>
      <select class="select" id="e-lead">
        ${EXAM_LEADS.map((l) => `<option value="${l.v}" ${String(current.remindBefore ?? '') === l.v ? 'selected' : ''}>${l.label}</option>`).join('')}
      </select>
    </div>
    <div class="field" style="margin-bottom:0">
      <label>یادداشت / منابع</label>
      <textarea class="textarea" id="e-note" maxlength="300" placeholder="مثلاً: فصل ۱ تا ۴ + جزوه‌ی کلاسی">${ui.esc(current.note)}</textarea>
    </div>`;

  ui.openModal({
    title: exam ? 'ویرایش آزمون' : 'افزودن آزمون',
    body,
    footer: `
      <button class="btn btn-primary" id="e-save">${exam ? 'ذخیره' : 'افزودن آزمون'}</button>
      ${exam ? '<button class="btn btn-danger" id="e-del">حذف</button>' : ''}
      <button class="btn btn-ghost" data-modal-close>لغو</button>`,
    onMount(modal, close) {
      const save = modal.querySelector('#e-save');
      save.onclick = async () => {
        const payload = {
          courseId: modal.querySelector('#e-course').value,
          title: modal.querySelector('#e-title').value.trim(),
          date: modal.querySelector('#e-date').value,
          time: modal.querySelector('#e-time').value,
          duration: Number(modal.querySelector('#e-duration').value) || 90,
          place: modal.querySelector('#e-place').value.trim(),
          note: modal.querySelector('#e-note').value.trim(),
          remindBefore: modal.querySelector('#e-lead').value === '' ? null : Number(modal.querySelector('#e-lead').value),
        };
        if (!payload.date) return ui.toast('تاریخ آزمون را انتخاب کن', 'err');
        save.disabled = true;
        save.innerHTML = '<span class="spinner"></span>';
        try {
          if (exam) await api.updateExam(exam.id, payload);
          else await api.createExam(payload);
          close();
          await app.refresh();
          ui.toast(exam ? 'آزمون ویرایش شد' : 'آزمون اضافه شد — یادآور تنظیم شد', 'ok');
        } catch (e) {
          ui.toast(e.message, 'err');
          save.disabled = false;
          save.textContent = exam ? 'ذخیره' : 'افزودن آزمون';
        }
      };

      const del = modal.querySelector('#e-del');
      if (del) del.onclick = async () => {
        const ok = await ui.confirmDialog({ message: 'این آزمون حذف شود؟' });
        if (!ok) return;
        try {
          await api.deleteExam(exam.id);
          close();
          await app.refresh();
          ui.toast('آزمون حذف شد', 'ok');
        } catch (e) { ui.toast(e.message, 'err'); }
      };
    },
  });
}
