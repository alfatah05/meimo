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

const WIDTH_RANGE = { min: 10, max: 640 };
const HEIGHT_RANGE = { min: 10, max: 640 };
const RADIUS_RANGE = { min: 0, max: 100 };

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
    label: "Kiri",
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="10" height="16" rx="1.5"/><line x1="16" y1="8" x2="21" y2="8"/><line x1="16" y1="12" x2="21" y2="12"/><line x1="16" y1="16" x2="21" y2="16"/></svg>',
  },
  {
    value: "center",
    label: "Tengah",
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="4" width="10" height="10" rx="1.5"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
  },
  {
    value: "right",
    label: "Kanan",
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="11" y="4" width="10" height="16" rx="1.5"/><line x1="3" y1="8" x2="8" y2="8"/><line x1="3" y1="12" x2="8" y2="12"/><line x1="3" y1="16" x2="8" y2="16"/></svg>',
  },
];

// Cuma satu bottom sheet gambar yang boleh terbuka dalam satu waktu.
let closeCurrentSheet = null;

function closeAnyOpenSheet() {
  if (closeCurrentSheet) {
    closeCurrentSheet();
    closeCurrentSheet = null;
  }
}

/** Terapkan pengaturan pratinjau (align/wrap/ukuran/radius) langsung ke
 * elemen block gambar di DOM, TANPA menyentuh model — dipakai selama sheet
 * masih terbuka supaya perubahan slider/tombol terasa instan. */
