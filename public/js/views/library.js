// public/js/views/library.js — فهرست کتاب‌ها و فصل‌ها

import { api } from '../api.js';
import * as ui from '../ui.js';
import { uploadModal, chaptersModal } from '../forms.js';

export async function libraryView(root, route, app) {
  const d = app.data;

  app.setHeader(
'فصل‌ها و مطالعه',
    d.books.length ? `${ui.faNum(d.books.length)} کتاب • ${ui.faNum(d.books.reduce((a, b) => a + (b.chapters?.length ?? 0), 0))} فصل` : 'کتاب PDF اضافه کن تا فصل‌ها ساخته شوند',
    `<button class="btn btn-sm btn-primary" id="lib-add">بارگذاری کتاب</button>`,
  );

  if (!d.books.length) {
    root.innerHTML = `<div class="card card-pad empty"><span class="emoji">📑</span><h3>کتابی اضافه نشده</h3><p>فایل PDF هر درس را بارگذاری کن. برنامه به‌صورت خودکار فصل‌ها را تشخیص می‌دهد و برای هر فصل خلاصه، تست و پاورپوینت می‌سازد.</p><button class="btn btn-primary" id="empty-up">بارگذاری اولین کتاب</button><p class="hint" style="margin-top:16px;display:inline-block">فایل باید متنی باشد (PDF اسکن‌شده فعلاً پشتیبانی نمی‌شود)</p></div>`;
    root.querySelector('#empty-up').onclick = () => uploadModal();
    document.getElementById('lib-add').onclick = () => uploadModal();
    return;
  }

  const selectedId = route.params.get('book') ?? d.books[0].id;
  const selected = d.books.find((b) => b.id === selectedId) ?? d.books[0];
  const course = app.course(selected.courseId);
  const chapters = selected.chapters ?? [];

  const sidebar = `<div class="card" style="padding:10px">${d.books.map((b) => {
        const c = app.course(b.courseId);
        return `<div class="book-item ${b.id === selected.id ? 'active' : ''}" data-book="${b.id}"><div class="cover" style="background:linear-gradient(135deg,${c?.color ?? '#6366f1'}33,${c?.color ?? '#6366f1'}66);color:${c?.color ?? '#4338ca'}"></div><div class="info"><div class="t">${ui.esc(b.title)}</div><div class="s">${ui.esc(c?.title ?? '')} • ${ui.faNum((b.chapters ?? []).length)} فصل</div></div></div>`;
      }).join('')}</div>`;

  const grid = chapters.length
    ? chapters.map((ch) => {
        const done = [ch.hasSummary && 'خلاصه', ch.hasQuiz && 'تست'].filter(Boolean);
        return `<div class="chapter-card"><div class="chapter-num">${ui.faNum(ch.order ?? 1)}</div><div class="body"><div class="title">${ui.esc(ch.title)}</div><div class="meta"><span>صفحه ${ui.faNum(ch.startPage)} تا ${ui.faNum(ch.endPage)}</span>${ch.stats ? `<span>${ui.faNum(ch.stats.words)} کلمه</span><span>~${ui.faNum(ch.stats.minutes)} دقیقه</span>` : ''}
              ${done.length ? `<span class="badge badge-ok">${done.join(' + ')} آماده</span>` : ''}</div></div><div class="actions"><button class="btn btn-sm ch-go" data-id="${ch.id}" data-tab="summary">خلاصه</button><button class="btn btn-sm ch-go" data-id="${ch.id}" data-tab="quiz">تست</button><button class="btn btn-sm ch-go" data-id="${ch.id}" data-tab="pptx">پاورپوینت</button></div></div>`;
      }).join('')
    : '<div class="card card-pad empty"><span class="emoji">⏳</span><p>این کتاب هنوز فصلی ندارد.</p></div>';

  root.innerHTML = `<div class="split"><div><div class="section-head"><h2>کتاب‌ها</h2><button class="btn btn-sm btn-ghost" id="lib-add2">＋</button></div>${sidebar}</div><div><div class="card card-pad" style="margin-bottom:16px"><div class="section-head" style="margin-bottom:6px"><div><h2 style="display:flex;gap:8px;align-items:center"><span style="width:10px;height:10px;border-radius:50%;background:${course?.color ?? '#6366f1'}"></span>${ui.esc(selected.title)}</h2><div style="font-size:12.5px;color:var(--muted);margin-top:2px">${ui.esc(course?.title ?? '')} • ${ui.faNum(selected.numPages ?? 0)} صفحه • ${ui.faNum(chapters.length)} فصل
                ${selected.status === 'processing' ? ' • <span class="badge badge-warn">در حال پردازش</span>' : ''}
                ${selected.status === 'error' ? ` • <span class="badge badge-danger">${ui.esc(selected.error || 'خطا')}</span>` : ''}</div></div><div style="display:flex;gap:6px"><button class="btn btn-sm" id="lib-edit">ویرایش فصل‌ها</button><button class="btn btn-sm btn-danger" id="lib-del">حذف</button></div></div></div><div class="grid" style="gap:10px">${grid}</div><p class="hint" style="margin-top:16px">روی «خلاصه» بزن تا متن فصل در چند ثانیه خلاصه شود؛ بعد از آن می‌توانی تست همان فصل را بسازی یا پاورپوینت آماده‌ی ارائه دانلود کنی.</p></div></div>`;

  root.querySelectorAll('[data-book]').forEach((el) => {
    el.onclick = () => app.navigate(`#/library?book=${el.dataset.book}`);
  });
  root.querySelectorAll('.ch-go').forEach((b) => {
    b.onclick = () => app.navigate(`#/chapter/${b.dataset.id}?tab=${b.dataset.tab}`);
  });
  document.getElementById('lib-add').onclick = () => uploadModal();
  root.querySelector('#lib-add2').onclick = () => uploadModal();
  root.querySelector('#lib-edit').onclick = () => chaptersModal(selected);
  // ورود از صفحهٔ کتاب‌ها با درخواست ویرایش فصل‌بندی
  if (route.params?.get?.('edit') === '1') chaptersModal(selected);
  root.querySelector('#lib-del').onclick = async () => {
    const ok = await ui.confirmDialog({ message: `کتاب «${selected.title}» و همه‌ی فصل‌هایش حذف شود؟` });
    if (!ok) return;
    try {
      await api.deleteBook(selected.id);
      await app.refresh();
      ui.toast('کتاب حذف شد', 'ok');
      app.navigate('#/library');
    } catch (e) { ui.toast(e.message, 'err'); }
  };
}
