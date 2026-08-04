/**
 * seed-default-notes.js
 * Impor note BAWAAN (.meimo di `assets/default-notes/`) jadi catatan
 * pertama user, TAPI CUMA SEKALI seumur hidup device ini — biasanya
 * dipanggil begitu user baru pertama kali buka app (IndexedDB masih
 * kosong), bukan setiap kali Home dibuka.
 *
 * Ditandai lewat localStorage (bukan IndexedDB) SENGAJA: flag ini harus
 * tetap "sudah pernah dicoba" walau importnya gagal (mis. offline & file
 * belum sempat ke-precache Service Worker) atau walau user langsung
 * menghapus note bawaannya — supaya note bawaan TIDAK PERNAH muncul lagi
 * balik sendiri di kunjungan berikutnya cuma karena database kebetulan
 * kosong lagi (habis user hapus semua notenya sendiri).
 *
 * TIDAK mengimpor db.js/notes-repository.js langsung — lewat
 * importMeimoBytes() (services/meimo-import.js) yang sama dipakai tombol
 * "Impor Catatan (.meimo)" manual, jadi satu jalur tulis data yang sama.
 */

import { importMeimoBytes } from "../services/meimo-import.js";

const SEEDED_FLAG_KEY = "meimo:defaultNotesSeeded";

// Daftar file .meimo bawaan yang diimpor otomatis di first launch. Satu
// array supaya gampang nambah note bawaan lain di masa depan (mis. note
// "Tips & Trik") tanpa ubah logic di bawah — tinggal tambah path di sini.
const DEFAULT_NOTE_PATHS = ["/assets/default-notes/Welcome_to_Meimo.meimo"];

/** Import satu file .meimo bawaan dari path statis (fetch, bukan file picker). */
async function importBundledMeimo(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Gagal memuat note bawaan (${path}): HTTP ${res.status}`);
  }
  const bytes = await res.arrayBuffer();
  return importMeimoBytes(bytes);
}

/**
 * Jalankan seeding kalau belum pernah dicoba sebelumnya di device ini.
 * Aman dipanggil di setiap boot Home — begitu flag localStorage sudah
 * ada, fungsi ini langsung return tanpa melakukan apa pun (tidak ada
 * fetch/import ulang, jadi tidak menambah delay boot di kunjungan
 * berikutnya).
 */
export async function seedDefaultNotesIfNeeded() {
  let alreadySeeded = false;
  try {
    alreadySeeded = localStorage.getItem(SEEDED_FLAG_KEY) === "1";
  } catch {
    // localStorage bisa saja tidak tersedia (mis. mode privat ketat di
    // sebagian browser) — anggap saja belum pernah di-seed, tapi jangan
    // sampai error ini menghentikan boot Home sama sekali.
  }
  if (alreadySeeded) return;

  // Flag ditulis SEBELUM proses import selesai (bukan cuma kalau sukses)
  // — lihat catatan panjang di atas file ini soal kenapa ini disengaja.
  try {
    localStorage.setItem(SEEDED_FLAG_KEY, "1");
  } catch {
    // Kalau localStorage tidak bisa ditulis, biarkan saja — worst case
    // seeding ini dicoba lagi di kunjungan berikutnya, tidak fatal.
  }

  for (const path of DEFAULT_NOTE_PATHS) {
    try {
      await importBundledMeimo(path);
    } catch (err) {
      // Satu note bawaan gagal (mis. belum ke-precache saat offline)
      // tidak boleh menghentikan boot Home ATAU note bawaan lain di
      // daftar — cukup dicatat ke console, Home tetap tampil normal
      // (kosong) seperti biasa.
      console.error("Gagal mengimpor note bawaan:", path, err);
    }
  }
}
