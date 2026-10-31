/**
 * Z1 — which build is running. `__BUILD__` is baked in by vite.config.ts; `version.json` sits
 * next to the page. At start the page asks the server for it past every cache: a newer build
 * there means this tab holds a stale index.html (GitHub Pages caches it for 10 min), so it
 * reloads once. With `?debug` the build shows in a corner.
 */
declare const __BUILD__: { sha: string; time: string };
export const BUILD = __BUILD__;

export function checkVersion() {
  if (import.meta.env.DEV) return;
  const KEY = 'love-story:reloaded-for';
  fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((v: { sha: string; time: string } | null) => {
      if (!v || v.sha === BUILD.sha || v.time <= BUILD.time) return;
      try {
        if (sessionStorage.getItem(KEY) === v.sha) return; // (once: never a reload loop)
        sessionStorage.setItem(KEY, v.sha);
      } catch {
        return;
      }
      location.reload();
    })
    .catch(() => {});
}

export function showBuildStamp() {
  if (!new URLSearchParams(location.search).has('debug')) return;
  const el = document.createElement('div');
  el.textContent = `${BUILD.sha} · ${BUILD.time.replace('T', ' ').slice(0, 16)} UTC`;
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;left:6px;bottom:4px;z-index:9999;font:11px/1 monospace;color:rgba(255,235,220,.55);pointer-events:none';
  document.body.appendChild(el);
}
