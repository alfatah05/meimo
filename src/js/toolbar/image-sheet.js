/**
 * image-sheet.js
 * Bottom sheet kustomisasi gambar — dibuka begitu tombol "Sisipkan Gambar"
 * di floating toolbar ditekan (mode "insert", placeholder block gambar
 * sudah disisipkan lebih dulu lewat commands.js insertImagePlaceholder),
 * atau begitu sebuah block gambar yang sudah ada di dokumen diketuk (mode
 * "edit").
 *
 * Sheet ini SENGAJA memanipulasi elemen DOM block gambar secara LANGSUNG
 * untuk pratinjau (posisi/wrap/lebar/tinggi/border-radius/crop-bentuk/gambar) selama
 * sheet masih terbuka — model dokumen baru benar-benar dimutasi (lewat
 * commands.js updateImageBlock) saat tombol "Terapkan" ditekan:
 *   - Tombol "Batal" membuang pratinjau: di mode "insert", block
 *     placeholder-nya dihapus total dari model (removeImageBlock); di mode
 *     "edit", editor cukup di-render ulang dari model yang tidak berubah
 *     (editor.renderAll()) untuk membuang pratinjau di DOM.
 *   - Tombol "Terapkan" mengunggah file yang dipilih (kalau ada) ke
 *     services/image-service.js, lalu mengunci semua pengaturan ke model
 *     lewat satu command (satu langkah undo).
 */

import { createEl, qs } from "../utils/dom.js";
import { insertImagePlaceholder, updateImageBlock, removeImageBlock } from "../editor/commands.js";
import { IMAGE_DEFAULTS } from "../editor/block-model.js";
import * as imageService from "../services/image-service.js";
import { IMAGE_CLIP_SHAPES, ensureClipDefsInjected, getClipPathCssValue } from "../editor/image-clip-shapes.js";
import { registerActiveSheet, closeActiveSheet, clearActiveSheet } from "./active-sheet.js";
import { t } from "../i18n/i18n.js";

const WIDTH_RANGE = { min: 10, max: 640 };
const HEIGHT_RANGE = { min: 10, max: 640 };
const RADIUS_RANGE = { min: 0, max: 1000 };

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** Baca dimensi asli (naturalWidth/naturalHeight) sebuah gambar dari URL-nya,
 * dipakai untuk menghitung rasio aspek sungguhan dari gambar yang diunggah
 * user (dipakai oleh toggle "Kunci Rasio" di bawah) — bukan rasio slider
 * Lebar/Tinggi yang sedang dipakai untuk pratinjau. Resolve ke `null` kalau
 * gambar gagal dimuat, supaya pemanggil bisa jatuh balik dengan aman. */
