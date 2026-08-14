/**
 * notes-list.js
 * Render & pengelolaan Notes List (Home): Pinned strip + grid Terbaru/Semua
 * Notes/Hasil Pencarian, plus entry point untuk halaman index.html.
 *
 * Sumber data SATU-SATUNYA lewat Document Service (bukan IndexedDB
 * langsung) — lihat src/js/services/document-service.js. Note yang
 * `trashed`/`archived` tidak ditampilkan di Home (sesuai DOCUMENT_MODEL.md).
 */

import * as documentService from "../services/document-service.js";
import { debounce } from "../utils/debounce.js";
import { createNoteCard, createPinnedCard } from "./note-card.js";
import { t, initI18n } from "../i18n/i18n.js";
import { sortOptionLabel } from "./sorting.js";
import { toggleNotePin } from "./pin.js";
import { downloadNoteAsMeimo } from "./download-note.js";
import { filterNotes } from "./search.js";
import { SORT_OPTIONS, getSort, setSort, sortNotes } from "./sorting.js";
import { openPanel, closeAllPanels } from "../utils/dom.js";
import { showToast } from "../../components/toast.js";
import { ensureInstalledFontsLoaded } from "../services/font-service.js";
import { getObjectUrl } from "../services/image-service.js";
import { initRefreshOnRestore } from "../utils/reload-on-restore.js";
import { seedDefaultNotesIfNeeded } from "./seed-default-notes.js";
import "../utils/trap-back-navigation.js";

/** diisi saat boot() — dipanggil SPA saat kembali ke Home */
let __refreshHomeFn = null;
/** Skeleton Home belum pernah disembunyikan di sesi ini. */
let __homeSkeletonPending = true;


const SEARCH_DEBOUNCE_MS = 120;

/** Warm object-URL cache untuk semua gambar latar kartu sebelum render. */
async function preloadCardBackgrounds(notes) {
  const ids = new Set();
  for (const note of notes || []) {
    const id = note && note.metadata && note.metadata.cardStyle && note.metadata.cardStyle.bgImageAssetId;
    if (id) ids.add(id);
  }
  if (!ids.size) return;
  await Promise.allSettled([...ids].map((id) => getObjectUrl(id)));
}

function collectBgReady(root) {
  const promises = [];
  if (!root) return promises;
  root.querySelectorAll(".note-card, .pinned-card").forEach((el) => {
    if (el.__bgReady && typeof el.__bgReady.then === "function") {
      promises.push(el.__bgReady);
    }
  });
  return promises;
}


/** Bangun panel dropdown berisi pilihan urutan (dibuka lewat openPanel dom.js). */
function buildSortPanel(onPick) {
  const list = document.createElement("div");
  list.className = "toolbar-panel__list";
  const current = getSort();

  for (const opt of SORT_OPTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toolbar-panel__item" + (opt.id === current ? " is-active" : "");
    btn.textContent = sortOptionLabel(opt);
    btn.addEventListener("click", () => onPick(opt));
    list.appendChild(btn);
  }
  return list;
}

