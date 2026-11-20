// ========================================
// VIDEO TABS (page "Sobre")
// ========================================

const videoTabs = [...document.querySelectorAll('[data-video-tab]')];
const videoPanels = [...document.querySelectorAll('[data-video-panel]')];

/**
 * Shows the selected video and hides the others.
 * @param {string} name
 * @param {boolean} moveFocus
 */
function selectVideoTab(name, moveFocus = false) {
  videoTabs.forEach(tab => {
    const isActive = tab.dataset.videoTab === name;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
    if (isActive && moveFocus) tab.focus();
  });

  videoPanels.forEach(panel => {
    panel.classList.toggle('hidden', panel.dataset.videoPanel !== name);
  });
}

videoTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectVideoTab(tab.dataset.videoTab));

  // Arrow keys move between tabs, as expected from a tab list.
  tab.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = videoTabs[(index + step + videoTabs.length) % videoTabs.length];
    selectVideoTab(next.dataset.videoTab, true);
  });
});

// ========================================
// APP DOWNLOAD (page "Sobre")
// ========================================

const appDownloadSection = document.getElementById('app-download');
const isInsideApp =
  Boolean(window.Capacitor) ||
  (window.location.hostname === 'localhost' && window.location.protocol === 'https:') ||
  window.matchMedia('(display-mode: standalone)').matches;

// Whoever already uses the app does not need the download box.
if (isInsideApp && appDownloadSection) appDownloadSection.classList.add('hidden');

// Chrome/Edge let the page offer its own "install" button (PWA).
const pwaInstallButton = document.getElementById('pwa-install-button');
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  pwaInstallButton?.classList.remove('hidden');
});

pwaInstallButton?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  pwaInstallButton.classList.add('hidden');
});

window.addEventListener('appinstalled', () => pwaInstallButton?.classList.add('hidden'));
