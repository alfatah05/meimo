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
import { t, initI18n } from "../i18n/i18n.js";

/** Ambil `id` note dari URL: bentuk cantik /card-style/<id> (lihat .htaccess
 * di root project) atau fallback ?id=... saat dibuka langsung tanpa rewrite. */
function getNoteIdFromUrl() {
  const pathMatch = window.location.pathname.match(/\/card-style\/([^/]+)\/?$/i);
  if (pathMatch) return decodeURIComponent(pathMatch[1]);
  return new URLSearchParams(window.location.search).get("id");
}

async function boot() {
  initI18n();
  const skeleton = document.getElementById("cardStyleSkeleton");
  const previewSlot = document.getElementById("cardPreviewSlot");
  const fontSelect = document.getElementById("fontSelect");
  const edgeShapeList = document.getElementById("edgeShapeList");
  const bgColorList = document.getElementById("bgColorList");
  const bgColorCustom = document.getElementById("bgColorCustom");
  const bgColorOpacity = document.getElementById("bgColorOpacity");
  const bgColorOpacityValue = document.getElementById("bgColorOpacityValue");
  const bgImageInput = document.getElementById("bgImageInput");
  const bgImageUploadBtn = document.getElementById("bgImageUploadBtn");
  const bgImageRemoveBtn = document.getElementById("bgImageRemoveBtn");
  const bgImageOpacity = document.getElementById("bgImageOpacity");
  const bgImageOpacityValue = document.getElementById("bgImageOpacityValue");
  const bgTabs = document.querySelectorAll(".card-style-bg-tab");
  const bgPanels = {
    none: document.getElementById("bgPanelNone"),
    color: document.getElementById("bgPanelColor"),
    image: document.getElementById("bgPanelImage"),
  };
  const hideSnippetToggle = document.getElementById("hideSnippetToggle");
  const resetBtn = document.getElementById("resetBtn");
  const saveBtn = document.getElementById("saveBtn");

  if (!previewSlot) return;

  const noteId = getNoteIdFromUrl();

  // Mulai load data SEGERA (paralel dengan animasi page-in), tapi jangan
  // mutasi DOM dulu. FontFace API + render swatch clip-path kompleks
  // sebelumnya jalan di tengah animasi → naik-nya terasa lambat/berat.
  const dataPromise = Promise.all([
    noteId ? documentService.loadNote(noteId) : Promise.resolve(null),
    ensureInstalledFontsLoaded(),
  ]);

  // Tunggu animasi page transition selesai (SPA: router.waitForPageTransition;
  // multi-page / tanpa VT: langsung lanjut). Fallback timeout supaya tidak
  // menggantung di browser aneh.
  try {
    if (window.__MEIMO_SPA__) {
      const { waitForPageTransition } = await import("../router.js");
      await Promise.race([
        waitForPageTransition(),
        new Promise((r) => setTimeout(r, 450)),
      ]);
    } else if (typeof document.startViewTransition === "function") {
      // Cross-document VT: berikan ruang satu frame + sedikit waktu agar
      // animasi page-in (≈380ms) sempat berjalan di atas skeleton dulu.
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r))
      );
      await new Promise((r) => setTimeout(r, 280));
    }
  } catch (_) {
    /* ignore — jangan gagalkan boot karena helper transisi */
  }

  const [note] = await dataPromise;
  if (!note) {
    if (window.__MEIMO_SPA__) {
      import("../router.js").then((r) => {
        if (r && r.navigate) r.navigate("/library");
        else window.location.href = "/library";
      }).catch(() => { window.location.href = "/library"; });
    } else {
      window.location.href = "/library";
    }
    return;
  }

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

  /* ---- Background mode tabs (none | color | image) ---- */
  let bgMode = "none"; // none | color | image
  let colorRgb = { r: 74, g: 85, b: 199 };
  let colorAlpha = 1;

  function parseCssColor(value) {
    if (!value || typeof value !== "string") return null;
    const v = value.trim();
    if (/^var\(/.test(v)) return null;
    const hex = v.match(/^#([0-9A-Fa-f]{6})$/i);
    if (hex) {
      const n = parseInt(hex[1], 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
    }
    const rgb = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (rgb) {
      return {
        r: Math.min(255, +rgb[1]),
        g: Math.min(255, +rgb[2]),
        b: Math.min(255, +rgb[3]),
        a: rgb[4] !== undefined ? Math.max(0, Math.min(1, +rgb[4])) : 1,
      };
    }
    try {
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;";
      probe.style.backgroundColor = v;
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe).backgroundColor;
      document.body.removeChild(probe);
      const m = computed && computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      if (!m) return null;
      return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
    } catch {
      return null;
    }
  }

  function resolveAnyColor(value) {
    const direct = parseCssColor(value);
    if (direct) return direct;
    if (!value) return null;
    try {
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;";
      probe.style.backgroundColor = value;
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe).backgroundColor;
      document.body.removeChild(probe);
      const m = computed && computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      if (!m) return null;
      return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
    } catch {
      return null;
    }
  }

  function toHex({ r, g, b }) {
    const h = (n) => n.toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
  }

  function formatCssColor({ r, g, b, a }) {
    if (a >= 0.995) return toHex({ r, g, b });
    const aStr = Math.round(a * 100) / 100;
    return `rgba(${r}, ${g}, ${b}, ${aStr})`;
  }

  function detectBgMode() {
    const hasImage = !!pendingPreviewUrl || (!removeExistingImage && !!draft.bgImageAssetId);
    if (hasImage) return "image";
    if (draft.bgColor) return "color";
    return "none";
  }

  function setBgMode(mode, { applyDefaults = true } = {}) {
    bgMode = mode;
    for (const tab of bgTabs) {
      const on = tab.dataset.tab === mode;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", String(on));
    }
    for (const [key, panel] of Object.entries(bgPanels)) {
      if (!panel) continue;
      const on = key === mode;
      panel.classList.toggle("is-active", on);
      panel.hidden = !on;
    }

    if (!applyDefaults) return;

    if (mode === "none") {
      draft.bgColor = null;
      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
        pendingPreviewUrl = null;
        pendingFile = null;
        pendingMimeType = null;
        pendingBytesPromise = null;
      }
      removeExistingImage = !!originalCardStyle.bgImageAssetId;
      if (bgImageInput) bgImageInput.value = "";
    } else if (mode === "color") {
      // Hapus gambar bila pindah ke color
      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
        pendingPreviewUrl = null;
        pendingFile = null;
        pendingMimeType = null;
        pendingBytesPromise = null;
      }
      removeExistingImage = true;
      if (bgImageInput) bgImageInput.value = "";
      if (!draft.bgColor) {
        draft.bgColor = formatCssColor({ ...colorRgb, a: colorAlpha });
      } else {
        const p = resolveAnyColor(draft.bgColor);
        if (p) {
          colorRgb = { r: p.r, g: p.g, b: p.b };
          colorAlpha = p.a;
        }
      }
      if (bgColorCustom) bgColorCustom.value = toHex(colorRgb);
      if (bgColorOpacity) {
        bgColorOpacity.value = String(colorAlpha);
        bgColorOpacityValue.textContent = `${Math.round(colorAlpha * 100)}%`;
      }
    } else if (mode === "image") {
      // Hapus warna solid
      draft.bgColor = null;
      removeExistingImage = false;
      if (bgImageOpacity) {
        const op = draft.bgImageOpacity != null ? draft.bgImageOpacity : 1;
        bgImageOpacity.value = String(op);
        bgImageOpacityValue.textContent = `${Math.round(op * 100)}%`;
      }
    }
  }


  function applyPreviewBackground(card) {
    if (!card || !pendingPreviewUrl) return;
    card.classList.add("has-bg-image");
    card.style.setProperty("--card-bg-image", `url("${pendingPreviewUrl}")`);
    card.style.setProperty(
      "--card-bg-opacity",
      String(draft.bgImageOpacity != null ? draft.bgImageOpacity : 1)
    );
  }


  function syncHideSnippetToggle() {
    if (!hideSnippetToggle) return;
    const on = !!draft.hideSnippet;
    hideSnippetToggle.classList.toggle("is-on", on);
    hideSnippetToggle.setAttribute("aria-checked", String(on));
  }

  function renderPreview() {
    clearChildren(previewSlot);
    const hasImage = !!pendingPreviewUrl || (!removeExistingImage && !!draft.bgImageAssetId);

    const previewNote = {
      ...note,
      metadata: {
        ...note.metadata,
        cardStyle: {
          ...draft,
          // Jangan kirim bgImageAssetId lama saat ada preview pending —
          // getObjectUrl async bisa menimpa --card-bg-image blob URL.
          bgImageAssetId:
            removeExistingImage || pendingPreviewUrl ? null : draft.bgImageAssetId,
        },
      },
    };
    const card = createNoteCard(previewNote, {});
    card.classList.add("card-style-preview__card");
    card.addEventListener("click", (e) => e.preventDefault());
    applyPreviewBackground(card);
    if (draft.hideSnippet) {
      card.classList.add("note-card--hide-snippet");
      const snip = card.querySelector(".note-card__snippet");
      if (snip) snip.hidden = true;
    }
    previewSlot.appendChild(card);
    syncHideSnippetToggle();
    // First-open PWA / file-picker return: paint ulang var CSS di frame berikutnya.
    if (pendingPreviewUrl) {
      const urlSnapshot = pendingPreviewUrl;
      requestAnimationFrame(() => {
        if (pendingPreviewUrl !== urlSnapshot) return;
        applyPreviewBackground(previewSlot.firstElementChild);
      });
    }

    if (bgImageRemoveBtn) bgImageRemoveBtn.hidden = !hasImage;
    if (hasImage && bgImageOpacity) {
      const op = draft.bgImageOpacity != null ? draft.bgImageOpacity : 1;
      bgImageOpacity.value = String(op);
      if (bgImageOpacityValue) bgImageOpacityValue.textContent = `${Math.round(op * 100)}%`;
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

  /* ---- Warna Latar (tab color) ---- */
  function colorMatchesActive(presetHex) {
    if (!presetHex && !draft.bgColor) return bgMode === "none";
    if (!presetHex) return false;
    if (draft.bgColor === presetHex) return true;
    // Match hex/rgba against resolved preset
    const a = resolveAnyColor(draft.bgColor);
    const b = resolveAnyColor(presetHex);
    if (!a || !b) return false;
    return a.r === b.r && a.g === b.g && a.b === b.b && Math.abs(a.a - b.a) < 0.02;
  }

  function renderBgColorList() {
    if (!bgColorList) return;
    clearChildren(bgColorList);
    for (const preset of BG_COLOR_PRESETS) {
      // Skip "Default"/null preset — digantikan tab None
      if (!preset.hex) continue;
      const swatch = createEl("button", {
        className:
          "card-style-color-swatch" +
          (bgMode === "color" && colorMatchesActive(preset.hex) ? " is-active" : ""),
        attrs: { type: "button", title: preset.label, "aria-label": preset.label },
      });
      swatch.style.backgroundColor = preset.hex;
      swatch.addEventListener("click", () => {
        draft.bgColor = preset.hex;
        const resolved = resolveAnyColor(preset.hex);
        if (resolved) {
          colorRgb = { r: resolved.r, g: resolved.g, b: resolved.b };
          colorAlpha = resolved.a;
          if (bgColorCustom) bgColorCustom.value = toHex(colorRgb);
          if (bgColorOpacity) {
            bgColorOpacity.value = String(colorAlpha);
            bgColorOpacityValue.textContent = `${Math.round(colorAlpha * 100)}%`;
          }
        }
        renderBgColorList();
        renderPreview();
      });
      bgColorList.appendChild(swatch);
    }
  }

  if (bgColorCustom) {
    bgColorCustom.addEventListener("input", () => {
      const p = parseCssColor(bgColorCustom.value);
      if (!p) return;
      colorRgb = { r: p.r, g: p.g, b: p.b };
      draft.bgColor = formatCssColor({ ...colorRgb, a: colorAlpha });
      renderBgColorList();
      renderPreview();
    });
  }

  if (bgColorOpacity) {
    bgColorOpacity.addEventListener("input", () => {
      colorAlpha = Math.max(0, Math.min(1, parseFloat(bgColorOpacity.value) || 0));
      bgColorOpacityValue.textContent = `${Math.round(colorAlpha * 100)}%`;
      // Ambil RGB dari warna aktif (preset var / custom)
      const resolved = resolveAnyColor(draft.bgColor) || colorRgb;
      colorRgb = { r: resolved.r, g: resolved.g, b: resolved.b };
      draft.bgColor = formatCssColor({ ...colorRgb, a: colorAlpha });
      renderBgColorList();
      renderPreview();
    });
  }

  /* ---- Tab bar ---- */
  for (const tab of bgTabs) {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.tab;
      if (!mode || mode === bgMode) return;
      setBgMode(mode, { applyDefaults: true });
      renderBgColorList();
      renderPreview();
    });
  }

  /* ---- Gambar Latar (tab image) ---- */
  if (bgImageUploadBtn) bgImageUploadBtn.addEventListener("click", () => bgImageInput.click());
  if (bgImageInput) {
    bgImageInput.addEventListener("change", async () => {
      const file = bgImageInput.files && bgImageInput.files[0];
      if (!file) return;
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
      pendingFile = file;
      pendingMimeType = file.type || "image/png";
      pendingBytesPromise = file.arrayBuffer();
      const objectUrl = URL.createObjectURL(file);
      try {
        await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = objectUrl;
        });
      } catch (_) {}
      pendingPreviewUrl = objectUrl;
      removeExistingImage = false;
      draft.bgColor = null;
      if (bgMode !== "image") setBgMode("image", { applyDefaults: false });
      renderPreview();
    });
  }

  if (bgImageRemoveBtn) {
    bgImageRemoveBtn.addEventListener("click", () => {
      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
        pendingPreviewUrl = null;
        pendingFile = null;
        pendingMimeType = null;
        pendingBytesPromise = null;
      }
      removeExistingImage = true;
      if (bgImageInput) bgImageInput.value = "";
      setBgMode("none", { applyDefaults: true });
      renderBgColorList();
      renderPreview();
    });
  }

  if (bgImageOpacity) {
    bgImageOpacity.addEventListener("input", () => {
      draft.bgImageOpacity = parseFloat(bgImageOpacity.value);
      bgImageOpacityValue.textContent = `${Math.round(draft.bgImageOpacity * 100)}%`;
      const card = previewSlot.firstElementChild;
      if (card) card.style.setProperty("--card-bg-opacity", draft.bgImageOpacity);
    });
  }

  /* ---- Setel Ulang & Simpan ---- */
  if (hideSnippetToggle) {
    hideSnippetToggle.addEventListener("click", () => {
      draft.hideSnippet = !draft.hideSnippet;
      syncHideSnippetToggle();
      renderPreview();
    });
  }

  resetBtn.addEventListener("click", () => {
    draft = createDefaultCardStyle();
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    pendingFile = null;
    pendingMimeType = null;
    pendingBytesPromise = null;
    pendingPreviewUrl = null;
    removeExistingImage = !!originalCardStyle.bgImageAssetId;
    if (bgImageInput) bgImageInput.value = "";
    colorRgb = { r: 74, g: 85, b: 199 };
    colorAlpha = 1;
    if (bgColorCustom) bgColorCustom.value = "#4A55C7";
    if (bgColorOpacity) {
      bgColorOpacity.value = "1";
      bgColorOpacityValue.textContent = "100%";
    }
    setBgMode("none", { applyDefaults: false });
    draft.bgColor = null;
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
      showToast(t("cardStyle.saved"));
      if (window.__MEIMO_SPA__) {
        import("../router.js").then((r) => {
          if (r && typeof r.navigate === "function") r.navigate("/library");
          else window.location.href = "/library";
        }).catch(() => { window.location.href = "/library"; });
      } else {
        window.location.href = "/library";
      }
    } catch (err) {
      console.error("Gagal menyimpan customisasi kartu:", err);
      showToast(t("cardStyle.saveFail"), { tone: "danger" });
      saveBtn.disabled = false;
    }
  });

  renderFontSelect();
  renderEdgeShapeList();
  // Init mode dari draft tersimpan
  const initialMode = detectBgMode();
  if (draft.bgColor) {
    const p = resolveAnyColor(draft.bgColor);
    if (p) {
      colorRgb = { r: p.r, g: p.g, b: p.b };
      colorAlpha = p.a;
    }
    if (bgColorCustom) bgColorCustom.value = toHex(colorRgb);
    if (bgColorOpacity) {
      bgColorOpacity.value = String(colorAlpha);
      bgColorOpacityValue.textContent = `${Math.round(colorAlpha * 100)}%`;
    }
  }
  setBgMode(initialMode, { applyDefaults: false });
  renderBgColorList();
  renderPreview();

  // Skeleton cuma perlu tampil sekali di load pertama (biar tidak "kedip
  // putih" pas navigasi ke halaman ini) — begitu semua section sudah
  // dirender dengan data asli, sembunyikan permanen (lihat pola yang sama
  // di fonts/font-manager.js).
  if (skeleton) skeleton.hidden = true;
}

/** Init untuk SPA / multi-page. */
export async function initCardStyle() {
  return boot();
}

if (!window.__MEIMO_SPA__) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
