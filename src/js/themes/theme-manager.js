/**
 * theme-manager.js
 * Mengelola tema aplikasi (Light/Dark/Sepia/Paper/OLED Black) — satu state
 * global yang berlaku di semua halaman (Home, Editor, Sampah) lewat atribut
 * `data-theme` di <html>, disimpan di localStorage supaya konsisten dipakai
 * ulang saat app dibuka lagi.
 *
 * Ini BUKAN dokumen (lihat PROJECT_RULES.md — "Jangan menggunakan
 * LocalStorage untuk menyimpan dokumen"), jadi aman dipakai untuk preferensi
 * UI seperti ini.
 *
 * Penerapan tema saat halaman dimuat dilakukan oleh inline script kecil di
 * <head> tiap halaman (sebelum stylesheet dirender) supaya tidak "kedip" ke
 * tema default sebelum tema tersimpan sempat diterapkan. Modul ini
 * menyediakan API untuk mengganti tema saat runtime (dipakai oleh Floating
 * Menu di Home).
 */

export const THEME_STORAGE_KEY = "notes-app-theme";

export const THEMES = [
  { id: "light", label: "Terang", swatch: "#FFFFFF" },
  { id: "dark", label: "Gelap", swatch: "#17181C" },
  { id: "sepia", label: "Sepia", swatch: "#F4ECD8" },
  { id: "paper", label: "Kertas", swatch: "#FBFAF5" },
  { id: "oled", label: "OLED Hitam", swatch: "#000000" },
];

/** Tema yang sedang aktif di halaman ini. */
export function getTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}

/** Terapkan & simpan tema baru. Mengembalikan id tema yang benar-benar dipakai. */
export function setTheme(themeId) {
  const valid = THEMES.some((t) => t.id === themeId) ? themeId : "light";
  document.documentElement.setAttribute("data-theme", valid);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, valid);
  } catch (_) {
    // localStorage tidak tersedia (mis. private mode) — tema tetap berlaku
    // untuk sesi berjalan saja, tidak fatal.
  }
  applyThemeColorMeta(valid);
  return valid;
}

/**
 * Sinkronkan warna status bar (`<meta name="theme-color">`) dengan warna
 * background tema yang baru aktif, supaya ganti tema = ganti warna info bar
 * juga (bukan warna ungu tetap). Dipakai dari setTheme() di sini, dan
 * duplikatnya (untuk mencegah kedip warna sebelum modul ini sempat dimuat)
 * ada di inline script <head> tiap halaman — kalau warna tema di
 * src/css/themes.css berubah, THEMES.swatch di atas & peta warna di inline
 * script tiap *.html harus ikut diperbarui.
 */
function applyThemeColorMeta(themeId) {
  const theme = THEMES.find((t) => t.id === themeId);
  if (!theme) return;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme.swatch);
}