function loadNaturalAspectRatio(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const ALIGN_OPTIONS = [
  {
    value: "left",
    labelKey: "image.align.left",
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="10" height="16" rx="1.5"/><line x1="16" y1="8" x2="21" y2="8"/><line x1="16" y1="12" x2="21" y2="12"/><line x1="16" y1="16" x2="21" y2="16"/></svg>',
  },
  {
    value: "center",
    labelKey: "image.align.center",
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="4" width="10" height="10" rx="1.5"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
  },
  {
    value: "right",
    labelKey: "image.align.right",
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="11" y="4" width="10" height="16" rx="1.5"/><line x1="3" y1="8" x2="8" y2="8"/><line x1="3" y1="12" x2="8" y2="12"/><line x1="3" y1="16" x2="8" y2="16"/></svg>',
  },
];

// Cuma satu bottom sheet (Gambar/Scene/Musik, lintas file) yang boleh
// terbuka dalam satu waktu — lihat active-sheet.js untuk koordinatornya.

/** Terapkan pengaturan pratinjau (align/wrap/ukuran/radius) langsung ke
 * elemen block gambar di DOM, TANPA menyentuh model — dipakai selama sheet
 * masih terbuka supaya perubahan slider/tombol terasa instan. */
function applyPreviewToBlockEl(blockEl, settings) {
  if (!blockEl) return;
  blockEl.style.setProperty("--img-w", `${settings.width}px`);
  blockEl.style.setProperty("--img-h", `${settings.height}px`);
  blockEl.style.setProperty("--img-radius", `${settings.radius}px`);
  blockEl.style.setProperty("--img-clip", getClipPathCssValue(settings.clipShape));
  blockEl.style.setProperty("--img-ox", `${settings.offsetX || 0}px`);
  blockEl.style.setProperty("--img-oy", `${settings.offsetY || 0}px`);
  blockEl.style.setProperty("--img-scale", String(settings.scale != null ? settings.scale : 1));
  blockEl.style.setProperty("--img-rotate", `${settings.rotate || 0}deg`);
  blockEl.classList.toggle("editor-block--image-clipped", settings.clipShape !== "none");
  blockEl.classList.toggle("editor-block--image-transparent", !!settings.transparentBg);
  blockEl.classList.remove(
    "editor-block--image-left",
    "editor-block--image-center",
    "editor-block--image-right"
  );
  blockEl.classList.add(`editor-block--image-${settings.align}`);
  blockEl.classList.toggle(
    "editor-block--image-wrap",
    !!settings.wrap && settings.align !== "center"
  );
}

function setPreviewImageSrc(blockEl, url) {
  if (!blockEl) return;
  const frame = qs(".editor-image__frame", blockEl);
  if (!frame) return;
  frame.classList.remove("editor-image__frame--empty");
  let img = qs(".editor-image__img", frame);
  if (!img) {
    frame.innerHTML = "";
    img = createEl("img", { className: "editor-image__img", attrs: { alt: "", draggable: "false" } });
    frame.appendChild(img);
  }
  img.src = url;
}

const RULER_TICK_PX = 5; // jarak antar garis tetap (= 1 unit nilai), konsisten di semua range

/**
 * Ruler drag + momentum (fling), VIRTUAL TICKS.
 * Tidak pernah membangun (max-min) DOM tick — hanya garis di sekitar
 * viewport (+overscan). Jarak antar tick tetap RULER_TICK_PX walau
 * range-nya -9999…9999.
 * Pointer fixed di tengah; nilai diubah dari delta drag.
 */
function makeRuler(labelText, range, initial, onInput, { format } = {}) {
  const fmt = format || ((v) => `${v}px`);
  const row = createEl("div", { className: "image-sheet__ruler-row" });
  row.appendChild(createEl("span", { className: "image-sheet__ruler-label", text: labelText }));

  const wrap = createEl("div", { className: "image-sheet__ruler-wrap" });
  const viewport = createEl("div", { className: "image-sheet__ruler-viewport" });
  const track = createEl("div", { className: "image-sheet__ruler-track image-sheet__ruler-track--virtual" });
  // Track tidak punya width raksasa — tick diposisikan relatif ke pusat pointer.
  track.style.width = "100%";
  track.style.transform = "none";
  viewport.appendChild(track);
  wrap.append(
    viewport,
    createEl("div", { className: "image-sheet__ruler-pointer", attrs: { "aria-hidden": "true" } })
  );

  const valueEl = createEl("span", { className: "image-sheet__ruler-value", text: fmt(Math.round(Number(initial))) });
  row.append(wrap, valueEl);

  const min = range.min;
  const max = range.max;
  let frac = clamp(Number(initial), min, max);
  let current = Math.round(frac);
  let dragging = false;
  let originX = 0;
  let originFrac = 0;
  const samples = [];
  let raf = 0;
  let lastEmit = current;
  // Pool tick nodes supaya tidak create/destroy tiap frame drag
  const tickPool = [];

  function centerX() {
    return (viewport.clientWidth || wrap.clientWidth || 0) / 2;
  }

  function ensurePool(n) {
    while (tickPool.length < n) {
      const tick = document.createElement("div");
      tick.className = "image-sheet__ruler-tick";
      tick.style.position = "absolute";
      tick.style.top = "0";
      tick.style.bottom = "0";
      tickPool.push(tick);
      track.appendChild(tick);
    }
  }

  function layoutTicks() {
    const cx = centerX();
    const vpW = viewport.clientWidth || wrap.clientWidth || 200;
    // cukup tutup viewport + overscan kiri/kanan
    const half = Math.ceil(vpW / RULER_TICK_PX) + 12;
    const centerInt = Math.round(frac);
    const v0 = Math.max(min, centerInt - half);
    const v1 = Math.min(max, centerInt + half);
    const need = Math.max(0, v1 - v0 + 1);
    ensurePool(need);
    for (let i = 0; i < tickPool.length; i++) {
      const tick = tickPool[i];
      if (i >= need) {
        tick.style.display = "none";
        continue;
      }
      const v = v0 + i;
      tick.style.display = "";
      // Posisi di viewport: pusat pointer = nilai `frac`
      const x = cx + (v - frac) * RULER_TICK_PX;
      tick.style.left = `${x}px`;
      // Major tick tiap 10 unit (opsional visual)
      tick.classList.toggle("is-major", v % 10 === 0);
    }
  }

  function paint(f) {
    frac = clamp(f, min, max);
    layoutTicks();
    const snapped = Math.round(frac);
    if (snapped !== lastEmit) {
      lastEmit = snapped;
      current = snapped;
      valueEl.textContent = fmt(current);
      onInput(current);
    } else {
      valueEl.textContent = fmt(current);
    }
  }

  function setValue(v, { silent = false } = {}) {
    cancelMomentum();
    frac = clamp(Math.round(v), min, max);
    current = Math.round(frac);
    lastEmit = current;
    layoutTicks();
    valueEl.textContent = fmt(current);
    if (!silent) onInput(current);
  }

  function cancelMomentum() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function startMomentum(velocityPxPerMs) {
    let v = (-velocityPxPerMs / RULER_TICK_PX) * 2.8;
    const MAX_V = 1.1;
    if (Math.abs(v) > MAX_V) v = Math.sign(v) * MAX_V;
    const FRICTION = 0.0028;
    let prev = performance.now();

    const step = (now) => {
      const dt = Math.min(34, now - prev);
      prev = now;
      if (dt > 0) {
        v *= Math.exp(-FRICTION * dt);
        if (Math.abs(v) < 0.00012) {
          frac = clamp(Math.round(frac), min, max);
          paint(frac);
          raf = 0;
          return;
        }
        paint(frac + v * dt);
        if (frac <= min || frac >= max) {
          frac = clamp(frac, min, max);
          v = 0;
          paint(frac);
          raf = 0;
          return;
        }
      }
      raf = requestAnimationFrame(step);
    };
    cancelMomentum();
    raf = requestAnimationFrame(step);
  }

  function recordSample(clientX, t) {
    samples.push({ x: clientX, t });
    const cut = t - 120;
    while (samples.length && samples[0].t < cut) samples.shift();
    while (samples.length > 10) samples.shift();
  }

  function releaseVelocity() {
    if (samples.length < 2) return 0;
    const b = samples[samples.length - 1];
    let a = samples[0];
    for (let i = samples.length - 2; i >= 0; i--) {
      if (b.t - samples[i].t >= 40) {
        a = samples[i];
        break;
      }
      a = samples[i];
    }
    const dt = b.t - a.t;
    if (dt <= 0) return 0;
    return (b.x - a.x) / dt;
  }

  viewport.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    cancelMomentum();
    dragging = true;
    originX = e.clientX;
    originFrac = frac;
    samples.length = 0;
    recordSample(e.clientX, performance.now());
    try {
      viewport.setPointerCapture(e.pointerId);
    } catch (_) {}
    e.preventDefault();
  });

  viewport.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - originX;
    recordSample(e.clientX, performance.now());
    paint(originFrac - dx / RULER_TICK_PX);
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    const vel = releaseVelocity();
    if (Math.abs(vel) > 0.015) {
      startMomentum(vel);
    } else {
      paint(Math.round(frac));
      frac = current;
    }
  }

  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  viewport.addEventListener(
    "wheel",
    (e) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta) return;
      e.preventDefault();
      cancelMomentum();
      paint(frac + Math.sign(delta));
      frac = current;
    },
    { passive: false }
  );

  row._rulerReady = () => {
    setValue(current, { silent: true });
    requestAnimationFrame(() => setValue(current, { silent: true }));
  };
  row.setValue = (v) => setValue(v, { silent: true });
  row.getValue = () => current;
  return row;
}

/**
 * @param {object} opts
 * @param {object} opts.editor - instance dari createEditor() (editor.js)
 * @param {object} opts.state - editor state (editor-state.js)
 * @param {string} opts.blockId - id block gambar yang sedang disunting
 * @param {"insert"|"edit"} opts.mode
 */
