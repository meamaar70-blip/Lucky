// public/js/views/settings.js — تنظیمات (نمای ساده و کم‌حجم)

import { api } from '../api.js';
import * as ui from '../ui.js';
import { permissionState, ensurePermission, sendTestReminder } from '../reminders.js';
import { THEMES, getPref, setTheme } from '../theme.js';

const PRESETS = [
  { label: 'OpenAI', url: 'https://api.openai.com', model: 'gpt-4o-mini' },
  { label: 'OpenRouter', url: 'https://openrouter.ai/api', model: 'openai/gpt-4o-mini' },
  { label: 'Groq', url: 'https://api.groq.com/openai', model: 'llama-3.3-70b-versatile' },
  { label: 'Ollama', url: 'http://localhost:11434', model: 'llama3.1' },
];

export async function settingsView(root, route, app) {
  app.setHeader('تنظیمات', 'مشخصات، ظاهر، یادآورها و هوش مصنوعی');
  const d = app.data;
  const perm = permissionState();

  root.innerHTML = `
    <div class="settings-wrap">

      <!-- مشخصات -->
      <section class="card card-pad">
        <div class="section-head"><h2>مشخصات</h2></div>
        <div class="field">
          <label class="label">نام و نام خانوادگی</label>
          <input class="input" id="p-name" maxlength="80" value="${ui.esc(d.profile.name)}" placeholder="مثلاً سارا محمدی" />
        </div>
        <div class="row">
          <div class="field">
            <label class="label">دانشگاه</label>
            <input class="input" id="p-uni" maxlength="80" value="${ui.esc(d.profile.university)}" placeholder="دانشگاه" />
          </div>
          <div class="field">
            <label class="label">رشته</label>
            <input class="input" id="p-field" maxlength="80" value="${ui.esc(d.profile.field)}" placeholder="رشته" />
          </div>
        </div>
        <div class="field">
          <label class="label">ترم</label>
          <input class="input" id="p-term" maxlength="80" value="${ui.esc(d.profile.term)}" placeholder="نیم‌سال اول ۱۴۰۴" />
        </div>
        <button class="btn btn-primary" id="p-save">ذخیره</button>
        <p class="hint" style="margin-top:10px">روی جلد پاورپوینت و کارت اکانت استفاده می‌شود.</p>
      </section>

      <!-- ظاهر -->
      <section class="card card-pad">
        <div class="section-head">
          <h2>ظاهر</h2>
          <span class="badge">${THEMES.find((t) => t.key === getPref())?.label ?? 'سیستم'}</span>
        </div>
        <div class="theme-choice">
          ${THEMES.map((t) => `<button data-theme-choice="${t.key}" class="${getPref() === t.key ? 'active' : ''}"><span class="ico">${t.icon}</span>${t.label}</button>`).join('')}
        </div>
        <p class="hint" style="margin-top:10px">در همین مرورگر ذخیره می‌شود؛ «هم‌پایه‌ی سیستم» با تنظیمات سیستم‌عامل هماهنگ است.</p>
      </section>

      <!-- یادآورها -->
      <section class="card card-pad">
        <div class="section-head">
          <h2>یادآورها</h2>
          <span class="badge ${d.reminders?.enabled ? 'badge-ok' : 'badge-danger'}">${d.reminders?.enabled ? 'فعال' : 'خاموش'}</span>
        </div>

        <label class="switch-row">
          <span><span class="t">یادآوری فعال باشد</span></span>
          <input type="checkbox" id="r-enabled" ${d.reminders?.enabled ? 'checked' : ''} />
        </label>
        <label class="switch-row">
          <span><span class="t">اعلان مرورگر</span><span class="sub">حتی وقتی تب در پس‌زمینه است</span></span>
          <input type="checkbox" id="r-browser" ${d.reminders?.browser ? 'checked' : ''} />
        </label>
        <label class="switch-row">
          <span><span class="t">صدای هشدار</span></span>
          <input type="checkbox" id="r-sound" ${d.reminders?.sound ? 'checked' : ''} />
        </label>

        <div class="row" style="margin-top:12px">
          <div class="field">
            <label class="label">یادآوری کلاس</label>
            <select class="select" id="r-class">
              ${[0, 5, 10, 15, 20, 30, 45, 60].map((m) => `<option value="${m}" ${Number(d.reminders?.classLead) === m ? 'selected' : ''}>${m === 0 ? 'بدون یادآوری' : `${ui.faNum(m)} دقیقه قبل`}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="label">یادآوری آزمون</label>
            <select class="select" id="r-exam">
              ${[0, 30, 120, 720, 1440, 2880, 4320].map((m) => `<option value="${m}" ${Number(d.reminders?.examLead) === m ? 'selected' : ''}>${m === 0 ? 'بدون یادآوری' : m >= 1440 ? `${ui.faNum(m / 1440)} روز قبل` : m >= 60 ? `${ui.faNum(m / 60)} ساعت قبل` : `${ui.faNum(m)} دقیقه قبل`}</option>`).join('')}
            </select>
          </div>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:2px">
          <button class="btn btn-primary" id="r-save">ذخیره</button>
          <button class="btn" id="r-perm">${perm === 'granted' ? 'اعلان مجاز است' : 'فعال‌سازی اعلان'}</button>
          <button class="btn btn-ghost" id="r-test">تست یادآور</button>
        </div>
        <p class="hint" style="margin-top:10px">یادآورها تا وقتی Lucky در یک تب باز است کار می‌کنند. برای یادآوری روی گوشی از
          <a href="/api/calendar.ics">خروجی تقویم</a> استفاده کن.</p>
      </section>

      <!-- هوش مصنوعی -->
      <details class="card card-pad acc">
        <summary>
          <span>هوش مصنوعی <span class="meta">(اختیاری)</span></span>
          <span class="badge ${d.ai.enabled ? 'badge-ok' : ''}">${d.ai.enabled ? 'متصل' : 'تنظیم نشده'}</span>
        </summary>
        <div class="acc-body">
          <p class="hint" style="margin-bottom:12px">بدون این بخش هم همه‌چیز کار می‌کند. اگر سرویس سازگار با OpenAI داری، وصل کن تا خلاصه‌ها و تست‌ها بهتر شوند.</p>
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:12px">
            ${PRESETS.map((p) => `<button class="btn btn-sm preset" data-url="${p.url}" data-model="${p.model}">${p.label}</button>`).join('')}
          </div>
          <div class="field">
            <label class="label">آدرس سرویس</label>
            <input class="input" id="ai-url" dir="ltr" placeholder="https://api.openai.com" value="${ui.esc(d.ai.baseUrl)}" />
          </div>
          <div class="field">
            <label class="label">مدل</label>
            <input class="input" id="ai-model" dir="ltr" placeholder="gpt-4o-mini" value="${ui.esc(d.ai.model)}" />
          </div>
          <div class="field">
            <label class="label">کلید API</label>
            <input class="input" id="ai-key" dir="ltr" type="password"
              placeholder="${d.ai.hasKey ? '•••••••• (ذخیره شده)' : 'sk-…'}" />
            <span class="meta">کلید فقط روی همین سرور ذخیره می‌شود.</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-primary" id="ai-save">ذخیره</button>
            <button class="btn" id="ai-test">تست اتصال</button>
            <button class="btn btn-ghost" id="ai-clear">حذف</button>
          </div>
          <p id="ai-result" class="meta" style="margin-top:8px"></p>
        </div>
      </details>

      <!-- داده‌ها -->
      <section class="card card-pad">
        <div class="section-head"><h2>داده‌ها</h2></div>
        <div class="data-line">
          <span>${ui.faNum(d.courses.length)} درس</span>
          <span>${ui.faNum(d.sessions.length)} جلسه</span>
          <span>${ui.faNum(d.books.length)} کتاب</span>
          <span>${ui.faNum(d.review?.total ?? 0)} کارت مرور</span>
          <span>${ui.faNum(d.attempts.length)} آزمون داده‌شده</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
          <a class="btn btn-sm" href="/api/calendar.ics">خروجی تقویم</a>
          <a class="btn btn-sm" href="#/library">رفتن به فصل‌ها</a>
        </div>
        <p class="hint" style="margin-top:10px">داده‌ها در پوشه‌ی <code>data/</code> روی همین سرور ذخیره می‌شوند.</p>
      </section>

      <p class="hint" style="text-align:center;padding:4px 0">Lucky — نسخه ۱.۰</p>
    </div>`;

  /* مشخصات */
  root.querySelector('#p-save').onclick = async (e) => {
    const btn = e.currentTarget;
    await app.busy(btn, async () => {
      try {
        await api.saveProfile({
          name: root.querySelector('#p-name').value.trim(),
          university: root.querySelector('#p-uni').value.trim(),
          field: root.querySelector('#p-field').value.trim(),
          term: root.querySelector('#p-term').value.trim(),
        });
        await app.refresh();
        ui.toast('مشخصات ذخیره شد', 'ok');
      } catch (err) { ui.toast(err.message, 'err'); }
    }, 'در حال ذخیره…');
  };

  /* تم */
  root.querySelectorAll('[data-theme-choice]').forEach((b) => {
    b.onclick = () => {
      setTheme(b.dataset.themeChoice);
      ui.toast(`تم «${THEMES.find((t) => t.key === b.dataset.themeChoice)?.label}» اعمال شد`, 'ok');
      settingsView(root, route, app);
    };
  });

  /* یادآورها */
  const pick = (id) => root.querySelector(id);
  pick('#r-save').onclick = async (e) => {
    const btn = e.currentTarget;
    await app.busy(btn, async () => {
      try {
        await api.saveReminders({
          enabled: pick('#r-enabled').checked,
          browser: pick('#r-browser').checked,
          sound: pick('#r-sound').checked,
          classLead: Number(pick('#r-class').value),
          examLead: Number(pick('#r-exam').value),
        });
        await app.refresh();
        ui.toast('تنظیمات یادآور ذخیره شد', 'ok');
        settingsView(root, route, app);
      } catch (err) { ui.toast(err.message, 'err'); }
    }, 'در حال ذخیره…');
  };

  pick('#r-perm').onclick = async () => {
    const state = await ensurePermission();
    if (state === 'granted') ui.toast('اعلان مرورگر فعال شد', 'ok');
    else if (state === 'denied') ui.toast('مرورگر اجازه‌ی اعلان را رد کرده است', 'warn');
    else ui.toast('این مرورگر از اعلان پشتیبانی نمی‌کند', 'warn');
    settingsView(root, route, app);
  };

  pick('#r-test').onclick = () => {
    sendTestReminder({ sound: pick('#r-sound').checked });
  };

  /* هوش مصنوعی */
  root.querySelectorAll('.preset').forEach((b) => {
    b.onclick = () => {
      root.querySelector('#ai-url').value = b.dataset.url;
      root.querySelector('#ai-model').value = b.dataset.model;
    };
  });

  const resultEl = root.querySelector('#ai-result');
  root.querySelector('#ai-save').onclick = async (e) => {
    const btn = e.currentTarget;
    const keyInput = root.querySelector('#ai-key');
    await app.busy(btn, async () => {
      try {
        const payload = {
          baseUrl: root.querySelector('#ai-url').value.trim(),
          model: root.querySelector('#ai-model').value.trim(),
        };
        if (keyInput.value.trim()) payload.apiKey = keyInput.value.trim();
        await api.saveAi(payload);
        keyInput.value = '';
        await app.refresh();
        resultEl.textContent = 'تنظیمات ذخیره شد';
        ui.toast('تنظیمات هوش مصنوعی ذخیره شد', 'ok');
        settingsView(root, route, app);
      } catch (err) {
        resultEl.textContent = err.message;
      }
    }, 'در حال ذخیره…');
  };

  root.querySelector('#ai-test').onclick = async (e) => {
    const btn = e.currentTarget;
    resultEl.textContent = '';
    await app.busy(btn, async () => {
      try {
        const out = await api.testAi();
        resultEl.textContent = `اتصال برقرار است — ${out.message ?? 'ok'}`;
      } catch (err) {
        resultEl.textContent = err.message;
      }
    }, 'در حال تست…');
  };

  root.querySelector('#ai-clear').onclick = async () => {
    const ok = await ui.confirmDialog({ message: 'تنظیمات هوش مصنوعی (آدرس، مدل و کلید) پاک شود؟', okText: 'پاک کن' });
    if (!ok) return;
    try {
      await api.saveAi({ baseUrl: '', model: '', apiKey: '' });
      await app.refresh();
      ui.toast('تنظیمات پاک شد', 'ok');
      settingsView(root, route, app);
    } catch (err) { ui.toast(err.message, 'err'); }
  };
}
