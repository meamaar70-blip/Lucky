// public/js/views/review.js — فلش‌کارت و مرور فاصله‌دار
//
// کارت‌ها از سؤال‌های تستِ هر فصل ساخته می‌شوند (سمت سرور، SM-2) و این‌جا
// یکی‌یکی نمایش داده می‌شوند: اول سؤال، بعد از «نمایش پاسخ» گزینه‌ی درست و
// توضیح، و در آخر چهار دکمه‌ی نمره‌دهی که فاصله‌ی مرور بعدی را نشان می‌دهند.

import { api } from '../api.js';
import * as ui from '../ui.js';

/** وضعیت جلسه‌ی جاری؛ بین رندرهای دوباره حفظ می‌شود */
const session = {
  cards: [],
  index: 0,
  revealed: false,
  startedAt: 0,
  shownAt: 0,
  results: [],
  stats: null,
  limit: 20,
  finished: false,
  keyHandler: null,
};

function resetSession(limit) {
  session.cards = [];
  session.index = 0;
  session.revealed = false;
  session.results = [];
  session.finished = false;
  session.limit = limit;
}

function unbindKeys() {
  if (session.keyHandler) {
    document.removeEventListener('keydown', session.keyHandler);
    session.keyHandler = null;
  }
}

/* ---------- تکه‌های HTML ---------- */