function applyPreviewToBlockEl(blockEl, settings) {
  if (!blockEl) return;
  blockEl.style.setProperty("--img-w", `${settings.width}px`);
  blockEl.style.setProperty("--img-h", `${settings.height}px`);
  blockEl.style.setProperty("--img-radius", `${settings.radius}px`);
  blockEl.style.setProperty("--img-clip", getClipPathCssValue(settings.clipShape));
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

function makeSlider(labelText, range, initial, onInput) {
  const row = createEl("div", { className: "image-sheet__slider-row" });
  const labelRow = createEl("div", { className: "image-sheet__slider-label-row" });
  labelRow.appendChild(createEl("span", { className: "image-sheet__label", text: labelText }));
  const valueEl = createEl("span", { className: "image-sheet__value", text: `${initial}px` });
  labelRow.appendChild(valueEl);
  row.appendChild(labelRow);

  const input = createEl("input", {
    className: "image-sheet__slider",
    attrs: { type: "range", min: range.min, max: range.max, value: initial },
  });
  input.addEventListener("input", () => {
    const v = Number(input.value);
    valueEl.textContent = `${v}px`;
    onInput(v);
  });
  row.appendChild(input);
  // Diekspos supaya pemanggil bisa menonaktifkan slider ini dari luar (mis.
  // slider Border Radius dimatikan saat crop bentuk SVG aktif — lihat
  // shapeSection di bawah).
  row.sliderInputEl = input;
  // Diekspos supaya slider lain (Lebar <-> Tinggi) bisa menyinkronkan nilai
  // tampilan slider ini secara programatis (mis. saat Kunci Rasio aktif),
  // TANPA memicu ulang `onInput` milik slider ini sendiri — mencegah loop
  // saling panggil antara handler Lebar & Tinggi.
  row.setValue = (v) => {
    input.value = v;
    valueEl.textContent = `${v}px`;
  };
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
  closeAnyOpenSheet();

  const blockEl = qs(`[data-block-id="${blockId}"]`, editor.bodyEl);
  const existingBlock = state.getDocument().blocks.find((b) => b.id === blockId);
  if (!blockEl || !existingBlock) return;

  const settings = {
    align: existingBlock.align === "left" || existingBlock.align === "right" ? existingBlock.align : IMAGE_DEFAULTS.align,
    wrap: !!existingBlock.wrap,
    width: existingBlock.imageWidth || IMAGE_DEFAULTS.width,
    height: existingBlock.imageHeight || IMAGE_DEFAULTS.height,
    radius: existingBlock.borderRadius ?? IMAGE_DEFAULTS.borderRadius,
    clipShape: existingBlock.clipShape || IMAGE_DEFAULTS.clipShape,
    transparentBg: !!existingBlock.transparentBg,
    lockAspect: false,
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
  const sheet = createEl("div", { className: "image-sheet" });
  overlay.appendChild(sheet);

  sheet.appendChild(
    createEl("div", {
      className: "image-sheet__title",
      text: mode === "edit" ? "Pengaturan Gambar" : "Sisipkan Gambar",
    })
  );

  /* ---- Posisi (align) ---- */
  const alignSection = createEl("div", { className: "image-sheet__section" });
  alignSection.appendChild(createEl("div", { className: "image-sheet__label", text: "Posisi Gambar" }));
  const alignGroup = createEl("div", { className: "image-sheet__align-group" });
  const alignButtons = {};
  for (const opt of ALIGN_OPTIONS) {
    const btn = createEl("button", {
      className: "image-sheet__align-btn",
      attrs: { type: "button", "aria-label": opt.label },
      html: `${opt.icon}<span>${opt.label}</span>`,
    });
    btn.addEventListener("click", () => {
      settings.align = opt.value;
      for (const key in alignButtons) alignButtons[key].classList.toggle("is-active", key === opt.value);
      wrapRow.classList.toggle("is-disabled", opt.value === "center");
      applyPreviewToBlockEl(blockEl, settings);
    });
    alignButtons[opt.value] = btn;
    alignGroup.appendChild(btn);
  }
  alignSection.appendChild(alignGroup);
  sheet.appendChild(alignSection);

  /* ---- Wrap text ---- */
  const wrapRow = createEl("div", { className: "image-sheet__section image-sheet__row" });
  wrapRow.appendChild(createEl("div", { className: "image-sheet__label", text: "Bungkus Teks (Wrap)" }));
  const wrapToggle = createEl("button", {
    className: "image-sheet__toggle",
    attrs: { type: "button", role: "switch", "aria-checked": "false" },
  });
  wrapToggle.appendChild(createEl("span", { className: "image-sheet__toggle-knob" }));
  wrapToggle.addEventListener("click", () => {
    if (settings.align === "center") return; // wrap tidak berlaku untuk posisi tengah
    settings.wrap = !settings.wrap;
    wrapToggle.classList.toggle("is-on", settings.wrap);
    wrapToggle.setAttribute("aria-checked", String(settings.wrap));
    applyPreviewToBlockEl(blockEl, settings);
  });
  wrapRow.appendChild(wrapToggle);
  sheet.appendChild(wrapRow);

  /* ---- Upload gambar ---- */
  const uploadSection = createEl("div", { className: "image-sheet__section" });
  const fileInput = createEl("input", { attrs: { type: "file", accept: "image/*" } });
  fileInput.hidden = true;
  const uploadBtnIdleHtml =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg><span>Unggah Gambar</span>';
  const uploadBtnBusyHtml = '<span class="image-sheet__spinner" aria-hidden="true"></span><span>Mengonversi…</span>';
  const uploadBtn = createEl("button", {
    className: "image-sheet__upload-btn",
    attrs: { type: "button" },
    html: uploadBtnIdleHtml,
  });
  // Tombol "Unggah Gambar" dikunci + diganti spinner selama konversi WebP
  // berjalan (lihat convertToWebp di image-service.js) — supaya kalau
  // konversinya agak lama (gambar besar/HP lambat), user tahu ada proses
  // yang sedang berjalan, bukan mengira tombolnya tidak merespons.
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
    if (!file) {
      return;
    }
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    pendingFile = file;
    const rawMimeType = file.type;

    // FIX (akar masalah "Terapkan gagal di mobile"): baca isi file jadi
    // ArrayBuffer SEKARANG JUGA, sedetik setelah user memilihnya di photo
    // picker — BUKAN nanti saat tombol Terapkan ditekan.
    //
    // Kenapa: izin baca ke file yang dipilih lewat photo picker Android
    // (content:// URI) bersifat singkat/one-shot. Sebelumnya kode ini baru
    // memanggil file.arrayBuffer() di dalam doApply(), yaitu SETELAH user
    // sempat mengatur posisi/wrap/ukuran gambar dulu (baru dari log nyata:
    // jeda ~3 detik antara file dipilih & Terapkan ditekan) — dalam jeda
    // itu Android sudah keburu mencabut izin baca ke file-nya, jadi
    // pembacaan gagal dengan NotReadableError ("izin bermasalah setelah
    // referensi file diperoleh").
    //
    // Dengan memulai pembacaan di sini (tepat saat file masih "segar"),
    // begitu ArrayBuffer selesai didapat ia sudah jadi salinan mentah di
    // memori JS biasa — tidak lagi bergantung ke izin/referensi file
    // eksternal apa pun. Konversi WebP di bawah (imageService.convertToWebp)
    // murni bekerja dari salinan ArrayBuffer ini lewat Canvas API, jadi
    // TIDAK menyentuh file/izin aslinya lagi sama sekali — aman dilakukan
    // kapan pun, termasuk yang agak lama untuk gambar besar.
    const rawBytesPromise = file.arrayBuffer();

    pendingPreviewUrl = null;
    hasImage = false; // baru jadi true lagi setelah konversi WebP selesai
    setUploadBusy(true);

    const selectionToken = pendingFile; // deteksi kalau user pilih file lain lagi selagi masih convert
    pendingBytesPromise = rawBytesPromise
      .then((rawBytes) => imageService.convertToWebp(rawBytes, rawMimeType))
      .then(({ bytes, mimeType }) => {
        pendingMimeType = mimeType;
        if (sheetClosed || selectionToken !== pendingFile) return bytes; // sheet sudah ditutup / file sudah diganti lagi

        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        pendingPreviewUrl = url;
        hasImage = true;
        setPreviewImageSrc(blockEl, url);
        applyPreviewToBlockEl(blockEl, settings);
        setUploadBusy(false);

        // Rasio aspek dihitung dari dimensi ASLI gambar hasil konversi
        // (bukan dari lebar/tinggi slider yang sedang dipakai) — begitu
        // didapat, kalau Kunci Rasio sedang aktif langsung selaraskan
        // slider Tinggi supaya tidak menunggu user menyentuh slider Lebar
        // dulu.
        loadNaturalAspectRatio(url).then((ratio) => {
          if (!ratio || sheetClosed || selectionToken !== pendingFile) return; // sheet ditutup / file sudah diganti lagi
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
          errorEl.textContent = "Gagal memproses gambar yang dipilih. Coba pilih ulang lewat \"Unggah Gambar\".";
        }
        throw err;
      });
  });
  uploadSection.appendChild(uploadBtn);
  uploadSection.appendChild(fileInput);
  sheet.appendChild(uploadSection);

  /* ---- Crop bentuk SVG (bintang/love/dll) ----
   * Strip yang bisa di-scroll ke samping, persis di bawah tombol "Unggah
   * Gambar". Memilih salah satu bentuk di sini langsung memotong pratinjau
   * gambar di dokumen lewat clip-path (lihat applyPreviewToBlockEl &
   * editor/image-clip-shapes.js) — DAN mematikan slider Border Radius di
   * bawah, karena begitu bentuknya dipotong jadi bintang/love/dll,
   * border-radius kotak sudah tidak relevan lagi secara visual. */
  const shapeSection = createEl("div", { className: "image-sheet__section" });
  shapeSection.appendChild(createEl("div", { className: "image-sheet__label", text: "Bentuk Crop" }));
  const shapeScroll = createEl("div", { className: "image-sheet__shape-scroll" });
  const shapeButtons = {};
  for (const shape of IMAGE_CLIP_SHAPES) {
    const iconSvg = shape.d
      ? `<svg viewBox="0 0 1 1" width="26" height="26"><path d="${shape.d}" fill="currentColor"/></svg>`
      : '<svg viewBox="0 0 1 1" width="26" height="26"><rect x="0.06" y="0.06" width="0.88" height="0.88" rx="0.12" fill="none" stroke="currentColor" stroke-width="0.1"/></svg>';
    const btn = createEl("button", {
      className: "image-sheet__shape-btn",
      attrs: { type: "button", "aria-label": shape.label },
      html: `${iconSvg}<span>${shape.label}</span>`,
    });
    btn.addEventListener("click", () => {
      settings.clipShape = shape.id;
      for (const key in shapeButtons) shapeButtons[key].classList.toggle("is-active", key === shape.id);
      updateRadiusDisabledState();
      applyPreviewToBlockEl(blockEl, settings);
    });
    shapeButtons[shape.id] = btn;
    shapeScroll.appendChild(btn);
  }
  shapeSection.appendChild(shapeScroll);
  sheet.appendChild(shapeSection);

  /* ---- Latar Transparan ----
   * Begitu aktif, kotak/frame di belakang gambar (biasanya diberi warna
   * --color-surface, lihat editor.css) dilepas jadi transparan — supaya
   * area tembus pandang gambar PNG (kanal alpha) benar-benar tembus ke
   * warna latar catatan/scene di baliknya, bukan ketutup warna frame.
   * Tidak berpengaruh secara visual untuk gambar tanpa transparansi asli
   * (mis. JPG), karena gambarnya sendiri memang tidak punya area
   * tembus pandang. */
  const transparentRow = createEl("div", { className: "image-sheet__section image-sheet__row" });
  const transparentLabelCol = createEl("div", { className: "image-sheet__label-col" });
  transparentLabelCol.appendChild(createEl("div", { className: "image-sheet__label", text: "Latar Transparan" }));
  transparentLabelCol.appendChild(
    createEl("div", {
      className: "image-sheet__hint",
      text: "Untuk gambar PNG — area transparan gambar akan tembus ke latar catatan.",
    })
  );
  transparentRow.appendChild(transparentLabelCol);
  const transparentToggle = createEl("button", {
    className: "image-sheet__toggle",
    attrs: { type: "button", role: "switch", "aria-checked": "false" },
  });
  transparentToggle.appendChild(createEl("span", { className: "image-sheet__toggle-knob" }));
  transparentToggle.addEventListener("click", () => {
    settings.transparentBg = !settings.transparentBg;
    transparentToggle.classList.toggle("is-on", settings.transparentBg);
    transparentToggle.setAttribute("aria-checked", String(settings.transparentBg));
    applyPreviewToBlockEl(blockEl, settings);
  });
  transparentRow.appendChild(transparentToggle);
  sheet.appendChild(transparentRow);

  /* ---- Kunci Rasio Gambar ----
   * Begitu aktif, slider Lebar & Tinggi di bawah saling mengikuti supaya
   * rasio aspek gambar tetap terjaga (default 1:1 sebelum ada gambar —
   * lihat IMAGE_DEFAULTS — lalu ikut rasio ASLI gambar begitu satu berhasil
   * diunggah/dimuat, lihat loadNaturalAspectRatio di atas). */
  const lockRow = createEl("div", { className: "image-sheet__section image-sheet__row" });
  lockRow.appendChild(createEl("div", { className: "image-sheet__label", text: "Kunci Rasio Gambar" }));
  const lockToggle = createEl("button", {
    className: "image-sheet__toggle",
    attrs: { type: "button", role: "switch", "aria-checked": "false" },
  });
  lockToggle.appendChild(createEl("span", { className: "image-sheet__toggle-knob" }));
  lockToggle.addEventListener("click", () => {
    settings.lockAspect = !settings.lockAspect;
    lockToggle.classList.toggle("is-on", settings.lockAspect);
    lockToggle.setAttribute("aria-checked", String(settings.lockAspect));
    // Begitu dikunci, samakan Tinggi ke Lebar yang sedang aktif sekarang
    // juga (bukan menunggu slider disentuh dulu) supaya keduanya langsung
    // konsisten dengan rasio yang berlaku.
    if (settings.lockAspect) syncHeightFromWidth(settings.width);
  });
  lockRow.appendChild(lockToggle);
  sheet.appendChild(lockRow);

  /* ---- Slider: lebar / tinggi / border-radius ---- */
  const slidersSection = createEl("div", { className: "image-sheet__section image-sheet__sliders" });
  const widthRow = makeSlider("Lebar", WIDTH_RANGE, settings.width, (v) => {
    settings.width = v;
    if (settings.lockAspect) syncHeightFromWidth(v);
    applyPreviewToBlockEl(blockEl, settings);
  });
  const heightRow = makeSlider("Tinggi", HEIGHT_RANGE, settings.height, (v) => {
    settings.height = v;
    if (settings.lockAspect) syncWidthFromHeight(v);
    applyPreviewToBlockEl(blockEl, settings);
  });
  slidersSection.appendChild(widthRow);
  slidersSection.appendChild(heightRow);

  // Sinkronkan slider Tinggi mengikuti Lebar (atau sebaliknya) sesuai
  // `aspectRatio` yang sedang berlaku — dipanggil dari handler `input` di
  // atas maupun saat toggle Kunci Rasio baru dinyalakan. Nilai HANYA
  // ditampilkan ulang lewat setValue() (tanpa memicu onInput slider
  // lawannya) supaya tidak saling panggil balik antar keduanya.
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
  const radiusRow = makeSlider("Border Radius", RADIUS_RANGE, settings.radius, (v) => {
    settings.radius = v;
    applyPreviewToBlockEl(blockEl, settings);
  });
  slidersSection.appendChild(radiusRow);
  sheet.appendChild(slidersSection);

  // Slider Border Radius dinonaktifkan (visual pudar + input disabled)
  // selama crop bentuk SVG sedang aktif, karena radius kotak tidak lagi
  // berpengaruh terhadap tampilan (bentuknya sudah ditentukan clip-path).
  function updateRadiusDisabledState() {
    const disabled = settings.clipShape !== "none";
    radiusRow.classList.toggle("is-disabled", disabled);
    if (radiusRow.sliderInputEl) radiusRow.sliderInputEl.disabled = disabled;
  }

  /* ---- Aksi: Batal / Terapkan ---- */
  const actions = createEl("div", { className: "image-sheet__actions" });
  const cancelBtn = createEl("button", {
    className: "image-sheet__btn image-sheet__btn--ghost",
    attrs: { type: "button" },
    text: "Batal",
  });
  const applyBtn = createEl("button", {
    className: "image-sheet__btn image-sheet__btn--primary",
    attrs: { type: "button" },
    text: "Terapkan",
  });
  actions.appendChild(cancelBtn);
  actions.appendChild(applyBtn);
  sheet.appendChild(actions);

  const errorEl = createEl("div", { className: "image-sheet__error" });
  sheet.appendChild(errorEl);

  function updateApplyState() {
    // Mode "insert" wajib punya gambar dulu sebelum bisa diterapkan; mode
    // "edit" boleh langsung Terapkan (mis. cuma ganti posisi/ukuran) tanpa
    // wajib mengganti gambarnya. Di kedua mode, selagi gambar yang baru
    // dipilih masih dikonversi ke WebP, "Terapkan" dikunci dulu — supaya
    // tidak ada proses simpan yang jalan diam-diam menunggu konversi
    // selesai tanpa indikasi apa pun ke user.
    applyBtn.disabled = isConverting || (mode === "insert" && !hasImage);
  }

  // --- Set tampilan awal sheet sesuai `settings` & gambar yang sudah ada ---
  for (const key in alignButtons) alignButtons[key].classList.toggle("is-active", key === settings.align);
  for (const key in shapeButtons) shapeButtons[key].classList.toggle("is-active", key === settings.clipShape);
  wrapToggle.classList.toggle("is-on", settings.wrap);
  wrapToggle.setAttribute("aria-checked", String(settings.wrap));
  wrapRow.classList.toggle("is-disabled", settings.align === "center");
  transparentToggle.classList.toggle("is-on", settings.transparentBg);
  transparentToggle.setAttribute("aria-checked", String(settings.transparentBg));
  updateApplyState();
  updateRadiusDisabledState();
  applyPreviewToBlockEl(blockEl, settings);
  if (hasImage && existingBlock.assetId) {
    imageService.getObjectUrl(existingBlock.assetId).then((url) => {
      if (!url) return;
      setPreviewImageSrc(blockEl, url);
      // Rasio aspek gambar yang SUDAH ada di dokumen (mode "edit") juga
      // dihitung dari dimensi aslinya, sama seperti gambar yang baru
      // diunggah di atas — supaya Kunci Rasio tetap akurat walau user
      // membuka lagi pengaturan gambar yang lama tanpa mengganti filenya.
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
    sheetClosed = true;
    overlay.classList.remove("is-open");
    stopReservingSpace();
    unlockNoteContent();
    setTimeout(() => overlay.remove(), 180);
    if (closeCurrentSheet === close) closeCurrentSheet = null;
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
    applyBtn.disabled = busy || (mode === "insert" && !hasImage);
    applyBtn.textContent = busy ? "Menyimpan…" : "Terapkan";
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
        ? "Gagal membaca gambar yang dipilih. Coba pilih ulang gambarnya lewat \"Unggah Gambar\"."
        : "Gagal menyimpan gambar. Coba tekan Terapkan sekali lagi.";
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

  closeCurrentSheet = close;
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
