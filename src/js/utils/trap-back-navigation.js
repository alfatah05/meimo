/**
 * trap-back-navigation.js
 * Dipasang dari Home (notes-list) — supaya tombol/gesture back BAWAAN HP
 * di halaman index tidak tembus keluar app.
 *
 * BUGFIX SPA: listener popstate SEBELUMNYA selalu pushState(location.href)
 * tanpa cek path. Akibatnya saat di editor, menutup bottom sheet (yang
 * memanggil history.back() lewat active-sheet popGuard) memicu popstate,
 * lalu trap ini MEN-DORONG ULANG URL editor — entry dummy "nyangkut".
 * Back berikutnya tidak pindah ke index; back sekali lagi bisa keluar app.
 *
 * Sekarang: cuma menyerap back saat path BENAR-BENAR di Home.
 */

function isHomePath(pathname = window.location.pathname) {
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  return path === "/" || path === "/library" || path === "/index.html";
}

// Entry dummy awal — hanya saat memang di Home.
if (isHomePath()) {
  history.pushState({ meimoHomeTrap: true }, "", window.location.href);
}

window.addEventListener("popstate", () => {
  // Jangan ganggu editor / guard bottom sheet / rute non-home.
  if (!isHomePath()) return;
  history.pushState({ meimoHomeTrap: true }, "", window.location.href);
});
