/**
 * spa-app.js
 * SPA shell: Home, Editor, Cadangkan, Trash, Font Manager, Arsip.
 */

import { init as initRouter } from "./router.js";
import { initI18n, t, applyI18n } from "./i18n/i18n.js";

window.__MEIMO_SPA__ = true;

const VIEW_IDS = {
  home: "view-home",
  editor: "view-editor",
  cadangkan: "view-cadangkan",
  trash: "view-trash",
  "font-manager": "view-font-manager",
  arsip: "view-arsip",
  "card-style": "view-card-style",
  settings: "view-settings",
  "fitur-ai": "view-fitur-ai",
};

/** Map route name → i18n key for document.title */
const TITLE_KEYS = {
  home: "title.home",
  editor: "title.editor",
  cadangkan: "title.backup",
  trash: "title.trash",
  "font-manager": "title.fonts",
  arsip: "title.archive",
  "card-style": "title.cardStyle",
  settings: "title.settings",
  "fitur-ai": "title.ai",
};

/** @type {Record<string, string|null>} */
const templates = {};
/** @type {Record<string, boolean>} */
const inited = {
  home: false,
  editor: false,
  cadangkan: false,
  trash: false,
  "font-manager": false,
  arsip: false,
  "card-style": false,
  settings: false,
  "fitur-ai": false,
};

let currentName = null;

function el(id) {
  return document.getElementById(id);
}

function setTitle(name) {
  const key = TITLE_KEYS[name] || TITLE_KEYS.home;
  document.title = t(key);
}

function showView(name) {
  for (const [routeName, vid] of Object.entries(VIEW_IDS)) {
    const node = el(vid);
    if (!node) continue;
    const active = routeName === name;
    node.hidden = !active;
    node.setAttribute("aria-hidden", active ? "false" : "true");
  }
  // body class for CSS (editor chrome hide, etc.)
  for (const routeName of Object.keys(VIEW_IDS)) {
    document.body.classList.toggle(`spa-${routeName}-active`, routeName === name);
  }
  // font-manager has a slash in name — class spa-font-manager-active
  document.body.classList.toggle("spa-home-active", name === "home");
  document.body.classList.toggle("spa-editor-active", name === "editor");
}

function captureTemplates() {
  for (const [name, vid] of Object.entries(VIEW_IDS)) {
    const node = el(vid);
    if (node && templates[name] == null) {
      templates[name] = node.innerHTML;
    }
  }
}

function restoreTemplate(name) {
  const node = el(VIEW_IDS[name]);
  if (!node || templates[name] == null) return;
  node.innerHTML = templates[name];
}

/* ---------- Home ---------- */
async function ensureHome() {
  if (!inited.home) {
    inited.home = true;
    const mod = await import("./notes/notes-list.js");
    if (typeof mod.initHome === "function") await mod.initHome();
    try {
      await import("../components/floating-button.js");
    } catch (e) {
      console.warn("[spa] floating-button:", e);
    }
  }
}

async function refreshHomeIfPossible() {
  try {
    const mod = await import("./notes/notes-list.js");
    if (typeof mod.refreshHome === "function") await mod.refreshHome();
  } catch (e) {
    console.warn("[spa] refreshHome:", e);
  }
}

/* ---------- Editor ---------- */
async function teardownEditor() {
  if (!inited.editor) return;
  try {
    const mod = await import("./app.js");
    if (typeof mod.destroyEditor === "function") mod.destroyEditor();
  } catch (e) {
    console.warn("[spa] destroyEditor:", e);
  }
  inited.editor = false;
  restoreTemplate("editor");
}

async function ensureEditor() {
  // Tampilkan view + skeleton dulu (template punya .is-loading / skeleton)
  if (inited.editor) {
    // teardown sync-ish: destroy + restore supaya skeleton muncul
    try {
      const mod = await import("./app.js");
      if (typeof mod.destroyEditor === "function") mod.destroyEditor();
    } catch (e) {}
    inited.editor = false;
  }
  restoreTemplate("editor");
  showView("editor");
  // Pastikan state loading terlihat
  try {
    const page = document.querySelector("#view-editor .note-page");
    if (page) page.classList.add("is-loading");
  } catch (e) {}

  try {
    const vp = await import("./utils/viewport-pin.js");
    if (typeof vp.init === "function") vp.init();
  } catch (e) {}
  try {
    const th = await import("./utils/topbar-autohide.js");
    if (typeof th.init === "function") th.init();
  } catch (e) {}
  const mod = await import("./app.js");
  if (typeof mod.initEditor === "function") await mod.initEditor();
  inited.editor = true;
}

/* ---------- Secondary pages: restore template + init each visit ---------- */
/**
 * @param {string} name
 * @param {string} importPath
 * @param {string} initExport
 * @param {{ waitTransition?: boolean }} [opts]
 *   waitTransition: tunggu animasi page-in selesai dulu sebelum init()
 *   memutasi DOM (font load + banyak clip-path di Customisasi Kartu
 *   sebelumnya jalan di tengah animasi → terasa berat/lag).
 */
