/**
 * router.js
 * Client-side router SPA: Home, Editor, Cadangkan, Trash, Font Manager, Arsip.
 *
 * - Intercept <a> internal ke rute SPA
 * - History API + same-document View Transitions
 * - Halaman di luar lingkup (about, download) tetap multi-page
 */

const HOME_PATHS = new Set(["/", "/library", "/index.html", "/library/"]);
const EDITOR_RE = /^\/editor(?:\/([^/]+))?\/?$/i;

const STATIC_ROUTES = {
  "/cadangkan": "cadangkan",
  "/cadangkan.html": "cadangkan",
  "/trash": "trash",
  "/trash.html": "trash",
  "/font-manager": "font-manager",
  "/font-manager.html": "font-manager",
  "/arsip": "arsip",
  "/arsip.html": "arsip",
  "/settings": "settings",
  "/settings.html": "settings",
  "/fitur-ai": "fitur-ai",
  "/fitur-ai.html": "fitur-ai",
};

let currentRoute = null;
let onRouteCallback = null;
let started = false;

function parseRoute(pathname = window.location.pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (HOME_PATHS.has(path) || path === "") {
    return { name: "home", id: null };
  }
  const m = path.match(EDITOR_RE);
  if (m) {
    return { name: "editor", id: m[1] ? decodeURIComponent(m[1]) : null };
  }
  // bare path without trailing content
  const bare = path.startsWith("/") ? path : `/${path}`;
  if (STATIC_ROUTES[bare]) {
    return { name: STATIC_ROUTES[bare], id: null };
  }
  // also try with .html stripped already handled; startsWith patterns
  for (const [key, name] of Object.entries(STATIC_ROUTES)) {
    if (key.endsWith(".html")) continue;
    if (bare === key || bare.startsWith(key + "/")) {
      return { name, id: null };
    }
  }
  // /card-style/<id>
  const cs = bare.match(/^\/card-style(?:\/([^/]+))?\/?$/i);
  if (cs) {
    return { name: "card-style", id: cs[1] ? decodeURIComponent(cs[1]) : null };
  }
  return null;
}

function pathFor(route) {
  switch (route.name) {
    case "home":
      return "/library";
    case "editor":
      return route.id ? `/editor/${encodeURIComponent(route.id)}` : "/editor";
    case "cadangkan":
      return "/cadangkan";
    case "trash":
      return "/trash";
    case "font-manager":
      return "/font-manager";
    case "arsip":
      return "/arsip";
    case "settings":
      return "/settings";
    case "fitur-ai":
      return "/fitur-ai";
    case "card-style":
      return route.id
        ? `/card-style/${encodeURIComponent(route.id)}`
        : "/card-style";
    default:
      return "/library";
  }
}

/** ViewTransition aktif terakhir (null kalau tidak support / reduced-motion). */
let activeViewTransition = null;

/**
 * Jalankan `apply` di dalam Same-Document View Transition bila didukung.
 * Mengembalikan objek ViewTransition (atau null) supaya pemanggil bisa
 * `await vt.finished` sebelum kerja berat (font load, render clip-path
 * kompleks, dsb.) — mencegah jank di tengah animasi page-in (terutama
 * halaman Customisasi Kartu yang isinya berat).
 */
function runWithViewTransition(apply) {
  activeViewTransition = null;
  if (
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    const vt = document.startViewTransition(apply);
    activeViewTransition = vt;
    // Bersihkan referensi setelah selesai supaya tidak menahan objek lama.
    if (vt && vt.finished) {
      vt.finished.catch(() => {}).finally(() => {
        if (activeViewTransition === vt) activeViewTransition = null;
      });
    }
    return vt;
  }
  apply();
  return null;
}

/**
 * Tunggu animasi page transition selesai (atau langsung resolve kalau
 * tidak ada / sudah selesai). Dipakai halaman berat (card-style) supaya
 * mutasi DOM besar tidak tabrakan dengan animasi translateY page-in.
 */
export function waitForPageTransition() {
  const vt = activeViewTransition;
  if (!vt || !vt.finished) return Promise.resolve();
  return vt.finished.catch(() => {});
}

export function navigate(to, { replace = false } = {}) {
  const url = typeof to === "string" ? new URL(to, window.location.origin) : to;
  const route = parseRoute(url.pathname);

  if (!route) {
    if (replace) window.location.replace(url.href);
    else window.location.assign(url.href);
    return;
  }

  const nextPath = pathFor(route) + (url.search || "") + (url.hash || "");
  const same =
    currentRoute &&
    currentRoute.name === route.name &&
    currentRoute.id === route.id &&
    window.location.search === (url.search || "");

  if (same && !replace) return;

  const apply = () => {
    if (replace) {
      window.history.replaceState({ spa: true, route }, "", nextPath);
    } else {
      window.history.pushState({ spa: true, route }, "", nextPath);
    }
    currentRoute = route;
    // Jangan return/await onRoute — VT harus selesai setelah ganti view sync
    // supaya skeleton di halaman tujuan langsung terlihat.
    if (typeof onRouteCallback === "function") {
      onRouteCallback(route);
    }
  };

  runWithViewTransition(apply);
}

export function getRoute() {
  return currentRoute || parseRoute();
}

export function syncRoute() {
  currentRoute = parseRoute();
  return currentRoute;
}

export function init(opts = {}) {
  if (started) return;
  started = true;
  onRouteCallback = opts.onRoute || null;

  currentRoute = parseRoute();

  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;

      if (
        e.target.closest(
          "button, [role='button'], input, select, textarea, label, summary"
        )
      ) {
        return;
      }

      let url;
      try {
        url = new URL(a.href, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      const route = parseRoute(url.pathname);
      if (!route) return;

      e.preventDefault();
      navigate(url, { replace: false });
    },
    true
  );

  window.addEventListener("popstate", () => {
    const route = parseRoute();
    if (!route) return;

    if (
      currentRoute &&
      currentRoute.name === route.name &&
      currentRoute.id === route.id
    ) {
      return;
    }

    runWithViewTransition(() => {
      currentRoute = route;
      // Jangan await — sama seperti navigate() (skeleton di halaman tujuan).
      if (typeof onRouteCallback === "function") {
        onRouteCallback(route);
      }
    });
  });

  if (typeof onRouteCallback === "function") {
    onRouteCallback(currentRoute);
  }
}

export default {
  navigate,
  init,
  getRoute,
  parseRoute,
  syncRoute,
  waitForPageTransition,
};
