// public/js/pwa.js — ثبت Service Worker و دکمهٔ «نصب برنامه»

let deferredPrompt = null;

/** آیا برنامه به‌صورت نصب‌شده باز شده است؟ */
export function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
}

function showInstallButton(show) {
  const btn = document.getElementById('install-btn');
  if (!btn) return;
  btn.hidden = !show;
}

/** نصب برنامه (اگر مرورگر پشتیبانی کند) */
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
  deferredPrompt = null;
  showInstallButton(false);
  return outcome;
}

export function initPWA() {
  /* ثبت Service Worker */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* ثبت نشد — برنامه بدون آفلاین کار می‌کند */
      });
    });
  }

  /* دکمهٔ نصب */
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton(!isStandalone());
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    showInstallButton(false);
  });

  showInstallButton(false);

  if (isStandalone()) document.documentElement.dataset.standalone = 'true';

  return { isStandalone };
}