function header(stats) {
  const due = stats?.due ?? 0;
  const done = session.results.length;
  const total = session.cards.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="card card-pad review-top"><div class="review-top-main"><div><h2 style="margin-bottom:2px">مرور امروز</h2><div class="review-sub">${due > 0
              ? `<span class="badge badge-brand">${ui.faNum(due)} کارت آماده‌ی مرور</span>`
              : '<span class="badge badge-ok">همه‌ی کارت‌ها مرور شده</span>'}<span class="badge">${ui.faNum(stats?.total ?? 0)} کارت</span>${stats?.todayReviews ? `<span class="badge">امروز: ${ui.faNum(stats.todayReviews)} مرور</span>` : ''}</div></div><button class="btn btn-sm btn-ghost" id="review-restart">شروع دوباره</button></div><div class="review-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="review-progress-bar" style="width:${pct}%"></div></div><div class="review-meta">${total ? `${ui.faNum(Math.min(done + 1, total))} از ${ui.faNum(total)}` : 'کارتی در صف نیست'}
        ${session.cards[session.index] ? ` • ${ui.esc(session.cards[session.index].chapterTitle ?? '')}` : ''}</div></div>`;
}

function cardHtml(card) {
  const isMcq = Array.isArray(card.options) && card.options.length > 0;
  return `<div class="flashcard ${session.revealed ? 'revealed' : ''}" id="flashcard"><div class="flash-tags">${card.courseTitle ? `<span class="badge badge-brand">${ui.esc(card.courseTitle)}</span>` : ''}<span class="badge">${ui.esc(card.chapterTitle ?? '')}</span>${card.difficulty ? `<span class="badge">${ui.esc(card.difficulty)}</span>` : ''}
        ${card.reps ? `<span class="badge badge-ok">بار ${ui.faNum(card.reps + 1)}</span>` : '<span class="badge badge-warn">کارت تازه</span>'}</div>${card.prompt ? `<div class="flash-prompt">${ui.esc(card.prompt)}</div>` : ''}<div class="flash-statement">${ui.esc(card.statement ?? '')}</div>${isMcq ? `<div class="flash-options">${card.options.map((opt, i) => `<div class="flash-opt ${session.revealed && i === card.answerIndex ? 'correct' : ''}"><span class="key">${ui.faNum(i + 1)}</span><span>${ui.esc(opt)}</span>${session.revealed && i === card.answerIndex ? '<span class="tick"></span>' : ''}</div>`).join('')}</div>` : ''}

      ${session.revealed ? `<div class="flash-answer"><strong>پاسخ:</strong> ${ui.esc(card.answer ?? '—')}</div>${card.explanation ? `<div class="flash-explain"><span class="k">از متن کتاب:</span> ${ui.esc(card.explanation)}</div>` : ''}
      ` : `<button class="btn btn-primary flash-reveal" id="reveal">نمایش پاسخ <span class="hint">Space</span></button>`}</div>`;
}

function actionsHtml(card) {
  if (!session.revealed) return '';
  const [again, hard, good, easy] = card.intervals ?? ['۱۰ دقیقه', 'فردا', '۲ روز', '۴ روز'];
  return `<div class="grade-bar"><button class="grade-btn again" data-grade="0"><span class="g-ico"></span><span class="g-t">یادم نبود</span><small>${ui.esc(again)}</small></button><button class="grade-btn hard" data-grade="3"><span class="g-ico"></span><span class="g-t">سخت بود</span><small>${ui.esc(hard)}</small></button><button class="grade-btn good" data-grade="4"><span class="g-ico"></span><span class="g-t">خوب</span><small>${ui.esc(good)}</small></button><button class="grade-btn easy" data-grade="5"><span class="g-ico"></span><span class="g-t">آسان</span><small>${ui.esc(easy)}</small></button></div><div class="grade-hint">با کلیدهای ۱ تا ۴ هم می‌توانی نمره بدهی</div>`;
}

function summaryHtml() {
  const done = session.results.length;
  const good = session.results.filter((r) => r.grade >= 3).length;
  const pct = done ? Math.round((good / done) * 100) : 0;
  const next = session.stats?.nextDueAt ? ui.faFullDate(new Date(session.stats.nextDueAt)) : '—';
  return `<div class="card card-pad review-done"><div class="done-emoji">${pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪'}</div><h2>مرور امروز تمام شد</h2><p class="done-sub">${ui.faNum(done)} کارت مرور شد • ${ui.faNum(good)} پاسخ درست (${ui.faNum(pct)}٪)</p><div class="done-grid"><div class="done-stat"><span class="v">${ui.faNum(session.stats?.due ?? 0)}</span><span class="l">کارت باقی‌مانده</span></div><div class="done-stat"><span class="v">${ui.faNum(session.stats?.learned ?? 0)}</span><span class="l">کارت آموخته‌شده</span></div><div class="done-stat"><span class="v">${ui.faNum(session.stats?.todayReviews ?? 0)}</span><span class="l">مرور امروز</span></div></div><div class="done-next">مرور بعدی: <strong>${ui.esc(next)}</strong></div><div class="done-actions">${(session.stats?.due ?? 0) > 0 ? '<button class="btn btn-primary" id="review-more">مرور کارت‌های بعدی</button>' : ''}<button class="btn" id="review-home">بازگشت به داشبورد</button><button class="btn btn-ghost" id="review-again">دوباره از ابتدا</button></div></div>`;
}

function emptyHtml(stats) {
  const next = stats?.nextDueAt ? ui.faFullDate(new Date(stats.nextDueAt)) : null;
  return `<div class="card card-pad empty"><span class="emoji">${stats?.total ? '✅' : '🗂️'}</span><h3>${stats?.total ? 'امروز چیزی برای مرور نیست' : 'هنوز کارتی نداری'}</h3><p>${stats?.total
        ? `همه‌ی کارت‌های امروز مرور شده‌اند.${next ? ` مرور بعدی: ${ui.esc(next)}` : ''}`
        : 'با ساختن تست برای هر فصل، سؤال‌هایش خودکار به کارت‌های مرور تبدیل می‌شود.'}</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:6px"><button class="btn btn-primary" id="review-library">رفتن به فصل‌ها و ساخت تست</button><button class="btn" id="review-home">داشبورد</button></div></div>`;
}

/* ---------- منطق ---------- */

async function load(limit) {
  const data = await api.review(limit);
  session.cards = data.cards ?? [];
  session.stats = data.stats ?? null;
  session.index = 0;
  session.revealed = false;
  session.finished = session.cards.length === 0;
  session.startedAt = Date.now();
  session.shownAt = Date.now();
  return data;
}

async function refreshStats() {
  try {
    const st = await api.state();
    session.stats = { ...(session.stats ?? {}), ...(st.review ?? {}) };
  } catch { /* بی‌اهمیت */ }
}

function paint(root, app) {
  if (session.finished) {
    root.innerHTML = summaryHtml();
    bindSummary(root, app);
    return;
  }
  if (!session.cards.length) {
    root.innerHTML = emptyHtml(session.stats);
    bindEmpty(root);
    return;
  }
  const card = session.cards[session.index];
  if (!card) {
    session.finished = true;
    paint(root, app);
    return;
  }
  root.innerHTML = `<div class="review-wrap">${header(session.stats)}
      ${cardHtml(card)}
      ${actionsHtml(card)}</div>`;
  bindCard(root, app);
}

async function grade(root, app, value) {
  const card = session.cards[session.index];
  if (!card || !session.revealed) return;
  session.revealed = false;
  const responseMs = Date.now() - session.shownAt;
  session.results.push({ key: card.key, grade: value, responseMs });
  session.index += 1;
  const finished = session.index >= session.cards.length;

  try {
    const res = await api.gradeCard(card.key, value, responseMs);
    if (res?.stats) session.stats = { ...(session.stats ?? {}), ...res.stats };
  } catch (err) {
    ui.toast(err.message, 'err');
  }

  if (finished) {
    await refreshStats();
    session.finished = true;
    paint(root, app);
  } else {
    session.shownAt = Date.now();
    paint(root, app);
  }
}

function bindKeys(root, app) {
  unbindKeys();
  session.keyHandler = (e) => {
    if (!document.getElementById('flashcard')) { unbindKeys(); return; }
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      if (!session.revealed) { session.revealed = true; paint(root, app); }
      return;
    }
    const map = { '1': 0, '2': 3, '3': 4, '4': 5 };
    if (map[e.key] !== undefined && session.revealed) {
      e.preventDefault();
      grade(root, app, map[e.key]);
    }
  };
  document.addEventListener('keydown', session.keyHandler);
}

