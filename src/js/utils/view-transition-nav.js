/**
 * view-transition-nav.js
 * Cross-document View Transitions (@view-transition di view-transitions.css)
 * di Chrome/WebView sering TERPICU untuk history traversal (tombol/gesture
 * back HP → history.back()) tapi TIDAK untuk klik <a href> biasa (push
 * navigasi). Modul ini menyamakan keduanya:
 *
 *  1) Tombol back topbar (`.note-back-btn`): pakai history.back() kalau
 *     referrer same-origin (sama seperti back HP) supaya animasi jalan;
 *     fallback ke href kalau tidak ada history in-app.
 *  2) Link internal same-origin (kartu catatan, menu FAB, Arsip, dll.):
 *     navigasi lewat Navigation API (kalau ada) atau location.assign di
 *     dalam handler klik (tetap punya user activation) supaya WebView
 *     memperlakukan navigasi setara dan VT ikut terpicu.
 *
 * Tidak mengubah perilaku link eksternal, download, target=_blank, atau
 * klik yang sudah e.defaultPrevented (mis. menu titik-tiga di note card).
 */

const BACK_BTN_SELECTOR = ".note-back-btn, a[data-nav-back]";

function isModifiedClick(e) {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

function sameOriginUrl(href) {
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return null;
    return url;
  } catch {
    return null;
  }
}

function navigateTo(url) {
  const href = typeof url === "string" ? url : url.href;
  // Navigation API (Chrome) — path resmi untuk navigasi yang ikut
  // cross-document View Transition types.
  if (window.navigation && typeof window.navigation.navigate === "function") {
    try {
      window.navigation.navigate(href);
      return;
    } catch (_) {
      /* fallback di bawah */
    }
  }
  window.location.assign(href);
}

function canUseHistoryBack() {
  // referrer same-origin = kemungkinan besar datang dari halaman meimo lain
  // (klik kartu / menu), jadi back = traverse yang sudah terbukti animasinya
  // jalan di WebView user.
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
      // Biarkan app.js menangani sheet terbuka (preventDefault + tutup sheet)
      if (e.defaultPrevented) return;

      const fallback = btn.getAttribute("href") || "/library";
      if (!canUseHistoryBack()) {
        // Deep link / buka langsung editor — tidak ada history in-app
        e.preventDefault();
        navigateTo(fallback);
        return;
      }

      e.preventDefault();
      // Sama seperti back HP → traverse → VT terpicu
      window.history.back();
    });
  });
}

function initInternalLinkClicks() {
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || isModifiedClick(e)) return;

      // Jangan intersep klik pada kontrol di dalam link (menu ⋮ note card,
      // tombol di header, input, dll.) — mereka preventDefault di bubble,
      // tapi capture kita jalan duluan dan bisa keliru menavigasi.
      if (e.target.closest && e.target.closest("button, [type='button'], input, select, textarea, label, [role='menuitem']")) {
        return;
      }

      const a = e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      if (a.dataset.vtNavBound === "1") return; // back btn sudah diurus
      if (a.matches(BACK_BTN_SELECTOR)) return;
      if (a.hasAttribute("download")) return;
      if (a.target && a.target !== "" && a.target !== "_self") return;
      if (a.getAttribute("href")?.startsWith("#")) return;

      const url = sameOriginUrl(a.href);
      if (!url) return;

      // Same path+search — biarkan default (hash / no-op)
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }

      e.preventDefault();
      navigateTo(url.href);
    },
    true // capture: sebelum handler lain sempat ganggu, tetap after defaultPrevented check
  );
}

export function initViewTransitionNav() {
  if (typeof window === "undefined") return;
  initBackButtons();
  initInternalLinkClicks();
}

// Auto-init (dipakai lewat <script type="module"> di semua halaman)
initViewTransitionNav();
