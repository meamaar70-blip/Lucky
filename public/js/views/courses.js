// public/js/views/courses.js — درس‌ها و کتاب‌ها
//
// ساختار: فهرست کتاب‌ها در یک ستون، و برای کتابی که انتخاب می‌شود یک پنل
// با همه‌ی کارهایی که آن کتاب لازم دارد: بارگذاری/جایگزینی PDF، ساخت خلاصه،
// ساخت تست، پاورپوینت، ویرایش فصل‌بندی و حذف.

import { api } from '../api.js';
import * as ui from '../ui.js';
import { courseModal, sessionModal, uploadModal } from '../forms.js';

let selectedBookId = null;

function statusOf(book) {
  if (book.status === 'processing') return '<span class="badge badge-warn">در حال پردازش</span>';
  if (book.status === 'error') return `<span class="badge badge-danger">خطا در پردازش</span>`;
  return `<span class="badge badge-ok">${ui.faNum((book.chapters ?? []).length)} فصل</span>`;
}

export async function coursesView(root, route, app) {
  const d = app.data;

  app.setHeader(
    'درس‌ها و کتاب‌ها',
    d.books.length ? `${ui.faNum(d.books.length)} کتاب • ${ui.faNum(d.courses.length)} درس` : 'اولین کتاب را اضافه کن',
    `<button class="btn btn-sm" id="add-book">بارگذاری PDF</button>
     <button class="btn btn-sm" id="add-course">درس تازه</button>`,
  );

  /* ---------- حالت خالی ---------- */
  if (!d.courses.length) {
    root.innerHTML = `<div class="card card-pad empty">
      <h3>هنوز درسی نداری</h3>
      <p>اول درس‌های این ترم را بساز، بعد PDF کتاب هر درس را بارگذاری کن.</p>
      <button class="btn btn-primary" id="empty-add">افزودن اولین درس</button>
    </div>`;
    root.querySelector('#empty-add').onclick = () => courseModal();
    document.getElementById('add-course').onclick = () => courseModal();
    document.getElementById('add-book').onclick = () => uploadModal();
    return;
  }

  const books = d.books;
  const fromUrl = route.params?.get?.('book');
  if (fromUrl && books.some((b) => b.id === fromUrl)) selectedBookId = fromUrl;
  if (selectedBookId && !books.some((b) => b.id === selectedBookId)) selectedBookId = null;
  if (!selectedBookId && books.length) selectedBookId = books[0].id;
  const book = books.find((b) => b.id === selectedBookId) ?? null;
  const course = book ? app.course(book.courseId) : null;

  /* ---------- ستون فهرست کتاب‌ها ---------- */
  const listHtml = books.length
    ? books.map((b) => {
        const c = app.course(b.courseId);
        return `<button class="book-row ${b.id === selectedBookId ? 'active' : ''}" data-book="${b.id}">
          <span class="book-tag" style="background:${c?.color ?? 'var(--line-strong)'}"></span>
          <span class="book-main">
            <span class="book-title">${ui.esc(b.title)}</span>
            <span class="book-sub">${ui.esc(c?.title ?? 'درس حذف‌شده')} • ${ui.faNum(b.numPages ?? 0)} صفحه</span>
          </span>
          ${b.status === 'ready' ? `<span class="badge">${ui.faNum((b.chapters ?? []).length)}</span>` : statusOf(b)}
        </button>`;
      }).join('')
    : `<div class="empty" style="padding:22px 10px">
        <p>هنوز کتابی بارگذاری نکرده‌ای.</p>
        <button class="btn btn-sm" id="empty-book">بارگذاری PDF</button>
      </div>`;

  /* ---------- پنل کتاب انتخاب‌شده ---------- */
  const chapters = book?.chapters ?? [];
  const readyCount = chapters.filter((c) => c.hasSummary || c.hasQuiz).length;

  const detailHtml = book
    ? `<div class="card card-pad book-detail">
        <div class="book-detail-head">
          <div style="min-width:0">
            <div class="meta">${ui.esc(course?.title ?? '')}</div>
            <h2 style="font-size:16px">${ui.esc(book.title)}</h2>
            <div class="meta">${ui.faNum(book.numPages ?? 0)} صفحه • ${ui.faNum(chapters.length)} فصل • ${statusOf(book)}</div>
          </div>
          <a class="btn btn-sm" href="#/library?book=${book.id}">رفتن به فصل‌ها</a>
        </div>

        <div class="book-actions">
          <button class="btn btn-sm" data-act="pdf" ${book.status === 'processing' ? 'disabled' : ''}>
            ${book.status === 'processing' ? 'در حال پردازش…' : 'بارگذاری PDF تازه'}
          </button>
          <button class="btn btn-sm" data-act="summary" ${book.status !== 'ready' ? 'disabled' : ''}>خلاصه همه‌ی فصل‌ها</button>
          <button class="btn btn-sm" data-act="quiz" ${book.status !== 'ready' ? 'disabled' : ''}>تست همه‌ی فصل‌ها</button>
          <button class="btn btn-sm" data-act="pptx" ${book.status !== 'ready' ? 'disabled' : ''}>پاورپوینت فصل ۱</button>
          <button class="btn btn-sm" data-act="edit" ${book.status !== 'ready' ? 'disabled' : ''}>ویرایش فصل‌بندی</button>
          <button class="btn btn-sm btn-danger" data-act="delete">حذف کتاب</button>
        </div>

        <div class="section-head" style="margin-top:18px">
          <h2>فصل‌ها</h2>
          <span class="meta">${ui.faNum(readyCount)} از ${ui.faNum(chapters.length)} فصل آماده</span>
        </div>

        ${chapters.length
          ? `<div class="chapter-rows">${chapters.map((ch, i) => `
              <div class="chapter-row">
                <span class="chapter-num">${ui.faNum(i + 1)}</span>
                <div style="flex:1;min-width:0">
                  <div class="ch-title">${ui.esc(ch.title)}</div>
                  <div class="meta">
                    صفحه ${ui.faNum(ch.startPage)} تا ${ui.faNum(ch.endPage)}
                    ${ch.stats?.words ? ` • ${ui.faNum(ch.stats.words)} کلمه` : ''}
                  </div>
                </div>
                <div class="chapter-flags">
                  ${ch.hasSummary ? '<span class="badge badge-ok">خلاصه</span>' : ''}
                  ${ch.hasQuiz ? '<span class="badge badge-brand">تست</span>' : ''}
                  ${!ch.hasSummary && !ch.hasQuiz ? '<span class="badge">خالی</span>' : ''}
                </div>
                <div class="chapter-row-actions">
                  <button class="btn btn-sm btn-ghost" data-build="summary" data-ch="${ch.id}">خلاصه</button>
                  <button class="btn btn-sm btn-ghost" data-build="quiz" data-ch="${ch.id}">تست</button>
                  <a class="btn btn-sm btn-ghost" href="#/chapter/${ch.id}?tab=summary">باز کردن</a>
                </div>
              </div>`).join('')}
            </div>`
          : `<div class="empty" style="padding:24px 8px">
              <p>${book.status === 'processing' ? 'در حال استخراج متن و فصل‌ها…' : 'فصلی برای این کتاب ثبت نشده.'}</p>
            </div>`}
      </div>`
    : `<div class="card card-pad empty">
        <h3>کتابی انتخاب نشده</h3>
        <p>از فهرست کنار، یک کتاب انتخاب کن یا کتاب تازه بارگذاری کن.</p>
        <button class="btn btn-primary" id="empty-book">بارگذاری PDF</button>
      </div>`;

  /* ---------- درس‌ها (جمع‌وجور) ---------- */
  const coursesHtml = `<div class="card card-pad">
      <div class="section-head"><h2>درس‌ها</h2><button class="btn btn-sm" id="add-course-2">درس تازه</button></div>
      ${d.courses.map((c) => {
        const cs = d.sessions.filter((s) => s.courseId === c.id);
        return `<div class="course-line">
          <span class="book-tag" style="background:${c.color}"></span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500">${ui.esc(c.title)}</div>
            <div class="meta">${[c.teacher, cs.length ? `${ui.faNum(cs.length)} جلسه` : 'بدون جلسه'].filter(Boolean).join(' • ')}</div>
          </div>
          <button class="btn btn-sm btn-ghost" data-course-session="${c.id}">کلاس</button>
          <button class="btn btn-sm btn-ghost c-edit" data-id="${c.id}">ویرایش</button>
          <button class="btn btn-sm btn-ghost c-del" data-id="${c.id}" data-title="${ui.esc(c.title)}">حذف</button>
        </div>`;
      }).join('')}
    </div>`;

  root.innerHTML = `
    <div class="books-layout">
      <div class="books-col">
        <div class="card card-pad" style="padding:10px">
          <div class="section-head" style="margin-bottom:8px;padding:0 4px">
            <h2>کتاب‌ها</h2>
            <button class="btn btn-sm btn-ghost" id="add-book-2">+ PDF</button>
          </div>
          <div class="book-list">${listHtml}</div>
        </div>
        ${coursesHtml}
      </div>
      <div class="books-detail">${detailHtml}</div>
    </div>`;

  /* ---------- رویدادها ---------- */
  const rerender = () => coursesView(root, route, app);

  root.querySelectorAll('[data-book]').forEach((btn) => {
    btn.onclick = () => {
      selectedBookId = btn.dataset.book;
      app.navigate(`#/courses?book=${btn.dataset.book}`);
      rerender();
    };
  });

  root.querySelectorAll('#empty-book, #add-book-2').forEach((b) => {
    b.onclick = () => uploadModal(book?.courseId ?? d.courses[0]?.id);
  });
  document.getElementById('add-book').onclick = () => uploadModal(book?.courseId ?? d.courses[0]?.id);
  document.getElementById('add-course').onclick = () => courseModal();
  root.querySelector('#add-course-2')?.addEventListener('click', () => courseModal());

  root.querySelectorAll('[data-course-session]').forEach((b) => {
    b.onclick = () => sessionModal({ defaults: { courseId: b.dataset.courseSession } });
  });
  root.querySelectorAll('.c-edit').forEach((b) => {
    b.onclick = () => courseModal(app.course(b.dataset.id));
  });
  root.querySelectorAll('.c-del').forEach((b) => {
    b.onclick = async () => {
      const ok = await ui.confirmDialog({
        message: `درس «${b.dataset.title}» با همه‌ی جلسه‌ها و کتاب‌هایش حذف شود؟`,
      });
      if (!ok) return;
      try {
        await api.deleteCourse(b.dataset.id);
        await app.refresh();
        ui.toast('درس حذف شد', 'ok');
        rerender();
      } catch (e) { ui.toast(e.message, 'err'); }
    };
  });

  /* ساخت تک‌فصل */
  root.querySelectorAll('[data-build]').forEach((btn) => {
    btn.onclick = async () => {
      const chapterId = btn.dataset.ch;
      const kind = btn.dataset.build;
      await app.busy(btn, async () => {
        try {
          if (kind === 'summary') await api.makeSummary(chapterId, {});
          else await api.makeQuiz(chapterId, { count: 8 });
          await app.refresh();
          ui.toast(kind === 'summary' ? 'خلاصه ساخته شد' : 'تست ساخته شد', 'ok');
          rerender();
        } catch (e) { ui.toast(e.message, 'err'); }
      }, kind === 'summary' ? 'در حال خلاصه‌سازی…' : 'در حال ساخت تست…');
    };
  });

  /* کارهای کتاب */
  root.querySelectorAll('[data-act]').forEach((btn) => {
    btn.onclick = async () => {
      if (!book) return;
      const act = btn.dataset.act;

      if (act === 'pdf') { uploadModal(book.courseId); return; }

      if (act === 'edit') { location.hash = `#/library?book=${book.id}&edit=1`; return; }

      if (act === 'delete') {
        const ok = await ui.confirmDialog({
          message: `کتاب «${book.title}» و همه‌ی فصل‌ها، خلاصه‌ها و کارت‌های مرورش حذف شود؟`,
        });
        if (!ok) return;
        try {
          await api.deleteBook(book.id);
          selectedBookId = null;
          await app.refresh();
          ui.toast('کتاب حذف شد', 'ok');
          rerender();
        } catch (e) { ui.toast(e.message, 'err'); }
        return;
      }

      if (act === 'pptx') {
        const first = chapters[0];
        if (!first) return;
        await app.busy(btn, async () => {
          try {
            const res = await api.makePptx(first.id);
            ui.toast('پاورپوینت فصل ۱ ساخته شد', 'ok');
            if (res?.url) location.href = res.url;
            rerender();
          } catch (e) { ui.toast(e.message, 'err'); }
        }, 'در حال ساخت…');
        return;
      }

      // خلاصه/تست برای همه‌ی فصل‌ها
      if (act === 'summary' || act === 'quiz') {
        const targets = act === 'summary'
          ? chapters.filter((c) => !c.hasSummary)
          : chapters.filter((c) => !c.hasQuiz);
        if (!targets.length) {
          ui.toast(act === 'summary' ? 'همه‌ی فصل‌ها خلاصه دارند' : 'همه‌ی فصل‌ها تست دارند', '');
          return;
        }
        await app.busy(btn, async () => {
          let done = 0;
          for (const ch of targets) {
            try {
              if (act === 'summary') await api.makeSummary(ch.id, {});
              else await api.makeQuiz(ch.id, { count: 8 });
              done += 1;
            } catch (e) {
              ui.toast(`فصل «${ch.title}»: ${e.message}`, 'err');
            }
          }
          await app.refresh();
          ui.toast(`${ui.faNum(done)} فصل ${act === 'summary' ? 'خلاصه' : 'تست'} شد`, 'ok');
          rerender();
        }, 'در حال پردازش…');
      }
    };
  });
}
