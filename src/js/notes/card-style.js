/**
 * card-style.js
 * Entry point halaman Customisasi Kartu (card-style.html) — kustomisasi
 * tampilan kartu note SATU PER SATU (per-note), dibuka lewat menu titik-tiga
 * di note card (lihat notes/note-card.js openCardMenu -> "Customisasi").
 *
 * Yang bisa dikustomisasi (semua disimpan di note.metadata.cardStyle —
 * lihat db/schema.js createDefaultCardStyle):
 *   - Font judul kartu (dari daftar font yang sama dengan editor, lihat
 *     services/font-service.js).
 *   - Bentuk edge/keliling kartu (border-radius/clip-path — lihat
 *     card-style-presets.js EDGE_SHAPES; dimensi kartu TIDAK pernah berubah).
 *   - Warna latar kartu.
 *   - Gambar latar kartu (opsional, disimpan sbg asset lewat Document Service
 *     yang sama dipakai gambar isi catatan).
 *
 * Perubahan hanya diterapkan ke DRAFT di memori (untuk pratinjau langsung)
 * sampai tombol "Simpan" ditekan — baru saat itu ditulis ke IndexedDB lewat
 * documentService.setCardStyle().
 */

import * as documentService from "../services/document-service.js";
import { ensureInstalledFontsLoaded, getAvailableFonts } from "../services/font-service.js";
import { createDefaultCardStyle } from "../db/schema.js";
import { createEl, clearChildren, openPanel, closeTransientPickers } from "../utils/dom.js";
import { createNoteCard } from "./note-card.js";
import { EDGE_SHAPES, BG_COLOR_PRESETS } from "./card-style-presets.js";
import { showToast } from "../../components/toast.js";

/** Ambil `id` note dari URL: bentuk cantik /card-style/<id> (lihat .htaccess
 * di root project) atau fallback ?id=... saat dibuka langsung tanpa rewrite. */
function getNoteIdFromUrl() {
  const pathMatch = window.location.pathname.match(/\/card-style\/([^/]+)\/?$/i);
  if (pathMatch) return decodeURIComponent(pathMatch[1]);
  return new URLSearchParams(window.location.search).get("id");
}

