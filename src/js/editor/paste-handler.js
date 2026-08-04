/**
 * paste-handler.js
 * Menangani event "paste" di area contenteditable.
 *
 * KENAPA TIDAK MEMBIARKAN PERILAKU PASTE DEFAULT BROWSER:
 * Model dokumen (block-model.js) adalah SATU-SATUNYA sumber kebenaran isi
 * catatan — versi HTML di contenteditable murni proyeksi tampilan (lihat
 * serializer.js). Paste default browser menyisipkan HTML clipboard mentah
 * langsung ke DOM tanpa lewat model sama sekali; kalau yang ditempel lebih
 * dari satu baris, browser bahkan bisa bikin elemen-elemen block BARU di
 * DOM (di luar satu <p>/<h1> yang lagi disorot kursor).
 *
 * editor.js (handleInput) cuma pernah menyinkronkan SATU block (yang lagi
 * berisi kursor) balik ke model setiap ada event "input" — elemen ekstra
 * yang disisipkan browser saat paste tidak pernah ikut kebaca ke model.
 * Begitu ada render ulang (mis. renderAll() dari toolbar/undo), DOM lama
 * dibuang & digambar ulang murni dari model, jadi teks yang cuma "nempel"
 * di DOM tapi tidak ada di model pun hilang — inilah penyebab bug "teks
 * panjang yang di-paste tidak ikut tersimpan".
 *
 * Solusinya: e.preventDefault() paste-nya, ambil TEKS POLOS clipboard
 * sendiri, lalu serahkan ke commands.js (insertPastedText) supaya masuk
 * lewat jalur model yang benar, sama seperti mengetik biasa.
 */

/**
 * Ambil teks polos dari sebuah event "paste", dipecah jadi baris-baris
 * (satu baris = satu block baru kalau lebih dari satu). Mengembalikan
 * `null` kalau clipboard tidak berisi teks sama sekali (mis. paste gambar).
 */
export function getPastedLines(clipboardEvent) {
  const clipboard = clipboardEvent.clipboardData || window.clipboardData;
  const text = clipboard ? clipboard.getData("text/plain") : "";
  if (!text) return null;
  return text.replace(/\r\n?/g, "\n").split("\n");
}