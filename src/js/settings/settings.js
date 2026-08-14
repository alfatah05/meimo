/**
 * settings.js
 * Halaman Pengaturan: Font Library, Tema, Bahasa, Sampah, Cadangkan, Fitur AI.
 */

import { THEMES, getTheme, setTheme } from "../themes/theme-manager.js";
import {
  LANGUAGES,
  getLanguage,
  setLanguage,
  t,
  applyI18n,
  initI18n,
} from "../i18n/i18n.js";
import { showToast } from "../../components/toast.js";
import { openPanel, closeAllPanels } from "../utils/dom.js";

function themeLabel(theme) {
  const key = `theme.${theme.id}`;
  const translated = t(key);
  return translated === key ? theme.label : translated;
}

function buildThemePanel(onPick) {
  const panel = document.createElement("div");
  panel.className = "theme-panel";
  const current = getTheme();
  for (const theme of THEMES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-panel__item" + (theme.id === current ? " is-active" : "");
    btn.innerHTML =
      `<span class="theme-panel__swatch" style="background:${theme.swatch}"></span>` +
      `<span class="theme-panel__label">${themeLabel(theme)}</span>`;
    btn.addEventListener("click", () => onPick(theme));
    panel.appendChild(btn);
  }
  return panel;
}

function buildLanguagePanel(onPick) {
  const panel = document.createElement("div");
  panel.className = "theme-panel language-panel";
  const current = getLanguage();
  for (const lang of LANGUAGES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-panel__item" + (lang.id === current ? " is-active" : "");
    const label = t(lang.labelKey);
    btn.innerHTML =
      `<span class="theme-panel__label language-panel__label">${label}</span>` +
      `<span class="language-panel__native">${lang.nativeLabel}</span>`;
    btn.addEventListener("click", () => onPick(lang));
    panel.appendChild(btn);
  }
  return panel;
}

async function boot() {
  initI18n();

  const themeBtn = document.getElementById("settingsThemeBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const panel = buildThemePanel((theme) => {
        setTheme(theme.id);
        closeAllPanels();
        showToast(t("settings.theme.changed", { label: themeLabel(theme) }));
      });
      openPanel(themeBtn, panel);
    });
  }

  const langBtn = document.getElementById("settingsLanguageBtn");
  if (langBtn) {
    langBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const panel = buildLanguagePanel((lang) => {
        setLanguage(lang.id);
        closeAllPanels();
        // Terapkan ulang seluruh data-i18n di halaman (settings + chrome SPA)
        applyI18n(document);
        const label = t(lang.labelKey);
        showToast(t("settings.language.changed", { label }));
        // Update document title halaman settings
        document.title = t("title.settings");
      });
      openPanel(langBtn, panel);
    });
  }
}

export async function initSettings() {
  return boot();
}

if (!window.__MEIMO_SPA__) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
