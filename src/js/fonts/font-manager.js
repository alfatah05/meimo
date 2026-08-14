/**
 * font-manager.js
 * Render & pengelolaan halaman Kelola Font (font-manager.html):
 *  - Font Bawaan: daftar tetap (BUILTIN_FONTS), tidak bisa dihapus.
 *  - Font Library: dibaca dari assets/fonts/library/manifest.json lewat
 *    Font Service. Yang belum diunduh tampil dengan tombol "Unduh"; yang
 *    sudah diunduh tampil dengan badge "Terpasang" + tombol "Hapus".
 * Sumber data & aturan bisnis semuanya lewat font-service.js — halaman ini
 * TIDAK PERNAH menyentuh IndexedDB langsung.
 */

import {
  BUILTIN_FONTS,
  getFontLibrary,
  getInstalledFonts,
  getUploadedFonts,
  installFont,
  installCustomFont,
  removeFont,
  ensureInstalledFontsLoaded,
  ensureLibraryFontPreviewLoaded,
} from "../services/font-service.js";
import { createEl, clearChildren } from "../utils/dom.js";
import { showToast } from "../../components/toast.js";
import { confirmDialog } from "../../components/modal.js";
import { t, initI18n } from "../i18n/i18n.js";

const PAGE_SIZE = 10;

function clampPage(page, totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  return Math.min(Math.max(1, page), totalPages);
}

/**
 * Render kontrol "‹ Sebelumnya / Halaman X dari Y / Berikutnya ›" ke dalam
 * `container` (dikosongkan dulu). Disembunyikan total (bukan cuma
 * dikosongkan) kalau totalnya cuma 1 halaman atau kurang — dipakai sama
 * oleh section Font Library & Font Kustom (Unggah), keduanya 10 item/halaman.
 * @param {HTMLElement} container
 * @param {number} currentPage
 * @param {number} totalItems
 * @param {(page:number)=>void} onChange
 */
function renderPagination(container, currentPage, totalItems, onChange) {
  clearChildren(container);
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  if (totalPages <= 1) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const prevBtn = createEl("button", {
    className: "font-manager-pagination__btn",
    text: t("fonts.prev"),
    attrs: { type: "button" },
  });
  prevBtn.disabled = currentPage <= 1;
  prevBtn.addEventListener("click", () => onChange(currentPage - 1));

  const label = createEl("span", {
    className: "font-manager-pagination__label",
    text: t("fonts.page", { current: currentPage, total: totalPages }),
  });

  const nextBtn = createEl("button", {
    className: "font-manager-pagination__btn",
    text: t("fonts.next"),
    attrs: { type: "button" },
  });
  nextBtn.disabled = currentPage >= totalPages;
  nextBtn.addEventListener("click", () => onChange(currentPage + 1));

  container.append(prevBtn, label, nextBtn);
}

function createBuiltinItem(font) {
  const item = createEl("div", { className: "font-item" });

  const info = createEl("div", { className: "font-item__info" });
  info.appendChild(
    createEl("div", {
      className: "font-item__name",
      text: font.name,
      attrs: { style: `font-family:"${font.family}"` },
    })
  );
  info.appendChild(
    createEl("div", {
      className: "font-item__meta",
      text: "Aa Bb Cc",
      attrs: { style: `font-family:"${font.family}"` },
    })
  );

  const badge = createEl("span", { className: "font-item__badge", text: t("fonts.builtinBadge") });

  item.append(info, badge);
  return item;
}