async function boot() {
  initI18n();
  const searchInput = document.getElementById("searchInput");
  const sortTrigger = document.getElementById("sortTrigger");
  const sortLabel = document.getElementById("sortLabel");
  const pinnedSection = document.getElementById("pinnedSection");
  const pinnedStrip = document.getElementById("pinnedStrip");
  const recentSection = document.getElementById("recentSection");
  const recentSectionTitle = document.getElementById("recentSectionTitle");
  const notesGrid = document.getElementById("notesGrid");
  const emptyState = document.getElementById("emptyState");
  const emptyStateTitle = document.getElementById("emptyStateTitle");
  const emptyStateDesc = document.getElementById("emptyStateDesc");

  if (!searchInput || !notesGrid) return;

  let allNotes = [];

  function updateSortLabel() {
    if (!sortLabel) return;
    const current = getSort();
    const opt = SORT_OPTIONS.find((o) => o.id === current) || SORT_OPTIONS[0];
    sortLabel.textContent = sortOptionLabel(opt);
  }
  updateSortLabel();

  if (sortTrigger) {
    sortTrigger.addEventListener("click", () => {
      const panel = buildSortPanel((opt) => {
        setSort(opt.id);
        updateSortLabel();
        closeAllPanels();
        render(searchInput.value);
      });
      openPanel(sortTrigger, panel, { align: "center" });
    });
  }

  /** Pindahkan satu catatan ke Sampah, lalu render ulang list dengan Undo. */
  async function handleTrash(note) {
    await documentService.moveToTrash(note.id);
    allNotes = allNotes.filter((n) => n.id !== note.id);
    render(searchInput.value);
    showToast(t("note.movedTrash", { title: note.title || t("note.untitled") }), {
      actionLabel: t("note.undo"),
      onAction: async () => {
        await documentService.restoreFromTrash(note.id);
        allNotes = await documentService.listNotes({ includeTrashed: false, includeArchived: false });
        render(searchInput.value);
      },
    });
  }

  /** Balik status sematan satu catatan, lalu render ulang list. */
  async function handleTogglePin(note) {
    const updated = await toggleNotePin(note);
    allNotes = allNotes.map((n) => (n.id === updated.id ? updated : n));
    render(searchInput.value);
  }

  /** Arsipkan satu catatan (hilang dari Home, tetap ada di halaman Arsip
   * lewat /arsip), lalu render ulang list dengan Undo — pola sama persis
   * dengan handleTrash() di atas. */
  async function handleArchive(note) {
    await documentService.setArchived(note.id, true);
    allNotes = allNotes.filter((n) => n.id !== note.id);
    render(searchInput.value);
    showToast(t("note.movedArchive", { title: note.title || t("note.untitled") }), {
      actionLabel: t("note.undo"),
      onAction: async () => {
        await documentService.setArchived(note.id, false);
        allNotes = await documentService.listNotes({ includeTrashed: false, includeArchived: false });
        render(searchInput.value);
      },
    });
  }

  function render(query) {
    // FIX v1.3.8: sebelumnya skeleton (#homeSkeleton) baru disembunyikan
    // SETELAH `Promise.all([ensureInstalledFontsLoaded(), refreshData()])`
    // di boot() selesai KEDUANYA — tapi refreshData() (yang manggil
    // render() ini) sering selesai duluan sebelum font kustom selesai
    // dimuat, jadi ada jeda di mana card note ASLI sudah tampil (di bawah
    // section pinned/recent yang baru di-unhide) SEMENTARA skeleton di
    // atasnya masih kelihatan juga — keduanya numpuk. Skeleton cuma perlu
    // tampil sampai render pertama ini benar-benar jalan, jadi disembunyikan
    // di sini juga (paling awal), atomically bareng konten aslinya muncul —
    // bukan digantungkan ke Promise lain yang tidak terkait langsung ke DOM
    // ini. Aman dipanggil berkali-kali (search/toggle pin ikut manggil
    // render() lagi setelahnya) karena tinggal no-op kalau sudah hidden.
    const homeSkeleton = document.getElementById("homeSkeleton");
    // Skeleton disembunyikan SETELAH kartu + gambar latar siap (lihat akhir render).

    const trimmed = (query || "").trim();
    const filtered = filterNotes(allNotes, trimmed);

    // Pinned lebih dulu: dipisah ke strip tersendiri di atas, sisanya di grid.
    const activeSort = getSort();
    const pinned = sortNotes(filtered.filter((note) => note.metadata.pinned), activeSort);
    const others = sortNotes(filtered.filter((note) => !note.metadata.pinned), activeSort);

    pinnedStrip.innerHTML = "";
    if (pinned.length) {
      pinnedSection.hidden = false;
      for (const note of pinned) pinnedStrip.appendChild(createPinnedCard(note, { onTrash: handleTrash, onTogglePin: handleTogglePin, onArchive: handleArchive, onDownload: downloadNoteAsMeimo }));
    } else {
      pinnedSection.hidden = true;
    }

    notesGrid.innerHTML = "";
    recentSectionTitle.textContent = trimmed ? t("home.searchResults") : t("home.recent");
    if (others.length) {
      recentSection.hidden = false;
      for (const note of others) notesGrid.appendChild(createNoteCard(note, { onTrash: handleTrash, onTogglePin: handleTogglePin, onArchive: handleArchive, onDownload: downloadNoteAsMeimo }));
    } else {
      recentSection.hidden = true;
    }

    if (filtered.length === 0) {
      emptyState.hidden = false;
      if (trimmed) {
        emptyStateTitle.textContent = t("home.empty.none.title");
        emptyStateDesc.textContent = t("home.empty.none.desc", { q: trimmed });
      } else {
        emptyStateTitle.textContent = t("home.empty.title");
        emptyStateDesc.textContent = t("home.empty.desc");
      }
    } else {
      emptyState.hidden = true;
    }

    // Tunggu gambar latar kartu (GIF/foto) sebelum nutup skeleton di reveal pertama.
    // Search/pin ulang tidak menampilkan skeleton lagi — no-op.
    if (__homeSkeletonPending && homeSkeleton) {
      const bgReady = [
        ...collectBgReady(pinnedStrip),
        ...collectBgReady(notesGrid),
      ];
      const done = () => {
        if (!__homeSkeletonPending) return;
        __homeSkeletonPending = false;
        homeSkeleton.hidden = true;
      };
      if (!bgReady.length) {
        done();
      } else {
        // Timeout jaga-jaga supaya skeleton tidak menggantung kalau asset rusak.
        const timeout = new Promise((r) => setTimeout(r, 4000));
        Promise.race([Promise.allSettled(bgReady), timeout]).then(done);
      }
    } else if (homeSkeleton && homeSkeleton.hidden === false && !__homeSkeletonPending) {
      homeSkeleton.hidden = true;
    }
  }

  const renderDebounced = debounce(() => render(searchInput.value), SEARCH_DEBOUNCE_MS);
  searchInput.addEventListener("input", renderDebounced);

  // Muat lebih dulu @font-face untuk font kustom yang sudah pernah diunduh
  // (lihat font-service.js) — kalau tidak, note card yang judulnya memakai
  // font kustom (lihat metadata.cardStyle.titleFont, notes/card-style.js)
  // akan jatuh ke font fallback karena browser belum tahu font tsb.
  // Note yang trashed/archived tidak muncul di Home (bukan dihapus dari DB).
  //
  // BUGFIX: sebelumnya fungsi ini juga langsung manggil render() di baris
  // terakhirnya, dan boot() nunggu `Promise.all([ensureInstalledFontsLoaded(),
  // refreshData()])` — tapi render() (yang menyembunyikan #homeSkeleton,
  // lihat catatan di render()) jalan begitu refreshData() SENDIRI selesai,
  // TIDAK ikut nunggu ensureInstalledFontsLoaded(). Baca metadata note dari
  // IndexedDB (refreshData) hampir selalu jauh lebih cepat daripada decode
  // font kustom jadi FontFace (ensureInstalledFontsLoaded), jadi urutan
  // nyatanya: refreshData() selesai duluan -> render() jalan -> skeleton
  // kehapus & note card muncul pakai font FALLBACK -> beberapa saat
  // kemudian font kustom baru kelar dimuat -> card "meloncat" ganti font
  // asli, padahal skeleton-nya sudah tidak ada buat nutupin loncatan itu.
  // Fix: refreshData() sekarang HANYA fetch (tidak render), render() cuma
  // dipanggil sekali di boot() setelah `Promise.all` KEDUA promise itu
  // benar-benar selesai — skeleton jadi nutupin loading data MAUPUN font
  // sekaligus, baru hilang atomically bareng note card yang sudah pasti
  // pakai font final (bukan font fallback yang bakal ganti lagi).
  async function refreshData() {
    allNotes = await documentService.listNotes({ includeTrashed: false, includeArchived: false });
  }

  function hideHomeSkeleton() {
    const homeSkeleton = document.getElementById("homeSkeleton");
    if (homeSkeleton) homeSkeleton.hidden = true;
  }

  /** Promise dengan batas waktu — kalau macet (IDB/font/seed), jangan biarkan
   * skeleton Home menggantung selamanya. */
  function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`Timeout ${label} (${ms}ms)`));
      }, ms);
      Promise.resolve(promise).then(
        (v) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(v);
        },
        (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  // Note bawaan / font / listNotes — dibungkus try/finally supaya
  // #homeSkeleton SELALU dilepas, bahkan kalau seed/font/IDB macet atau
  // throw. Tanpa ini, satu promise yang hang membuat Home stuck di
  // skeleton selamanya (page lain yang tidak lewat jalur ini tetap aman).
  try {
    try {
      await withTimeout(seedDefaultNotesIfNeeded(), 15000, "seedDefaultNotes");
    } catch (err) {
      console.error("[notes-list] seed default notes gagal/timeout:", err);
    }
    try {
      await withTimeout(
        Promise.all([
          ensureInstalledFontsLoaded(),
          refreshData().then(() => preloadCardBackgrounds(allNotes)),
        ]),
        12000,
        "fonts+listNotes"
      );
    } catch (err) {
      console.error("[notes-list] fonts/listNotes gagal/timeout:", err);
      // Coba minimal ambil list notes tanpa nunggu font
      try {
        await withTimeout(refreshData(), 8000, "listNotes-retry");
      } catch (err2) {
        console.error("[notes-list] listNotes retry gagal:", err2);
        allNotes = [];
      }
    }
    render(searchInput.value);
  } catch (err) {
    console.error("[notes-list] boot gagal:", err);
    hideHomeSkeleton();
  } finally {
    // Jaga-jaga kalau render() tidak sempat dipanggil / throw di tengah
    hideHomeSkeleton();
  }

  /** Dipakai khusus untuk bfcache-restore (initRefreshOnRestore di bawah):
   * fetch ulang + render ulang. Font kustom TIDAK perlu dimuat ulang di
   * sini — state `document.fonts` (FontFace yang sudah ditambahkan) ikut
   * dipulihkan utuh oleh bfcache bareng seluruh state JS lainnya, jadi
   * sudah pasti masih ada tanpa perlu ensureInstalledFontsLoaded() lagi. */
  async function refreshAndRender() {
    try {
      await refreshData();
      render(searchInput.value);
    } catch (err) {
      console.error("[notes-list] refreshAndRender gagal:", err);
      hideHomeSkeleton();
    }
  }

  // Kalau halaman ini dipulihkan dari bfcache (balik lewat back HP), JANGAN
  // navigasi ulang apa pun (lihat catatan panjang di reload-on-restore.js
  // soal kenapa itu malah merusak animasi) — cukup fetch ulang data &
  // render ulang ke DOM yang sudah ada, diam-diam, tanpa re-attach listener
  // apa pun (refreshAndRender() di atas cuma fetch+render, aman dipanggil
  // ulang berkali-kali).
  initRefreshOnRestore(refreshAndRender);
  __refreshHomeFn = refreshAndRender;
}

/** Dipakai SPA: fetch ulang + render list saat kembali dari editor. */
export async function refreshHome() {
  if (typeof __refreshHomeFn === "function") {
    return __refreshHomeFn();
  }
}

/** Init untuk SPA / multi-page. Dipanggil otomatis kalau BUKAN mode SPA. */
export async function initHome() {
  return boot();
}

// Auto-boot hanya di mode multi-page klasik (bukan SPA shell).
if (!window.__MEIMO_SPA__) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
