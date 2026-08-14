/**
 * scroll-bottom-fab.js
 * FAB kiri-bawah: gulir ke baris paling bawah editor.
 * Ukuran ~setengah FAB AI, warna senada outline FAB.
 *
 * Saat diklik: scroll ke bawah, lalu begitu scroll benar-benar sampai batas
 * bawah, tunggu 300ms (biar user sempat lihat posisi akhir dulu) baru
 * kursor otomatis difokuskan ke baris paling bawah dokumen.
 */

import { createEl } from "../utils/dom.js";

const NEAR_BOTTOM_PX = 48;
const FOCUS_END_DELAY_MS = 300;

export function initScrollBottomFab({ bodyEl, editor }) {
  const scrollArea = document.querySelector(".note-scroll-area");
  if (!scrollArea || !bodyEl) return;

  const fabEl = createEl("button", {
    className: "scroll-bottom-fab",
    attrs: {
      type: "button",
      "aria-label": "Gulir ke bawah",
      title: "Ke bawah",
    },
    html:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  });

  let isVisible = false;

  function canScrollDown() {
    const max = scrollArea.scrollHeight - scrollArea.clientHeight;
    if (max < 24) return false;
    return scrollArea.scrollTop < max - NEAR_BOTTOM_PX;
  }

  function setVisible(show) {
    if (show === isVisible) return;
    isVisible = show;
    if (show) {
      fabEl.classList.remove("is-hiding");
      fabEl.classList.add("is-visible");
    } else {
      fabEl.classList.remove("is-visible");
      fabEl.classList.add("is-hiding");
    }
  }

  function update() {
    if (document.body.classList.contains("is-block-select-mode")) {
      setVisible(false);
      return;
    }
    setVisible(canScrollDown());
  }

  fabEl.addEventListener("animationend", (e) => {
    if (e.animationName === "scrollBottomFabOut") fabEl.classList.remove("is-hiding");
  });

  let focusTimer = null;
  let scrollEndCleanup = null;

  function clearPendingFocus() {
    if (focusTimer) {
      clearTimeout(focusTimer);
      focusTimer = null;
    }
    if (scrollEndCleanup) {
      scrollEndCleanup();
      scrollEndCleanup = null;
    }
  }

  function isAtBottom() {
    const max = scrollArea.scrollHeight - scrollArea.clientHeight;
    return scrollArea.scrollTop >= max - 1;
  }

  /** Tunggu sampai scroll area benar-benar berhenti di posisi paling bawah,
   * lalu jalankan callback. Pakai event native "scrollend" kalau didukung
   * browser; kalau tidak, fallback polling via requestAnimationFrame yang
   * menganggap scroll "selesai" begitu posisinya stabil beberapa frame. */
  function onceScrollSettledAtBottom(callback) {
    if (isAtBottom()) {
      callback();
      return;
    }

    if ("onscrollend" in window) {
      const handler = () => {
        scrollArea.removeEventListener("scrollend", handler);
        scrollEndCleanup = null;
        if (isAtBottom()) callback();
      };
      scrollArea.addEventListener("scrollend", handler);
      scrollEndCleanup = () => scrollArea.removeEventListener("scrollend", handler);
      return;
    }

    let lastTop = scrollArea.scrollTop;
    let stableFrames = 0;
    let rafId = null;
    const tick = () => {
      const top = scrollArea.scrollTop;
      if (top === lastTop) {
        stableFrames++;
      } else {
        stableFrames = 0;
        lastTop = top;
      }
      if (stableFrames >= 3) {
        scrollEndCleanup = null;
        if (isAtBottom()) callback();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    scrollEndCleanup = () => cancelAnimationFrame(rafId);
  }

  fabEl.addEventListener("click", () => {
    clearPendingFocus();
    scrollArea.scrollTo({
      top: scrollArea.scrollHeight,
      behavior: "smooth",
    });
    onceScrollSettledAtBottom(() => {
      focusTimer = setTimeout(() => {
        focusTimer = null;
        if (editor && typeof editor.focusEnd === "function") editor.focusEnd();
      }, FOCUS_END_DELAY_MS);
    });
  });

  document.body.appendChild(fabEl);

  scrollArea.addEventListener("scroll", update, { passive: true });
  // Kalau user scroll manual lagi (menjauh dari bawah) selagi timer 300ms
  // masih menunggu, batalkan auto-focus supaya tidak "menyambar" fokus tanpa
  // diminta saat user sedang baca-baca di tengah dokumen.
  scrollArea.addEventListener(
    "scroll",
    () => {
      if (focusTimer && !isAtBottom()) clearPendingFocus();
    },
    { passive: true }
  );
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => update());
    ro.observe(scrollArea);
    ro.observe(bodyEl);
  }
  window.addEventListener("resize", update);

  // Initial
  requestAnimationFrame(update);

  return { update };
}
