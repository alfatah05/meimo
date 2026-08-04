/**
 * outline.js
 * FAB "Outline" di kanan-bawah viewport editor -> membuka sidebar dari
 * kanan berisi daftar heading (H1-H6) dokumen dalam bentuk file tree
 * (indentasi + garis penuntun, mirip sidebar folder/file VS Code).
 *
 * Aturan:
 * - FAB HANYA tampil kalau dokumen punya minimal satu block heading;
 *   hilang lagi otomatis begitu heading terakhir dihapus (lihat
 *   updateFabVisibility, dipanggil tiap state.onChange).
 * - Klik FAB -> buka sidebar (daftar di-render ulang dari model saat itu
 *   juga, jadi selalu segar). Klik salah satu item -> sidebar ditutup DULU,
 *   baru scroll otomatis ke heading terkait (lihat scrollToHeading).
 * - Posisi FAB & sidebar TIDAK PERNAH menutupi topbar: FAB & overlay
 *   sidebar dipasang dengan z-index var(--z-fab), lebih rendah dari
 *   .note-topbar (var(--z-toolbar)) -- lihat outline.css untuk detail
 *   kenapa itu cukup (topbar selalu tergambar di atas walau posisi
 *   sidebar "top: 0").
 *
 * Styling murni ada di src/css/outline.css, file ini cuma bikin DOM &
 * wiring interaksinya (senada dengan pola sheet lain, mis. image-sheet.js).
 */

import { createEl, clearChildren } from "../utils/dom.js";

/** Gabungkan seluruh teks run dalam satu block heading jadi satu string. */
function headingText(block) {
  const text = (block.runs || []).map((r) => r.text).join("").trim();
  return text || "(Tanpa Judul)";
}

const CLOSE_ANIM_MS = 200; // sedikit lebih lama dari --duration-base (150ms) di outline.css

export function initOutline({ state, bodyEl }) {
  if (!bodyEl) return;

  // ---- Bangun DOM sekali di awal, dipasang permanen ke <body> ----
  const fabEl = createEl("button", {
    className: "outline-fab",
    attrs: { type: "button", "aria-label": "Outline Heading", title: "Outline" },
    html: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="18" x2="12" y2="18"/></svg>',
  });

  const overlayEl = createEl("div", { className: "outline-overlay", attrs: { hidden: true } });
  const backdropEl = createEl("div", { className: "outline-overlay__backdrop" });
  const sidebarEl = createEl("aside", {
    className: "outline-sidebar",
    attrs: { role: "dialog", "aria-label": "Outline Heading" },
  });

  const headerEl = createEl("div", { className: "outline-sidebar__header" });
  headerEl.appendChild(createEl("span", { className: "outline-sidebar__title", text: "Outline" }));
  const closeBtn = createEl("button", {
    className: "outline-sidebar__close",
    attrs: { type: "button", "aria-label": "Tutup Outline" },
    html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>',
  });
  headerEl.appendChild(closeBtn);

  const listEl = createEl("div", { className: "outline-sidebar__list" });

  sidebarEl.append(headerEl, listEl);
  overlayEl.append(backdropEl, sidebarEl);
  document.body.append(fabEl, overlayEl);

  let isOpen = false;
  let isFabVisible = false;

  function getHeadingBlocks() {
    return state.getDocument().blocks.filter((b) => b.type === "heading");
  }

  /** Render ulang daftar heading -> file tree di sidebar dari model
   * terkini. Dipanggil tiap kali sidebar dibuka, dan tiap dokumen berubah
   * SELAGI sidebar masih terbuka (supaya heading baru langsung kelihatan). */
  function renderList() {
    clearChildren(listEl);
    const headings = getHeadingBlocks();

    if (headings.length === 0) {
      listEl.appendChild(
        createEl("div", { className: "outline-sidebar__empty", text: "Belum ada heading di catatan ini." })
      );
      return;
    }

    for (const block of headings) {
      const level = block.level || 2;
      const item = createEl("button", {
        className: `outline-item outline-item--level-${level}`,
        attrs: { type: "button" },
      });

      // Satu guide per level indentasi di atas H1 (H1 = akar, tanpa guide).
      const guides = createEl("span", { className: "outline-item__guides" });
      for (let i = 1; i < level; i++) {
        guides.appendChild(createEl("span", { className: "outline-item__guide" }));
      }

      const icon = createEl("span", { className: "outline-item__icon", text: `H${level}` });
      const label = createEl("span", { className: "outline-item__label", text: headingText(block) });
      item.append(guides, icon, label);

      item.addEventListener("click", () => {
        closeSidebar();
        scrollToHeading(block.id);
      });

      listEl.appendChild(item);
    }
  }

  /** Scroll ke block heading terkait. Clearance dari topbar (yang
   * position:fixed DI ATAS .note-scroll-area) diserahkan ke CSS
   * `scroll-margin-top` di heading (lihat outline.css) -- browser yang
   * urus offsetnya sendiri lewat scrollIntoView, jadi tidak perlu hitung
   * manual scrollTop (lebih rapuh & gampang meleset antar-browser). */
  function scrollToHeading(blockId) {
    const targetEl = bodyEl.querySelector(`[data-block-id="${blockId}"]`);
    if (!targetEl) return;
    targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openSidebar() {
    if (isOpen || !isFabVisible) return;
    isOpen = true;
    renderList();
    overlayEl.hidden = false;
    // Lepas dari flow render pertama (hidden -> false) dulu sebelum nambah
    // class, supaya transisi transform beneran ke-trigger dari state
    // tersembunyi, bukan langsung "snap" ke state akhir.
    requestAnimationFrame(() => overlayEl.classList.add("is-open"));
  }

  function closeSidebar() {
    if (!isOpen) return;
    isOpen = false;
    overlayEl.classList.remove("is-open");
    setTimeout(() => {
      if (!isOpen) overlayEl.hidden = true;
    }, CLOSE_ANIM_MS);
  }

  fabEl.addEventListener("click", () => {
    if (isOpen) closeSidebar();
    else openSidebar();
  });
  closeBtn.addEventListener("click", closeSidebar);
  backdropEl.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) closeSidebar();
  });

  // Class "is-hiding" (animasi keluar) dilepas begitu animasinya selesai,
  // biar balik ke state dasar (tersembunyi, tanpa class apa pun) yang
  // secara visual identik -- murni beres-beres, tidak mempengaruhi tampilan.
  fabEl.addEventListener("animationend", (e) => {
    if (e.animationName === "outlineFabOut") fabEl.classList.remove("is-hiding");
  });

  function updateFabVisibility() {
    const hasHeading = getHeadingBlocks().length > 0;
    if (hasHeading === isFabVisible) return;
    isFabVisible = hasHeading;

    if (hasHeading) {
      fabEl.classList.remove("is-hiding");
      fabEl.classList.add("is-visible");
    } else {
      fabEl.classList.remove("is-visible");
      fabEl.classList.add("is-hiding");
      closeSidebar(); // heading terakhir dihapus selagi sidebar terbuka -> ikut tutup
    }
  }

  state.onChange(() => {
    updateFabVisibility();
    if (isOpen) renderList();
  });

  updateFabVisibility();
}
