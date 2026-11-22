// ========================================
// ANDROID APP UPDATES
// "npm run mobile:prepare" adds this script to every page of the app, with the
// build number of these pages (data-build). The website never loads it.
//
// On start-up, and whenever the app comes back to the screen, it asks the
// server (/api/app/android) for the latest versions:
// - Pages (live update): a newer bundle is downloaded in the background with
//   @capgo/capacitor-updater and used from the next start. Without internet the
//   app keeps working with the pages it already has.
// - APK: changes to native parts (icon, permissions, plugins) need a new APK.
//   While the installed one is older, a full-screen notice blocks the app; its
//   button downloads the APK (mobile/apk-installer) and opens Android's
//   installer, where the person only confirms "Update".
// ========================================
(function () {
  const script = document.currentScript;
  const webBuild = Number(script && script.dataset.build) || 0;
  const cap = window.Capacitor;
  if (!webBuild || !cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;

  const VERSION_URL = 'https://otw.gtazz.dev/api/app/android';
  const APK_STORAGE_KEY = 'openTeamworkLatestApk';
  const logoUrl = new URL('../icons/icon-192.png', script.src).href;
  const call = (plugin, method, options = {}) => cap.nativePromise(plugin, method, options);

  // These pages started fine: otherwise the updater goes back to the previous ones.
  call('CapacitorUpdater', 'notifyAppReady').catch(() => {});

  // Native build of the installed APK: its versionName is "1.0.<build>".
  const nativeBuild = call('CapacitorUpdater', 'current')
    .then(result => Number((/(\d+)$/.exec(result.native || '') || [])[1]) || 0)
    .catch(() => 0);

  // ---------- Mandatory APK update ----------
  let screen = null;
  let apkUrl = '';

  function showUpdateScreen(url) {
    apkUrl = url;
    if (screen) return;
    screen = document.createElement('div');
    screen.setAttribute('role', 'alertdialog');
    screen.setAttribute('aria-modal', 'true');
    screen.setAttribute('aria-labelledby', 'otw-update-title');
    screen.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'gap:16px', 'padding:32px 24px', 'text-align:center',
      'background:var(--bg,#0d1117)', 'color:var(--fg,#e6edf3)',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    ].join(';');
    screen.innerHTML = `
      <img src="${logoUrl}" alt="" width="96" height="96" style="width:96px;height:96px">
      <h1 id="otw-update-title" style="margin:0;font-size:22px">Atualização obrigatória</h1>
      <p style="margin:0;max-width:320px;line-height:1.5;color:var(--fg-muted,#8b949e)">
        Há uma nova versão do Open Teamwork. Para continuar usando o app, instale a atualização.
      </p>
      <button type="button" style="margin-top:8px;padding:12px 24px;border:0;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;background:var(--success-emphasis,#238636);color:#fff">
        Atualizar agora
      </button>
      <p data-status style="margin:0;max-width:320px;min-height:40px;font-size:13px;line-height:1.5;color:var(--fg-subtle,#6e7681)">
        Seus dados e sua conta continuam os mesmos.
      </p>`;
    const button = screen.querySelector('button');
    const status = screen.querySelector('[data-status]');
    button.addEventListener('click', () => installApk(button, status));
    document.documentElement.appendChild(screen);
    document.documentElement.style.overflow = 'hidden';
  }

  let progressListening = false;
  function installApk(button, status) {
    button.disabled = true;
    button.style.opacity = '0.6';
    status.textContent = 'Baixando a atualização…';
    if (!progressListening) {
      progressListening = true;
      try {
        cap.nativeCallback('ApkInstaller', 'addListener', { eventName: 'progress' }, event => {
          if (event && typeof event.percent === 'number') status.textContent = `Baixando a atualização… ${event.percent}%`;
        });
      } catch {
        // Progress is optional.
      }
    }
    call('ApkInstaller', 'downloadAndInstall', { url: apkUrl })
      .then(() => {
        status.textContent = 'Na janela do Android, toque em "Atualizar". Se ela não apareceu, toque no botão de novo.';
      })
      .catch(() => {
        // Plan B: the phone's browser downloads the file; the person opens it to install.
        status.textContent = 'Abrindo o download no navegador. Depois, abra o arquivo open-teamwork.apk e toque em "Atualizar".';
        window.location.href = apkUrl;
      })
      .finally(() => {
        button.disabled = false;
        button.style.opacity = '';
        button.textContent = 'Baixar de novo';
      });
  }

  // ---------- Pages (live update) ----------
  let downloading = false;
  async function updatePages(web) {
    if (downloading) return;
    downloading = true;
    try {
      const version = String(web.build);
      const { bundles = [] } = await call('CapacitorUpdater', 'list');
      let bundle = bundles.find(item => item.version === version && item.status !== 'error');
      if (bundle && bundle.status === 'downloading') return;
      if (!bundle) bundle = await call('CapacitorUpdater', 'download', { url: web.url, version, checksum: web.checksum });
      // Used from the next start (or when the app returns from the background).
      await call('CapacitorUpdater', 'next', { id: bundle.id });
    } catch {
      // Tries again on the next start.
    } finally {
      downloading = false;
    }
  }

  // ---------- Check ----------
  async function apply(info, installed) {
    if (!installed) return;
    if (info.apk && info.apk.build > installed) {
      showUpdateScreen(info.apk.url);
    } else if (info.web && info.web.build > webBuild && info.web.minNativeBuild <= installed) {
      updatePages(info.web);
    }
  }

  async function check() {
    try {
      const response = await fetch(VERSION_URL, { cache: 'no-store' });
      if (!response.ok) return;
      const info = await response.json();
      if (info.apk) localStorage.setItem(APK_STORAGE_KEY, JSON.stringify(info.apk));
      apply(info, await nativeBuild);
    } catch {
      // Offline: the last known APK version (below) still applies.
    }
  }

  // Blocks right away when an earlier check already found a newer APK (even offline).
  nativeBuild.then(installed => {
    try {
      const apk = JSON.parse(localStorage.getItem(APK_STORAGE_KEY) || 'null');
      if (apk) apply({ apk }, installed);
    } catch {
      localStorage.removeItem(APK_STORAGE_KEY);
    }
  });
  check();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
})();
