'use strict';

/**
 * Latest Android app versions, read from the GitHub releases that
 * .github/workflows/android.yml publishes, cached for a few minutes:
 *
 * - "android-latest": the APK. Its title ends in "(1.0.<build>)". An app with an
 *   older native build shows the mandatory "update" screen.
 * - "android-web":    the app's pages as web-<build>.zip plus version.json
 *   ({ webBuild, minNativeBuild, checksum, file }). The zip has a new name per
 *   build, so version.json never points at a half-replaced file. Apps download it in the background
 *   (live update) and switch to it on the next start.
 *
 * When GitHub fails (or while the workflow is replacing a file), the last known
 * answer is kept, so phones never see a version go backwards.
 */
const GITHUB_API = 'https://api.github.com';
const CACHE_MS = 5 * 60_000;

function createAndroidRelease({ repo = 'GTazz/Open-Teamwork', fetchImpl = (...args) => fetch(...args) } = {}) {
  const state = { info: { apk: null, web: null }, checkedAt: 0, pending: null };

  async function getJson(url, accept = 'application/vnd.github+json') {
    const response = await fetchImpl(url, {
      headers: { Accept: accept, 'User-Agent': 'open-teamwork-server' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`${url} respondeu ${response.status}`);
    return response.json();
  }

  const uploadedAsset = (release, name) =>
    (release.assets || []).find(asset => asset.name === name && asset.state === 'uploaded');

  async function fetchApk() {
    const release = await getJson(`${GITHUB_API}/repos/${repo}/releases/tags/android-latest`);
    const asset = uploadedAsset(release, 'open-teamwork.apk');
    const match = /\(\d+\.\d+\.(\d+)\)/.exec(release.name || '');
    if (!asset || !match) throw new Error('release do APK sem arquivo ou sem número de versão');
    return { build: Number(match[1]), url: asset.browser_download_url };
  }

  async function fetchWeb() {
    const release = await getJson(`${GITHUB_API}/repos/${repo}/releases/tags/android-web`);
    const versionFile = uploadedAsset(release, 'version.json');
    if (!versionFile) throw new Error('release das páginas sem version.json');
    const version = await getJson(versionFile.browser_download_url, 'application/json');
    const zip = uploadedAsset(release, String(version.file));
    if (!zip) throw new Error(`release das páginas sem ${version.file}`);
    const webBuild = Number(version.webBuild);
    const minNativeBuild = Number(version.minNativeBuild);
    if (!webBuild || !minNativeBuild || !/^[0-9a-f]{64}$/.test(String(version.checksum))) {
      throw new Error('version.json inválido');
    }
    return { build: webBuild, minNativeBuild, checksum: version.checksum, url: zip.browser_download_url };
  }

  const newer = (known, fresh) => (fresh && (!known || fresh.build >= known.build) ? fresh : known);

  async function refresh() {
    const [apk, web] = await Promise.allSettled([fetchApk(), fetchWeb()]);
    if (apk.status === 'fulfilled') state.info.apk = newer(state.info.apk, apk.value);
    else console.warn('APK Android indisponível:', apk.reason.message);
    if (web.status === 'fulfilled') state.info.web = newer(state.info.web, web.value);
    else console.warn('Páginas do app Android indisponíveis:', web.reason.message);
  }

  /** @returns {Promise<{apk: object|null, web: object|null}>} Never rejects. */
  async function latest() {
    if (Date.now() - state.checkedAt >= CACHE_MS) {
      if (!state.pending) {
        state.pending = refresh().finally(() => {
          state.checkedAt = Date.now();
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
