/**
 * dom.js
 * Helper umum manipulasi DOM, dipakai lintas modul editor & toolbar.
 * Juga berisi "panel manager" kecil untuk dropdown/popover toolbar
 * (buka satu panel, tutup panel lain, tutup saat klik di luar / Escape).
 */

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function createEl(tag, { className, attrs, text, html } = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      el.setAttribute(key, value === true ? "" : String(value));
    }
  }
  if (text !== undefined) el.textContent = text;
  if (html !== undefined) el.innerHTML = html;
  return el;
}

export function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/* ---------------------------------------------------------------------- */
/* Panel manager — dipakai oleh dropdown/color-picker/highlight-picker    */
/* ---------------------------------------------------------------------- */

// Klik tombol toolbar/panel (mis. Bold, Heading, warna) secara default akan
// memindahkan fokus browser ke tombol tsb, sehingga kursor di area catatan
// jadi tidak lagi menerima input keyboard. Ini mencegah "format tertunda"
// (pending marks) diterapkan ke pengetikan berikutnya, karena fokus sudah
// pindah. `preventDefault()` pada mousedown menahan pemindahan fokus itu
// tanpa mengganggu event "click" tombol. <input> dikecualikan supaya
// color-picker native tetap bisa dibuka secara normal.
document.addEventListener("mousedown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.closest("input")) return;
  if (
    e.target.closest(".note-topbar-row") ||
    e.target.closest(".toolbar-child-bar") ||
    e.target.closest(".toolbar-panel") ||
    e.target.closest(".color-picker-bar") ||
    // block-selection-bar.js: menekan Select/Copy/Paste Block atau tombol
    // batal (X) TIDAK BOLEH memindahkan fokus browser — kalau fokus
    // pindah, seleksi teks yang lagi ditampilkan bar ini langsung collapse
    // sebelum tombolnya sempat diproses (sama alasannya dengan tombol
    // toolbar lain di atas).
    e.target.closest(".block-selection-bar") ||
    // block-select-mode.js: drag di probe (pojok kanan-atas/kanan-bawah
    // highlight) juga tidak boleh memindahkan fokus browser ke luar
    // #editorBody selagi mode Select Block aktif (sama alasannya seperti
    // .block-selection-bar di atas).
    e.target.closest(".block-select-handle")
  ) {
    e.preventDefault();
  }
});

let activePanel = null; // { el, close }

// Harus sinkron dengan durasi @keyframes panelOut (var(--anim-scale)) di
// toolbar.css, supaya panel benar-benar dilepas dari DOM setelah animasi
// keluarnya selesai, bukan sebelum/sesudahnya (sama seperti CLOSE_ANIM_MS
// di floating-button.js untuk FAB).
const PANEL_CLOSE_ANIM_MS = 150;

function closeActivePanel() {
  if (activePanel) {
    activePanel.close();
    activePanel = null;
  }
}

document.addEventListener("pointerdown", (e) => {
  if (!activePanel) return;
  const { el, trigger } = activePanel;
  if (el.contains(e.target) || (trigger && trigger.contains(e.target))) return;
  closeActivePanel();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeActivePanel();
    closeColorBar();
    closeFontFamilyBar();
    closeChildGroup();
  }
});

/* ---------------------------------------------------------------------- */
/* Color bar — baris KETIGA di .note-topbar (bukan floating panel seperti  */
/* panel manager di atas). Dipakai oleh color-picker.js & highlight-      */
/* picker.js: klik tombol Warna Teks/Highlight menampilkan #colorPickerBar */
/* full-width tepat di bawah child bar (baris kedua), satu baris yang bisa */
/* digeser horizontal (sama seperti .toolbar-child-bar). Tinggi topbar     */
/* yang bertambah otomatis kedeteksi oleh ResizeObserver di               */
/* viewport-pin.js (yang mengamati .note-topbar), jadi konten catatan     */
/* ikut terdorong turun tanpa kode tambahan di sana.                      */
/* ---------------------------------------------------------------------- */

let activeBar = null; // { trigger }