function bindCard(root, app) {
  root.querySelector('#reveal')?.addEventListener('click', () => {
    session.revealed = true;
    paint(root, app);
  });
  root.querySelectorAll('[data-grade]').forEach((btn) => {
    btn.addEventListener('click', () => grade(root, app, Number(btn.dataset.grade)));
  });
  root.querySelector('#review-restart')?.addEventListener('click', async () => {
    resetSession(session.limit);
    await load(session.limit);
    paint(root, app);
  });
  bindKeys(root, app);
}

function bindSummary(root, app) {
  unbindKeys();
  root.querySelector('#review-more')?.addEventListener('click', async () => {
    resetSession(session.limit);
    await load(session.limit);
    paint(root, app);
  });
  root.querySelector('#review-again')?.addEventListener('click', async () => {
    resetSession(session.limit);
    await load(session.limit);
    paint(root, app);
  });
  root.querySelector('#review-home')?.addEventListener('click', () => { location.hash = '#/dashboard'; });
}

function bindEmpty(root) {
  unbindKeys();
  root.querySelector('#review-library')?.addEventListener('click', () => { location.hash = '#/library'; });
  root.querySelector('#review-home')?.addEventListener('click', () => { location.hash = '#/dashboard'; });
}

export async function reviewView(root, route, a) {
  const limit = Number(route.params?.get?.('limit')) || 20;

  if (!session.cards.length || session.finished) {
    resetSession(limit);
    root.innerHTML = '<div class="card card-pad"><div class="skeleton" style="height:120px"></div></div>';
    try {
      await load(limit);
    } catch (err) {
      unbindKeys();
      root.innerHTML = `<div class="card card-pad empty"><span class="emoji">⚠️</span><h3>کارت‌ها بارگذاری نشد</h3><p>${ui.esc(err.message)}</p></div>`;
      return;
    }
  }
  paint(root, a);
}
