/**
 * floating-button.js
 * Floating Menu (speed dial) di pojok kanan bawah Home: tombol "+" utama
 * membuka aksi cepat — Catatan Baru, Rekam Suara, Pengaturan (menu lain
 * dipindah ke halaman Pengaturan). Dipasang lewat mountFloatingMenu() ke atas markup
 * `.fab-menu` yang sudah ada di index.html.
 */

import { qs, qsa, openPanel, closeAllPanels } from "../js/utils/dom.js";
import { THEMES, getTheme, setTheme } from "../js/themes/theme-manager.js";
import { showToast } from "./toast.js";
import { initInstallAvailability, triggerInstall } from "../js/pwa/install-prompt.js";
import { t } from "../js/i18n/i18n.js";

/** Bangun panel kecil berisi 5 pilihan tema (dibuka lewat openPanel dom.js). */
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
      `<span class="theme-panel__label">${theme.label}</span>`;
    btn.addEventListener("click", () => onPick(theme));
    panel.appendChild(btn);
  }
  return panel;
}

export function mountFloatingMenu(root = document) {
  const menu = qs(".fab-menu", root);
  if (!menu) return;

  const mainBtn = qs("[data-fab-main]", menu);
  const actionsList = qs("[data-fab-actions]", menu);
  const backdrop = qs("[data-fab-backdrop]", menu);
  if (!mainBtn || !actionsList || !backdrop) return;

  // Harus sinkron dengan durasi transisi `.fab-action-item` / `.fab-menu__backdrop`
  // di components.css (var(--anim-slide)), supaya elemen baru benar-benar
  // disembunyikan (hidden) setelah animasi keluar selesai, bukan sebelum/sesudahnya.
  const CLOSE_ANIM_MS = 180;
  let isOpen = false;
  let hideTimer = null;

  function setOpen(next) {
    isOpen = next;
    mainBtn.setAttribute("aria-expanded", String(isOpen));

    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }

    if (isOpen) {
      // Lepas `hidden` dulu (state awal: opacity 0 / translateY) baru tambahkan
      // `is-open` di frame berikutnya, supaya browser sempat "paint" state
      // tertutupnya lebih dulu dan transisi CSS-nya benar-benar terpicu
      // (kalau ditambahkan di frame yang sama, transisinya bisa dilewati).
      actionsList.hidden = false;
      backdrop.hidden = false;
      requestAnimationFrame(() => {
        menu.classList.add("is-open");
      });
    } else {
      menu.classList.remove("is-open");
      closeAllPanels();
      // Baru benar-benar disembunyikan setelah animasi keluar kelar, supaya
      // animasinya kelihatan (bukan langsung hilang instan).
      hideTimer = window.setTimeout(() => {
        actionsList.hidden = true;
        backdrop.hidden = true;
        hideTimer = null;
      }, CLOSE_ANIM_MS);
    }
  }

  mainBtn.addEventListener("click", () => setOpen(!isOpen));
  backdrop.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) setOpen(false);
  });

  // Item "Instal Aplikasi" disembunyikan lewat markup (`hidden`) sampai
  // browser benar-benar menawarkan instalasi (lihat install-prompt.js).
  // App yang sudah terpasang / browser tanpa dukungan install prompt ->
  // item ini tetap tersembunyi selamanya, tidak mengganggu 4 aksi lain.
  const installItem = qs('[data-fab-action="install"]', actionsList)?.closest(".fab-action-item");
  window.addEventListener("meimo:install-availability", (e) => {
    if (installItem) installItem.hidden = !e.detail.available;
  });
  initInstallAvailability();

  qsa("[data-fab-action]", actionsList).forEach((el) => {
    const action = el.getAttribute("data-fab-action");

    // "new-note", "trash", "backup", "font-library" & "voice-record" adalah <a> biasa
    // (navigasi native ke editor.html / trash.html / cadangkan.html /
    // font-manager.html) — sebelumnya sama sekali tidak dikasih handler,
    // jadi klik langsung navigasi tanpa memicu setOpen(false) dulu: FAB
    // masih kelihatan terbuka penuh (item-item + backdrop) di snapshot
    // "halaman lama" yang diambil cross-document View Transition (lihat
    // @view-transition di view-transitions.css, aktif utk semua navigasi),
    // jadi kelihatan seperti menu tidak pernah menutup. Panggil setOpen(false)
    // di sini (TANPA preventDefault, navigasi native tetap jalan seperti
    // biasa) supaya FAB sempat mulai animasi close-nya lebih dulu.
    if (action === "new-note" || action === "voice-record" || action === "settings") {
      el.addEventListener("click", () => setOpen(false));
      return;
    }

    el.addEventListener("click", async (e) => {
      if (action === "theme") {
        e.preventDefault();
        const panel = buildThemePanel((theme) => {
          setTheme(theme.id);
          closeAllPanels();
          setOpen(false);
          showToast(t("settings.theme.changed", { label: theme.label }));
        });
        openPanel(el, panel, { align: "center" });
        return;
      }

      if (action === "install") {
        e.preventDefault();
        setOpen(false);
        const outcome = await triggerInstall();
        if (outcome === "accepted") {
          showToast(t("install.progress"));
        } else if (outcome === "dismissed") {
          showToast(t("install.cancelled"));
        }
        // "unavailable" (prompt sudah dipakai/hilang) -> diam saja, tombol
        // sudah ikut tersembunyi lewat event meimo:install-availability.
      }
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mountFloatingMenu());
} else {
  mountFloatingMenu();
}
