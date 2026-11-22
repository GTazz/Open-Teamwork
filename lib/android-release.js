'use strict';

/**
 * Latest Android app versions, published by .github/workflows/android.yml:
 *
 * - release "android-latest": the APK (open-teamwork.apk). An app with an older
 *   native build shows the mandatory "update" screen.
 * - release "android-web": the app's pages as web-<build>.zip plus version.json
 *   ({ webBuild, minNativeBuild, apkBuild, checksum, file }). Apps download the
 *   zip in the background (live update) and switch to it on the next start.
 *
 * Only version.json is read, through the plain download link: GitHub's API has a
 * 60 requests/hour limit per IP, shared with everyone on the host's IPs. The
 * answer is cached for a few minutes; when GitHub fails (or while the workflow
 * replaces the file), the last known answer is kept.
 */
const CACHE_MS = 5 * 60_000;
const RETRY_MS = 30_000; // after a failure

function createAndroidRelease({ repo = 'GTazz/Open-Teamwork', fetchImpl = (...args) => fetch(...args) } = {}) {
  const downloads = `https://github.com/${repo}/releases/download`;
  const state = { info: { apk: null, web: null }, checkedAt: 0, pending: null };

  async function fetchVersion() {
    const response = await fetchImpl(`${downloads}/android-web/version.json`, {
      headers: { 'User-Agent': 'open-teamwork-server' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`version.json respondeu ${response.status}`);
    const version = await response.json();
    const webBuild = Number(version.webBuild);
    const minNativeBuild = Number(version.minNativeBuild);
    const apkBuild = Number(version.apkBuild);
    const file = String(version.file);
    if (!webBuild || !minNativeBuild || !apkBuild || !/^web-\d+\.zip$/.test(file) || !/^[0-9a-f]{64}$/.test(String(version.checksum))) {
      throw new Error('version.json inválido');
    }
    return {
      apk: { build: apkBuild, url: `${downloads}/android-latest/open-teamwork.apk` },
      web: { build: webBuild, minNativeBuild, checksum: version.checksum, url: `${downloads}/android-web/${file}` },
    };
  }

  const newer = (known, fresh) => (!known || fresh.build >= known.build ? fresh : known);

  /** @returns {Promise<{apk: object|null, web: object|null}>} Never rejects. */
  async function latest() {
    if (Date.now() - state.checkedAt >= CACHE_MS) {
      if (!state.pending) {
        state.pending = fetchVersion()
          .then(fresh => {
            state.info = { apk: newer(state.info.apk, fresh.apk), web: newer(state.info.web, fresh.web) };
            state.checkedAt = Date.now();
          })
          .catch(error => {
            console.warn('Versão do app Android indisponível:', error.message);
            state.checkedAt = Date.now() - CACHE_MS + RETRY_MS;
          })
          .finally(() => {
            state.pending = null;
          });
      }
      await state.pending;
    }
    return state.info;
  }

  return { latest };
}

module.exports = { createAndroidRelease };
