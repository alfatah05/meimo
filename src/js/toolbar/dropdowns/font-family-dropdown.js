/**
 * font-family-dropdown.js
 * Dropdown Font Family di floating toolbar. Daftarnya BUKAN daftar bebas —
 * hanya font yang boleh dipakai user:
 *   1. 2 font bawaan (Inter, Georgia) — selalu ada.
 *   2. Font kustom yang sudah diunduh user dari Font Library (halaman
 *      Kelola Font / font-manager.html) — dibaca dari IndexedDB lewat
 *      font-service.js.
 * Kalau user mau font lain di luar itu, dropdown ini mengarahkan ke
 * font-manager.html untuk mengunduhnya dulu — TIDAK ada input font bebas.
 *
 * Tiap font juga bisa ditandai FAVORIT lewat ikon bintang di sebelah kanan
 * nama font (lihat renderRow()/toggleFontFavorite()) — status favoritnya
 * disimpan lintas sesi lewat font-service.js. Baris toggle di paling atas
 * bar (.font-family-bar__tabs, DI LUAR area yang discroll) memfilter
 * daftar jadi Semua Font / Font Favorit / Font Impor.
 */

import { createEl, clearChildren, openFontFamilyBar, closeTransientPickers } from "../../utils/dom.js";
import { setFontFamily } from "../../editor/commands.js";
import { getAvailableFonts, toggleFontFavorite } from "../../services/font-service.js";
import { t } from "../../i18n/i18n.js";

const DEFAULT_FAMILY = "Inter";

const STAR_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 2.5l2.97 6.34 6.99.8-5.2 4.78 1.42 6.9-6.18-3.55-6.18 3.55 1.42-6.9-5.2-4.78 6.99-.8z"></path></svg>';

// Ikon "T" — SAMA PERSIS dipakai tombol FAB "Font Library" (lihat
// index.html, .fab-action[data-fab-action="font-library"]) — dipakai
// ulang di sini juga supaya tombol "Kelola Font" konsisten ikonnya di
// mana pun dia muncul.
const MANAGE_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<polyline points="4 7 4 4 20 4 20 7"></polyline>' +
  '<line x1="9" y1="20" x2="15" y2="20"></line>' +
  '<line x1="12" y1="4" x2="12" y2="20"></line></svg>';

function getTabs() {
  return [
    { id: "all", label: t("font.tab.all") },
    { id: "favorite", label: t("font.tab.favorite") },
    { id: "upload", label: t("font.tab.upload") },
  ];
}

function emptyMessageFor(tabId) {
  if (tabId === "favorite") return t("font.empty.favorite");
  if (tabId === "upload") return t("font.empty.upload");
  return t("font.empty.all");
}

