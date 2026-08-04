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
import { initToolbar } from "./toolbar/toolbar.js";
import * as documentService from "./services/document-service.js";
import { ensureInstalledFontsLoaded } from "./services/font-service.js";
import * as audioPlayerService from "./services/audio-player-service.js";
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

async function boot() {
  const bootStartedAt = performance.now();

  const titleEl = document.getElementById("editorTitle");
  const bodyEl = document.getElementById("editorBody");
  const toolbarEl = document.querySelector(".note-topbar");
  if (!bodyEl || !toolbarEl) return;

  // Muat lebih dulu @font-face untuk font kustom yang sudah pernah diunduh
  // (lihat font-service.js) — supaya isi note yang sudah memakai Font
  // Family kustom langsung tampil dengan font yang benar, bukan fallback.
  await ensureInstalledFontsLoaded();

  // Muat note yang sudah ada (?id=...) atau buat note baru (mis. dari tombol "+").
  const existingId = getNoteIdFromUrl();
  let doc = existingId ? await documentService.loadNote(existingId) : null;
  if (!doc) {
    doc = await documentService.createNote({ title: "" });
    setNoteIdInUrl(doc.id);
  }

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

  // Editor sudah siap dirender (judul + isi ter-hydrate dari `doc`) —
  // lepas skeleton, tampilkan #editorTitle/#editorBody sungguhan. Ditunda
  // sampai MIN_SKELETON_VISIBLE_MS terlampaui (lihat catatan di atas)
  // supaya skeleton tidak kehapus sebelum sempat ke-paint sama sekali.
  const elapsed = performance.now() - bootStartedAt;
  const remaining = MIN_SKELETON_VISIBLE_MS - elapsed;
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));

  const noteContentEl = document.querySelector(".note-content");
  if (noteContentEl) noteContentEl.classList.remove("is-loading");

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
  window.addEventListener("pagehide", () => {
    saveNow();
    audioPlayerService.stopAll();
  });
  window.addEventListener("beforeunload", saveNow);

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
      saveDebounced.cancel();
    } else {
      saveDebounced();
    }
  });

  // Fokus otomatis ke judul saat catatan baru dibuka kosong.
  if (!doc.title) titleEl.focus();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
