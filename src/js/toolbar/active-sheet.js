/**
 * active-sheet.js
 * Koordinator SATU bottom sheet aktif di seluruh toolbar editor (Sisipkan/
 * Edit Gambar, Scene, Musik) — sebelumnya masing-masing file
 * (image-sheet.js/scene-sheet.js/music-sheet.js) punya guard "satu sheet
 * per JENIS" sendiri-sendiri (module-scoped `closeCurrentSheet`), jadi
 * membuka sheet Scene selagi sheet Gambar masih terbuka TIDAK saling
 * mengganggu sama sekali — dua overlay bisa numpuk berbarengan. Modul ini
 * menggantikannya dengan SATU slot aktif yang dipakai bareng lintas ketiga
 * file, supaya cuma pernah ada maksimal SATU bottom sheet yang terbuka di
 * seluruh editor, apa pun jenisnya.
 *
 * PENTING: yang disimpan di slot aktif bukan sekadar "fungsi tutup UI",
 * melainkan fungsi BATAL milik sheet itu sendiri (`doCancel` di
 * image-sheet.js/scene-sheet.js/music-sheet.js) — sama persis dengan yang
 * dijalankan tombol "Batal" sheet itu. Jadi begitu sheet lain dibuka
 * sementara sheet ini masih dalam mode "insert" (placeholder gambar yang
 * belum dikonfirmasi, Scene yang baru saja disisipkan, dst.), insert itu
 * betul-betul DIBATALKAN (placeholder-nya dibuang dari model) — bukan
 * cuma disembunyikan diam-diam sementara sisa-sisanya nyangkut di model.
 * Untuk sheet mode "edit" (menyunting sesuatu yang sudah ada), fungsi
 * `doCancel` versi mode itu SUDAH otomatis cuma membuang pratinjau tanpa
 * menghapus apa pun (lihat komentar doCancel masing-masing file) — jadi
 * aman dipanggil di sini tanpa perlu tahu jenis sheet apa yang sedang aktif.
 *
 * ---- Guard back HP & tombol back topbar ----
 * Modul ini JUGA menangani supaya tombol back topbar (`.note-back-btn`,
 * lihat wiring-nya di app.js) maupun back/gesture BAWAAN HP tidak langsung
 * menavigasi keluar begitu ada sheet yang lagi terbuka — sekali back
 * pertama-tama cuma menutup/membatalkan sheet-nya (persis seperti tombol
 * "Batal"), baru back KEDUA benar-benar berpindah ke halaman index/library.
 * Triknya: begitu sheet pertama dibuka, `history.pushState()` SATU entry
 * dummy yang menunjuk ke URL editor yang sama (pola sama seperti
 * utils/trap-back-navigation.js di Home, tapi di sini KONDISIONAL — cuma
 * ada selama minimal satu sheet terbuka, bukan permanen). Back HP yang
 * "memakan" entry dummy itu memicu `popstate` pada URL yang SAMA (tidak
 * ada navigasi terlihat sama sekali) — persis titik itu yang dipakai untuk
 * membatalkan sheet yang lagi terbuka. Begitu sheet ditutup lewat jalur
 * NORMAL-nya sendiri (Batal/Terapkan/Hapus, atau tombol back topbar sambil
 * sheet terbuka), entry dummy yang belum sempat "dimakan" back HP dibuang
 * balik secara diam-diam lewat `history.back()` (ditandai
 * `suppressNextPopstate` supaya `popstate` hasil pemanggilan itu sendiri
 * tidak keliru dianggap back HP sungguhan) — supaya tidak ada entry dummy
 * "nyangkut" yang bikin back berikutnya kebuang percuma tanpa sheet apa
 * pun yang perlu dibatalkan.
 */

let activeCancel = null;
let guardPushed = false;
let suppressNextPopstate = false;

function pushGuard() {
  if (guardPushed) return;
  history.pushState({ meimoSheetGuard: true }, "", location.href);
  guardPushed = true;
}

/** Buang entry dummy (kalau ada) TANPA memicu ulang pembatalan sheet apa
 * pun — dipakai setelah sheet SUDAH ditutup lewat jalurnya sendiri, supaya
 * entry dummy tidak nyangkut nunggu "dimakan" back HP nanti-nanti. */