export function initFontFamilyDropdown(button, editor) {
  const labelEl = button.querySelector(".toolbar-dropdown__label");
  let currentFamily = null;
  let renderedItems = []; // { el, family }
  let allFonts = [];
  // Tab aktif dipertahankan di memori sepanjang sesi (bukan per-buka), jadi
  // kalau user sedang lihat Font Favorit lalu tutup/buka lagi bar-nya,
  // pilihan tab-nya tidak balik ke "Semua Font" sendiri.
  let activeTab = "all";
  let listEl = null;
  let tabButtons = [];
  // Ditentukan SEKALI saat tombol "Font" di-tap (lihat button.addEventListener
  // "click" di bawah) — BUKAN dibaca ulang saat baris font di dalam bar
  // di-tap. Alasannya: begitu bar terbuka lalu user tap salah satu baris
  // font di dalamnya, baris itu SENDIRI yang jadi document.activeElement
  // (tombol di dalam bar ikut menerima fokus saat diklik), jadi
  // `document.activeElement === editor.titleEl` sudah pasti false lagi di
  // titik itu — walau user sebenarnya lagi mengedit judul. Menyimpan
  // konteksnya lebih awal (saat activeElement masih benar-benar
  // titleEl/bodyEl) menghindari salah target ini.
  //
  // Disimpan sebagai REFERENSI ELEMEN LANGSUNG (bukan cuma boolean
  // editingTitle) supaya juga benar untuk Scene: isi Scene punya
  // contenteditable "pulau" SENDIRI (`.editor-scene__body`, lihat
  // serializer.js renderSceneWrapper()) yang terpisah dari editor.bodyEl
  // — kalau kursor lagi ada di dalam Scene, elemen yang perlu difokuskan
  // balik setelah bar ditutup adalah `.editor-scene__body` itu, BUKAN
  // editor.bodyEl (memfokuskan editor.bodyEl akan "melompat keluar" dari
  // Scene ke pulau contenteditable luar, kursor pindah ke posisi
  // default di situ alih-alih tetap di dalam Scene).
  let focusTargetEl = null;

  function isEditableTarget(el) {
    return !!el && (el === editor.titleEl || el === editor.bodyEl || el.closest(".editor-scene__body") === el);
  }

  function markActive() {
    const effective = currentFamily || DEFAULT_FAMILY;
    for (const { el, family } of renderedItems) {
      el.classList.toggle("is-active", family === effective);
    }
  }

  function updateLabel(family, fallback = DEFAULT_FAMILY) {
    currentFamily = family || null;
    if (labelEl) labelEl.textContent = family || fallback;
    markActive();
  }

  function fontsForTab(tabId) {
    if (tabId === "favorite") return allFonts.filter((f) => f.favorite);
    if (tabId === "upload") return allFonts.filter((f) => f.source === "upload");
    return allFonts;
  }

  function renderRow(font) {
    const row = createEl("div", { className: "font-family-bar__row" });

    const item = createEl("button", {
      className: "font-family-bar__item",
      attrs: { type: "button", title: font.name },
      text: font.name,
    });
    item.style.fontFamily = `"${font.family}"`;
    item.addEventListener("click", () => {
      const editingTitle = focusTargetEl === editor.titleEl;
      if (editingTitle) {
        editor.setTitleStyle({ fontFamily: font.family });
      } else {
        editor.runCommand(setFontFamily, font.family);
      }
      updateLabel(font.family);
      closeTransientPickers();
      // Kembalikan fokus ke elemen yang tadi benar-benar sedang diedit
      // SETELAH closeTransientPickers() melepas bar (barEl.hidden +
      // clearChildren membuang tombol font yang barusan ini juga sedang
      // fokus, dari DOM — begitu elemen yang fokus hilang dari DOM,
      // browser otomatis melempar fokus ke <body>). Tanpa ini, kalau
      // sebelumnya user cuma taruh kursor collapsed (TANPA memblok/
      // menyeleksi teks apa pun) lalu pilih font di sini, font memang
      // sudah tersimpan sebagai "pending mark" (lihat applyPendingMark()
      // di commands.js) — tapi ketikan berikutnya sama sekali tidak akan
      // masuk ke catatan, karena tidak ada elemen contenteditable yang
      // punya fokus lagi untuk menerimanya. Kalau sebelumnya user MEMBLOK
      // teks, bug ini tidak kelihatan karena formatnya langsung
      // diterapkan ke teks yang sudah ada (tidak perlu menunggu ketikan
      // lanjutan), makanya seolah-olah cuma jalur "blok dulu" yang
      // bekerja.
      //
      // PENTING dipakai `focusTargetEl` (elemen persis yang tadinya
      // fokus), BUKAN selalu editor.bodyEl — kalau kursor ada di dalam
      // Scene, elemen itu adalah `.editor-scene__body` milik Scene
      // tersebut, bukan editor.bodyEl (lihat komentar deklarasi
      // `focusTargetEl` di atas). Fallback ke editor.bodyEl kalau karena
      // sesuatu hal referensinya sudah tidak valid lagi (mis. Scene-nya
      // sempat dihapus).
      const target = isEditableTarget(focusTargetEl) && document.contains(focusTargetEl) ? focusTargetEl : editor.bodyEl;
      target.focus();
    });
    renderedItems.push({ el: item, family: font.family });

    const favBtn = createEl("button", {
      className: "font-family-bar__fav-btn",
      attrs: { type: "button" },
      html: STAR_ICON_SVG,
    });
    const syncFavBtn = () => {
      favBtn.classList.toggle("is-favorite", !!font.favorite);
      const label = font.favorite
        ? t("font.fav.remove", { name: font.name })
        : t("font.fav.add", { name: font.name });
      favBtn.setAttribute("aria-label", label);
      favBtn.title = label;
    };
    syncFavBtn();
    // stopPropagation: dua tombol terpisah bertetangga di baris yang sama
    // (bukan satu elemen bertumpuk), jadi sebenarnya klik keduanya tidak
    // akan saling bentrok — tapi dijaga tetap eksplisit kalau markup-nya
    // berubah nanti.
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      font.favorite = toggleFontFavorite(font.id);
      syncFavBtn();
      // Lagi lihat tab Font Favorit & baru di-unfavorite -> baris ini
      // langsung hilang dari daftar (bukan nunggu bar ditutup-buka lagi).
      if (activeTab === "favorite" && !font.favorite) {
        renderList();
      }
    });

    row.appendChild(item);
    row.appendChild(favBtn);
    return row;
  }

  function renderList() {
    if (!listEl) return;
    renderedItems = [];
    clearChildren(listEl);

    const fonts = fontsForTab(activeTab);

    if (fonts.length === 0) {
      listEl.appendChild(
        createEl("div", {
          className: "font-family-bar__empty",
          text: emptyMessageFor(activeTab),
        })
      );
    } else {
      for (const font of fonts) {
        listEl.appendChild(renderRow(font));
      }
    }

    markActive();
  }

  function renderTabs(tabsEl) {
    tabButtons = [];
    for (const tab of getTabs()) {
      const tabBtn = createEl("button", {
        className: "font-family-bar__tab",
        attrs: { type: "button", role: "tab", "aria-selected": String(tab.id === activeTab) },
        text: tab.label,
      });
      tabBtn.classList.toggle("is-active", tab.id === activeTab);
      tabBtn.addEventListener("click", () => {
        if (activeTab === tab.id) return;
        activeTab = tab.id;
        for (const btn of tabButtons) {
          const isActive = btn === tabBtn;
          btn.classList.toggle("is-active", isActive);
          btn.setAttribute("aria-selected", String(isActive));
        }
        renderList();
      });
      tabButtons.push(tabBtn);
      tabsEl.appendChild(tabBtn);
    }

    // Tombol "Kelola Font" — DI LUAR role="tablist" logis (bukan salah
    // satu pilihan Semua/Favorit/Impor, cuma tautan navigasi ke
    // font-manager.html) tapi tetap ditaruh SEBARIS di sebelah kanan
    // ketiga tab, menggantikan link teks "+ Kelola Font…" yang dulu ada
    // di paling bawah daftar (lihat renderList()) — supaya selalu
    // kelihatan tanpa perlu discroll ke bawah dulu, sama seperti tab-tab
    // di sebelahnya. `<a>` (bukan `<button>`) supaya navigasi native ke
    // /font-manager tetap jalan apa adanya, konsisten dengan pola link
    // navigasi FAB lain (lihat komentar toolbar.js "Item menu yang
    // berupa link navigasi native").
    const manageBtn = createEl("a", {
      className: "font-family-bar__manage-btn",
      attrs: { href: "/font-manager", "aria-label": t("font.manage"), title: t("font.manage") },
      html: MANAGE_ICON_SVG,
    });
    tabsEl.appendChild(manageBtn);
  }

  function renderBar(barEl, fonts) {
    allFonts = fonts;

    const tabsEl = createEl("div", { className: "font-family-bar__tabs", attrs: { role: "tablist" } });
    renderTabs(tabsEl);
    barEl.appendChild(tabsEl);

    listEl = createEl("div", { className: "font-family-bar__list" });
    barEl.appendChild(listEl);
    renderList();
  }

  button.addEventListener("click", async () => {
    // Tangkap elemen yang sedang diedit (judul / isi catatan / isi
    // Scene) DI SINI, sebelum apa pun lain terjadi — lihat komentar di
    // deklarasi `focusTargetEl` di atas kenapa ini tidak bisa ditunda
    // sampai baris font di dalam bar di-tap.
    focusTargetEl = isEditableTarget(document.activeElement) ? document.activeElement : editor.bodyEl;
    // Data font diambil DULU (await) sebelum bar dibuka — sama seperti
    // perilaku buildPanel() versi sebelumnya — supaya bar tidak sempat
    // muncul kosong sesaat lalu "kedip" terisi begitu IndexedDB selesai
    // dibaca (walau biasanya cepat, lebih konsisten kalau isi & buka
    // barengan).
    const fonts = await getAvailableFonts();
    openFontFamilyBar(button, (barEl) => renderBar(barEl, fonts));
  });

  return { updateLabel };
}