// Lihat komentar .header-space-transition di layout.css: class ini cuma
// dipasang SEBENTAR (durasi lebih panjang dikit dari delay ResizeObserver+
// rAF di viewport-pin.js) supaya perubahan --editor-header-space akibat
// color bar buka/tutup dianimasikan, lalu dilepas lagi biar tidak
// mengganggu update --editor-footer-space saat keyboard mobile buka/tutup.
let headerSpaceTransitionTimer = null;
function flashHeaderSpaceTransition() {
  const scrollArea = qs(".note-scroll-area");
  if (!scrollArea) return;
  scrollArea.classList.add("header-space-transition");
  clearTimeout(headerSpaceTransitionTimer);
  headerSpaceTransitionTimer = setTimeout(() => {
    scrollArea.classList.remove("header-space-transition");
  }, 300);
}

/**
 * Buka color bar untuk sebuah tombol trigger (Warna Teks / Highlight).
 * `render(barEl)` mengisi konten bar (swatch-swatch + custom color input).
 * Klik trigger yang sama saat bar sudah terbuka untuknya akan menutupnya
 * (toggle), sama seperti openPanel().
 */
export function openColorBar(trigger, render) {
  const barEl = qs("#colorPickerBar");
  if (!barEl) return;

  if (activeBar && activeBar.trigger === trigger) {
    closeColorBar();
    return;
  }
  closeActivePanel();
  closeColorBar();
  closeFontFamilyBar();

  flashHeaderSpaceTransition();
  clearChildren(barEl);
  render(barEl);
  barEl.hidden = false;
  trigger.classList.add("is-open");
  if (trigger.hasAttribute("aria-expanded")) trigger.setAttribute("aria-expanded", "true");
  activeBar = { trigger };
}

export function closeColorBar() {
  if (!activeBar) return;
  const { trigger } = activeBar;
  const barEl = qs("#colorPickerBar");
  trigger.classList.remove("is-open");
  if (trigger.hasAttribute("aria-expanded")) trigger.setAttribute("aria-expanded", "false");
  if (barEl) {
    flashHeaderSpaceTransition();
    barEl.hidden = true;
    clearChildren(barEl);
  }
  activeBar = null;
}

export function isColorBarOpen() {
  return activeBar !== null;
}

document.addEventListener("pointerdown", (e) => {
  if (!activeBar) return;
  const barEl = qs("#colorPickerBar");
  const { trigger } = activeBar;
  if ((barEl && barEl.contains(e.target)) || (trigger && trigger.contains(e.target))) return;
  closeColorBar();
});

/* ---------------------------------------------------------------------- */
/* Font Family bar — full-width, menempel visual di bawah .note-topbar    */
/* (#fontFamilyBar), TAPI beda dari color bar di atas: `position:         */
/* absolute` (lihat .font-family-bar di layout.css) supaya TIDAK ikut     */
/* menambah tinggi .note-topbar sama sekali begitu terbuka — floating/    */
/* overlay MENUTUPI bagian atas area catatan di baliknya, bukan           */
/* mendorongnya turun (beda dari color bar yang masih di-flow normal &    */
/* ikut mendorong konten). Isinya daftar VERTIKAL (bisa panjang, puluhan  */
/* font), jadi discroll VERTIKAL (bukan horizontal) dengan max-height     */
/* dibatasi lewat CSS (.font-family-bar, layout.css) supaya tidak         */
/* menutupi seluruh area catatan di layar pendek. Dipakai oleh            */
/* font-family-dropdown.js.                                                */
/* ---------------------------------------------------------------------- */

let activeFontFamilyBar = null; // { trigger }

/**
 * Buka Font Family bar untuk sebuah tombol trigger. `render(barEl)` mengisi
 * konten bar (daftar font + link "Kelola Font"). Klik trigger yang sama
 * saat bar sudah terbuka untuknya akan menutupnya (toggle), sama seperti
 * openColorBar()/openPanel().
 */
export function openFontFamilyBar(trigger, render) {
  const barEl = qs("#fontFamilyBar");
  if (!barEl) return;

  if (activeFontFamilyBar && activeFontFamilyBar.trigger === trigger) {
    closeFontFamilyBar();
    return;
  }
  closeActivePanel();
  closeColorBar();
  closeFontFamilyBar();

  // BEDA dari openColorBar()/openPanel() child bar lain: bar ini sekarang
  // floating (position:absolute, lihat .font-family-bar di layout.css) —
  // TIDAK ikut menambah tinggi .note-topbar sama sekali, jadi tidak ada
  // --editor-header-space yang berubah untuk di-animasikan halus di sini
  // (beda dari color bar yang masih dorong konten turun). Makanya TIDAK
  // ada flashHeaderSpaceTransition() lagi di sini.
  clearChildren(barEl);
  render(barEl);
  barEl.hidden = false;
  trigger.classList.add("is-open");
  if (trigger.hasAttribute("aria-expanded")) trigger.setAttribute("aria-expanded", "true");
  activeFontFamilyBar = { trigger };
}

