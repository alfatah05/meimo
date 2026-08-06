/**
 * trap-back-navigation.js
 * Dipasang di halaman "list" terluar — index.html (Home) & arsip.html
 * (keduanya lewat notes-list.js yang mengimpor modul ini) — supaya
 * tombol/gesture back BAWAAN HP, waktu dipencet PERSIS di halaman itu,
 * tidak tembus keluar ke history SEBELUM halaman itu dibuka (mis. balik ke
 * halaman lain yang sempat dikunjungi sebelumnya, atau keluar dari app
 * sama sekali). Halaman ini harus jadi "mentok" — back di sini idealnya
 * tidak melakukan navigasi apa pun.
 *
 * Trik standar: begitu halaman dimuat, dorong SATU history entry dummy
 * yang menunjuk ke URL yang sama (pushState), ditandai `meimoHomeGuard:
 * true` di state-nya. Waktu user pencet back, browser mencoba "pop" entry
 * dummy itu (event `popstate` terpicu) — pada saat itu kita langsung
 * `pushState` lagi entry yang sama, jadi secara efektif entry dummy itu
 * "diisi ulang" terus-menerus. Hasilnya: back button selalu "diserap"
 * entry dummy ini duluan, tidak pernah benar-benar sampai ke entry
 * SEBELUM halaman ini — user tetap mentok di sini.
 *
 * Tombol back DI DALAM app di halaman lain (editor/trash/dst, elemen
 * <a href="index.html">) tidak kepengaruh sama sekali oleh modul ini — itu
 * navigasi biasa (klik tombol), bukan back HP, dan modul ini juga tidak
 * dipasang di halaman-halaman itu.
 *
 * CAPACITOR: di APK, tombol back HP ditangani src/js/pwa/back-button.js
 * (bukan `popstate` langsung — App plugin Capacitor mengambil alih back
 * button begitu ada listener terdaftar). Modul itu SENGAJA membaca flag
 * `meimoHomeGuard` di `history.state` untuk tahu kapan harus langsung
 * minimize app alih-alih memanggil `history.back()` — tanpa flag ini,
 * `history.length` di halaman ini SELALU > 1 (gara-gara entry dummy di
 * atas), jadi back HP di APK akan "diserap" guard ini selamanya (kerasa
 * mati, tidak merespons) alih-alih minimize seperti mestinya. Kalau state
 * dummy di sini diubah bentuknya, back-button.js harus ikut disesuaikan.
 */
history.pushState({ meimoHomeGuard: true }, "", window.location.href);
window.addEventListener("popstate", () => {
  history.pushState({ meimoHomeGuard: true }, "", window.location.href);
});
