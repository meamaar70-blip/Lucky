// public/js/views/settings.js

import { api } from '../api.js';
import * as ui from '../ui.js';
import { permissionState, ensurePermission, sendTestReminder, nextExam } from '../reminders.js';

const PRESETS = [
  { label: 'OpenAI', url: 'https://api.openai.com', model: 'gpt-4o-mini' },
  { label: 'OpenRouter', url: 'https://openrouter.ai/api', model: 'openai/gpt-4o-mini' },
  { label: 'Groq', url: 'https://api.groq.com/openai', model: 'llama-3.3-70b-versatile' },
  { label: 'Ollama (محلی)', url: 'http://localhost:11434', model: 'llama3.1' },
];

export async function settingsView(root, route, app) {
  app.setHeader('تنظیمات', 'مشخصات، اتصال هوش مصنوعی و داده‌ها');
  const d = app.data;

  root.innerHTML = `
    <div class="grid cols-2" style="align-items:start">
      <div class="card card-pad">
        <div class="section-head"><h2>👤 مشخصات من</h2></div>
        <div class="field">
          <label>نام و نام خانوادگی</label>
          <input class="input" id="p-name" maxlength="80" value="${ui.esc(d.profile.name)}" placeholder="مثلاً: سارا محمدی" />
        </div>
        <div class="row">
          <div class="field">
            <label>دانشگاه</label>
            <input class="input" id="p-uni" maxlength="80" value="${ui.esc(d.profile.university)}" placeholder="دانشگاه …" />
          </div>
          <div class="field">
            <label>رشته</label>
            <input class="input" id="p-field" maxlength="80" value="${ui.esc(d.profile.field)}" placeholder="رشته‌ی تحصیلی" />
          </div>
        </div>
        <div class="field">
          <label>ترم</label>
          <input class="input" id="p-term" maxlength="80" value="${ui.esc(d.profile.term)}" placeholder="مثلاً: نیم‌سال اول ۱۴۰۴-۱۴۰۵" />
        </div>
        <button class="btn btn-primary" id="p-save">ذخیره‌ی مشخصات</button>
        <p class="hint" style="margin-top:12px">این اطلاعات روی جلد پاورپوینت و در داشبورد استفاده می‌شود.</p>
      </div>

      <div class="card card-pad">
        <div class="section-head">
          <h2>🤖 هوش مصنوعی (اختیاری)</h2>
          <span class="badge ${d.ai.enabled ? 'badge-ok' : ''}">${d.ai.enabled ? 'متصل' : 'تنظیم نشده'}</span>
        </div>
        <p style="font-size:13px;color:var(--ink-2);line-height:2;margin-bottom:12px">
          بدون این بخش هم همه‌چیز کار می‌کند (خلاصه و تست با موتور محلی ساخته می‌شوند).
          اگر سرویس سازگار با OpenAI داری، این‌جا وصل کن تا خلاصه‌ها بازنویسی‌شده و تست‌ها مفهومی‌تر شوند.
        </p>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
          ${PRESETS.map((p) => `<button class="btn btn-sm preset" data-url="${p.url}" data-model="${p.model}">${p.label}</button>`).join('')}
        </div>
        <div class="field">
          <label>آدرس سرویس (Base URL)</label>
          <input class="input" id="ai-url" dir="ltr" placeholder="https://api.openai.com" value="${ui.esc(d.ai.baseUrl)}" />
        </div>
        <div class="field">
          <label>نام مدل</label>
          <input class="input" id="ai-model" dir="ltr" placeholder="gpt-4o-mini" value="${ui.esc(d.ai.model)}" />
        </div>
        <div class="field">
          <label>کلید API</label>
          <input class="input" id="ai-key" dir="ltr" type="password"
            placeholder="${d.ai.hasKey ? '•••••••• (ذخیره شده — برای تغییر مقدار جدید بنویس)' : 'sk-…'}" />
          <span class="note">کلید فقط روی همین سرور ذخیره می‌شود و در پاسخ‌ها نمایش داده نمی‌شود.</span>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" id="ai-save">ذخیره</button>
          <button class="btn" id="ai-test">تست اتصال</button>
          <button class="btn btn-ghost" id="ai-clear">حذف تنظیمات</button>
        </div>
        <p id="ai-result" style="font-size:12.5px;margin-top:10px"></p>
      </div>

      <div class="card card-pad">
        <div class="section-head">
          <h2>🔔 یادآور کلاس و آزمون</h2>
          <span class="badge ${d.reminders?.enabled ? 'badge-ok' : 'badge-danger'}">${d.reminders?.enabled ? 'فعال' : 'خاموش'}</span>
        </div>
        <label class="switch-row">
          <input type="checkbox" id="r-enabled" ${d.reminders?.enabled ? 'checked' : ''} />
          <span>یادآوری فعال باشد</span>
        </label>
        <label class="switch-row">
          <input type="checkbox" id="r-browser" ${d.reminders?.browser ? 'checked' : ''} />
          <span>اعلان مرورگر (حتی وقتی تب در پس‌زمینه است)</span>
        </label>
        <label class="switch-row">
          <input type="checkbox" id="r-sound" ${d.reminders?.sound ? 'checked' : ''} />
          <span>صدای هشدار</span>
        </label>
        <div class="row" style="margin-top:10px">
          <div class="field">
            <label>یادآوری کلاس</label>
            <select class="select" id="r-class">
              ${[0, 5, 10, 15, 20, 30, 45, 60].map((m) => `<option value="${m}" ${Number(d.reminders?.classLead) === m ? 'selected' : ''}>${m === 0 ? 'بدون یادآوری' : `${ui.faNum(m)} دقیقه قبل`}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>یادآوری آزمون</label>
            <select class="select" id="r-exam">
              ${[0, 30, 120, 720, 1440, 2880, 4320].map((m) => `<option value="${m}" ${Number(d.reminders?.examLead) === m ? 'selected' : ''}>${m === 0 ? 'بدون یادآوری' : m >= 1440 ? `${ui.faNum(m / 1440)} روز قبل` : m >= 60 ? `${ui.faNum(m / 60)} ساعت قبل` : `${ui.faNum(m)} دقیقه قبل`}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
          <button class="btn btn-primary" id="r-save">ذخیره‌ی تنظیمات</button>
          <button class="btn" id="r-perm">${permissionState() === 'granted' ? '🔔 اعلان مجاز است' : '🔔 فعال‌سازی اعلان مرورگر'}</button>
          <button class="btn" id="r-test">تست یادآور</button>
        </div>
        <p class="hint" style="margin-top:12px">
          یادآورها در همین مرورگر اجرا می‌شوند و تا وقتی Lucky در یک تب باز است کار می‌کنند.
          برای یادآوری روی گوشی، از <a href="/api/calendar.ics">خروجی تقویم (ICS)</a> استفاده کن؛ کلاس‌ها و آزمون‌ها با هشدار داخل تقویم ثبت می‌شوند.
        </p>
      </div>

      <div class="card card-pad">
        <div class="section-head"><h2>📊 داده‌های من</h2></div>
        <div class="grid cols-2" style="gap:10px">
          <div class="stat" style="padding:10px 0"><div class="icon">📚</div><div><div class="value">${ui.faNum(d.courses.length)}</div><div class="label">درس</div></div></div>
          <div class="stat" style="padding:10px 0"><div class="icon">🗓️</div><div><div class="value">${ui.faNum(d.sessions.length)}</div><div class="label">جلسه</div></div></div>
          <div class="stat" style="padding:10px 0"><div class="icon">📄</div><div><div class="value">${ui.faNum(d.books.length)}</div><div class="label">کتاب</div></div></div>
          <div class="stat" style="padding:10px 0"><div class="icon">✅</div><div><div class="value">${ui.faNum(d.attempts.length)}</div><div class="label">آزمون داده‌شده</div></div></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
          <a class="btn btn-sm" href="/api/calendar.ics">📅 خروجی تقویم</a>
          <a class="btn btn-sm" href="/api/calendar.ics">📥 خروجی تقویم</a>
          <a class="btn btn-sm" href="#/library">📑 رفتن به فصل‌ها</a>
        </div>
        <p class="hint" style="margin-top:12px">همه‌ی داده‌ها در پوشه‌ی <code>data/</code> روی همین سرور ذخیره می‌شوند (فایل <code>db.json</code> و پوشه‌های uploads و exports).</p>
      </div>

      <div class="card card-pad">
        <div class="section-head"><h2>ℹ️ درباره‌ی Lucky</h2></div>
        <p style="font-size:13px;color:var(--ink-2);line-height:2">
          Lucky برنامه‌ی کلاسی دانشجو را ثبت می‌کند، PDF کتاب هر درس را می‌خواند، فصل‌ها را خودکار تشخیص می‌دهد و برای هر فصل
          <strong>خلاصه</strong>، <strong>تست تعاملی</strong> و <strong>پاورپوینت</strong> می‌سازد.
        </p>
        <ul style="font-size:13px;color:var(--ink-2);line-height:2.1;padding-inline-start:18px">
          <li>موتور محلی: انتخاب جمله‌های مهم بر اساس وزن واژه‌ها و ساختار متن فارسی.</li>
          <li>موتور هوش مصنوعی: بازنویسی خلاصه، تعریف اصطلاحات و طراحی سؤال مفهومی.</li>
          <li>پاورپوینت با چیدمان راست‌به‌چپ و فونت Tahoma ساخته می‌شود.</li>
        </ul>
        <p class="hint">نسخه ۱.۰ — ساخته‌شده برای مطالعه‌ی سریع‌تر و منظم‌تر</p>
      </div>
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
        resultEl.innerHTML = '<span style="color:#0f766e">✓ تنظیمات ذخیره شد</span>';
        ui.toast('تنظیمات هوش مصنوعی ذخیره شد', 'ok');
        settingsView(root, route, app);
      } catch (err) {
        resultEl.innerHTML = `<span style="color:#b91c1c">${ui.esc(err.message)}</span>`;
      }
    }, 'در حال ذخیره…');
  };

  root.querySelector('#ai-test').onclick = async (e) => {
    const btn = e.currentTarget;
    resultEl.innerHTML = '';
    await app.busy(btn, async () => {
      try {
        const out = await api.testAi();
        resultEl.innerHTML = `<span style="color:#0f766e">✓ اتصال برقرار است — پاسخ: ${ui.esc(out.message ?? 'ok')}</span>`;
      } catch (err) {
        resultEl.innerHTML = `<span style="color:#b91c1c">✗ ${ui.esc(err.message)}</span>`;
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
