// public/js/views/courses.js — دروس و کتاب‌ها

import { api } from '../api.js';
import * as ui from '../ui.js';
import { courseModal, sessionModal, uploadModal } from '../forms.js';

export async function coursesView(root, route, app) {
  const d = app.data;

  app.setHeader(
    'دروس و کتاب‌ها',
    d.courses.length ? `${ui.faNum(d.courses.length)} درس • ${ui.faNum(d.books.length)} کتاب` : 'شروع با ساختن اولین درس',
    `<button class="btn btn-sm" id="add-book">📄 بارگذاری کتاب</button>
     <button class="btn btn-sm btn-primary" id="add-course">＋ درس جدید</button>`,
  );

  if (!d.courses.length) {
    root.innerHTML = `
      <div class="card card-pad empty">
        <span class="emoji">📚</span>
        <h3>هنوز درسی نداری</h3>
        <p>برای شروع، درس‌های این ترم را اضافه کن. بعد از آن می‌توانی برنامه‌ی هفتگی و فایل PDF کتاب هر درس را ثبت کنی.</p>
        <button class="btn btn-primary" id="empty-add">＋ افزودن اولین درس</button>
      </div>`;
    root.querySelector('#empty-add').onclick = () => courseModal();
    document.getElementById('add-course').onclick = () => courseModal();
    document.getElementById('add-book').onclick = () => uploadModal();
    return;
  }

  const booksOf = (courseId) => d.books.filter((b) => b.courseId === courseId);

  const bookRow = (b) => {
    const statusBadge = b.status === 'processing'
      ? '<span class="badge badge-warn">در حال پردازش</span>'
      : b.status === 'error'
        ? '<span class="badge badge-danger" title="' + ui.esc(b.error ?? '') + '">خطا در پردازش</span>'
        : `<span class="badge badge-ok">${ui.faNum((b.chapters ?? []).length)} فصل</span>`;
    return `<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-top:1px dashed var(--line)">
      <span style="font-size:16px">📄</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ui.esc(b.title)}</div>
        <div style="font-size:11.5px;color:var(--muted)">${ui.faNum(b.numPages ?? 0)} صفحه ${statusBadge}</div>
      </div>
      ${b.status === 'ready' ? `<a class="btn btn-sm btn-ghost" href="#/library?book=${b.id}">فصل‌ها →</a>` : ''}
      <button class="btn btn-sm btn-ghost book-del" data-id="${b.id}" data-title="${ui.esc(b.title)}" title="حذف کتاب">🗑</button>
    </div>`;
  };

  root.innerHTML = `
    <div class="grid cols-2">
      ${d.courses.map((c) => {
        const cs = d.sessions.filter((s) => s.courseId === c.id).sort((a, b) => a.weekday - b.weekday);
        const books = booksOf(c.id);
        return `<div class="course-card card" style="--c:${c.color}">
          <div class="head">
            <div class="course-dot" style="background:${c.color}">${ui.esc(ui.initials(c.title))}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:15px">${ui.esc(c.title)}</div>
              <div class="meta">${[c.teacher, c.code ? `کد ${ui.esc(c.code)}` : ''].filter(Boolean).join(' • ') || 'بدون استاد'}</div>
            </div>
            <button class="btn btn-sm btn-ghost c-edit" data-id="${c.id}" title="ویرایش">✏️</button>
            <button class="btn btn-sm btn-ghost c-del" data-id="${c.id}" data-title="${ui.esc(c.title)}" title="حذف">🗑</button>
          </div>

          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${cs.length
              ? cs.map((s) => `<span class="chip" style="font-size:11.5px">${ui.DAYS[s.weekday]} ${ui.faNum(s.start)}–${ui.faNum(s.end)}</span>`).join('')
              : '<span class="badge">بدون جلسه</span>'}
          </div>

          ${c.note ? `<div class="hint" style="background:transparent;padding:0;font-size:12.5px">📝 ${ui.esc(c.note)}</div>` : ''}

          ${books.length ? books.map(bookRow).join('') : '<div style="font-size:12.5px;color:var(--muted);border-top:1px dashed var(--line);padding-top:8px">کتابی برای این درس ثبت نشده.</div>'}

          <div class="foot">
            <button class="btn btn-sm s-add" data-id="${c.id}">＋ کلاس</button>
            <button class="btn btn-sm b-add" data-id="${c.id}">📄 افزودن PDF</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  const bind = () => {
    root.querySelectorAll('.c-edit').forEach((b) => {
      b.onclick = () => courseModal(app.course(b.dataset.id));
    });
    root.querySelectorAll('.c-del').forEach((b) => {
      b.onclick = async () => {
        const ok = await ui.confirmDialog({
          message: `درس «${b.dataset.title}» با همه‌ی جلسه‌ها و کتاب‌هایش حذف شود؟ این کار قابل بازگشت نیست.`,
        });
        if (!ok) return;
        try {
          await api.deleteCourse(b.dataset.id);
          await app.refresh();
          ui.toast('درس حذف شد', 'ok');
          coursesView(root, route, app);
        } catch (e) { ui.toast(e.message, 'err'); }
      };
    });
    root.querySelectorAll('.s-add').forEach((b) => {
      b.onclick = () => sessionModal({ defaults: { courseId: b.dataset.id } });
    });
    root.querySelectorAll('.b-add').forEach((b) => {
      b.onclick = () => uploadModal(b.dataset.id);
    });
    root.querySelectorAll('.book-del').forEach((b) => {
      b.onclick = async () => {
        const ok = await ui.confirmDialog({ message: `کتاب «${b.dataset.title}» و همه‌ی فصل‌ها و خلاصه‌هایش حذف شود؟` });
        if (!ok) return;
        try {
          await api.deleteBook(b.dataset.id);
          await app.refresh();
          ui.toast('کتاب حذف شد', 'ok');
          coursesView(root, route, app);
        } catch (e) { ui.toast(e.message, 'err'); }
      };
    });
  };
  bind();

  document.getElementById('add-course').onclick = () => courseModal();
  document.getElementById('add-book').onclick = () => uploadModal();
}
