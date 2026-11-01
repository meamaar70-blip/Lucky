// public/js/views/chapter.js — صفحه‌ی مطالعه‌ی یک فصل: خلاصه، تست، پاورپوینت، متن

import { api } from '../api.js';
import * as ui from '../ui.js';

const norm = (s) => String(s ?? '')
  .replace(/[\u064B-\u0652]/g, '')
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim().toLowerCase();

function shortCorrect(given, answer) {
  const g = norm(given);
  const a = norm(answer);
  if (!g) return false;
  if (g === a || g.includes(a) || a.includes(g)) return true;
  const gw = new Set(g.split(' ').filter((w) => w.length > 2));
  const aw = new Set(a.split(' ').filter((w) => w.length > 2));
  if (!gw.size || !aw.size) return false;
  let inter = 0;
  for (const w of gw) if (aw.has(w)) inter++;
  return inter / Math.min(gw.size, aw.size) >= 0.6;
}

export async function chapterView(root, route, app) {
  const data = await api.getChapter(route.id);
  const { chapter, book, course, stats } = data;

  let summary = data.artifacts.summary;
  let quiz = data.artifacts.quiz;
  let pptx = data.artifacts.pptx;
  let tab = ['summary', 'quiz', 'pptx', 'text'].includes(route.params.get('tab'))
    ? route.params.get('tab')
    : 'summary';

  const aiOn = app.data.ai.enabled;

  app.setHeader(
    chapter.title,
    `${course?.title ?? ''} • ${book.title} • صفحه ${ui.faNum(chapter.startPage)}–${ui.faNum(chapter.endPage)}`,
    `<a class="btn btn-sm" href="#/library?book=${book.id}">→ بازگشت به فصل‌ها</a>`,
  );

  /* ---------- قالب ---------- */
  root.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;background:linear-gradient(135deg,#f5f3ff,#eef2ff);border-color:#e0e7ff">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <div style="width:52px;height:52px;border-radius:15px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;display:grid;place-items:center;font-weight:800;font-size:18px">
          ${ui.faNum(chapter.order ?? 1)}
        </div>
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;font-size:16px">${ui.esc(chapter.title)}</div>
          <div style="font-size:12.5px;color:var(--muted);margin-top:2px">
            ${stats ? `${ui.faNum(stats.words)} کلمه • حدود ${ui.faNum(stats.minutes)} دقیقه مطالعه` : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${summary ? '<span class="badge badge-ok">خلاصه آماده</span>' : '<span class="badge">بدون خلاصه</span>'}
          ${quiz ? `<span class="badge badge-ok">${ui.faNum(quiz.questions.length)} سؤال</span>` : '<span class="badge">بدون تست</span>'}
          ${pptx ? '<span class="badge badge-brand">پاورپوینت ساخته شده</span>' : ''}
          <span class="badge ${aiOn ? 'badge-brand' : ''}">${aiOn ? '🤖 هوش مصنوعی متصل' : '⚙️ موتور محلی'}</span>
        </div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab" data-tab="summary">📝 خلاصه</button>
      <button class="tab" data-tab="quiz">✅ تست</button>
      <button class="tab" data-tab="pptx">📊 پاورپوینت</button>
      <button class="tab" data-tab="text">📖 متن فصل</button>
    </div>
    <div id="tab-body"></div>`;

  const tabBody = root.querySelector('#tab-body');

  root.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tab);
    t.onclick = () => {
      tab = t.dataset.tab;
      root.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
      history.replaceState(null, '', `#/chapter/${route.id}?tab=${tab}`);
      paint();
    };
  });

  function paint() {
    if (tab === 'summary') renderSummary();
    else if (tab === 'quiz') renderQuiz();
    else if (tab === 'pptx') renderPptx();
    else renderText();
  }

  /* ---------- خلاصه ---------- */
  function renderSummary() {
    const controls = `
      <div class="card card-pad" style="margin-bottom:16px">
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
          <div class="field" style="margin:0;flex:0 0 150px">
            <label>حجم خلاصه</label>
            <select class="select" id="sum-depth">
              <option value="short" ${summary?.depth === 'short' ? 'selected' : ''}>کوتاه (مرور سریع)</option>
              <option value="medium" ${!summary || summary.depth === 'medium' ? 'selected' : ''}>متوسط</option>
              <option value="long" ${summary?.depth === 'long' ? 'selected' : ''}>مفصل (امتحان)</option>
            </select>
          </div>
          <div class="field" style="margin:0;flex:0 0 190px">
            <label>موتور تولید</label>
            <select class="select" id="sum-engine">
              <option value="auto">خودکار (پیشنهادی)</option>
              <option value="local">موتور محلی</option>
              ${aiOn ? '<option value="ai">هوش مصنوعی</option>' : ''}
            </select>
          </div>
          <button class="btn btn-primary" id="sum-run" style="flex:0 0 auto">
            ${summary ? '🔄 ساخت دوباره' : '✨ ساخت خلاصه'}
          </button>
          ${summary ? `<button class="btn" id="sum-copy">کپی متن</button>
                       <button class="btn" id="sum-print">چاپ</button>` : ''}
        </div>
        <p class="hint" style="margin-top:12px">
          ${aiOn
            ? 'با هوش مصنوعی، خلاصه‌ی ساختاریافته با توضیح مفهوم‌ها ساخته می‌شود. اگر اتصال برقرار نشود، خودکار به موتور محلی برمی‌گردد.'
            : 'موتور محلی جمله‌های مهم فصل را بر اساس ساختار متن انتخاب می‌کند (بدون نیاز به اینترنت). برای خلاصه‌ی بازنویسی‌شده، هوش مصنوعی را در تنظیمات وصل کن.'}
        </p>
      </div>`;

    if (!summary) {
      tabBody.innerHTML = `${controls}
        <div class="card card-pad empty">
          <span class="emoji">🪄</span>
          <h3>هنوز خلاصه‌ای ساخته نشده</h3>
          <p>دکمه‌ی «ساخت خلاصه» را بزن؛ چند ثانیه بعد خلاصه، نکات کلیدی و اصطلاحات همین فصل را می‌بینی.</p>
        </div>`;
      bindSummaryControls();
      return;
    }

    const engineBadge = summary.engine === 'ai'
      ? '<span class="badge badge-brand">ساخته‌شده با هوش مصنوعی</span>'
      : '<span class="badge">موتور محلی</span>';

    tabBody.innerHTML = `
      ${controls}
      ${summary.sections?.length ? `
        <div class="card card-pad" style="margin-bottom:16px">
          <div class="section-head"><h2>نقشه‌ی فصل</h2>${engineBadge}</div>
          <div class="grid cols-2" style="gap:10px">
            ${summary.sections.map((s) => `
              <div style="border:1px solid var(--line);border-radius:12px;padding:12px 14px">
                <div style="font-weight:600;color:var(--brand);margin-bottom:4px">${ui.esc(s.title)}</div>
                <div style="font-size:13px;color:var(--ink-2);line-height:1.95">${ui.esc(s.body)}</div>
              </div>`).join('')}
          </div>
        </div>` : ''}
      <div class="card card-pad" style="margin-bottom:16px">
        <div class="section-head">
          <h2>📝 خلاصه‌ی فصل</h2>
          <div style="display:flex;gap:6px;align-items:center">${engineBadge}
            <span class="badge">${ui.faNum(summary.coverage ?? 0)}٪ از متن</span>
            <span class="badge">${ui.timeAgo(summary.createdAt)}</span>
          </div>
        </div>
        <p class="summary-text" id="sum-text">${ui.esc(summary.paragraph || '—')}</p>
      </div>

      ${summary.keyPoints?.length ? `
        <div class="card card-pad" style="margin-bottom:16px">
          <div class="section-head"><h2>⭐ نکات کلیدی</h2><span class="badge">${ui.faNum(summary.keyPoints.length)} نکته</span></div>
          <div class="points">
            ${summary.keyPoints.map((p, i) => `
              <div class="point">
                <div class="n">${ui.faNum(i + 1)}</div>
                <div style="font-size:13.5px;line-height:2">${ui.esc(typeof p === 'string' ? p : p.text)}
                  ${p.page ? `<span class="badge" style="margin-inline-start:6px">صفحه ${ui.faNum(p.page)}</span>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>` : ''}

      ${summary.terms?.length ? `
        <div class="card card-pad">
          <div class="section-head"><h2>🔑 اصطلاح‌های مهم</h2><span class="badge">${ui.faNum(summary.terms.length)} اصطلاح</span></div>
          ${summary.terms.map((t) => `
            <div class="term-row">
              <div class="k">${ui.esc(t.term)}</div>
              <div class="v">${ui.esc(t.context || t.definition || '—')}</div>
            </div>`).join('')}
        </div>` : ''}`;

    bindSummaryControls();
  }

  function bindSummaryControls() {
    const runBtn = tabBody.querySelector('#sum-run');
    const copyBtn = tabBody.querySelector('#sum-copy');
    const printBtn = tabBody.querySelector('#sum-print');

    runBtn.onclick = async () => {
      const depth = tabBody.querySelector('#sum-depth').value;
      const engine = tabBody.querySelector('#sum-engine').value;
      await app.busy(runBtn, async () => {
        try {
          const res = await api.makeSummary(chapter.id, { depth, engine });
          summary = res.summary;
          if (res.warning) ui.toast(res.warning, 'warn');
          else ui.toast('خلاصه ساخته شد', 'ok');
          await app.refresh();
          renderSummary();
        } catch (e) {
          ui.toast(e.message, 'err');
        }
      }, 'در حال خواندن فصل…');
    };

    if (copyBtn) copyBtn.onclick = async () => {
      const parts = [summary.paragraph, '', 'نکات کلیدی:', ...(summary.keyPoints ?? []).map((p, i) => `${i + 1}. ${p.text ?? p}`)];
      try {
        await navigator.clipboard.writeText(parts.join('\n'));
        ui.toast('خلاصه کپی شد', 'ok');
      } catch { ui.toast('کپی ممکن نشد', 'err'); }
    };
    if (printBtn) printBtn.onclick = () => window.print();
  }

  /* ---------- تست ---------- */
  let answers = {};
  let submitted = false;

  function renderQuiz() {
    if (!quiz) {
      tabBody.innerHTML = `
        <div class="card card-pad" style="margin-bottom:16px">
          <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
            <div class="field" style="margin:0;flex:0 0 160px">
              <label>تعداد سؤال</label>
              <select class="select" id="quiz-count">
                ${[5, 10, 15, 20].map((n) => `<option value="${n}" ${n === 10 ? 'selected' : ''}>${ui.faNum(n)} سؤال</option>`).join('')}
              </select>
            </div>
            <div class="field" style="margin:0;flex:0 0 190px">
              <label>موتور تولید</label>
              <select class="select" id="quiz-engine">
                <option value="auto">خودکار (پیشنهادی)</option>
                <option value="local">موتور محلی</option>
                ${aiOn ? '<option value="ai">هوش مصنوعی</option>' : ''}
              </select>
            </div>
            <button class="btn btn-primary" id="quiz-run">✅ ساخت تست</button>
          </div>
          <p class="hint" style="margin-top:12px">تست‌ها شامل چهارگزینه‌ای، درست/نادرست و پاسخ کوتاه هستند و از متن همین فصل ساخته می‌شوند.</p>
        </div>
        <div class="card card-pad empty">
          <span class="emoji">📝</span><h3>تستی ساخته نشده</h3>
          <p>بعد از مطالعه‌ی خلاصه، یک تست بساز تا میزان یادگیری‌ات مشخص شود.</p>
        </div>`;
      tabBody.querySelector('#quiz-run').onclick = async (e) => {
        const btn = e.currentTarget;
        const count = Number(tabBody.querySelector('#quiz-count').value);
        const engine = tabBody.querySelector('#quiz-engine').value;
        await app.busy(btn, async () => {
          try {
            const res = await api.makeQuiz(chapter.id, { count, engine });
            quiz = res.quiz;
            answers = {};
            submitted = false;
            if (res.warning) ui.toast(res.warning, 'warn');
            else ui.toast(`${ui.faNum(quiz.questions.length)} سؤال ساخته شد`, 'ok');
            await app.refresh();
            renderQuiz();
          } catch (err) { ui.toast(err.message, 'err'); }
        }, 'در حال ساخت تست…');
      };
      return;
    }

    const total = quiz.questions.length;
    const answered = quiz.questions.filter((q) => (q.type === 'short' ? (answers[q.id] ?? '').trim() : answers[q.id] !== undefined)).length;

    let correct = 0;
    if (submitted) {
      for (const q of quiz.questions) {
        const a = answers[q.id];
        if (q.type === 'short') { if (shortCorrect(a ?? '', q.answer)) correct++; }
        else if (a === q.answerIndex) correct++;
      }
    }
    const percent = submitted ? Math.round((correct / total) * 100) : 0;

    tabBody.innerHTML = `
      ${submitted ? `
        <div class="quiz-result">
          <div>
            <div class="score">${ui.faNum(percent)}٪</div>
            <div style="font-size:12.5px;color:var(--muted)">${ui.faNum(correct)} پاسخ درست از ${ui.faNum(total)}</div>
          </div>
          <div style="flex:1;font-size:13px;color:var(--ink-2)">
            ${percent >= 80 ? 'عالی بود! مطالب را خوب یاد گرفته‌ای. 👏'
              : percent >= 50 ? 'قابل قبول است؛ بخش‌های اشتباه را در خلاصه مرور کن.'
              : 'بهتر است خلاصه‌ی فصل را دوباره بخوانی و بعد آزمون را تکرار کنی.'}
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn" id="quiz-again">🔄 آزمون دوباره</button>
            <button class="btn btn-ghost" id="quiz-new">ساخت تست تازه</button>
          </div>
        </div>` : ''}

      <div class="card card-pad" style="margin-bottom:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span class="badge badge-brand">${ui.faNum(total)} سؤال</span>
        <span class="badge">${ui.faNum(quiz.meta?.mcq ?? 0)} چهارگزینه‌ای</span>
        <span class="badge">${ui.faNum(quiz.meta?.tf ?? 0)} درست/نادرست</span>
        <span class="badge">${ui.faNum(quiz.meta?.short ?? 0)} پاسخ کوتاه</span>
        <span class="badge">${quiz.meta?.engine === 'ai' ? '🤖 هوش مصنوعی' : '⚙️ موتور محلی'}</span>
        <div style="margin-inline-start:auto;font-size:12.5px;color:var(--muted)">
          ${submitted ? `پاسخ‌داده‌شده: ${ui.faNum(answered)} از ${ui.faNum(total)}` : `پاسخ‌داده‌شده: ${ui.faNum(answered)} از ${ui.faNum(total)}`}
        </div>
      </div>

      <div id="quiz-list">
        ${quiz.questions.map((q, i) => renderQuestion(q, i)).join('')}
      </div>

      ${submitted ? '' : `<button class="btn btn-primary btn-block" id="quiz-submit" style="margin-top:8px">
        پایان و مشاهده‌ی نتیجه
      </button>`}`;

    bindQuiz();
  }

  function renderQuestion(q, i) {
    const a = answers[q.id];
    const isCorrect = submitted && (q.type === 'short' ? shortCorrect(a ?? '', q.answer) : a === q.answerIndex);
    return `<div class="quiz-q" data-q="${q.id}">
      <div class="qhead">
        <div style="display:flex;gap:8px;align-items:center">
          <span class="badge badge-brand">سؤال ${ui.faNum(i + 1)}</span>
          <span class="badge">${q.type === 'mcq' ? 'چهارگزینه‌ای' : q.type === 'tf' ? 'درست/نادرست' : 'پاسخ کوتاه'}</span>
          <span class="badge">${ui.esc(q.difficulty ?? 'متوسط')}</span>
        </div>
        ${submitted ? `<span class="badge ${isCorrect ? 'badge-ok' : 'badge-danger'}">${isCorrect ? '✓ درست' : '✗ نادرست'}</span>` : ''}
      </div>
      <div class="qtext">${ui.esc(q.statement ?? '')}</div>
      ${q.type === 'short'
        ? `<input class="input" data-short="${q.id}" placeholder="پاسخ کوتاه…" value="${ui.esc(a ?? '')}" ${submitted ? 'disabled' : ''} />
           ${submitted ? `<div class="explain">پاسخ درست: <strong>${ui.esc(q.answer)}</strong>${q.explanation ? ` — ${ui.esc(q.explanation)}` : ''}</div>` : ''}`
        : (q.options ?? []).map((opt, oi) => {
            let cls = 'opt';
            if (submitted) {
              if (oi === q.answerIndex) cls += ' correct';
              else if (a === oi) cls += ' wrong';
            } else if (a === oi) cls += ' sel';
            return `<div class="${cls}" data-opt="${oi}" data-qid="${q.id}">
              <span class="key">${ui.faNum(oi + 1)}</span>
              <span>${ui.esc(opt)}</span>
            </div>`;
          }).join('')}
      ${submitted && q.type !== 'short' && q.explanation ? `<div class="explain">💡 ${ui.esc(q.explanation)}</div>` : ''}
    </div>`;
  }

  function bindQuiz() {
    tabBody.querySelectorAll('.opt').forEach((el) => {
      if (submitted) return;
      el.onclick = () => {
        const qid = el.dataset.qid;
        answers[qid] = Number(el.dataset.opt);
        const card = el.closest('.quiz-q');
        card.querySelectorAll('.opt').forEach((o) => o.classList.remove('sel'));
        el.classList.add('sel');
      };
    });

    tabBody.querySelectorAll('[data-short]').forEach((inp) => {
      inp.oninput = () => { answers[inp.dataset.short] = inp.value; };
    });

    const submitBtn = tabBody.querySelector('#quiz-submit');
    if (submitBtn) submitBtn.onclick = async () => {
      submitted = true;
      renderQuiz();
      let correctCount = 0;
      for (const q of quiz.questions) {
        const a = answers[q.id];
        if (q.type === 'short') { if (shortCorrect(a ?? '', q.answer)) correctCount++; }
        else if (a === q.answerIndex) correctCount++;
      }
      try {
        await api.saveAttempt(chapter.id, { score: correctCount, total: quiz.questions.length });
        await app.refresh();
      } catch { /* بی‌اهمیت */ }
      window.scrollTo({ top: 120, behavior: 'smooth' });
    };

    const again = tabBody.querySelector('#quiz-again');
    if (again) again.onclick = () => { answers = {}; submitted = false; renderQuiz(); };
    const fresh = tabBody.querySelector('#quiz-new');
    if (fresh) fresh.onclick = async () => {
      await app.busy(fresh, async () => {
        try {
          const res = await api.makeQuiz(chapter.id, { count: quiz.questions.length });
          quiz = res.quiz; answers = {}; submitted = false;
          await app.refresh();
          renderQuiz();
          ui.toast('تست جدید ساخته شد', 'ok');
        } catch (e) { ui.toast(e.message, 'err'); }
      }, 'در حال ساخت…');
    };
  }

  /* ---------- پاورپوینت ---------- */
  function renderPptx() {
    const parts = [
      ['جلد ارائه', '📕'],
      ['نقشه‌ی فصل', '🗺️'],
      ['نکات کلیدی', `⭐ ${ui.faNum(summary?.keyPoints?.length ?? 0)}`],
      ['اصطلاحات', `🔑 ${ui.faNum(summary?.terms?.length ?? 0)}`],
      ['خلاصه', '📝'],
      ['پرسش‌های مرور', quiz ? `✅ ${ui.faNum(Math.min(8, quiz.questions.length))}` : '—'],
    ];

    tabBody.innerHTML = `
      <div class="grid cols-2" style="align-items:start">
        <div class="card card-pad">
          <div class="section-head"><h2>📊 ساخت پاورپوینت</h2></div>
          <p style="font-size:13.5px;color:var(--ink-2);line-height:2">
            یک فایل <code>.pptx</code> راست‌به‌چپ و آماده‌ی ارائه ساخته می‌شود؛ از روی خلاصه و تست همین فصل.
            ${summary ? '' : 'ابتدا باید خلاصه‌ی فصل ساخته شود.'}
          </p>
          <div style="margin:14px 0">
            ${parts.map(([k, ico]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--line);font-size:13px">
              <span>${ico} ${k}</span>
            </div>`).join('')}
          </div>
          <button class="btn btn-primary btn-block" id="pptx-run">
            ${pptx ? '🔄 ساخت دوباره‌ی فایل' : '📊 ساخت فایل پاورپوینت'}
          </button>
          ${pptx ? `
            <div class="card card-pad" style="margin-top:14px;background:var(--accent-soft);border-color:#99f6e4">
              <div style="font-weight:600;margin-bottom:4px">آخرین فایل ساخته‌شده</div>
              <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">
                ${ui.faNum(pptx.slides)} اسلاید • ${ui.timeAgo(pptx.createdAt)}
              </div>
              <a class="btn btn-primary btn-block" href="${pptx.url}">⬇️ دانلود فایل PPTX</a>
            </div>` : ''}
        </div>
        <div class="card card-pad">
          <div class="section-head"><h2>پیش‌نمایش محتوا</h2></div>
          <div style="font-size:13px;line-height:2;color:var(--ink-2)">
            <strong>عنوان:</strong> ${ui.esc(chapter.title)}<br>
            <strong>درس:</strong> ${ui.esc(course?.title ?? '')}<br>
            <strong>نکات کلیدی:</strong>
            <ul style="margin:6px 0;padding-inline-start:18px">
              ${(summary?.keyPoints ?? []).slice(0, 4).map((p) => `<li>${ui.esc((p.text ?? p).slice(0, 90))}…</li>`).join('') || '<li>—</li>'}
            </ul>
            ${quiz ? `<strong>نمونه پرسش:</strong> ${ui.esc((quiz.questions[0]?.statement ?? '').slice(0, 110))}…` : ''}
          </div>
          <p class="hint" style="margin-top:12px">فونت فایل Tahoma است تا در همه‌ی نسخه‌های PowerPoint درست نمایش داده شود.</p>
        </div>
      </div>`;

    tabBody.querySelector('#pptx-run').onclick = async (e) => {
      const btn = e.currentTarget;
      await app.busy(btn, async () => {
        try {
          if (!summary) {
            const res = await api.makeSummary(chapter.id, { depth: 'medium', engine: 'auto' });
            summary = res.summary;
          }
          const out = await api.makePptx(chapter.id);
          pptx = out;
          await app.refresh();
          renderPptx();
          ui.toast(`پاورپوینت با ${ui.faNum(out.slides)} اسلاید ساخته شد`, 'ok');
          window.open(out.url, '_blank');
        } catch (err) { ui.toast(err.message, 'err'); }
      }, 'در حال ساخت پاورپوینت…');
    };
  }

  /* ---------- متن فصل ---------- */
  let fullText = null;
  async function renderText() {
    tabBody.innerHTML = `<div class="card card-pad"><div class="skeleton" style="height:160px"></div></div>`;
    try {
      if (!fullText) {
        const res = await fetch(`/api/chapters/${chapter.id}/text`).then((r) => r.json());
        fullText = res.text ?? '';
      }
    } catch {
      fullText = '';
    }
    const clean = ui.faNum(fullText.replace(/\[\[صفحه ([^\]]+)\]\]/g, '\n\n— صفحه $1 —\n'));
    tabBody.innerHTML = `
      <div class="card card-pad">
        <div class="section-head"><h2>📖 متن استخراج‌شده</h2>
          <span class="badge">${ui.faNum(stats?.words ?? 0)} کلمه</span>
        </div>
        <div style="white-space:pre-wrap;font-size:13.5px;line-height:2.1;color:var(--ink-2);max-height:70vh;overflow:auto">${ui.esc(clean)}</div>
      </div>`;
  }

  paint();
}
