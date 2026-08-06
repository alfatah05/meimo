/**
 * trap-back-navigation.js
 * Dipasang HANYA di Home (index.html / URL cantik "/library") — supaya
 * tombol/gesture back BAWAAN HP, waktu dipencet PERSIS di halaman index,
 * tidak tembus keluar ke history SEBELUM index dibuka (mis. balik ke
 * halaman lain yang sempat dikunjungi sebelum masuk index, atau keluar
 * dari app sama sekali). Index harus jadi "mentok" — back di sini idealnya
 * tidak melakukan apa-apa secara navigasi.
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
 * <a href="/library">) tidak kepengaruh sama sekali oleh modul ini — itu
 * navigasi biasa (klik tombol), bukan back HP, dan modul ini juga tidak
 * dipasang di halaman-halaman itu.
 */
history.pushState(null, "", window.location.href);
window.addEventListener("popstate", () => {
  history.pushState(null, "", window.location.href);
});