export function closeFontFamilyBar() {
  if (!activeFontFamilyBar) return;
  const { trigger } = activeFontFamilyBar;
  const barEl = qs("#fontFamilyBar");
  trigger.classList.remove("is-open");
  if (trigger.hasAttribute("aria-expanded")) trigger.setAttribute("aria-expanded", "false");
  if (barEl) {
    barEl.hidden = true;
    clearChildren(barEl);
  }
  activeFontFamilyBar = null;
}

export function isFontFamilyBarOpen() {
  return activeFontFamilyBar !== null;
}

document.addEventListener("pointerdown", (e) => {
  if (!activeFontFamilyBar) return;
  const barEl = qs("#fontFamilyBar");
  const { trigger } = activeFontFamilyBar;
  if ((barEl && barEl.contains(e.target)) || (trigger && trigger.contains(e.target))) return;
  closeFontFamilyBar();
});

/* ---------------------------------------------------------------------- */
/* Child bar — baris KEDUA di .note-topbar (#toolbarChildBar). Menampilkan */
/* isi salah satu menu kelompok (Text/Style/List/Block/Insert) yang lagi  */
/* aktif. Beda dari color bar di atas: baris ini SENGAJA tidak ikut       */
/* tersembunyi saat page discroll (lihat isChildGroupOpen() dipakai oleh */
/* topbar-autohide.js) — cuma tertutup kalau menu kelompoknya dipencet   */
/* lagi (toggle) atau user tap di luar. Membuka child group baru selalu  */
/* menutup dulu color bar/panel (level 3) yang mungkin masih terbuka     */
/* punya menu kelompok sebelumnya, supaya tidak nyangkut salah konteks.  */
/* ---------------------------------------------------------------------- */

let activeChildGroup = null; // { trigger, groupEl }

/**
 * Buka child bar untuk sebuah tombol menu kelompok (Text/Style/List/
 * Block/Insert). `groupEl` adalah elemen `.toolbar-child-group` yang
 * sudah berisi tombol-tombol anaknya (lihat editor.html). Klik trigger
 * yang sama saat groupnya sudah terbuka akan menutupnya (toggle), sama
 * seperti openColorBar()/openPanel().
 */
export function openChildGroup(trigger, groupEl) {
  const barEl = qs("#toolbarChildBar");
  if (!barEl) return;

  if (activeChildGroup && activeChildGroup.trigger === trigger) {
    closeChildGroup();
    return;
  }

  closeActivePanel();
  closeColorBar();
  closeFontFamilyBar();

  if (activeChildGroup) {
    activeChildGroup.trigger.classList.remove("is-open");
    if (activeChildGroup.trigger.hasAttribute("aria-expanded")) {
      activeChildGroup.trigger.setAttribute("aria-expanded", "false");
    }
    activeChildGroup.groupEl.hidden = true;
  }

  groupEl.hidden = false;
  barEl.hidden = false;
  trigger.classList.add("is-open");
  if (trigger.hasAttribute("aria-expanded")) trigger.setAttribute("aria-expanded", "true");
  activeChildGroup = { trigger, groupEl };
  flashHeaderSpaceTransition();
}

export function closeChildGroup() {
  if (!activeChildGroup) return;
  const { trigger, groupEl } = activeChildGroup;
  const barEl = qs("#toolbarChildBar");

  closeActivePanel();
  closeColorBar();
  closeFontFamilyBar();

  trigger.classList.remove("is-open");
  if (trigger.hasAttribute("aria-expanded")) trigger.setAttribute("aria-expanded", "false");
  groupEl.hidden = true;
  if (barEl) {
    flashHeaderSpaceTransition();
    barEl.hidden = true;
  }
  activeChildGroup = null;
}

export function isChildGroupOpen() {
  return activeChildGroup !== null;
}

/**
 * Menutup panel/color-bar (level 3, mis. daftar Heading atau swatch Warna
 * Teks) TANPA ikut menutup child bar (level 2). Dipakai topbar-autohide.js
 * saat scroll: bar nilai/swatch harus hilang, tapi child bar & topbar
 * tetap tampil kalau masih terbuka.
 */
