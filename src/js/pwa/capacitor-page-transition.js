/**
 * capacitor-page-transition.js
 * Fallback animasi transisi halaman untuk navigasi PUSH (klik <a> internal
 * biasa — tombol back di header `.note-back-btn`, item menu FAB, dst) —
 * CUMA aktif saat app jalan dibungkus Capacitor (APK), TIDAK ada efeknya di
 * browser/PWA biasa.
 *
 * KENAPA PERLU FALLBACK MANUAL:
 * App ini pakai Cross-Document View Transitions bawaan browser
 * (`@view-transition { navigation: auto }`, lihat src/css/view-transitions.css)
 * yang seharusnya otomatis jalan untuk SEMUA jenis navigasi. Tapi di WebView
 * Android yang dipakai Capacitor, itu kelihatannya cuma reliable dipicu buat
 * navigasi back/forward (traverse dari bfcache) — BUKAN buat klik <a> biasa
 * (push navigation). Hasilnya: pindah halaman lewat tombol back header atau
 * menu FAB terasa "patah" (langsung ganti tanpa animasi), sementara balik
 * lewat gesture/tombol back HP animasinya mulus.
 *
 * SOLUSI: intercept klik <a> internal secara manual —
 *   1. `preventDefault()`, kasih class `.meimo-page-exit` di <html> (lihat
 *      keyframes-nya di view-transitions.css, disamakan gayanya dengan
 *      ::view-transition-old(root) yang asli).
 *   2. Simpan flag sekali-pakai di sessionStorage, lalu tunggu durasi exit
 *      animation-nya selesai baru benar-benar pindah halaman
 *      (`window.location.href = ...`).
 *   3. Di halaman tujuan, flag itu dibaca lagi lewat inline script <head>
 *      SEBELUM paint pertama (lihat blok tema di <head> tiap halaman) —
 *      kalau ada, class `.meimo-page-enter` langsung dipasang di situ juga
 *      (bukan di sini, supaya tidak ada kedip nunggu module script ini
 *      dimuat) — modul ini di sini cuma tinggal MEMBERSIHKAN class itu
 *      setelah animasinya selesai.
 *
 * KENAPA DIGATE DI BELAKANG Capacitor.isNativePlatform():
 * Supaya tidak dobel-animasi di browser/PWA biasa yang Cross-Document View
 * Transition-nya justru sudah reliable jalan sendiri utk push navigation
 * juga (mis. Chrome desktop/Android) — kalau modul ini ikut jalan di sana,
 * satu navigasi bisa dapat DUA animasi bertumpuk (punya browser + punya
 * modul ini). Dan karena modul ini SAMA SEKALI tidak menyentuh navigasi
 * back/forward (cuma klik <a> yang di-intercept-nya lewat listener di
 * bawah), animasi back/forward yang sudah mulus lewat View Transition API
 * bawaan browser juga tidak akan pernah bentrok/dobel dengan ini.
 */

const Capacitor = window.Capacitor;

const ENTER_FLAG_KEY = "meimo-page-transition-enter";
const EXIT_CLASS = "meimo-page-exit";
const ENTER_CLASS = "meimo-page-enter";

// HARUS sama dengan --duration-page-out di src/css/variables.css — dipakai
// buat nunggu animation exit selesai sebelum benar-benar pindah halaman.
const EXIT_ANIMATION_MS = 220;
// HARUS sama dengan --duration-page-in — dipakai buat lepas class enter
// setelah animasinya selesai (biar tidak nyangkut kalau elemen di halaman
// itu nanti dianimasikan ulang oleh hal lain, mis. ganti tema).
const ENTER_ANIMATION_MS = 380;

function isSameOriginNavigableLink(link) {
  if (!link || !link.href) return false;
  // target="_blank" (atau target lain) — biarkan browser yang tangani,
  // bukan navigasi yang menggantikan halaman ini.
  if (link.target && link.target !== "_self") return false;
  // <a download> — bukan navigasi, biarkan trik download bawaan browser
  // (kalaupun ada) jalan seperti biasa.
  if (link.hasAttribute("download")) return false;
  if (link.origin !== window.location.origin) return false;

  // Link jangkar ke section di halaman yang SAMA (mis. "#fitur" di
  // download.html) — bukan pindah dokumen, biar browser scroll seperti
  // biasa, jangan di-intercept.
  if (link.hash && link.pathname === window.location.pathname && link.search === window.location.search) {
    return false;
  }

  return true;
}

function handleClick(event) {
  if (event.defaultPrevented) return;
  if (event.button !== 0) return; // cuma klik kiri; klik tengah/kanan biarkan browser
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // biarkan "buka di tab baru", dst

  const link = event.target.closest?.("a[href]");
  if (!isSameOriginNavigableLink(link)) return;

  event.preventDefault();
  const destination = link.href;

  document.documentElement.classList.add(EXIT_CLASS);
  try {
    sessionStorage.setItem(ENTER_FLAG_KEY, "1");
  } catch (err) {
    // sessionStorage tidak tersedia — halaman tujuan cuma tidak akan dapat
    // animasi masuk, navigasinya sendiri tetap jalan normal di bawah.
  }

  window.setTimeout(() => {
    window.location.href = destination;
  }, EXIT_ANIMATION_MS);
}

// Kalau <html> sudah kepasang class enter (dipasang lewat inline script di
// <head>, lihat komentar di atas), lepas lagi setelah animasinya selesai.
function cleanUpEnterAnimation() {
  if (!document.documentElement.classList.contains(ENTER_CLASS)) return;
  window.setTimeout(() => {
    document.documentElement.classList.remove(ENTER_CLASS);
  }, ENTER_ANIMATION_MS);
}

if (Capacitor?.isNativePlatform?.()) {
  cleanUpEnterAnimation();
  document.addEventListener("click", handleClick, { capture: true });
}
