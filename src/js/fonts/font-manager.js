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
  installFont,
  removeFont,
  ensureInstalledFontsLoaded,
  ensureLibraryFontPreviewLoaded,
} from "../services/font-service.js";
import { createEl, clearChildren } from "../utils/dom.js";
import { showToast } from "../../components/toast.js";
import { confirmDialog } from "../../components/modal.js";

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

  const badge = createEl("span", { className: "font-item__badge", text: "Bawaan" });

  item.append(info, badge);
  return item;
}

function createLibraryItem(font, { installed, onChange }) {
  const item = createEl("div", { className: "font-item" });

  const info = createEl("div", { className: "font-item__info" });
  const nameEl = createEl("div", { className: "font-item__name", text: font.name });
  info.appendChild(nameEl);
  const metaText = font.category ? font.category : "Font tambahan";
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
    actions.appendChild(createEl("span", { className: "font-item__badge font-item__badge--installed", text: "Terpasang" }));
    const removeBtn = createEl("button", {
      className: "font-item__btn font-item__btn--danger",
      text: "Hapus",
      attrs: { type: "button" },
    });
    removeBtn.addEventListener("click", async () => {
      const confirmed = await confirmDialog({
        title: "Hapus font?",
        message: `"${font.name}" akan dihapus dari perangkat ini. Teks yang sudah memakai font ini tidak berubah, tapi tampilannya kembali ke font bawaan sampai diunduh lagi.`,
        confirmLabel: "Hapus",
      });
      if (!confirmed) return;
      await removeFont(font.id);
      showToast(`Font "${font.name}" dihapus.`);
      onChange();
    });
    actions.appendChild(removeBtn);
  } else {
    const downloadBtn = createEl("button", {
      className: "font-item__btn font-item__btn--primary",
      text: "Unduh",
      attrs: { type: "button" },
    });
    downloadBtn.addEventListener("click", async () => {
      downloadBtn.disabled = true;
      downloadBtn.textContent = "Mengunduh…";
      try {
        await installFont(font);
        showToast(`Font "${font.name}" siap dipakai di editor.`);
        onChange();
      } catch (err) {
        console.error("Gagal mengunduh font:", err);
        showToast(`Gagal mengunduh font "${font.name}".`, { tone: "danger" });
        downloadBtn.disabled = false;
        downloadBtn.textContent = "Unduh";
      }
    });
    actions.appendChild(downloadBtn);
  }

  item.append(info, actions);
  return item;
}

async function boot() {
  const builtinList = document.getElementById("builtinFontList");
  const libraryList = document.getElementById("libraryFontList");
  const libraryListSkeleton = document.getElementById("libraryFontListSkeleton");
  const libraryEmptyState = document.getElementById("libraryEmptyState");
  if (!builtinList || !libraryList) return;

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
        return;
      }

      libraryList.hidden = false;
      libraryEmptyState.hidden = true;
      for (const font of library) {
        libraryList.appendChild(
          createLibraryItem(font, { installed: installedIds.has(font.id), onChange: load })
        );
      }
    } finally {
      // Skeleton cuma perlu tampil sekali di load pertama (biar tidak
      // "kedip putih" pas navigasi ke halaman ini) — begitu render
      // pertama selesai (sukses ataupun gagal), sembunyikan permanen.
      if (libraryListSkeleton) libraryListSkeleton.hidden = true;
    }
  }

  await load();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