async function ensureSecondary(name, importPath, initExport, opts = {}) {
  // 1) Restore template (skeleton terlihat lagi) + tampilkan view SEGERA
  //    (bagian sync ini sudah dipanggil di onRoute; tetap aman dipanggil ulang)
  restoreTemplate(name);
  showView(name);

  // 2) Mulai fetch modul segera (paralel dengan animasi)
  const modPromise = import(importPath);

  // 3) Untuk halaman berat: tunggu page transition selesai dulu supaya
  //    mutasi DOM di init tidak tabrakan dengan animasi translateY.
  if (opts.waitTransition) {
    try {
      const { waitForPageTransition } = await import("./router.js");
      await waitForPageTransition();
    } catch (_) {
      /* ignore */
    }
  }

  const mod = await modPromise;
  if (typeof mod[initExport] === "function") {
    await mod[initExport]();
  }
  inited[name] = true;
}

async function leaveSecondary(name) {
  if (!inited[name]) return;
  restoreTemplate(name);
  inited[name] = false;
}

async function onRoute(route) {
  if (!route) return;
  const prev = currentName;
  currentName = route.name;
  setTitle(route.name);

  // 1) GANTI VIEW SEGERA (sync) — ini yang ditangkap View Transition.
  //    Jangan await load data sebelum showView.
  if (route.name === "home") {
    showView("home");
  } else if (route.name === "editor") {
    // skeleton lewat restore di ensureEditor; show dulu agar tidak blank
    if (!inited.editor) {
      restoreTemplate("editor");
      try {
        const page = document.querySelector("#view-editor .note-page");
        if (page) page.classList.add("is-loading");
      } catch (e) {}
    }
    showView("editor");
  } else if (VIEW_IDS[route.name]) {
    restoreTemplate(route.name);
    showView(route.name);
  }

  // 2) Cleanup halaman sebelumnya (setelah view tujuan sudah tampil)
  if (prev && prev !== route.name) {
    if (prev === "editor") {
      // destroy tanpa restore dulu (view editor sudah diganti/hidden)
      try {
        const mod = await import("./app.js");
        if (typeof mod.destroyEditor === "function") mod.destroyEditor();
      } catch (e) {}
      inited.editor = false;
    } else if (prev !== "home" && VIEW_IDS[prev]) {
      inited[prev] = false;
    }
  }

  // 3) Load data di halaman tujuan (skeleton sudah terlihat)
  if (route.name === "home") {
    await ensureHome();
    if (prev && prev !== "home") await refreshHomeIfPossible();
    return;
  }
  if (route.name === "editor") {
    await ensureEditor();
    return;
  }
  if (route.name === "cadangkan") {
    await ensureSecondary("cadangkan", "./notes/backup-import.js", "initBackup");
    return;
  }
  if (route.name === "trash") {
    await ensureSecondary("trash", "./notes/trash.js", "initTrash");
    return;
  }
  if (route.name === "font-manager") {
    await ensureSecondary("font-manager", "./fonts/font-manager.js", "initFontManager");
    return;
  }
  if (route.name === "arsip") {
    await ensureSecondary("arsip", "./notes/arsip.js", "initArsip");
    return;
  }
  if (route.name === "card-style") {
    // Tunggu animasi page-in selesai dulu — boot() memuat semua FontFace
    // + merender banyak swatch clip-path yang mahal di GPU; kalau jalan
    // di tengah animasi, naik-nya terasa lambat & tidak smooth.
    await ensureSecondary("card-style", "./notes/card-style.js", "initCardStyle", {
      waitTransition: true,
    });
    return;
  }
  if (route.name === "settings") {
    await ensureSecondary("settings", "./settings/settings.js", "initSettings");
    return;
  }
  if (route.name === "fitur-ai") {
    await ensureSecondary("fitur-ai", "./settings/ai-features.js", "initAiFeatures");
    return;
  }
}

function bootSpa() {
  // Bahasa UI (English default) — apply data-i18n sebelum view pertama tampil
  try {
    initI18n();
  } catch (e) {
    console.warn("[spa] i18n init failed", e);
  }

  for (const vid of Object.values(VIEW_IDS)) {
    if (!el(vid)) {
      console.error("[spa] missing view:", vid);
      return;
    }
  }

  captureTemplates();

  const initial = window.__MEIMO_SPA_INITIAL__ || "home";
  showView(VIEW_IDS[initial] ? initial : "home");

  initRouter({ onRoute });

  import("./pwa/sw-register.js").catch(() => {});
  import("./pwa/install-prompt.js").catch(() => {});
  import("./utils/native-feel.js").catch(() => {});
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootSpa);
} else {
  bootSpa();
}
