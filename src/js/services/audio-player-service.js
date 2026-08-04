/**
 * audio-player-service.js
 * SATU-SATUNYA pemutar audio untuk seluruh fitur Insert Music (lihat blok
 * komentar "Musik" di editor/block-model.js) — global singleton per
 * halaman, dipakai oleh toolbar/music-sheet.js untuk memutar musik section
 * mana pun (Root Editor / Divider / Scene) di dalam SATU note yang sedang
 * dibuka. Modul ini TIDAK tahu apa-apa soal dokumen/model — hanya
 * mengelola state playback berdasarkan `key` string yang diberikan
 * pemanggil (lihat block-model.js musicKeyForTarget), supaya hanya ADA
 * SATU instance audio aktif dalam satu waktu (hemat memori, dan menjamin
 * aturan "hanya satu musik boleh diputar dalam satu note").
 *
 * Crossfade dua musik dilakukan dengan DUA elemen <audio> (bergantian jadi
 * "aktif") — satu elemen HTMLAudioElement tidak bisa crossfade dengan
 * dirinya sendiri karena hanya bisa menahan satu `src` dalam satu waktu.
 */

const FADE_MS = 400; // di dalam rentang 300–500ms yang diminta
const FADE_STEP_MS = 40;

let audioA = null;
let audioB = null;
let activeEl = null; // elemen <audio> yang SEDANG dipakai (yang lagi terdengar/di-load)
let activeKey = null; // musicKey (lihat block-model.js) yang dimuat di activeEl
let activeUrl = null; // Object URL yang dimuat di activeEl — dipakai untuk mendeteksi musik section yang SAMA tapi berkasnya baru saja DIGANTI (lihat playToggle())
let isPlaying = false;

// Kumpulan interval id fade yang sedang berjalan (fade-in musik baru & fade-
// out musik lama bisa jalan BERSAMAAN, jadi bukan cuma satu timer tunggal).
let activeFadeIntervals = [];

const listeners = new Set();

function ensureElements() {
  if (audioA) return;
  audioA = new Audio();
  audioB = new Audio();
  audioA.preload = "auto";
  audioB.preload = "auto";
}

function emit() {
  const snapshot = { key: activeKey, isPlaying };
  for (const fn of listeners) fn(snapshot);
}

/** Daftar sebagai pendengar perubahan state (key + isPlaying) — dipakai
 * toolbar/music-sheet.js untuk menyinkronkan ikon Play/Pause SEMUA tombol
 * yang sedang terpasang di DOM lewat SATU langganan (bukan per-tombol),
 * supaya tidak ada listener yatim menumpuk tiap kali tombol dibangun ulang
 * (lihat catatan panjang di toolbar/music-sheet.js soal ini). */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return { key: activeKey, isPlaying };
}

export function isKeyPlaying(key) {
  return !!key && activeKey === key && isPlaying;
}

export function isKeyActive(key) {
  return !!key && activeKey === key;
}

function clearFades() {
  for (const id of activeFadeIntervals) clearInterval(id);
  activeFadeIntervals = [];
}

/** Animasikan `el.volume` dari `from` ke `to` selama `ms`, panggil
 * `onDone` tepat setelah selesai. Dikembalikan interval id-nya supaya bisa
 * dibatalkan (lihat clearFades()) kalau ada playToggle()/stopAll() baru
 * yang menyusul sebelum fade sebelumnya selesai. */
function fade(el, from, to, ms, onDone) {
  const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
  let i = 0;
  el.volume = from;
  const id = setInterval(() => {
    i++;
    const t = Math.min(1, i / steps);
    el.volume = from + (to - from) * t;
    if (i >= steps) {
      clearInterval(id);
      activeFadeIntervals = activeFadeIntervals.filter((x) => x !== id);
      el.volume = to;
      if (onDone) onDone();
    }
  }, FADE_STEP_MS);
  activeFadeIntervals.push(id);
  return id;
}

function otherElement(el) {
  return el === audioA ? audioB : audioA;
}

function handleEnded() {
  // Musik selesai diputar wajar (bukan di-pause manual) -> tombolnya balik
  // ke status Play, lihat spec "Aturan Pemutaran Musik".
  isPlaying = false;
  emit();
}

/**
 * Mainkan/toggle musik `key` dari `url` (Object URL, lihat
 * services/music-service.js getObjectUrl()).
 *   - `key` & `url` SAMA dengan yang sedang aktif & sedang diputar -> Pause.
 *   - `key` & `url` SAMA dengan yang sedang aktif tapi sedang di-pause ->
 *     Resume dari posisi terakhir (currentTime TIDAK direset).
 *   - `key` SAMA tapi `url` BEDA (mis. musik section itu baru saja DIGANTI
 *     lewat bottom sheet sementara section-nya sedang diputar) -> diperlakukan
 *     seperti musik baru: crossfade dari track lama ke track baru.
 *   - `key` BEDA dan ada musik lain sedang diputar -> crossfade: musik lama
 *     fade-out sambil musik baru fade-in bersamaan, musik lama baru
 *     benar-benar di-pause & dilepas SETELAH fade-out-nya selesai.
 *   - `key` BEDA dan tidak ada musik lain yang sedang diputar (mis. musik
 *     lain ada tapi lagi di-pause, atau memang belum ada yang pernah
 *     dimuat) -> langsung diputar penuh, tanpa perlu crossfade.
 */
export function playToggle(key, url) {
  if (!key || !url) return;
  ensureElements();

  if (activeKey === key && activeUrl === url && activeEl) {
    if (isPlaying) {
      activeEl.pause();
      isPlaying = false;
    } else {
      activeEl.play().catch(() => {});
      isPlaying = true;
    }
    emit();
    return;
  }

  const outgoing = activeEl;
  const wasPlaying = isPlaying;
  const incoming = outgoing ? otherElement(outgoing) : audioA;

  clearFades();
  incoming.onended = handleEnded;
  incoming.src = url;
  incoming.currentTime = 0;

  if (outgoing && wasPlaying) {
    // Crossfade halus: incoming fade-in dari 0, outgoing fade-out ke 0
    // BERSAMAAN, baru dihentikan/dilepas setelah fade-out-nya selesai.
    incoming.volume = 0;
    incoming.play().catch(() => {});
    fade(incoming, 0, 1, FADE_MS);
    fade(outgoing, outgoing.volume, 0, FADE_MS, () => {
      outgoing.pause();
      outgoing.removeAttribute("src");
      outgoing.onended = null;
      outgoing.load();
    });
  } else {
    if (outgoing) outgoing.pause(); // musik lain ada tapi sudah ter-pause, cukup pastikan diam
    incoming.volume = 1;
    incoming.play().catch(() => {});
  }

  activeEl = incoming;
  activeKey = key;
  activeUrl = url;
  isPlaying = true;
  emit();
}

/** Hentikan seluruh playback & reset state player — dipakai saat note
 * ditutup/berpindah (lihat app.js) atau saat musik yang sedang aktif
 * ternyata baru saja dihapus dari dokumen (lihat toolbar/music-sheet.js
 * enforceActiveKeyStillValid()). */
export function stopAll() {
  clearFades();
  if (audioA) {
    audioA.pause();
    audioA.onended = null;
    audioA.removeAttribute("src");
    audioA.load();
  }
  if (audioB) {
    audioB.pause();
    audioB.onended = null;
    audioB.removeAttribute("src");
    audioB.load();
  }
  activeEl = null;
  const hadKey = !!activeKey;
  activeKey = null;
  activeUrl = null;
  isPlaying = false;
  if (hadKey) emit();
}