function popGuard() {
  if (!guardPushed) return;
  suppressNextPopstate = true;
  guardPushed = false;
  history.back();
}

window.addEventListener("popstate", () => {
  if (suppressNextPopstate) {
    suppressNextPopstate = false;
    return;
  }
  if (!guardPushed) return; // popstate di luar konteks sheet (tidak relevan di sini)
  // Entry dummy baru saja "dimakan" oleh back HP sungguhan — URL tidak
  // berubah sama sekali (entry dummy menunjuk ke URL yang sama), jadi
  // cukup batalkan sheet yang terbuka; tidak perlu tindakan navigasi apa
  // pun lagi di sini.
  guardPushed = false;
  closeActiveSheet();
});

/** Batalkan sheet aktif TANPA menyentuh guard — dipakai internal saat
 * SATU sheet digantikan sheet LAIN (registerActiveSheet), supaya entry
 * dummy yang sudah ada tetap dipertahankan selama transisinya (bukan
 * dibuang-lalu-dorong-lagi). */
function cancelCurrentSheetSilently() {
  if (!activeCancel) return;
  const cancel = activeCancel;
  activeCancel = null;
  cancel();
}

/** Batalkan & tutup sheet yang sedang aktif (kalau ada) — dipakai sheet
 * lain yang mau dibuka (dipanggil PALING AWAL, sebelum sheet baru mulai
 * dibangun) maupun kode lain yang perlu memaksa tutup sheet yang sedang
 * terbuka (mis. scene-sheet.js saat Scene yang sheet-nya lagi terbuka
 * ternyata baru saja hilang dari model lewat undo di tempat lain, ATAU
 * tombol back topbar di app.js saat sheet masih terbuka). BEDA dari
 * `cancelCurrentSheetSilently()`: dipanggil sendirian (bukan didahului
 * `registerActiveSheet` yang segera mengisi slotnya lagi), jadi entry
 * dummy-nya ikut dibuang di sini. */
export function closeActiveSheet() {
  if (!activeCancel) return;
  cancelCurrentSheetSilently();
  popGuard();
}

/** Daftarkan `cancelFn` (fungsi `doCancel` milik sheet yang baru dibuka)
 * sebagai sheet aktif — sekaligus otomatis membatalkan & menutup sheet
 * lain yang sebelumnya aktif (kalau ada). Aman dipanggil di baris PALING
 * AWAL sebuah `open*Sheet()`, sebelum `cancelFn` (function declaration,
 * jadi sudah di-hoisting) selesai didefinisikan teksnya — `cancelFn` di
 * sini cuma DISIMPAN, baru benar-benar DIPANGGIL belakangan (saat sheet
 * lain dibuka, atau tombol "Batal" sheet ini sendiri ditekan), yang pasti
 * sudah lewat semua deklarasi variabel yang dipakainya. */
export function registerActiveSheet(cancelFn) {
  cancelCurrentSheetSilently();
  activeCancel = cancelFn;
  pushGuard();
}

/** Kosongkan slot aktif — dipanggil dari dalam `close()` sheet itu sendiri
 * begitu ditutup lewat jalurnya sendiri (Batal/Terapkan/Selesai), supaya
 * slot tidak "nyangkut" menunjuk ke sheet yang sudah tidak ada. `cancelFn`
 * dicocokkan dulu (bukan asal null-kan) supaya sheet lama yang telat
 * menutup dirinya sendiri tidak keliru mengosongkan slot milik sheet BARU
 * yang sudah keburu terbuka menggantikannya. */
export function clearActiveSheet(cancelFn) {
  if (activeCancel === cancelFn) {
    activeCancel = null;
    popGuard();
  }
}

/** Ada sheet (Gambar/Scene/Musik) yang sedang terbuka saat ini atau tidak
 * — dipakai app.js buat tombol back topbar (`.note-back-btn`): back
 * PERTAMA sambil sheet masih terbuka cuma membatalkan sheet-nya (lewat
 * `closeActiveSheet()`), TIDAK ikut menavigasi ke `/library`; back KEDUA
 * (sheet sudah tertutup) baru navigasi normal seperti biasa. */
export function hasActiveSheet() {
  return !!activeCancel;
}