function createLibraryItem(font, { installed, onChange }) {
  const item = createEl("div", { className: "font-item" });

  const info = createEl("div", { className: "font-item__info" });
  const nameEl = createEl("div", { className: "font-item__name", text: font.name });
  info.appendChild(nameEl);
  const metaText = font.category ? font.category : t("fonts.extra");
  info.appendChild(createEl("div", { className: "font-item__meta", text: metaText }));

  // Nama font selalu ditampilkan pakai typeface aslinya, baik sudah
  // diunduh maupun belum. Kalau belum diunduh, berkas font dimuat
  // sementara ke document.fonts (FontFace API) HANYA untuk pratinjau di
  // sesi ini — TIDAK ditulis ke IndexedDB. Begitu berkasnya selesai
  // dimuat, browser otomatis me-render ulang teks ini dengan font asli.
  nameEl.style.fontFamily = `"${font.family}"`;
  if (!installed) {
    ensureLibraryFontPreviewLoaded(font);
  }

  const actions = createEl("div", { className: "font-item__actions" });

  if (installed) {
    actions.appendChild(createEl("span", { className: "font-item__badge font-item__badge--installed", text: t("fonts.installed") }));
    const removeBtn = createEl("button", {
      className: "font-item__btn font-item__btn--danger",
      text: t("fonts.delete"),
      attrs: { type: "button" },
    });
    removeBtn.addEventListener("click", async () => {
      const confirmed = await confirmDialog({
        title: t("fonts.deleteTitle"),
        message: `"${font.name}" akan dihapus dari perangkat ini. Teks yang sudah memakai font ini tidak berubah, tapi tampilannya kembali ke font bawaan sampai diunduh lagi.`,
        confirmLabel: t("fonts.delete"),
      });
      if (!confirmed) return;
      await removeFont(font.id);
      showToast(t("fonts.deleted", { name: font.name }));
      onChange();
    });
    actions.appendChild(removeBtn);
  } else {
    const downloadBtn = createEl("button", {
      className: "font-item__btn font-item__btn--primary",
      text: t("fonts.download"),
      attrs: { type: "button" },
    });
    downloadBtn.addEventListener("click", async () => {
      downloadBtn.disabled = true;
      downloadBtn.textContent = t("fonts.downloading");
      try {
        await installFont(font);
        showToast(t("fonts.ready", { name: font.name }));
        onChange();
      } catch (err) {
        console.error("Gagal mengunduh font:", err);
        showToast(t("fonts.downloadFail", { name: font.name }), { tone: "danger" });
        downloadBtn.disabled = false;
        downloadBtn.textContent = t("fonts.download");
      }
    });
    actions.appendChild(downloadBtn);
  }

  item.append(info, actions);
  return item;
}

/**
 * Item font kustom yang sudah diunggah (section "Font Kustom"). Selalu
 * "terpasang" (tidak ada tombol Unduh, cuma nama + Hapus) karena unggah
 * langsung menyimpan berkasnya ke IndexedDB — beda dari item Font Library
 * yang punya status belum/sudah diunduh.
 */
function createUploadedItem(font, { onChange }) {
  const item = createEl("div", { className: "font-item" });

  const info = createEl("div", { className: "font-item__info" });
  info.appendChild(
    createEl("div", {
      className: "font-item__name",
      text: font.name,
      attrs: { style: `font-family:"${font.family}"` },
    })
  );
  info.appendChild(createEl("div", { className: "font-item__meta", text: t("fonts.uploadedMeta") }));

  const actions = createEl("div", { className: "font-item__actions" });
  const removeBtn = createEl("button", {
    className: "font-item__btn font-item__btn--danger",
    text: t("fonts.delete"),
    attrs: { type: "button" },
  });
  removeBtn.addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: t("fonts.deleteTitle"),
      message: t("fonts.deleteConfirm", { name: font.name }),
      confirmLabel: t("fonts.delete"),
    });
    if (!confirmed) return;
    await removeFont(font.id);
    showToast(t("fonts.deleted", { name: font.name }));
    onChange();
  });
  actions.appendChild(removeBtn);

  item.append(info, actions);
  return item;
}

