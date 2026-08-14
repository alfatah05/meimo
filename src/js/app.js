/**
 * app.js
 * Entry point aplikasi untuk halaman editor: inisialisasi model dokumen,
 * mesin editor (contenteditable sebagai media render), floating toolbar,
 * dan penyimpanan (autosave) lewat Document Service.
 *
 * Catatan lingkup (lihat implementasi formatting yang diminta):
 * Bold, Italic, Underline, Strike, Heading, Alignment, Font Size,
 * Font Family, Font Color, Highlight, Undo/Redo, List (bulleted/numbered/
 * checklist), Hyperlink, Quote, dan Divider sudah tersambung ke
 * command sungguhan. Tombol lain (Image, Clear Formatting, dst.)
 * masih seperti mockup.
 *
 * Penyimpanan mengikuti arsitektur:
 *   Editor -> Document Service -> Repository -> IndexedDB
 * app.js (bootstrap) HANYA boleh mengimpor Document Service, TIDAK PERNAH
 * db.js / notes-repository.js secara langsung.
 */

import { createEditorState } from "./editor/editor-state.js";
import { createEditor } from "./editor/editor.js";
import { initOutline } from "./editor/outline.js";
import { initScrollBottomFab } from "./editor/scroll-bottom-fab.js";
import { initAiSheet } from "./editor/ai-sheet.js";
import { initBlockSelectionBar } from "./editor/block-selection-bar.js";
import {
  openVoiceRecordSheet,
  shouldAutoOpenVoiceRecord,
  clearVoiceQueryFromUrl,
} from "./editor/voice-record-sheet.js";
import { initToolbar } from "./toolbar/toolbar.js";
import * as documentService from "./services/document-service.js";
import { ensureInstalledFontsLoaded } from "./services/font-service.js";
import * as audioPlayerService from "./services/audio-player-service.js";
import { hasActiveSheet, closeActiveSheet } from "./toolbar/active-sheet.js";
import { debounce } from "./utils/debounce.js";

const AUTOSAVE_DELAY_MS = 600;

/**
 * Ambil `id` note dari URL.
 * Mendukung dua bentuk:
 *   - URL cantik: /editor/<id>            (lihat .htaccess di root project)
 *   - URL lama:   editor.html?id=<id>     (fallback — dipakai kalau file
 *     dibuka langsung tanpa rewrite, mis. saat development lokal)
 *
 * PENTING soal .htaccess: rewrite Apache di sini sifatnya INTERNAL (bukan
 * redirect), jadi begitu browser menampilkan /editor/<id>, `window.location`
 * di JS TIDAK PERNAH melihat query string ?id=... sama sekali — makanya id
 * di sini wajib diambil dari pathname, bukan cuma dari URLSearchParams.
 */
function getNoteIdFromUrl() {
  const pathMatch = window.location.pathname.match(/\/editor\/([^/]+)\/?$/i);
  if (pathMatch) return decodeURIComponent(pathMatch[1]);
  return new URLSearchParams(window.location.search).get("id");
}

/** Tulis `id` note baru ke URL (bentuk cantik /editor/<id>) tanpa reload,
 * supaya refresh tetap membuka note yang sama. */
function setNoteIdInUrl(id) {
  const url = new URL(window.location.href);
  url.pathname = `/editor/${encodeURIComponent(id)}`;
  url.search = "";
  window.history.replaceState({}, "", url);
  // SPA: samakan currentRoute router dengan URL baru supaya popstate dari
  // penutupan bottom sheet (history.back guard) tidak terlihat seperti
  // pindah note (id null → uuid) lalu memicu remount/reload editor.
  if (window.__MEIMO_SPA__) {
    import("./router.js")
      .then((r) => {
        if (r && typeof r.syncRoute === "function") r.syncRoute();
      })
      .catch(() => {});
  }
}

