/**
 * i18n.js
 * Preferensi bahasa UI (English / Indonesia / Japan) — pola sama dengan
 * theme-manager: disimpan di localStorage, diterapkan lewat data-i18n di DOM.
 *
 * Default: English (`en`). Konten catatan user tidak diterjemahkan.
 */

import { LOCALES, DEFAULT_LOCALE, LANGUAGES } from "./locales.js";

export const LANG_STORAGE_KEY = "notes-app-lang";

export { LANGUAGES, DEFAULT_LOCALE };

/** Baca bahasa tersimpan (atau default). */
export function getLanguage() {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    if (v && LOCALES[v]) return v;
  } catch (_) {
    /* private mode */
  }
  return DEFAULT_LOCALE;
}

/**
 * Simpan & terapkan bahasa. Mengembalikan id yang benar-benar dipakai.
 * @param {string} langId
 * @param {{ apply?: boolean }} [opts] apply=false kalau mau set dulu baru apply manual
 */
export function setLanguage(langId, opts = {}) {
  const valid = LOCALES[langId] ? langId : DEFAULT_LOCALE;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, valid);
  } catch (_) {
    /* ignore */
  }
  document.documentElement.setAttribute("lang", valid === "id" ? "id" : valid === "ja" ? "ja" : "en");
  if (opts.apply !== false) {
    applyI18n(document);
  }
  return valid;
}

/**
 * Ambil string terjemahan. Placeholder `{name}` diganti dari `vars`.
 * Fallback: locale aktif → en → key itu sendiri.
 */
export function t(key, vars) {
  const lang = getLanguage();
  let str =
    (LOCALES[lang] && LOCALES[lang][key]) ||
    (LOCALES.en && LOCALES.en[key]) ||
    key;
  if (vars && typeof vars === "object") {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}

/**
 * Terapkan terjemahan ke subtree:
 *  - `[data-i18n="key"]` → textContent
 *  - `[data-i18n-html="key"]` → innerHTML (hati-hati, hanya string aman)
 *  - `[data-i18n-attr="attr:key,attr2:key2"]` → setAttribute
 *  - `[data-i18n-placeholder="key"]` → placeholder
 *  - `[data-i18n-aria="key"]` → aria-label
 */
export function applyI18n(root = document) {
  const scope = root.querySelectorAll
    ? root
    : document;

  scope.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });

  scope.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (key) el.innerHTML = t(key);
  });

  scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.setAttribute("placeholder", t(key));
  });

  scope.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key) el.setAttribute("aria-label", t(key));
  });

  scope.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    const raw = el.getAttribute("data-i18n-attr");
    if (!raw) return;
    raw.split(",").forEach((pair) => {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
}

/** Inisialisasi bahasa saat boot (set lang attr + apply DOM). */
export function initI18n() {
  const lang = getLanguage();
  document.documentElement.setAttribute(
    "lang",
    lang === "id" ? "id" : lang === "ja" ? "ja" : "en"
  );
  applyI18n(document);
  return lang;
}

export function getLanguageMeta(langId) {
  return LANGUAGES.find((l) => l.id === langId) || LANGUAGES[0];
}
