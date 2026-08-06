/**
 * view-transition-nav.js
 * Cross-document View Transitions (@view-transition).
 *
 * - Opt-in HARUS ada inline di <head> tiap HTML (bukan cuma CSS eksternal)
 *   supaya navigasi MAJU (klik card/menu) ikut beranimasi — lihat komentar
 *   di index.html & Chromium issue 348683476.
 * - Tombol back topbar: history.back() supaya sama dengan back HP (traverse
 *   VT yang sudah terbukti jalan di WebView).
 *
 * Link internal (<a href>) SENGAJA tidak di-intersep — biarkan navigasi
 * native browser. preventDefault + location.assign bisa membuat navigasi
 * dianggap "script-initiated" dan VT maju gagal di beberapa WebView.
 */

const BACK_BTN_SELECTOR = ".note-back-btn, a[data-nav-back]";

function isModifiedClick(e) {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

function canUseHistoryBack() {
  try {
    if (!document.referrer) return false;
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

function initBackButtons() {
  document.querySelectorAll(BACK_BTN_SELECTOR).forEach((btn) => {
    if (btn.dataset.vtNavBound === "1") return;
    btn.dataset.vtNavBound = "1";

    btn.addEventListener("click", (e) => {
      if (isModifiedClick(e)) return;
      // Sheet terbuka: app.js sudah preventDefault + tutup sheet
      if (e.defaultPrevented) return;

      const fallback = btn.getAttribute("href") || "/library";
      if (!canUseHistoryBack()) {
        // Deep link — tidak ada history in-app; biarkan <a> default ATAU assign
        return;
      }

      e.preventDefault();
      window.history.back();
    });
  });
}

export function initViewTransitionNav() {
  if (typeof window === "undefined") return;
  initBackButtons();
}

initViewTransitionNav();