// Durasi minimum skeleton (.editor-skeleton) tampil di layar, dihitung dari
// awal boot(). BUGFIX: sebelumnya skeleton dilepas (class .is-loading
// dicopot) begitu SEMUA await di boot() selesai — ensureInstalledFontsLoaded()
// & documentService.loadNote() sama-sama baca dari cache/IndexedDB lokal,
// jadi biasanya kelar dalam hitungan beberapa milidetik saja, SERINGKALI
// LEBIH CEPAT DARI SATU FRAME RENDER BROWSER. Akibatnya skeleton kehapus
// dari DOM sebelum sempat benar-benar ke-paint ke layar — bukan skeleton-nya
// yang salah/tidak terpasang, tapi user memang tidak pernah melihatnya sama
// sekali. Fix: skeleton dijamin tampil minimal MIN_SKELETON_VISIBLE_MS sejak
// boot() mulai, baru boleh dilepas — kalau load-nya sudah lebih lambat dari
// itu (mis. device lambat/font besar), tidak ada tambahan delay sama sekali.
const MIN_SKELETON_VISIBLE_MS = 220;

let __editorBooted = false;
/** Listener pagehide/beforeunload/visibility — sekali saja per document. */
let __editorGlobalListenersBound = false;
/** save handler aktif (di-update tiap boot/remount SPA). */
let __activeSaveNow = null;
let __activeSaveDebounced = null;