function openImageSheet({ editor, state, blockId, mode }) {
  // Batalkan & tutup sheet lain (Gambar/Scene/Musik) yang sedang aktif,
  // kalau ada — SEBELUM guard di bawah, sama seperti perilaku lama
  // (closeAnyOpenSheet() dulu dipanggil tanpa syarat di titik ini juga).
  closeActiveSheet();

  const blockEl = qs(`[data-block-id="${blockId}"]`, editor.bodyEl);
  const existingBlock = state.getDocument().blocks.find((b) => b.id === blockId);
  if (!blockEl || !existingBlock) return;

  // Daftarkan `doCancel` (didefinisikan di bawah, tapi function declaration
  // sudah di-hoisting jadi aman dirujuk di sini) sebagai sheet aktif — kalau
  // ada sheet lain yang berhasil dibuka duluan tepat di antara baris ini &
  // closeActiveSheet() di atas (async tidak mungkin di sini, tapi jaga-jaga
  // konsistensi), registerActiveSheet() akan membatalkannya juga dulu.
  registerActiveSheet(doCancel);

  const settings = {
    align: existingBlock.align === "left" || existingBlock.align === "right" ? existingBlock.align : IMAGE_DEFAULTS.align,
    wrap: !!existingBlock.wrap,
    width: existingBlock.imageWidth || IMAGE_DEFAULTS.width,
    height: existingBlock.imageHeight || IMAGE_DEFAULTS.height,
    radius: existingBlock.borderRadius ?? IMAGE_DEFAULTS.borderRadius,
    clipShape: existingBlock.clipShape || IMAGE_DEFAULTS.clipShape,
    transparentBg: !!existingBlock.transparentBg,
    // FIX: sebelumnya hardcode false di sini (state toggle "Kunci Rasio"
    // selalu balik ke off tiap sheet dibuka lagi) — sekarang dibaca dari
    // block model (lihat IMAGE_DEFAULTS.lockAspect & createImageBlock di
    // block-model.js) supaya preferensinya benar-benar diingat per gambar.
    lockAspect: !!existingBlock.lockAspect,
    offsetX: Number.isFinite(existingBlock.imageOffsetX) ? existingBlock.imageOffsetX : 0,
    offsetY: Number.isFinite(existingBlock.imageOffsetY) ? existingBlock.imageOffsetY : 0,
    scale: Number.isFinite(existingBlock.imageScale) ? existingBlock.imageScale : 1,
    rotate: Number.isFinite(existingBlock.imageRotate) ? existingBlock.imageRotate : 0,
  };

  // Rasio aspek dipakai toggle "Kunci Rasio" di bawah supaya slider Lebar
  // & Tinggi saling mengikuti. Nilai awal jatuh balik ke rasio Lebar/Tinggi
  // yang sedang aktif (default insert = 1:1, lihat IMAGE_DEFAULTS) sampai
  // rasio ASLI gambar yang diunggah/sudah ada berhasil dimuat di bawah —
  // begitu itu didapat, nilainya menggantikan fallback ini.
  let aspectRatio = settings.width / settings.height;

  // <clipPath> global (bintang/love/dll) dipastikan tersedia di DOM sebelum
  // strip pemilihan bentuk di bawah maupun pratinjau block gambar
  // memakainya lewat clip-path: url(#...).
  ensureClipDefsInjected();

  let pendingFile = null;
  let pendingPreviewUrl = null;
  let hasImage = !!existingBlock.assetId;
  // FIX: promise pembacaan ArrayBuffer file — dimulai SEDINI MUNGKIN (saat
  // file baru dipilih di fileInput change handler di bawah), bukan ditunda
  // sampai tombol Terapkan ditekan. Lihat catatan panjang di handler
  // fileInput.addEventListener("change", ...) untuk alasannya.
  let pendingBytesPromise = null;
  let pendingMimeType = null;
  // true selagi file yang baru dipilih sedang dikonversi ke WebP (lihat
  // fileInput change handler) — dipakai updateApplyState() supaya tombol
  // "Terapkan" tidak bisa ditekan di tengah proses konversi.
  let isConverting = false;
  // true setelah sheet ditutup (Batal/Terapkan) — dicek di dalam promise
  // konversi WebP supaya kalau baru selesai SETELAH sheet ditutup (mis.
  // user buru-buru menekan Batal padahal konversi masih jalan), hasilnya
  // tidak lagi disentuhkan ke blockEl yang sudah dilepas/dibuang.
  let sheetClosed = false;

  const overlay = createEl("div", { className: "image-sheet-overlay" });
  const sheet = createEl("div", { className: "image-sheet image-sheet--compact" });
  overlay.appendChild(sheet);

  const ICON = {
    wrap: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><line x1="12" y1="6" x2="21" y2="6"/><line x1="12" y1="10" x2="21" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    transparent: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><g fill="currentColor" stroke="none"><rect x="3" y="3" width="4.5" height="4.5"/><rect x="12" y="3" width="4.5" height="4.5"/><rect x="7.5" y="7.5" width="4.5" height="4.5"/><rect x="16.5" y="7.5" width="4.5" height="4.5"/><rect x="3" y="12" width="4.5" height="4.5"/><rect x="12" y="12" width="4.5" height="4.5"/><rect x="7.5" y="16.5" width="4.5" height="4.5"/><rect x="16.5" y="16.5" width="4.5" height="4.5"/></g></svg>',
    lock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="19" x2="21" y2="5"/></svg>',
    delete: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    dimension: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H3v6"/><path d="M15 21h6v-6"/><path d="M3 3l7 7"/><path d="M21 21l-7-7"/></svg>',
    offset: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l3 3 3-3"/><path d="M19 9l3 3-3 3"/><path d="M2 12h20"/><path d="M12 2v20"/></svg>',
    rotate: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>',
    crop: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="5.5" fill="currentColor" stroke="none"/></svg>',
    upload: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.75" fill="currentColor" stroke="none"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  };

  // ---- Panels: main / dimension / crop (satu sheet, isi diganti) ----
  const panelMain = createEl("div", { className: "image-sheet__panel image-sheet__panel--main is-active" });
  const panelDim = createEl("div", { className: "image-sheet__panel image-sheet__panel--sub" });
  const panelCrop = createEl("div", { className: "image-sheet__panel image-sheet__panel--sub" });
  sheet.append(panelMain, panelDim, panelCrop);

  let setDimTab = null; // diisi saat dimension panel dibangun
  function showPanel(name) {
    panelMain.classList.toggle("is-active", name === "main");
    panelDim.classList.toggle("is-active", name === "dimension");
    panelCrop.classList.toggle("is-active", name === "crop");
    if (name === "dimension") {
      if (typeof setDimTab === "function") setDimTab("size");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          widthRow._rulerReady && widthRow._rulerReady();
          heightRow._rulerReady && heightRow._rulerReady();
          radiusRow._rulerReady && radiusRow._rulerReady();
        });
      });
    }
  }

  // ========== MAIN PANEL ==========
  const mainLeft = createEl("div", { className: "image-sheet__main-left" });
  const mainRight = createEl("div", { className: "image-sheet__main-right" });
  panelMain.append(mainLeft, mainRight);

  /* Align bar */
  const alignBar = createEl("div", { className: "image-sheet__align-bar" });
  const alignButtons = {};
  ALIGN_OPTIONS.forEach((opt, i) => {
    if (i > 0) alignBar.appendChild(createEl("span", { className: "image-sheet__align-divider", attrs: { "aria-hidden": "true" } }));
    const btn = createEl("button", {
      className: "image-sheet__align-btn",
      attrs: { type: "button", "aria-label": t(opt.labelKey) },
      html: opt.icon,
    });
    btn.addEventListener("click", () => {
      settings.align = opt.value;
      for (const key in alignButtons) alignButtons[key].classList.toggle("is-active", key === opt.value);
      wrapToggle.classList.toggle("is-disabled", opt.value === "center");
      if (opt.value === "center" && settings.wrap) {
        settings.wrap = false;
        wrapToggle.classList.remove("is-on");
        wrapToggle.setAttribute("aria-checked", "false");
      }
      applyPreviewToBlockEl(blockEl, settings);
    });
    alignButtons[opt.value] = btn;
    alignBar.appendChild(btn);
  });
  mainLeft.appendChild(alignBar);

  /* Big row: Dimension | Crop | Upload  (dari kanan: dim, crop, upload → kiri ke kanan: upload, crop, dim? User: dari kanan = dimension, crop, upload)
     Jadi urutan DOM kiri→kanan: Upload, Crop, Dimension */
  const bigRow = createEl("div", { className: "image-sheet__big-row" });
  const fileInput = createEl("input", { attrs: { type: "file", accept: "image/*" } });
  fileInput.hidden = true;

  const uploadBtnIdleHtml = `${ICON.upload}<span>${t("image.upload")}</span>`;
  const uploadBtnBusyHtml = '<span class="image-sheet__spinner" aria-hidden="true"></span><span>…</span>';
  const uploadBtn = createEl("button", {
    className: "image-sheet__big-btn image-sheet__big-btn--upload",
    attrs: { type: "button", "aria-label": t("image.uploadAria") },
    html: uploadBtnIdleHtml,
  });
  const cropOpenBtn = createEl("button", {
    className: "image-sheet__big-btn",
    attrs: { type: "button", "aria-label": t("image.cropAria") },
    html: `${ICON.crop}<span>${t("image.crop")}</span>`,
  });
  const dimOpenBtn = createEl("button", {
    className: "image-sheet__big-btn",
    attrs: { type: "button", "aria-label": t("image.dimension") },
    html: `${ICON.dimension}<span>${t("image.dimension")}</span>`,
  });
  // Urutan visual kiri → kanan: Unggah, Crop, Dimensi (kanan = dimensi sesuai request)
  bigRow.append(uploadBtn, cropOpenBtn, dimOpenBtn, fileInput);
  mainLeft.appendChild(bigRow);

  cropOpenBtn.addEventListener("click", () => showPanel("crop"));
  dimOpenBtn.addEventListener("click", () => showPanel("dimension"));

  function setUploadBusy(busy) {
    isConverting = busy;
    uploadBtn.disabled = busy;
    fileInput.disabled = busy;
    uploadBtn.classList.toggle("is-busy", busy);
    uploadBtn.innerHTML = busy ? uploadBtnBusyHtml : uploadBtnIdleHtml;
    updateApplyState();
  }
  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    pendingFile = file;
    const rawMimeType = file.type;
    const rawBytesPromise = file.arrayBuffer();
    pendingPreviewUrl = null;
    hasImage = false;
    setUploadBusy(true);
    const selectionToken = pendingFile;
    pendingBytesPromise = rawBytesPromise
      .then((rawBytes) => imageService.convertToWebp(rawBytes, rawMimeType))
      .then(({ bytes, mimeType }) => {
        pendingMimeType = mimeType;
        if (sheetClosed || selectionToken !== pendingFile) return bytes;
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        pendingPreviewUrl = url;
        hasImage = true;
        setPreviewImageSrc(blockEl, url);
        applyPreviewToBlockEl(blockEl, settings);
        setUploadBusy(false);
        loadNaturalAspectRatio(url).then((ratio) => {
          if (!ratio || sheetClosed || selectionToken !== pendingFile) return;
          aspectRatio = ratio;
          if (settings.lockAspect) {
            syncHeightFromWidth(settings.width);
            applyPreviewToBlockEl(blockEl, settings);
          }
        });
        return bytes;
      })
      .catch((err) => {
        console.error("[image-sheet] Gagal memproses gambar:", err);
        if (!sheetClosed && selectionToken === pendingFile) {
          setUploadBusy(false);
          errorEl.textContent = t("image.err.process");
        }
        throw err;
      });
  });

  /* Actions: Batal / Terapkan */
  const actions = createEl("div", { className: "image-sheet__actions" });
  const cancelBtn = createEl("button", {
    className: "image-sheet__btn image-sheet__btn--ghost",
    attrs: { type: "button" },
    text: t("sheet.cancel"),
  });
  const applyBtn = createEl("button", {
    className: "image-sheet__btn image-sheet__btn--primary",
    attrs: { type: "button" },
    text: t("sheet.apply"),
  });
  actions.append(cancelBtn, applyBtn);
  mainLeft.appendChild(actions);

  /* Right rail: wrap, transparent, lock, delete */
  const wrapToggle = createEl("button", {
    className: "image-sheet__icon-btn",
    attrs: { type: "button", role: "switch", "aria-checked": "false", "aria-label": t("image.wrap") },
    html: ICON.wrap,
  });
  wrapToggle.addEventListener("click", () => {
    if (settings.align === "center") return;
    settings.wrap = !settings.wrap;
    wrapToggle.classList.toggle("is-on", settings.wrap);
    wrapToggle.setAttribute("aria-checked", String(settings.wrap));
    applyPreviewToBlockEl(blockEl, settings);
  });

  const transparentToggle = createEl("button", {
    className: "image-sheet__icon-btn",
    attrs: { type: "button", role: "switch", "aria-checked": "false", "aria-label": t("image.transparentBg") },
    html: ICON.transparent,
  });
  transparentToggle.addEventListener("click", () => {
    settings.transparentBg = !settings.transparentBg;
    transparentToggle.classList.toggle("is-on", settings.transparentBg);
    transparentToggle.setAttribute("aria-checked", String(settings.transparentBg));
    applyPreviewToBlockEl(blockEl, settings);
  });

  const lockToggle = createEl("button", {
    className: "image-sheet__icon-btn",
    attrs: { type: "button", role: "switch", "aria-checked": "false", "aria-label": t("image.lockAspect") },
    html: ICON.lock,
  });
  lockToggle.addEventListener("click", () => {
    settings.lockAspect = !settings.lockAspect;
    lockToggle.classList.toggle("is-on", settings.lockAspect);
    lockToggle.setAttribute("aria-checked", String(settings.lockAspect));
    if (settings.lockAspect) syncHeightFromWidth(settings.width);
  });

  let deleteArmed = false;
  let deleteArmTimer = null;
  let deleteBtn = null;
  if (mode === "edit") {
    deleteBtn = createEl("button", {
      className: "image-sheet__icon-btn image-sheet__icon-btn--danger",
      attrs: { type: "button", "aria-label": t("image.delete") },
      html: ICON.delete,
    });
    function resetDeleteArm() {
      deleteArmed = false;
      deleteBtn.classList.remove("is-armed");
      deleteBtn.innerHTML = ICON.delete;
      deleteBtn.setAttribute("aria-label", t("image.delete"));
    }
    deleteBtn.addEventListener("click", () => {
      if (isBusy) return;
      if (!deleteArmed) {
        deleteArmed = true;
        deleteBtn.classList.add("is-armed");
        deleteBtn.innerHTML = ICON.check;
        deleteBtn.setAttribute("aria-label", t("image.deleteConfirm"));
        deleteArmTimer = setTimeout(() => {
          resetDeleteArm();
        }, 3000);
        return;
      }
      clearTimeout(deleteArmTimer);
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
      if (pendingBytesPromise) pendingBytesPromise.catch(() => {});
      editor.runCommand(removeImageBlock, blockId);
      close();
    });
  } else {
    // mode insert: slot kosong biar grid tetap 4 box (tinggi sejajar)
    deleteBtn = createEl("div", {
      className: "image-sheet__icon-btn",
      attrs: { "aria-hidden": "true", style: "visibility:hidden;pointer-events:none;" },
    });
  }
  mainRight.append(wrapToggle, transparentToggle, lockToggle, deleteBtn);

  // ========== DIMENSION PANEL (tabs: size | offset | rotate) ==========
  const OFFSET_RANGE = { min: -9999, max: 9999 };
  const SCALE_RANGE = { min: 10, max: 500 };
  const dimRail = createEl("div", { className: "image-sheet__sub-rail" });
  const dimBack = createEl("button", {
    className: "image-sheet__back-btn",
    attrs: { type: "button", "aria-label": t("sheet.back") },
    html: ICON.back,
  });
  dimBack.addEventListener("click", () => showPanel("main"));
  const dimTabSize = createEl("button", {
    className: "image-sheet__rail-icon-btn is-active",
    attrs: { type: "button", "aria-label": t("image.dimension"), "data-dim-tab": "size" },
    html: ICON.dimension,
  });
  const dimTabOffset = createEl("button", {
    className: "image-sheet__rail-icon-btn",
    attrs: { type: "button", "aria-label": t("image.offset"), "data-dim-tab": "offset" },
    html: ICON.offset,
  });
  const dimTabRotate = createEl("button", {
    className: "image-sheet__rail-icon-btn",
    attrs: { type: "button", "aria-label": t("image.rotate"), "data-dim-tab": "rotate" },
    html: ICON.rotate,
  });
  dimRail.append(dimBack, dimTabSize, dimTabOffset, dimTabRotate);

  const dimBody = createEl("div", { className: "image-sheet__sub-body" });

  const sizePane = createEl("div", { className: "image-sheet__dim-pane is-active", attrs: { "data-dim-pane": "size" } });
  const rulersSection = createEl("div", { className: "image-sheet__rulers" });
  const widthRow = makeRuler(t("image.width"), WIDTH_RANGE, settings.width, (v) => {
    settings.width = v;
    if (settings.lockAspect) syncHeightFromWidth(v);
    applyPreviewToBlockEl(blockEl, settings);
  });
  const heightRow = makeRuler(t("image.height"), HEIGHT_RANGE, settings.height, (v) => {
    settings.height = v;
    if (settings.lockAspect) syncWidthFromHeight(v);
    applyPreviewToBlockEl(blockEl, settings);
  });
  const radiusRow = makeRuler(t("image.radius"), RADIUS_RANGE, settings.radius, (v) => {
    settings.radius = v;
    applyPreviewToBlockEl(blockEl, settings);
  });
  rulersSection.append(widthRow, heightRow, radiusRow);
  sizePane.appendChild(rulersSection);

  const offsetPane = createEl("div", { className: "image-sheet__dim-pane", attrs: { "data-dim-pane": "offset", hidden: "true" } });
  const offsetRulers = createEl("div", { className: "image-sheet__rulers" });
  const offsetXRow = makeRuler(t("image.offsetX"), OFFSET_RANGE, settings.offsetX, (v) => {
    settings.offsetX = v;
    applyPreviewToBlockEl(blockEl, settings);
  });
  const offsetYRow = makeRuler(t("image.offsetY"), OFFSET_RANGE, settings.offsetY, (v) => {
    settings.offsetY = v;
    applyPreviewToBlockEl(blockEl, settings);
  });
  const scalePct = Math.round((settings.scale != null ? settings.scale : 1) * 100);
  const scaleRow = makeRuler(t("image.scale"), SCALE_RANGE, scalePct, (v) => {
    settings.scale = v / 100;
    applyPreviewToBlockEl(blockEl, settings);
  }, { format: (v) => `${v}%` });
  offsetRulers.append(offsetXRow, offsetYRow, scaleRow);
  offsetPane.appendChild(offsetRulers);

  const rotatePane = createEl("div", {
    className: "image-sheet__dim-pane image-sheet__dim-pane--rotate",
    attrs: { "data-dim-pane": "rotate", hidden: "true" },
  });
  const rotateDial = createEl("div", {
    className: "image-sheet__rotate-dial",
    attrs: {
      role: "slider",
      "aria-valuemin": "0",
      "aria-valuemax": "360",
      "aria-valuenow": String(settings.rotate || 0),
      tabindex: "0",
    },
  });
  const rotateRing = createEl("div", { className: "image-sheet__rotate-ring", attrs: { "aria-hidden": "true" } });
  const rotateKnob = createEl("div", { className: "image-sheet__rotate-knob", attrs: { "aria-hidden": "true" } });
  const rotateChip = createEl("div", { className: "image-sheet__rotate-chip", text: `${Math.round(settings.rotate || 0)}°` });
  rotateRing.appendChild(rotateKnob);
  rotateDial.append(rotateRing, rotateChip);
  rotatePane.appendChild(rotateDial);

  function setRotateUI(deg) {
    const d = ((Math.round(deg) % 360) + 360) % 360;
    settings.rotate = d;
    rotateChip.textContent = `${d}°`;
    rotateDial.setAttribute("aria-valuenow", String(d));
    rotateKnob.style.transform = `rotate(${d}deg)`;
    applyPreviewToBlockEl(blockEl, settings);
  }
  setRotateUI(settings.rotate || 0);

  function angleFromPointer(clientX, clientY) {
    const rect = rotateRing.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let deg = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    return deg;
  }
  let rotateDragging = false;
  rotateDial.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    rotateDragging = true;
    try { rotateDial.setPointerCapture(e.pointerId); } catch (_) {}
    setRotateUI(angleFromPointer(e.clientX, e.clientY));
    e.preventDefault();
  });
  rotateDial.addEventListener("pointermove", (e) => {
    if (!rotateDragging) return;
    setRotateUI(angleFromPointer(e.clientX, e.clientY));
  });
  const endRot = () => { rotateDragging = false; };
  rotateDial.addEventListener("pointerup", endRot);
  rotateDial.addEventListener("pointercancel", endRot);
  rotateDial.addEventListener("keydown", (e) => {
    let d = settings.rotate || 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") d -= 5;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") d += 5;
    else return;
    e.preventDefault();
    setRotateUI(d);
  });

  dimBody.append(sizePane, offsetPane, rotatePane);
  panelDim.append(dimRail, dimBody);

  const dimTabs = [dimTabSize, dimTabOffset, dimTabRotate];
  const dimPanes = { size: sizePane, offset: offsetPane, rotate: rotatePane };
  setDimTab = function setDimTabFn(name) {
    dimTabs.forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-dim-tab") === name);
    });
    for (const [key, pane] of Object.entries(dimPanes)) {
      const on = key === name;
      pane.classList.toggle("is-active", on);
      pane.hidden = !on;
    }
    if (name === "size") {
      widthRow._rulerReady && widthRow._rulerReady();
      heightRow._rulerReady && heightRow._rulerReady();
      radiusRow._rulerReady && radiusRow._rulerReady();
    } else if (name === "offset") {
      offsetXRow._rulerReady && offsetXRow._rulerReady();
      offsetYRow._rulerReady && offsetYRow._rulerReady();
      scaleRow._rulerReady && scaleRow._rulerReady();
    }
  };
  dimTabs.forEach((btn) => {
    btn.addEventListener("click", () => setDimTab(btn.getAttribute("data-dim-tab")));
  });


  function syncHeightFromWidth(width) {
    const h = clamp(Math.round(width / aspectRatio), HEIGHT_RANGE.min, HEIGHT_RANGE.max);
    settings.height = h;
    heightRow.setValue(h);
  }
  function syncWidthFromHeight(height) {
    const w = clamp(Math.round(height * aspectRatio), WIDTH_RANGE.min, WIDTH_RANGE.max);
    settings.width = w;
    widthRow.setValue(w);
  }
  function updateRadiusDisabledState() {
    const disabled = settings.clipShape !== "none";
    radiusRow.classList.toggle("is-disabled", disabled);
  }

  // ========== CROP PANEL ==========
  const cropRail = createEl("div", { className: "image-sheet__sub-rail" });
  const cropBack = createEl("button", {
    className: "image-sheet__back-btn",
    attrs: { type: "button", "aria-label": t("sheet.back") },
    html: ICON.back,
  });
  cropBack.addEventListener("click", () => showPanel("main"));
  const cropRailIcon = createEl("button", {
    className: "image-sheet__rail-icon-btn is-active",
    attrs: { type: "button", "aria-label": t("image.crop"), tabindex: "-1" },
    html: ICON.crop,
  });
  cropRail.append(cropBack, cropRailIcon);
  const cropBody = createEl("div", { className: "image-sheet__sub-body image-sheet__sub-body--crop" });
  const shapeGrid = createEl("div", { className: "image-sheet__shape-grid" });
  const shapeButtons = {};
  for (const shape of IMAGE_CLIP_SHAPES) {
    const iconSvg = shape.d
      ? `<svg viewBox="0 0 1 1" width="22" height="22"><path d="${shape.d}" fill="currentColor"/></svg>`
      : '<svg viewBox="0 0 1 1" width="22" height="22"><rect x="0.06" y="0.06" width="0.88" height="0.88" rx="0.12" fill="none" stroke="currentColor" stroke-width="0.1"/></svg>';
    const btn = createEl("button", {
      className: "image-sheet__shape-btn",
      attrs: { type: "button", "aria-label": t("image.clip." + shape.id) },
      html: iconSvg,
    });
    btn.addEventListener("click", () => {
      settings.clipShape = shape.id;
      for (const key in shapeButtons) shapeButtons[key].classList.toggle("is-active", key === shape.id);
      updateRadiusDisabledState();
      applyPreviewToBlockEl(blockEl, settings);
    });
    shapeButtons[shape.id] = btn;
    shapeGrid.appendChild(btn);
  }
  cropBody.appendChild(shapeGrid);
  panelCrop.append(cropRail, cropBody);

  const errorEl = createEl("div", { className: "image-sheet__error" });
  sheet.appendChild(errorEl);

  function updateApplyState() {
    applyBtn.disabled = isConverting || (mode === "insert" && !hasImage);
  }

  // --- Set tampilan awal ---
  for (const key in alignButtons) alignButtons[key].classList.toggle("is-active", key === settings.align);
  for (const key in shapeButtons) shapeButtons[key].classList.toggle("is-active", key === settings.clipShape);
  wrapToggle.classList.toggle("is-on", settings.wrap);
  wrapToggle.setAttribute("aria-checked", String(settings.wrap));
  wrapToggle.classList.toggle("is-disabled", settings.align === "center");
  transparentToggle.classList.toggle("is-on", settings.transparentBg);
  transparentToggle.setAttribute("aria-checked", String(settings.transparentBg));
  lockToggle.classList.toggle("is-on", settings.lockAspect);
  lockToggle.setAttribute("aria-checked", String(settings.lockAspect));
  updateApplyState();
  updateRadiusDisabledState();
  applyPreviewToBlockEl(blockEl, settings);
  if (hasImage && existingBlock.assetId) {
    imageService.getObjectUrl(existingBlock.assetId).then((url) => {
      if (!url) return;
      setPreviewImageSrc(blockEl, url);
      loadNaturalAspectRatio(url).then((ratio) => {
        if (ratio) aspectRatio = ratio;
      });
    });
  }

  let isBusy = false; // true selama proses "Terapkan" (unggah + simpan) berjalan

  // ---- Kunci area catatan supaya keyboard TIDAK bisa muncul lagi ----
  // pointer-events: none di .note-content mencegah tap di judul/isi catatan
  // memicu fokus (dan keyboard) selama sheet terbuka — tapi scroll TETAP
  // jalan karena yang di-nonaktifkan cuma pointer-events elemen contenteditable
  // itu sendiri, bukan .note-scroll-area (parent) yang menangani scroll-nya.
  // focusin listener di bawah cuma jaring pengaman tambahan untuk kasus
  // fokus yang tidak lewat tap/klik (mis. keyboard fisik/Tab).
  const noteContentEl = qs(".note-content");
  function preventEditorFocus(e) {
    if (noteContentEl && noteContentEl.contains(e.target) && e.target !== noteContentEl) {
      e.target.blur();
    }
  }
  function lockNoteContent() {
    if (noteContentEl) noteContentEl.classList.add("note-content--sheet-locked");
    document.addEventListener("focusin", preventEditorFocus);
  }
  function unlockNoteContent() {
    if (noteContentEl) noteContentEl.classList.remove("note-content--sheet-locked");
    document.removeEventListener("focusin", preventEditorFocus);
  }

  // ---- Ruang scroll cadangan setinggi sheet ----
  // Supaya text/block paling bawah di catatan tidak ketutup sheet, kita set
  // custom property --image-sheet-space (dibaca oleh layout.css di
  // .note-scroll-area) persis setinggi sheet yang benar-benar ter-render.
  // ResizeObserver dipakai karena tinggi sheet bisa berubah (mis. rotasi
  // layar, atau baris "Bungkus Teks" jadi disabled/enabled tidak mengubah
  // tinggi tapi jaga-jaga untuk kasus lain).
  const root = document.documentElement;
  let sheetResizeObserver = null;
  function setReservedSpace(px) {
    root.style.setProperty("--image-sheet-space", `${Math.max(0, Math.round(px))}px`);
  }
  function startReservingSpace() {
    setReservedSpace(sheet.getBoundingClientRect().height);
    if (window.ResizeObserver) {
      sheetResizeObserver = new ResizeObserver(() => setReservedSpace(sheet.getBoundingClientRect().height));
      sheetResizeObserver.observe(sheet);
    }
  }
  function stopReservingSpace() {
    if (sheetResizeObserver) {
      sheetResizeObserver.disconnect();
      sheetResizeObserver = null;
    }
    setReservedSpace(0);
  }

  function close() {
    clearTimeout(deleteArmTimer);
    sheetClosed = true;
    overlay.classList.remove("is-open");
    stopReservingSpace();
    unlockNoteContent();
    setTimeout(() => overlay.remove(), 180);
    clearActiveSheet(doCancel);
  }

  function doCancel() {
    if (isBusy) return; // cegah tombol Batal membatalkan proses "Terapkan" yang sedang berjalan
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    // Kalau konversi WebP masih berjalan di background saat Batal ditekan,
    // hasilnya (atau errornya) tidak lagi dipakai siapa pun (sheetClosed
    // sudah true lewat close() di bawah) — redam saja supaya rejection-nya
    // tidak muncul sebagai "Uncaught (in promise)" di console.
    if (pendingBytesPromise) pendingBytesPromise.catch(() => {});
    if (mode === "insert") {
      editor.runCommand(removeImageBlock, blockId);
    } else {
      editor.renderAll(); // buang pratinjau DOM, balik ke nilai model semula
      // BUG FIX: renderAll() di sini dipanggil LANGSUNG (bukan lewat
      // runCommand), jadi tidak otomatis memicu state.emitChange() seperti
      // jalur command biasa. Tanpa ini, listener yang bergantung pada
      // "state.onChange" untuk menyinkronkan ulang elemen DOM PERSISTEN di
      // luar block (mis. tombol play musik — lihat toolbar/music-sheet.js
      // syncAllMusicButtons — dan chip "Scene" di scene-sheet.js) tidak
      // pernah tahu bodyEl baru saja dibongkar total oleh renderAll(),
      // sehingga elemen-elemen itu hilang sampai halaman di-refresh.
      if (state.emitChange) state.emitChange({ type: "image-cancel" });
    }
    close();
  }

  function setBusy(busy) {
    isBusy = busy;
    cancelBtn.disabled = busy;
    if (deleteBtn) deleteBtn.disabled = busy;
    applyBtn.disabled = busy || (mode === "insert" && !hasImage);
    applyBtn.textContent = busy ? t("sheet.saving") : t("sheet.apply");
  }

  async function doApply() {
    if (isBusy || applyBtn.disabled) {
      return;
    }
    setBusy(true);
    errorEl.textContent = "";

    const patch = {
      align: settings.align,
      wrap: settings.align !== "center" && !!settings.wrap,
      imageWidth: settings.width,
      imageHeight: settings.height,
      borderRadius: settings.radius,
      clipShape: settings.clipShape,
      transparentBg: !!settings.transparentBg,
      lockAspect: !!settings.lockAspect,
      imageOffsetX: settings.offsetX || 0,
      imageOffsetY: settings.offsetY || 0,
      imageScale: settings.scale != null ? settings.scale : 1,
      imageRotate: settings.rotate || 0,
    };

    const t0 = performance.now();
    try {
      if (pendingFile) {
        const noteId = state.getDocument().id;
        // FIX: TIDAK memanggil pendingFile.arrayBuffer() di sini lagi.
        // Pembacaan sudah dimulai jauh lebih awal, tepat saat file dipilih
        // di fileInput change handler (lihat pendingBytesPromise di atas) —
        // itulah akar perbaikan bug "Terapkan gagal di mobile": kalau baru
        // dibaca sekarang (setelah user sempat atur slider dulu beberapa
        // detik), izin baca file dari Android photo picker sudah keburu
        // dicabut duluan (NotReadableError).
        const bytes = await pendingBytesPromise;
        // saveImage() bisa "menggantung" cukup lama di browser mobile
        // tertentu (lihat catatan withTimeout di db.js) — dibatasi di sini
        // juga supaya tombol TIDAK PERNAH stuck disabled selamanya walau
        // db.js sendiri gagal melempar error tepat waktu.
        const assetId = await withApplyTimeout(imageService.saveImage(noteId, bytes, pendingMimeType));
        imageService.primeObjectUrl(assetId, pendingPreviewUrl);
        patch.assetId = assetId;
        pendingPreviewUrl = null; // sudah "dimiliki" cache image-service, jangan di-revoke
      }
      editor.runCommand(updateImageBlock, blockId, patch);
      close();
    } catch (err) {
      // Gagal simpan (mis. koneksi IndexedDB macet di HP setelah picker foto
      // dibuka) — JANGAN hapus placeholder atau tutup sheet begitu saja;
      // biarkan pengguna coba lagi tanpa kehilangan gambar yang sudah dipilih.
      // db.js sudah mencoba ulang sekali secara otomatis dengan koneksi baru
      // sebelum error ini benar-benar sampai ke sini, jadi kalau tetap gagal
      // di titik ini kemungkinan penyebabnya bukan cuma koneksi yang basi.
      console.error("[image-sheet] Gagal menyimpan gambar:", err);
      setBusy(false);
      // Bedakan pesan: kalau akar masalahnya file-nya sendiri sudah tidak
      // bisa dibaca lagi (mis. NotReadableError — izin dari photo picker
      // sudah dicabut, atau pengguna sempat menghapus/memindah file
      // aslinya), menekan "Terapkan" berkali-kali TIDAK akan pernah
      // berhasil karena pendingBytesPromise yang sama akan terus gagal;
      // pengguna perlu memilih ulang gambarnya dari "Unggah Gambar".
      // Untuk error lain (mis. IndexedDB) baru masuk akal minta coba lagi.
      const isFileReadError = err && (err.name === "NotReadableError" || /could not be read/i.test(err.message || ""));
      errorEl.textContent = isFileReadError
        ? t("image.err.read")
        : t("image.err.save");
    }
  }

  // ms dinaikkan dari 12s -> 26s: db.js withStore() kini bisa mencoba ulang
  // OTOMATIS sekali dengan koneksi baru saat koneksi lama macet (lihat
  // catatan retry di db/db.js), yang berarti satu panggilan saveImage() bisa
  // memakan waktu sampai ~2x TRANSACTION_TIMEOUT_MS (10s) sebelum akhirnya
  // resolve/reject. Batas di sini HARUS lebih longgar dari itu, kalau tidak
  // percobaan retry otomatis yang sebenarnya akan berhasil malah keburu
  // dipotong duluan oleh timeout di lapisan UI ini.
  function withApplyTimeout(promise, ms = 26000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Waktu simpan habis."));
      }, ms);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        }
      );
    });
  }

  cancelBtn.addEventListener("click", doCancel);
  applyBtn.addEventListener("click", doApply);
  // Sheet SENGAJA cuma bisa ditutup lewat tombol "Batal" (atau "Terapkan"
  // yang sukses) — tanpa tap-di-luar / Escape, karena overlay-nya sekarang
  // transparan & tidak menangkap klik (lihat image-sheet.css), jadi area di
  // luar sheet memang harus tetap bisa dipakai untuk scroll/baca catatan.

  // Tutup keyboard otomatis begitu sheet dibuka (kalau ada field yang lagi
  // fokus, mis. sedang mengetik lalu menekan "Sisipkan Gambar") supaya
  // sheet dapat ruang penuh & viewport tidak "berantem" dengan keyboard.
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }
  // Kunci area catatan SEKARANG JUGA (bukan nanti) supaya tap apa pun di
  // judul/isi catatan selama sheet terbuka tidak sempat memicu keyboard
  // muncul lagi sama sekali.
  lockNoteContent();

  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add("is-open");
    // Tunggu transisi buka + penutupan keyboard selesai sebelum mengukur
    // tinggi sheet & menggeser block gambar ke atas area sheet, supaya
    // pengukurannya memakai layout final (bukan di tengah animasi).
    setTimeout(() => {
      startReservingSpace();
      blockEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 200);
  });

  // registerActiveSheet(doCancel) sudah dipanggil di awal fungsi ini — tidak
  // ada lagi yang perlu didaftarkan ulang di sini.
}

/**
 * Pasang handler tombol "Sisipkan Gambar" di floating toolbar, sekaligus
 * klik pada block gambar yang sudah ada di dokumen (buka lagi bottom sheet
 * di mode "edit" supaya pengaturan bisa diubah kapan saja, bukan cuma
 * sekali waktu insert).
 */
export function initImageInsert(button, editor, state) {
  if (!button) return;

  button.addEventListener("click", () => {
    const result = editor.runCommand(insertImagePlaceholder);
    if (!result || !result.imageBlockId) {
      return;
    }
    openImageSheet({ editor, state, blockId: result.imageBlockId, mode: "insert" });
  });

  editor.bodyEl.addEventListener("click", (e) => {
    if (editor.bodyEl.getAttribute("contenteditable") === "false") return; // mode Read Only
    const blockEl = e.target.closest(".editor-block--image");
    if (!blockEl || !editor.bodyEl.contains(blockEl)) return;
    const blockId = blockEl.dataset.blockId;
    if (!blockId) return;
    openImageSheet({ editor, state, blockId, mode: "edit" });
  });
}