async function boot() {
  initI18n();
  const builtinList = document.getElementById("builtinFontList");
  const libraryList = document.getElementById("libraryFontList");
  const libraryListSkeleton = document.getElementById("libraryFontListSkeleton");
  const libraryEmptyState = document.getElementById("libraryEmptyState");
  const libraryPagination = document.getElementById("libraryFontPagination");
  const uploadBtn = document.getElementById("btnUploadFont");
  const uploadInput = document.getElementById("uploadFontInput");
  const uploadedList = document.getElementById("uploadedFontList");
  const uploadedEmpty = document.getElementById("uploadedFontEmpty");
  const uploadedPagination = document.getElementById("uploadedFontPagination");
  if (!builtinList || !libraryList) return;

  // Halaman aktif per section (10 item/halaman) — bertahan lintas re-render
  // (mis. setelah Unduh/Hapus) selama masih dalam rentang valid, supaya
  // user tidak dilempar balik ke halaman 1 tiap kali daftar di-refresh.
  let libraryPage = 1;
  let uploadedPage = 1;

  for (const font of BUILTIN_FONTS) {
    builtinList.appendChild(createBuiltinItem(font));
  }

  // Muat ulang @font-face untuk font yang sudah pernah diunduh sebelumnya,
  // supaya preview nama font di daftar tampil pakai fontnya sendiri.
  await ensureInstalledFontsLoaded();

  async function load() {
    try {
      const [library, installedRecords] = await Promise.all([getFontLibrary(), getInstalledFonts()]);
      const installedIds = new Set(installedRecords.map((f) => f.id));

      clearChildren(libraryList);

      if (library.length === 0) {
        libraryList.hidden = true;
        libraryEmptyState.hidden = false;
        if (libraryPagination) libraryPagination.hidden = true;
      } else {
        libraryList.hidden = false;
        libraryEmptyState.hidden = true;
        libraryPage = clampPage(libraryPage, library.length);
        const start = (libraryPage - 1) * PAGE_SIZE;
        const pageItems = library.slice(start, start + PAGE_SIZE);
        for (const font of pageItems) {
          libraryList.appendChild(
            createLibraryItem(font, { installed: installedIds.has(font.id), onChange: load })
          );
        }
        if (libraryPagination) {
          renderPagination(libraryPagination, libraryPage, library.length, (page) => {
            libraryPage = page;
            load();
          });
        }
      }
    } finally {
      // Skeleton cuma perlu tampil sekali di load pertama (biar tidak
      // "kedip putih" pas navigasi ke halaman ini) — begitu render
      // pertama selesai (sukses ataupun gagal), sembunyikan permanen.
      if (libraryListSkeleton) libraryListSkeleton.hidden = true;
    }

    if (uploadedList && uploadedEmpty) {
      clearChildren(uploadedList);
      const uploaded = await getUploadedFonts();
      if (uploaded.length === 0) {
        uploadedList.hidden = true;
        uploadedEmpty.hidden = false;
        if (uploadedPagination) uploadedPagination.hidden = true;
      } else {
        uploadedList.hidden = false;
        uploadedEmpty.hidden = true;
        uploadedPage = clampPage(uploadedPage, uploaded.length);
        const start = (uploadedPage - 1) * PAGE_SIZE;
        const pageItems = uploaded.slice(start, start + PAGE_SIZE);
        for (const font of pageItems) {
          uploadedList.appendChild(createUploadedItem(font, { onChange: load }));
        }
        if (uploadedPagination) {
          renderPagination(uploadedPagination, uploadedPage, uploaded.length, (page) => {
            uploadedPage = page;
            load();
          });
        }
      }
    }
  }

  if (uploadBtn && uploadInput) {
    uploadBtn.addEventListener("click", () => uploadInput.click());
    uploadInput.addEventListener("change", async () => {
      const files = Array.from(uploadInput.files || []);
      if (files.length === 0) return;

      uploadBtn.disabled = true;
      const originalTitle = uploadBtn.querySelector(".font-manager-upload-btn__title")?.textContent;
      const titleEl = uploadBtn.querySelector(".font-manager-upload-btn__title");
      if (titleEl) titleEl.textContent = t("fonts.uploading");

      let successCount = 0;
      for (const file of files) {
        try {
          await installCustomFont(file);
          successCount++;
        } catch (err) {
          console.error("Gagal mengunggah font:", err);
          showToast(err.message || `Gagal mengunggah "${file.name}".`, { tone: "danger" });
        }
      }

      if (successCount > 0) {
        showToast(
          successCount === 1 ? "Font berhasil diunggah." : `${successCount} font berhasil diunggah.`
        );
        await load();
      }

      uploadBtn.disabled = false;
      if (titleEl) titleEl.textContent = originalTitle || t("fonts.upload");
      uploadInput.value = "";
    });
  }

  await load();
}

/** Init untuk SPA / multi-page. */
export async function initFontManager() {
  initI18n();
  return boot();
}

if (!window.__MEIMO_SPA__) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
