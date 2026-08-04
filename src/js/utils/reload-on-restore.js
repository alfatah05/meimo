/**
 * reload-on-restore.js
 * Tiap halaman di app ini cuma boot() SEKALI (DOMContentLoaded) — fetch data
 * dari IndexedDB lewat Document Service, lalu render sekali ke DOM. Kalau
 * user balik ke halaman ini lewat navigasi BACK bawaan HP (gesture edge
 * atau tombol hardware, BUKAN tombol back di dalam app), browser bisa
 * memulihkan halaman dari bfcache (back-forward cache) alih-alih memuat
 * ulang — artinya skrip TIDAK dieksekusi ulang, boot() tidak jalan lagi,
 * dan yang kelihatan cuma snapshot DOM lama dari sebelum halaman
 * ditinggalkan (data/perubahan terbaru gak ikut muncul).
 *
 * PENTING — riwayat 3 percobaan fix sebelumnya yang SEMUANYA SALAH ARAH,
 * dicatat di sini supaya tidak diulangi lagi:
 *   1) `location.reload()` saat pageshow/persisted -> transisi kepotong,
 *      karena navigationType "reload" SENGAJA dikecualikan dari cross-
 *      document View Transition oleh spesifikasi.
 *   2) Diganti `location.replace(location.href)` supaya navigationType-nya
 *      push/replace (dapat animasi) -> ternyata malah bikin animasi
 *      DOBEL. Sebab sebenarnya: navigasi back/traverse yang dipulihkan
 *      dari bfcache itu SENDIRI SUDAH otomatis dapat animasi View
 *      Transition dari browser (spesifikasinya EKSPLISIT menghitung
 *      "activating a document from bfcache" sebagai kondisi valid untuk
 *      cross-document view transition, lewat event pageswap/pagereveal) —
 *      jadi begitu kita paksa navigasi KEDUA (replace) di atasnya, yang
 *      kelihatan itu DUA transisi ditumpuk: satu dari bfcache-restore asli
 *      (otomatis), satu lagi dari replace() kita.
 *   3) Dicoba dicegah dengan header `Cache-Control: no-store` (supaya
 *      halaman tidak pernah masuk bfcache blas, back selalu full network
 *      traverse) -> transisi jadi ada jeda putih ("blink") duluan sebelum
 *      animasi, karena SETIAP navigasi (termasuk yang dari replace() di
 *      atas) sekarang wajib nunggu network round-trip HTML utuh dulu
 *      (tidak boleh pakai cache apa pun), padahal transisi butuh render
 *      pertama halaman baru siap dulu baru bisa mulai animasi.
 *
 * KESIMPULAN: akar masalahnya BUKAN animasinya (itu sudah otomatis benar
 * dari browser, tidak perlu dibantu JS sama sekali) — melainkan cuma soal
 * DATA yang stale di snapshot bfcache. Jadi modul ini TIDAK PERNAH memicu
 * navigasi apa pun lagi (tidak reload, tidak replace). Yang dilakukan cuma
 * REFRESH DATA DI TEMPAT (in-place: fetch ulang + render ulang ke DOM yang
 * sudah ada) lewat callback yang didaftarkan tiap halaman — tanpa
 * meninggalkan/memuat ulang dokumen sama sekali, jadi TIDAK ADA navigasi
 * kedua yang bisa numpuk/nge-double/nge-blink di atas animasi bfcache-
 * restore bawaan browser yang sudah otomatis mulus itu.
 *
 * Dipakai lewat `initRefreshOnRestore(refreshFn)` — `refreshFn` idealnya
 * fungsi yang HANYA fetch data terbaru & render ulang ke elemen yang sudah
 * ada (BUKAN re-attach event listener, supaya tidak dobel ke-bind kalau
 * halaman sempat di-boot() sekali sebelumnya). Halaman yang datanya
 * berisiko rusak kalau di-refresh diam-diam saat sedang diedit (mis.
 * editor.html, card-style.html — ada draft belum disimpan di memori)
 * sengaja TIDAK memanggil ini sama sekali; datanya biarkan seadanya
 * (biasanya sudah cukup fresh lewat autosave), yang penting animasinya
 * tidak lagi rusak.
 */
export function initRefreshOnRestore(refreshFn) {
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) refreshFn();
  });
}