export function closeTransientPickers() {
  closeActivePanel();
  closeColorBar();
  closeFontFamilyBar();
}

// Child bar SENGAJA tidak punya listener "tutup kalau tap di luar".
// Beda dari activePanel (dropdown, listener pointerdown di atas) dan
// activeBar (color picker, listener pointerdown di atas) yang memang
// harus tetap tertutup begitu user tap di luar dirinya — child bar ini
// harus tetap terbuka apa pun yang user lakukan di area catatan
// (termasuk scroll), dan cuma tertutup lewat toggle tombol trigger-nya
// sendiri (lihat openChildGroup di atas) atau tombol Escape (lihat
// listener keydown di atas).

// Panel harus mengikuti posisi toolbar (mis. saat toolbar di-scroll horizontal
// atau resize), jadi kita reposisi setiap saat, bukan hanya sekali saat dibuka.
window.addEventListener("scroll", () => { if (activePanel) activePanel.reposition(); }, true);
window.addEventListener("resize", () => { if (activePanel) activePanel.reposition(); });

/**
 * Membuka panel mengambang (fixed) tepat di bawah tombol trigger.
 * @param {HTMLElement} trigger - tombol yang membuka panel
 * @param {HTMLElement} panelEl - elemen panel (sudah berisi konten)
 * @param {object} [opts]
 * @param {"left"|"center"} [opts.align="left"]
 */
export function openPanel(trigger, panelEl, opts = {}) {
  // Toggle: kalau panel yang sama sedang terbuka, tutup saja.
  if (activePanel && activePanel.trigger === trigger) {
    closeActivePanel();
    return;
  }
  closeActivePanel();
  closeFontFamilyBar();

  panelEl.classList.add("toolbar-panel");
  document.body.appendChild(panelEl);

  function reposition() {
    // `window.innerHeight`/`innerWidth` TIDAK mengecil saat keyboard mobile
    // muncul (cuma `visualViewport` yang mengecil). Kalau flip-check di
    // bawah masih pakai window.innerHeight, dia bisa salah kira ruang di
    // bawah trigger masih luas padahal sebagian sudah ketutup keyboard
    // (mis. dropdown yang tinggi dibuka dari toolbar di baris atas tetap
    // bisa nabrak keyboard di layar pendek) -> dropdown kebuka ke situ dan
    // jadi tidak kelihatan. Makanya batas bawah/kanan yang dipakai harus
    // dari visualViewport, bukan window.innerHeight/innerWidth.
    const vv = window.visualViewport;
    const viewportRight = vv ? vv.offsetLeft + vv.width : window.innerWidth;
    const viewportBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;

    const rect = trigger.getBoundingClientRect();
    const panelRect = panelEl.getBoundingClientRect();
    let left = opts.align === "center"
      ? rect.left + rect.width / 2 - panelRect.width / 2
      : rect.left;
    const margin = 8;
    left = Math.max(margin, Math.min(left, viewportRight - panelRect.width - margin));
    let top = rect.bottom + 8;
    if (top + panelRect.height > viewportBottom - margin) {
      top = Math.max(margin, rect.top - panelRect.height - 8);
    }
    panelEl.style.left = `${left}px`;
    panelEl.style.top = `${top}px`;
  }

  function close() {
    trigger.classList.remove("is-open");
    if (trigger.hasAttribute("aria-expanded")) trigger.setAttribute("aria-expanded", "false");
    // Ganti ke animasi keluar (panelOut di toolbar.css) dulu, baru benar-benar
    // dilepas dari DOM setelah animasinya kelar — sebelumnya panelEl.remove()
    // dipanggil langsung di sini, jadi dropdown manapun yang lewat openPanel()
    // (menu titik-tiga note card, panel Ganti Tema di FAB, dropdown toolbar
    // editor) selalu menghilang instan tanpa animasi close sama sekali.
    panelEl.classList.add("is-closing");
    window.setTimeout(() => {
      panelEl.remove();
    }, PANEL_CLOSE_ANIM_MS);
  }

  trigger.classList.add("is-open");
  if (trigger.hasAttribute("aria-expanded")) trigger.setAttribute("aria-expanded", "true");
  activePanel = { el: panelEl, trigger, close, reposition };
  reposition();
}

export function closeAllPanels() {
  closeActivePanel();
  closeColorBar();
  closeFontFamilyBar();
  closeChildGroup();
}