async function boot() {
  const bootStartedAt = performance.now();

  const titleEl = document.getElementById("editorTitle");
  const bodyEl = document.getElementById("editorBody");
  const toolbarEl = document.querySelector(".note-topbar");
  if (!bodyEl || !toolbarEl) return;

  __editorBooted = true;
  // Global listeners (pagehide dll.) cukup sekali; remount SPA tidak menambah lagi.
  const bindGlobalListeners = !__editorGlobalListenersBound;
  if (bindGlobalListeners) __editorGlobalListenersBound = true;

  // Muat lebih dulu @font-face untuk font kustom yang sudah pernah diunduh
  // (lihat font-service.js) — supaya isi note yang sudah memakai Font
  // Family kustom langsung tampil dengan font yang benar, bukan fallback.
  await ensureInstalledFontsLoaded();

  // Tangkap flag voice SEBELUM setNoteIdInUrl menghapus query string.
  const autoOpenVoice = shouldAutoOpenVoiceRecord();

  // Muat note yang sudah ada (?id=...) atau buat note baru (mis. dari tombol "+").
  const existingId = getNoteIdFromUrl();
  let doc = existingId ? await documentService.loadNote(existingId) : null;
  if (!doc) {
    doc = await documentService.createNote({ title: "" });
    setNoteIdInUrl(doc.id);
  }
  // Bersihkan query voice dari URL (baik note baru maupun existing).
  if (autoOpenVoice) clearVoiceQueryFromUrl();

  // Tampilkan judul yang sudah tersimpan (sebelumnya titleEl tidak pernah
  // diisi ulang dari `doc`, jadi note lama yang punya judul kelihatan
  // kosong/placeholder seolah-olah catatan baru).
  titleEl.textContent = doc.title || "";

  const state = createEditorState(doc);

  const saveNow = () => {
    documentService.saveNote(state.getDocument()).catch((err) => {
      console.error("Gagal menyimpan catatan:", err);
    });
  };
  const saveDebounced = debounce(saveNow, AUTOSAVE_DELAY_MS);

  titleEl.addEventListener("input", () => {
    if (state.checkpoint) state.checkpoint({ coalesce: true });
    state.setTitle(titleEl.textContent);
    saveDebounced();
  });

  // Ctrl/Cmd+A saat fokus di judul: batasi seleksi cuma ke teks judul
  // sendiri. titleEl & bodyEl adalah dua contenteditable terpisah yang
  // SIBLING (bukan bersarang), jadi tanpa batasan eksplisit ini "select
  // all" bisa saja melebar ke luar judul tergantung browser/webview.
  titleEl.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || e.key.toLowerCase() !== "a") return;
    e.preventDefault();
    const range = document.createRange();
    range.selectNodeContents(titleEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });

  const editor = createEditor({ state, bodyEl, titleEl });
  initToolbar({ toolbarEl, editor, state });
  initOutline({ state, bodyEl });
  initScrollBottomFab({ bodyEl, editor });
  initAiSheet({ editor, state });
  initBlockSelectionBar({ bodyEl, editor, state });

  // Tombol back topbar (`.note-back-btn`, <a href="/library">) — kalau ada
  // bottom sheet editor (Gambar/Scene/Musik, lihat toolbar/active-sheet.js)
  // yang lagi terbuka, back PERTAMA cuma membatalkan/menutup sheet-nya
  // (persis tombol "Batal" sheet itu) & TIDAK ikut menavigasi ke /library;
  // back KEDUA (sheet sudah tertutup) baru navigasi normal seperti biasa.
  // Back HP/gesture bawaan (bukan tombol ini) ditangani terpisah lewat
  // trik history guard di dalam active-sheet.js sendiri.
  const backBtn = document.querySelector(".note-back-btn");
  if (backBtn) {
    backBtn.addEventListener("click", (e) => {
      // Sheet terbuka → back cuma menutup sheet (sama seperti "Batal").
      if (hasActiveSheet()) {
        e.preventDefault();
        closeActiveSheet();
        return;
      }
      // Mode SPA: navigasi client-side ke home (jangan andalkan <a> +
      // history stack yang bisa kotor karena sheet guard).
      if (window.__MEIMO_SPA__) {
        e.preventDefault();
        import("./router.js").then((r) => {
          if (r && typeof r.navigate === "function") {
            r.navigate("/library");
          } else {
            window.location.assign("/library");
          }
        }).catch(() => {
          window.location.assign("/library");
        });
      }
    });
  }

  // Editor sudah siap dirender (judul + isi ter-hydrate dari `doc`) —
  // lepas skeleton, tampilkan #editorTitle/#editorBody sungguhan. Ditunda
  // sampai MIN_SKELETON_VISIBLE_MS terlampaui (lihat catatan di atas)
  // supaya skeleton tidak kehapus sebelum sempat ke-paint sama sekali.
  const elapsed = performance.now() - bootStartedAt;
  const remaining = MIN_SKELETON_VISIBLE_MS - elapsed;
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));

  const noteContentEl = document.querySelector(".note-content");
  if (noteContentEl) noteContentEl.classList.remove("is-loading");

  // Auto-buka voice record sheet kalau datang dari FAB "Rekam Suara"
  // (/editor?voice=1). Flag sudah ditangkap lebih awal sebelum URL dibersihkan.
  // Jangan fokus judul/body dulu (supaya keyboard tidak muncul); fokus
  // baris terakhir baru setelah user menekan Selesai di sheet.
  if (autoOpenVoice) {
    requestAnimationFrame(() => {
      openVoiceRecordSheet({
        editor,
        state,
        onFinished: () => {
          try {
            if (editor && typeof editor.focusEnd === "function") {
              editor.focusEnd();
            } else if (bodyEl) {
              bodyEl.focus();
            }
          } catch (e) {
            console.warn("[app] focus after voice:", e);
          }
        },
      });
    });
  }

  // Ctrl/Cmd+Z (undo) & Ctrl/Cmd+Shift+Z / Ctrl+Y (redo) dari mana saja di
  // halaman note (termasuk saat fokus di judul). Kalau fokus ada di dalam
  // area isi catatan, editor.js sendiri sudah menangani & memanggil
  // preventDefault() lebih dulu — `e.defaultPrevented` dipakai di sini
  // supaya tidak dobel-eksekusi untuk kasus itu.
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === "z") {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
    } else if (key === "y") {
      e.preventDefault();
      editor.redo();
    }
  });

  // Perubahan isi dokumen (ketik, format, split/merge block) -> autosave.
  state.onChange(() => saveDebounced());

  // Pastikan perubahan terakhir tersimpan saat tab ditinggalkan/ditutup.
  // Note ini juga TIDAK PERNAH berganti tanpa reload halaman penuh (lihat
  // getNoteIdFromUrl di atas — satu HTML load = satu note), jadi "note
  // ditutup atau berpindah ke note lain" (aturan playback musik, lihat
  // toolbar/music-sheet.js) sama persis dengan pagehide di sini: hentikan
  // seluruh playback & reset state player global (services/
  // audio-player-service.js) supaya tidak ada audio yang terus terdengar
  // sesudah user pindah halaman/tab.
  // Daftarkan save handlers aktif supaya listener global (sekali pasang)
  // selalu memanggil instance boot yang paling baru setelah SPA remount.
  __activeSaveNow = saveNow;
  __activeSaveDebounced = saveDebounced;

  if (bindGlobalListeners) {
    window.addEventListener("pagehide", () => {
      if (typeof __activeSaveNow === "function") __activeSaveNow();
      audioPlayerService.stopAll();
    });
    window.addEventListener("beforeunload", () => {
      if (typeof __activeSaveNow === "function") __activeSaveNow();
    });

    // Beberapa browser mobile bisa "membekukan" tab begitu native picker
    // foto/kamera terbuka (lihat toolbar/image-sheet.js -> "Sisipkan Gambar").
    // Kalau autosave yang di-debounce ini kebetulan menembak PERSIS di jendela
    // waktu itu, transaksinya berisiko jadi transaksi macet yang bisa
    // menyumbat penyimpanan berikutnya ke store yang sama (lihat catatan
    // panjang di db/db.js). Supaya autosave tidak pernah mulai tepat saat itu:
    // begitu halaman disembunyikan, batalkan timer yang masih menunggu; begitu
    // terlihat lagi, jadwalkan ulang (aman walau ternyata tidak ada perubahan
    // yang tertunda — saveNote() cukup murah untuk dokumen yang tidak berubah).
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        if (__activeSaveDebounced && __activeSaveDebounced.cancel) __activeSaveDebounced.cancel();
      } else {
        if (typeof __activeSaveDebounced === "function") __activeSaveDebounced();
      }
    });
  }

  // Fokus otomatis ke judul saat catatan baru dibuka kosong.
  // Skip kalau mode rekam suara — input dari bottom sheet dulu.
  if (!doc.title && !autoOpenVoice) titleEl.focus();
}