async function boot() {
  const skeleton = document.getElementById("cardStyleSkeleton");
  const previewSlot = document.getElementById("cardPreviewSlot");
  const fontSelect = document.getElementById("fontSelect");
  const edgeShapeList = document.getElementById("edgeShapeList");
  const bgColorList = document.getElementById("bgColorList");
  const bgColorCustom = document.getElementById("bgColorCustom");
  const bgImageInput = document.getElementById("bgImageInput");
  const bgImageUploadBtn = document.getElementById("bgImageUploadBtn");
  const bgImageRemoveBtn = document.getElementById("bgImageRemoveBtn");
  const bgImageOpacityRow = document.getElementById("bgImageOpacityRow");
  const bgImageOpacity = document.getElementById("bgImageOpacity");
  const bgImageOpacityValue = document.getElementById("bgImageOpacityValue");
  const resetBtn = document.getElementById("resetBtn");
  const saveBtn = document.getElementById("saveBtn");

  if (!previewSlot) return;

  const noteId = getNoteIdFromUrl();
  const note = noteId ? await documentService.loadNote(noteId) : null;
  if (!note) {
    window.location.href = "/library";
    return;
  }

  await ensureInstalledFontsLoaded();
  const fonts = await getAvailableFonts();

  const originalCardStyle = note.metadata.cardStyle
    ? { ...createDefaultCardStyle(), ...note.metadata.cardStyle }
    : createDefaultCardStyle();

  // Draft yang dikustomisasi secara langsung di memori — baru dipersist
  // saat tombol Simpan ditekan.
  let draft = { ...originalCardStyle };

  // State unggahan gambar latar baru (belum disimpan) — lihat pola yang
  // sama di toolbar/image-sheet.js: bytes dibaca SEDINI mungkin begitu
  // file dipilih, supaya tidak kena masalah izin baca file di mobile.
  let pendingFile = null;
  let pendingMimeType = null;
  let pendingBytesPromise = null;
  let pendingPreviewUrl = null;
  let removeExistingImage = false;

  function renderPreview() {
    clearChildren(previewSlot);
    const hasImage = !!pendingPreviewUrl || (!removeExistingImage && !!draft.bgImageAssetId);

    const previewNote = {
      ...note,
      metadata: {
        ...note.metadata,
        cardStyle: {
          ...draft,
          // Kalau ada pendingPreviewUrl (gambar baru baru saja dipilih), jangan
          // kasih bgImageAssetId (lama) ke createNoteCard() sama sekali —
          // note-card.js applyStoredCardStyle() fetch gambar itu secara ASYNC
          // (getObjectUrl().then(...)), dan kalau dibiarkan, promise itu bisa
          // resolve BELAKANGAN lalu menimpa balik --card-bg-image yang barusan
          // di-set ke gambar baru di bawah (race condition — preview kelihatan
          // "tidak update" padahal cuma ketiban balik ke gambar lama).
          bgImageAssetId:
            removeExistingImage || pendingPreviewUrl ? null : draft.bgImageAssetId,
        },
      },
    };
    const card = createNoteCard(previewNote, {});
    card.classList.add("card-style-preview__card");
    card.addEventListener("click", (e) => e.preventDefault());
    if (pendingPreviewUrl) {
      card.classList.add("has-bg-image");
      card.style.setProperty("--card-bg-image", `url("${pendingPreviewUrl}")`);
      card.style.setProperty("--card-bg-opacity", draft.bgImageOpacity);
    }
    previewSlot.appendChild(card);

    bgImageRemoveBtn.hidden = !hasImage;
    bgImageOpacityRow.hidden = !hasImage;
    if (hasImage) {
      bgImageOpacity.value = draft.bgImageOpacity;
      bgImageOpacityValue.textContent = `${Math.round(draft.bgImageOpacity * 100)}%`;
    }
  }

  /* ---- Font Judul (dropdown custom — lihat toolbar/dropdowns/font-family-dropdown.js
     untuk pola yang sama: tombol trigger + panel mengambang lewat openPanel(),
     bukan <select> bawaan browser, supaya tiap opsi bisa ditampilkan
     memakai font-nya sendiri sebagai pratinjau). */
  const fontSelectLabel = document.getElementById("fontSelectLabel");
  const fontOptions = [{ id: "__default__", name: "Default", family: null }, ...fonts];

  function currentFontOption() {
    return fontOptions.find((f) => f.family === draft.titleFont) || fontOptions[0];
  }

  function renderFontSelect() {
    const current = currentFontOption();
    fontSelectLabel.textContent = current.name;
    fontSelectLabel.style.fontFamily = current.family ? `"${current.family}"` : "";
  }

  function buildFontPanel() {
    const panel = createEl("div", { className: "toolbar-panel__list card-style-font-panel" });
    for (const font of fontOptions) {
      const item = createEl("button", {
        className:
          "toolbar-panel__item" + (draft.titleFont === font.family ? " is-active" : ""),
        attrs: { type: "button", role: "option" },
        text: font.name,
      });
      if (font.family) item.style.fontFamily = `"${font.family}"`;
      item.addEventListener("click", () => {
        draft.titleFont = font.family;
        renderFontSelect();
        renderPreview();
        closeTransientPickers();
      });
      panel.appendChild(item);
    }
    return panel;
  }

  fontSelect.addEventListener("click", () => {
    openPanel(fontSelect, buildFontPanel(), { align: "left" });
  });

  /* ---- Bentuk Edge ---- */
  // Sebelumnya renderEdgeShapeList() dipanggil ulang tiap klik shape, yang
  // berarti clearChildren() + bangun ulang SEMUA tombol dari nol — DOM
  // baru itu bikin browser reset scrollLeft strip ke 0 setiap klik. Fix:
  // list dibangun SEKALI saja; klik shape cuma menukar class "is-active"
  // di tombol yang sudah ada (tidak menyentuh DOM/scroll strip sama sekali).
  function updateEdgeShapeActiveState() {
    for (const item of edgeShapeList.children) {
      item.classList.toggle("is-active", item.dataset.shapeId === draft.edgeShape);
    }
  }

  function renderEdgeShapeList() {
    clearChildren(edgeShapeList);
    for (const shape of EDGE_SHAPES) {
      const item = createEl("button", {
        className:
          "card-style-shape-item" + (draft.edgeShape === shape.id ? " is-active" : ""),
        attrs: { type: "button", "data-shape-id": shape.id },
      });
      const swatch = createEl("span", { className: "card-style-shape-item__swatch" });
      swatch.style.borderRadius = shape.borderRadius;
      swatch.style.clipPath = shape.clipPath;
      item.appendChild(swatch);
      item.appendChild(createEl("span", { className: "card-style-shape-item__label", text: shape.label }));
      item.addEventListener("click", () => {
        draft.edgeShape = shape.id;
        updateEdgeShapeActiveState();
        renderPreview();
      });
      edgeShapeList.appendChild(item);
    }
  }

  /* ---- Warna Latar ---- */
  function renderBgColorList() {
    clearChildren(bgColorList);
    for (const preset of BG_COLOR_PRESETS) {
      const swatch = createEl("button", {
        className:
          "card-style-color-swatch" +
          (!preset.hex ? " card-style-color-swatch--none" : "") +
          (draft.bgColor === preset.hex ? " is-active" : ""),
        attrs: { type: "button", title: preset.label, "aria-label": preset.label },
      });
      if (preset.hex) swatch.style.backgroundColor = preset.hex;
      swatch.addEventListener("click", () => {
        draft.bgColor = preset.hex;
        renderBgColorList();
        renderPreview();
      });
      bgColorList.appendChild(swatch);
    }
  }

  bgColorCustom.addEventListener("input", () => {
    draft.bgColor = bgColorCustom.value;
    renderBgColorList();
    renderPreview();
  });

  /* ---- Gambar Latar ---- */
  bgImageUploadBtn.addEventListener("click", () => bgImageInput.click());
  bgImageInput.addEventListener("change", () => {
    const file = bgImageInput.files && bgImageInput.files[0];
    if (!file) return;
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    pendingFile = file;
    pendingMimeType = file.type;
    pendingPreviewUrl = URL.createObjectURL(file);
    // Baca ArrayBuffer sekarang juga (bukan nanti saat Simpan ditekan) —
    // lihat catatan panjang di toolbar/image-sheet.js soal kenapa ini penting
    // untuk keandalan di mobile (izin baca file dari photo picker bersifat singkat).
    pendingBytesPromise = file.arrayBuffer();
    removeExistingImage = false;
    renderPreview();
  });

  bgImageRemoveBtn.addEventListener("click", () => {
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
      pendingPreviewUrl = null;
      pendingFile = null;
      pendingMimeType = null;
      pendingBytesPromise = null;
    }
    removeExistingImage = true;
    bgImageInput.value = "";
    renderPreview();
  });

  bgImageOpacity.addEventListener("input", () => {
    draft.bgImageOpacity = parseFloat(bgImageOpacity.value);
    bgImageOpacityValue.textContent = `${Math.round(draft.bgImageOpacity * 100)}%`;
    const card = previewSlot.firstElementChild;
    if (card) card.style.setProperty("--card-bg-opacity", draft.bgImageOpacity);
  });

  /* ---- Setel Ulang & Simpan ---- */
  resetBtn.addEventListener("click", () => {
    draft = createDefaultCardStyle();
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    pendingFile = null;
    pendingMimeType = null;
    pendingBytesPromise = null;
    pendingPreviewUrl = null;
    removeExistingImage = !!originalCardStyle.bgImageAssetId;
    bgImageInput.value = "";
    bgColorCustom.value = "#4A55C7";
    renderFontSelect();
    renderEdgeShapeList();
    renderBgColorList();
    renderPreview();
  });

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try {
      let bgImageAssetId = draft.bgImageAssetId;
      const previousAssetId = originalCardStyle.bgImageAssetId;

      if (removeExistingImage && !pendingFile) {
        bgImageAssetId = null;
      }

      if (pendingFile) {
        const bytes = await pendingBytesPromise;
        bgImageAssetId = await documentService.saveImageAsset(note.id, bytes, pendingMimeType);
      }

      // Buang asset lama kalau diganti/dihapus, supaya tidak jadi sampah
      // tak terpakai di object store `assets`.
      if (previousAssetId && previousAssetId !== bgImageAssetId) {
        await documentService.deleteImageAsset(previousAssetId);
      }

      const finalCardStyle = { ...draft, bgImageAssetId };
      await documentService.setCardStyle(note.id, finalCardStyle);
      showToast("Tampilan kartu disimpan.");
      window.location.href = "/library";
    } catch (err) {
      console.error("Gagal menyimpan customisasi kartu:", err);
      showToast("Gagal menyimpan customisasi kartu.", { tone: "danger" });
      saveBtn.disabled = false;
    }
  });

  renderFontSelect();
  renderEdgeShapeList();
  renderBgColorList();
  if (draft.bgColor) bgColorCustom.value = draft.bgColor;
  renderPreview();

  // Skeleton cuma perlu tampil sekali di load pertama (biar tidak "kedip
  // putih" pas navigasi ke halaman ini) — begitu semua section sudah
  // dirender dengan data asli, sembunyikan permanen (lihat pola yang sama
  // di fonts/font-manager.js).
  if (skeleton) skeleton.hidden = true;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
