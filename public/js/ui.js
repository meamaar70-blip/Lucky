// public/js/ui.js — ابزارهای رابط کاربری

export const DAYS = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

export function h(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (values[i] ?? ''), '');
}

export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function faNum(n) {
  return String(n ?? '').replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

export function faDate(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  } catch {
    return '';
  }
}

export function faDateTime(iso) {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'همین حالا';
  if (min < 60) return `${faNum(min)} دقیقه پیش`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${faNum(hr)} ساعت پیش`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${faNum(day)} روز پیش`;
  return faDateTime(iso);
}

export const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
};

export const tz = (mins) =>`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

export function duration(start, end) {
  const d = toMin(end) - toMin(start);
  const h = Math.floor(d / 60);
  const m = d % 60;
  return [h ? `${faNum(h)} ساعت` : '', m ? `${faNum(m)} دقیقه` : ''].filter(Boolean).join(' و ');
}

/* ---------------- توست ---------------- */
export function toast(message, type = '') {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .2s, transform .2s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 220);
  }, 3800);
}

/* ---------------- بنر یادآور ---------------- */
export function pushReminder({ key, title, body, actions = [], tone = 'class' }) {
  const root = document.getElementById('reminders');
  if (!root) return;
  if (root.querySelector(`[data-rk="${String(key).replace(/["\\]/g, '')}"]`)) return;
  const el = document.createElement('div');
  el.className = `reminder ${tone}`;
  el.dataset.rk = key;
  el.innerHTML = `<div class="reminder-icon">${tone === 'exam' ? '' : ''}</div><div class="reminder-body"><div class="reminder-title">${esc(title)}</div><div class="reminder-text">${esc(body)}</div><div class="reminder-actions">${actions.map((a, i) => a.href
          ? `<a class="btn btn-sm ${a.primary ? 'btn-primary' : ''}" href="${esc(a.href)}" ${a.href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${esc(a.label)}</a>`
          : `<button class="btn btn-sm" data-ack="${i}">${esc(a.label)}</button>`).join('')}</div></div><button class="reminder-x" aria-label="بستن">×</button>`;
  el.querySelector('.reminder-x').onclick = () => el.remove();
  el.querySelectorAll('[data-ack]').forEach((b) => { b.onclick = () => el.remove(); });
  root.appendChild(el);
  // حداکثر ۳ بنر هم‌زمان
  const all = root.querySelectorAll('.reminder');
  if (all.length > 3) all[0].remove();
}

/* ---------------- مودال ---------------- */
export function openModal({ title, body, footer = '', onMount, size }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" data-close="1"><div class="modal" role="dialog" aria-modal="true" ${size === 'lg' ? 'style="max-width:760px"' : ''}><div class="modal-head"><h3>${esc(title)}</h3><button class="close-x" data-close="1" aria-label="بستن">×</button></div><div class="modal-body">${body}</div>${footer ? `<div class="modal-foot">${footer}</div>` : ''}</div></div>`;

  const backdrop = root.firstElementChild;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  backdrop.addEventListener('click', (e) => {
    if (e.target.dataset.close) close();
  });
  root.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', close));

  if (onMount) onMount(root.querySelector('.modal'), close);
  return { root: root.querySelector('.modal'), close };
}

export function confirmDialog({ title = 'تأیید', message, okText = 'بله، انجام بده', danger = true }) {
  return new Promise((resolve) => {
    openModal({
      title,
      body: `<p style="line-height:2">${esc(message)}</p>`,
      footer: `<button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cf-ok">${esc(okText)}</button><button class="btn btn-ghost" id="cf-no">لغو</button>`,
      onMount(modal, close) {
        modal.querySelector('#cf-ok').onclick = () => { close(); resolve(true); };
        modal.querySelector('#cf-no').onclick = () => { close(); resolve(false); };
      },
    });
  });
}

/* ---------------- کمکی‌ها ---------------- */
export function initials(text = '') {
  const t = String(text).trim();
  return t ? t.slice(0, 1) : '؟';
}

export function weekToday() {
  return (new Date().getDay() + 1) % 7; // شنبه = ۰
}

export function classStatus(session) {
  const now = new Date();
  const day = weekToday();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (session.weekday !== day) return null;
  if (mins >= toMin(session.start) && mins < toMin(session.end)) return 'live';
  if (mins < toMin(session.start)) return 'later';
  return null;
}

/** نزدیک‌ترین کلاس آینده از بین همه‌ی جلسه‌ها */
export function nextClass(sessions) {
  if (!sessions.length) return null;
  const now = new Date();
  const day = weekToday();
  const mins = now.getHours() * 60 + now.getMinutes();
  let best = null;
  for (const s of sessions) {
    const live = s.weekday === day && mins >= toMin(s.start) && mins < toMin(s.end);
    let diffDay = (s.weekday - day + 7) % 7;
    let diffMin = toMin(s.start) - mins;
    if (diffDay === 0 && diffMin < 0) diffDay = 7;
    const total = live ? 0 : diffDay * 1440 + diffMin;
    if (!best || total < best.total) best = { session: s, total, live };
  }
  return best;
}

export function humanCountdown(totalMinutes) {
  if (totalMinutes <= 0) return 'همین حالا';
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  if (d > 0) return `${faNum(d)} روز و ${faNum(h)} ساعت دیگر`;
  if (h > 0) return `${faNum(h)} ساعت و ${faNum(m)} دقیقه دیگر`;
  return `${faNum(m)} دقیقه دیگر`;
}

export function faFullDate(date) {
  try {
    const wd = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' }).format(date);
    const rest = new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    return `${wd} ${rest}`;
  } catch {
    return '';
  }
}

export function faShortDate(date) {
  try {
    return new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'long' }).format(date);
  } catch {
    return '';
  }
}

export function todayISO(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function fileSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${faNum(mb.toFixed(1))} مگابایت` : `${faNum(Math.round(bytes / 1024))} کیلوبایت`;
}