/** Init untuk SPA / multi-page. Dipanggil otomatis kalau BUKAN mode SPA. */
export async function initEditor() {
  return boot();
}

/**
 * Cleanup ringan saat meninggalkan editor di SPA (stop audio + autosave).
 * Listener pagehide/beforeunload tetap ada untuk multi-page & tab close.
 */
export function destroyEditor() {
  // Flush save sebelum unmount (SPA leave editor).
  try {
    if (typeof __activeSaveNow === "function") __activeSaveNow();
  } catch (e) {}
  __editorBooted = false;
  __activeSaveNow = null;
  if (__activeSaveDebounced && __activeSaveDebounced.cancel) {
    try { __activeSaveDebounced.cancel(); } catch (e) {}
  }
  __activeSaveDebounced = null;
  try {
    // Stop audio supaya tidak nyangkut di Home.
    import("./services/audio-player-service.js").then((m) => {
      if (m && m.stopAll) m.stopAll();
    }).catch(() => {});
  } catch (e) {}
  try {
    import("./toolbar/active-sheet.js").then((m) => {
      if (m && typeof m.closeActiveSheet === "function") m.closeActiveSheet();
    }).catch(() => {});
  } catch (e) {}

  // Hapus chrome editor yang di-append ke document.body (FAB AI, Outline,
  // scroll-bottom, block-selection-bar, overlay). Kalau dibiarkan, mereka
  // ikut tampil di index karena tidak ikut di dalam #view-editor.
  try {
    const selectors = [
      ".outline-fab",
      ".outline-overlay",
      ".ai-fab",
      ".ai-sheet-overlay",
      ".scroll-bottom-fab",
      ".block-selection-bar",
      ".image-sheet-overlay",
      ".scene-sheet-overlay",
      ".music-sheet-overlay",
      ".voice-record-overlay",
      ".block-select-overlay",
      ".block-select-handle",
    ];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => el.remove());
    }
    document.body.classList.remove(
      "is-ai-generating",
      "is-ai-typing",
      "is-block-select-mode"
    );
    document.documentElement.style.removeProperty("--ai-sheet-space");

    // Kosongkan field editor agar konten note lama tidak flash saat
    // view editor sempat terlihat lagi sebelum navigasi penuh.
    const titleEl = document.getElementById("editorTitle");
    const bodyEl = document.getElementById("editorBody");
    if (titleEl) titleEl.textContent = "";
    if (bodyEl) bodyEl.innerHTML = "";
  } catch (e) {
    console.warn("[app] destroyEditor cleanup DOM:", e);
  }
}

// Auto-boot hanya di mode multi-page klasik (bukan SPA shell).
if (!window.__MEIMO_SPA__) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
