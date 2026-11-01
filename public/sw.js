// public/sw.js — Service Worker برای Lucky
//
// راهبرد:
//   • پوستهٔ برنامه (HTML/CSS/JS/فونت/آیکن) پیش‌کش می‌شود تا برنامه بدون اینترنت باز شود.
//   • ناوبری (باز کردن صفحه‌ها): اول شبکه، اگر نبود از کش.
//   • درخواست‌های GET مربوط به API: اول شبکه، در حالت آفلاین آخرین پاسخ کش‌شده.
//   • فایل‌های ثابت: از کش و هم‌زمان تازه‌سازی در پس‌زمینه (stale-while-revalidate).

const VERSION = 'lucky-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;

const SHELL = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/api.js',
  '/js/ui.js',
  '/js/forms.js',
  '/js/reminders.js',
  '/js/theme.js',
  '/js/views/dashboard.js',
  '/js/views/schedule.js',
  '/js/views/courses.js',
  '/js/views/chapter.js',
  '/js/views/review.js',
  '/js/views/exams.js',
  '/js/views/settings.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/icon.svg',
  '/fonts/vazirmatn-arabic-400-normal.woff2',
  '/fonts/vazirmatn-arabic-500-normal.woff2',
  '/fonts/vazirmatn-arabic-700-normal.woff2',
  '/fonts/vazirmatn-latin-400-normal.woff2',
  '/fonts/vazirmatn-latin-500-normal.woff2',
  '/fonts/vazirmatn-latin-700-normal.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // هر فایلی که نبود، نصب را خراب نکند
    await Promise.all(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/** پاسخ آفلاین برای درخواست‌های API */
function offlineJson() {
  return new Response(JSON.stringify({ error: 'آفلاین هستی؛ این کار به اینترنت نیاز دارد.' }), {
    status: 503,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // درخواست‌های تقویم/دانلود را دست نزن
  if (url.pathname.startsWith('/api/exports/') || url.pathname.endsWith('.ics')) return;

  // صفحه‌ها
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('/index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('/index.html')) ?? (await cache.match('/')) ?? new Response('آفلاین', { status: 503 });
      }
    })());
    return;
  }

  // API
  if (url.pathname.startsWith('/api/')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok && url.pathname === '/api/state') {
          const cache = await caches.open(DATA_CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        const cache = await caches.open(DATA_CACHE);
        const hit = await cache.match(request);
        return hit ?? offlineJson();
      }
    })());
    return;
  }

  // فایل‌های ثابت
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(request);
    const network = fetch(request)
      .then((res) => {
        if (res.ok) cache.put(request, res.clone()).catch(() => {});
        return res;
      })
      .catch(() => null);
    return hit ?? (await network) ?? new Response('', { status: 504 });
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
