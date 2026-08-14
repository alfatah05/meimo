/**
 * download-note.js
 * Aksi "Download" satu catatan jadi file `.meimo` — dipicu dari menu
 * titik-tiga di note card (lihat notes/note-card.js openCardMenu, item
 * "Download"). Sebelumnya ini tombol "Ekspor .meimo" per-baris di halaman
 * Cadangkan & Impor (cadangkan.html); sekarang dipindah ke sini supaya bisa
 * diakses langsung dari note card mana pun note itu tampil (Home maupun
 * Arsip), tanpa perlu berpindah ke halaman Cadangkan & Impor dulu.
 *
 * Modul kecil terpisah (bukan langsung di notes-list.js/arsip.js) mengikuti
 * pola pin.js: logika aksi murni di sini, pemanggil tinggal memanggilnya.
 */

import { loadNote } from "../services/document-service.js";
import { exportNoteAsMeimo } from "../services/meimo-export.js";
import { showToast } from "../../components/toast.js";

/**
 * Ekspor satu catatan sebagai file `.meimo` (lengkap dengan asset) & langsung
 * memicu unduhannya lewat browser, dengan toast konfirmasi/kegagalan.
 * @param {object} note - item note dari daftar (Home/Arsip); cuma `note.id`
 *   & `note.title` yang dipakai di sini.
 */
export async function downloadNoteAsMeimo(note) {
  try {
    // Muat ulang note-nya dari storage (bukan pakai objek `note` dari
    // daftar) supaya isi yang diekspor selalu versi TERBARU yang
    // tersimpan — daftar di Home/Arsip bisa saja sudah agak basi kalau
    // note itu baru saja diedit di tab/jendela lain.
    const freshDoc = await loadNote(note.id);
    if (!freshDoc) {
      showToast("Catatan tidak ditemukan (mungkin sudah dihapus).", { tone: "danger" });
      return;
    }
    const { fileName } = await exportNoteAsMeimo(freshDoc);
    showToast(`Diunduh sebagai ${fileName}`);
  } catch (err) {
    console.error("Gagal mengunduh catatan:", err);
    showToast("Gagal mengunduh catatan. Coba lagi.", { tone: "danger" });
  }
}
