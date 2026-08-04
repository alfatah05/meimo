/**
 * trap-back-navigation.js
 * Dipasang HANYA di Home (index.html) — supaya tombol/gesture back BAWAAN
 * HP, waktu dipencet PERSIS di halaman index, tidak tembus keluar ke
 * history SEBELUM index dibuka (mis. balik ke halaman lain yang sempat
 * dikunjungi sebelum masuk index, atau keluar dari app sama sekali). Index
 * harus jadi "mentok" — back di sini idealnya tidak melakukan apa-apa
 * secara navigasi.
 *
 * Trik standar: begitu index dimuat, dorong SATU history entry dummy yang
 * menunjuk ke URL yang sama (pushState). Waktu user pencet back, browser
 * mencoba "pop" entry dummy itu (event `popstate` terpicu) — pada saat itu
 * kita langsung `pushState` lagi entry yang sama, jadi secara efektif entry
 * dummy itu "diisi ulang" terus-menerus. Hasilnya: back button di index
 * selalu "diserap" entry dummy ini duluan, tidak pernah benar-benar sampai
 * ke entry SEBELUM index — user tetap mentok di index.
 *
 * Tombol back DI DALAM app di halaman lain (editor/trash/dst, elemen
 * <a href="/index.html">) tidak kepengaruh sama sekali oleh modul ini —
 * itu navigasi biasa (klik tombol), bukan back HP, dan modul ini juga
 * tidak dipasang di halaman-halaman itu.
 *
 * CATATAN buat APK (lihat src/js/utils/native-back.js): tombol/gesture
 * back Android fisik memicu event `backButton` dari @capacitor/app, yang
 * ditangani native-back.js dengan `window.history.back()` — trik pushState
 * di atas tetap "menyerap" itu dengan cara yang sama seperti popstate
 * biasa, jadi kedua modul ini kompatibel tanpa perlu perubahan apa pun.
 * Konsekuensinya: tombol back TIDAK akan menutup app selama masih di Home
 * — kalau ternyata ini bukan yang kamu mau untuk versi APK (banyak app
 * Android biasanya back di halaman utama = keluar app), bilang saja, ini
 * gampang diubah.
 */
history.pushState(null, "", window.location.href);
window.addEventListener("popstate", () => {
  history.pushState(null, "", window.location.href);
});
