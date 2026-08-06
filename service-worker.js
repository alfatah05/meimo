/**
 * service-worker.js
 * App-shell caching untuk mode offline.
 *
 * Strategi:
 *  - Navigasi (HTML) -> network-first, fallback ke SHELL FILE yang sesuai
 *    (lihat resolveShellPath) — BUKAN dicocokkan persis per-URL. Ini
 *    penting karena app.js menulis ID catatan ke URL "cantik"
 *    /editor/<id> lewat history.replaceState (lihat app.js), jadi setiap
 *    catatan punya URL uniknya sendiri yang TIDAK PERNAH bisa satu-satu
 *    dicache duluan (apalagi catatan yang baru dibuat justru saat offline).
 *    Semua path berpola /editor... di-fallback ke satu shell precached
 *    "/editor.html", /trash... ke "/trash.html", /font-manager... ke
 *    "/font-manager.html", selainnya ke "/index.html" — persis seperti
 *    App Shell Model untuk SPA dengan client-side routing.
 *  - Asset statis same-origin (css/js/gambar/manifest) -> cache-first,
 *    lalu diperbarui diam-diam di background (stale-while-revalidate)
 *    supaya update kode tetap terpakai di kunjungan berikutnya tanpa
 *    membuat kunjungan saat ini menunggu jaringan.
 *  - Google Fonts (cross-origin) -> cache-first juga, supaya font tidak
 *    hilang saat offline setelah sempat dimuat sekali.
 *  - IndexedDB (data catatan) TIDAK disentuh oleh service worker ini sama
 *    sekali — itu murni tanggung jawab src/js/db/*, bukan cache HTTP.
 *    Catatan yang dibuat offline SUDAH tersimpan di IndexedDB begitu
 *    disimpan; yang tadinya gagal dibuka lagi cuma karena SW salah
 *    menyajikan shell HTML-nya (bug ini yang diperbaiki di versi ini).
 *
 * PENTING: file ini tidak mengubah apa pun di src/js/editor/* — service
 * worker hanya meng-cache file editor.js dkk sebagai byte statis, tidak
 * mengeksekusi atau memodifikasi logikanya.
 */

// v10 -> v11: dinaikkan karena struktur folder Font Library berubah
// (assets/fonts/library/<slug>/<file> -> assets/fonts/library/<file>
// langsung, tanpa subfolder — subfolder ternyata kena 403 di hosting user)
// & manifest.json ikut berubah isinya.
// v11 -> v12: panel debug sementara (utils/debug-overlay.js) & semua
// pemanggilnya sudah dihapus dari src/js — dinaikkan supaya browser yang
// masih memegang cache lama tidak terus menyajikan file yang sudah tidak
// ada di precache list ini, dan file-file lain yang isinya berubah ikut
// ter-update. NAIKKAN LAGI ANGKA INI setiap kali deploy perubahan ke
// src/js, src/css, atau asset yang sudah pernah di-runtime-cache (termasuk
// assets/fonts/library/manifest.json).
// v14 -> v15: (lihat riwayat sebelumnya)
// v15 -> v16: fitur Outline (FAB + sidebar heading) ditambahkan
// (src/js/editor/outline.js, src/css/outline.css) & outline.js sempat
// direvisi (scrollToHeading diganti ke scrollIntoView + scroll-margin-top)
// SETELAH v15 sempat dicache browser tanpa versi dinaikkan — klien lama
// bisa nyangkut di outline.js versi sebelum fix karena cacheFirst
// (stale-while-revalidate) balikin cache dulu baru update belakangan.
// Menaikkan versi di sini memaksa SW baru terpasang & cache lama dihapus
// total (lihat listener "activate" di bawah), jadi klien lama otomatis
// dapat file terbaru begitu SW baru aktif.
// v16 -> v17: src/css/editor.css berubah (highlight: border-radius
// diperbesar 3px -> 5px, ditambah padding-inline & box-decoration-break
// biar teks yang di-highlight ada "napas" kiri-kanan) — app version 1.0.1.
// v17 -> v18: fitur baru toggle "Latar Transparan" di bottom sheet gambar
// (src/js/toolbar/image-sheet.js, src/js/editor/block-model.js,
// src/js/editor/serializer.js, src/css/editor.css, src/css/image-sheet.css
// semua ikut berubah) — app version 1.1.0.
// v18 -> v19: src/js/toolbar/image-sheet.js (rentang slider Lebar & Tinggi
// disamakan 10px-640px) & src/css/image-sheet.css (jarak slider Border
// Radius ke tombol Batal/Terapkan ditambah, max-height SEMUA bottom sheet
// editor — image/scene/music-sheet — diubah dari 66vh ke 40vh + tetap
// scrollable) — app version 1.1.1.
// v19 -> v20: fitur baru — gambar yang diunggah lewat bottom sheet gambar
// sekarang dikonversi ke WebP dulu (src/js/services/image-service.js
// convertToWebp(), murni Canvas API, jalan offline) SEBELUM tampil di
// pratinjau & sebelum disimpan ke IndexedDB. src/js/toolbar/image-sheet.js,
// src/js/editor/block-model.js (field baru tidak ada, cuma alur upload),
// src/css/image-sheet.css & src/css/animations.css (spinner "Mengonversi…"
// di tombol Unggah Gambar) ikut berubah — app version 1.2.0.
// v25 -> v26: Menu FAB (Home) & dropdown menu titik-tiga note card sekarang
// benar-benar menutup dengan animasi saat diklik — sebelumnya close() di
// openPanel() (src/js/utils/dom.js) langsung panelEl.remove() tanpa animasi
// apa pun, dan item FAB/dropdown yang berupa link navigasi langsung (Catatan
// Baru, Sampah, Cadangkan, Font Library, Customisasi) malah tidak memicu
// close sama sekali sebelum berpindah halaman. src/js/utils/dom.js,
// src/css/toolbar.css, src/components/floating-button.js,
// src/js/notes/note-card.js — app version 1.3.3.
// v26 -> v27: tambah indikator kecil "punya dropdown/color picker" (segitiga
// di pojok kanan-bawah, gaya sama seperti .toolbar-btn--group::after yang
// sudah ada untuk menu level-1) di 9 tombol child bar (baris 2) topbar
// editor yang membuka dropdown/color picker: Heading, Font Family, Font
// Size, Warna Teks, Highlight, Perataan Teks, Line Height, Letter Spacing,
// Hyperlink. editor.html (class `toolbar-btn--has-dropdown` ditambah ke
// 9 tombol itu) & src/css/toolbar.css (rule barunya) — app version 1.3.4.
// v28 -> v31 (app v1.3.5 -> v1.3.6). Tiga fix dikonsolidasi jadi satu
// rilis (lihat entri lengkap #v1.3.6 di README.md > Changelog):
//  1. Offline: /card-style/<id> (halaman Customisasi) salah sasaran ke
//     index.html karena resolveShellPath() belum kenal pola URL-nya.
//     card-style.html & about.html, plus SEMUA file JS/CSS yang benar-
//     benar dipakainya (ditelusuri dari import graph ES module +
//     <link>/<script> tiap halaman) ternyata belum ikut precache sama
//     sekali. File yang ditambah: card-style.html, about.html, src/css/
//     {card-style,about,scene,scene-sheet,music,view-transitions,
//     skeleton}.css, src/js/editor/{image-clip-shapes,scene-edges,
//     title-style}.js, src/js/notes/{card-style,card-style-presets,
//     card-edge-outline}.js, src/js/services/{audio-player-service,
//     music-service}.js, src/js/toolbar/{music-sheet,scene-sheet}.js,
//     src/js/utils/{native-feel,reload-on-restore}.js.
//  2. "Kedip putih" saat navigasi ke font-manager/cadangkan/trash — sudah
//     ditangani di HTML/CSS/JS masing-masing halaman lewat skeleton.css
//     (baru ikut ditambah ke precache di atas juga).
//  3. Strip putih di area status-bar saat dibuka sebagai PWA (standalone)
//     — fix di base.css (background-color di <html>, bukan cuma <body>),
//     tidak menyentuh daftar precache di sini.
// v31 -> v32 (app v1.3.6 -> v1.3.7). Navigasi HTML diganti dari
// network-first jadi cache-first — lihat komentar lengkap di
// cacheFirstNavigation() di bawah & entri #v1.3.7 di README.md >
// Changelog. Ringkas: network-first bikin SETIAP pindah halaman nunggu
// jaringan dulu meski filenya sudah precached, jeda itu memicu Chrome
// (mode PWA standalone di Android) nongolin toolbar browser sungguhan
// sesaat sebagai jalan keluar darurat — persis "kedip header browser"
// yang dilaporkan, bukan sekadar bug CSS/tampilan.
// v32 -> v33 (app v1.3.7 -> v1.3.8). Fix skeleton Home (#homeSkeleton)
// numpuk kelihatan bareng list card note asli — lihat komentar lengkap
// di render() (src/js/notes/notes-list.js) & entri #v1.3.8 di README.md
// > Changelog. Tidak mengubah daftar precache di sini.
// v34 -> v35 (app v1.3.9 -> v1.3.10). BUGFIX KRUSIAL: redirect *.html ->
// URL cantik yang ditambah ke htaccess di v1.3.9 bikin fetch() saat
// precache (& saat revalidate navigasi langsung ke *.html) mengikuti
// redirect itu, menghasilkan Response ber-flag "redirected" yang KALAU
// disimpan ke cache lalu dipakai menjawab request navigasi, DITOLAK Chrome
// (net::ERR_FAILED) — situs jadi "tidak dapat dijangkau" setiap refresh/
// pindah halaman begitu Service Worker baru selesai precache & mulai
// mengontrol. Fix: stripRedirectMeta() (baru) membungkus ulang Response
// yang "redirected" jadi Response bersih sebelum dipakai/disimpan — dipakai
// baik di precache (install handler) maupun revalidate (cacheFirstNavigation).
// Lihat komentar lengkap di stripRedirectMeta().
// v37 -> v38 (app v1.3.12 -> v1.3.13). Redesain skeleton loading jadi
// OVERLAY penuh (position:absolute inset:0) yang menutup SELURUH area
// konten (dari .home-content / .note-content, lihat layout.css & komentar
// lengkap di skeleton.css), bukan cuma elemen biasa di alur dokumen —
// sebelumnya bagian HTML lain yang sudah kel-load lebih dulu (mis. "Font
// Bawaan" yang sinkron di font-manager.html, tombol Cadangkan/Impor
// statis di cadangkan.html) bisa "mendorong" skeleton turun & sempat
// kelihatan sebelum halaman benar-benar lengkap. File yang berubah:
// src/css/layout.css (.home-content & .note-content), src/css/
// variables.css (--z-skeleton baru), src/css/skeleton.css (.skeleton-
// overlay baru), serta index.html/trash.html/font-manager.html/
// cadangkan.html/editor.html (tambah class skeleton-overlay). Semua file
// itu sudah ada di precache (APP_SHELL_FILES) — dinaikkan di sini supaya
// klien lama ikut dapat versi terbaru, bukan menambah entri precache baru.
// v36 -> v37 (app v1.3.11 -> v1.3.12). BUGFIX: /Download (URL cantik
// halaman instalasi PWA) belum dikenal resolveShellPath() sama sekali,
// jadi selalu jatuh ke default "/index.html" — begitu index.html kepasang
// di cache (hampir pasti), navigasi ke /Download disajikan sebagai Home,
// SALAH, walau lagi online, karena cacheFirstNavigation() cek cache
// SEBELUM ke jaringan. download.html TETAP tidak ditambah ke precache
// (memang sengaja, halaman ini cuma didatangi orang yang belum install app
// alias pasti online) — fix cuma benerin shellPath-nya biar cache MISS &
// otomatis fetch ke jaringan. Lihat komentar BUGFIX v36->v37 di
// resolveShellPath() di bawah.
// v35 -> v36 (app v1.3.10 -> v1.3.11). BUGFIX: semua URL cantik BARE (tanpa
// ".html" & tanpa apa-apa lagi di belakangnya) — "/trash", "/font-manager",
// "/cadangkan", "/about", dan "/editor" tanpa id (tombol "Catatan Baru") —
// selalu tersaji sebagai Home (index.html), bukan halamannya sendiri. Akar
// masalah: tiap kondisi di resolveShellPath() cuma cek "=== \"/xxx.html\""
// atau ".startsWith(\"/xxx/\")" — tidak ada satupun yang cocok untuk bentuk
// bare "/xxx" polos, padahal htaccess (rule 2b & 3d-3g) justru mengizinkan
// bentuk itu. Persis pola bug yang sama dengan /card-style di v29 & /cadangkan
// di v34, kali ini dipicu bare path bukan pola baru. Fix: tambah
// "pathname === \"/xxx\"" di kelima kondisi terkait. Lihat komentar BUGFIX
// v35->v36 di resolveShellPath() di bawah.
// v33 -> v34 (app v1.3.8 -> v1.3.9). Dua perubahan:
//  1. Bugfix: resolveShellPath() belum kenal pola /cadangkan — halaman
//     Cadangkan & Impor jadi tersaji sebagai Home lewat cache-first
//     navigation. Lihat komentar BUGFIX di resolveShellPath() di bawah.
//  2. Semua URL halaman sekarang "cantik" tanpa ".html" (/about,
//     /cadangkan, /trash, /font-manager, /editor tanpa id) — lihat
//     htaccess & manifest.json. Dinaikkan supaya klien lama yang masih
//     memegang index.html/font-family-dropdown.js versi tautan lama
//     (berisi href=".../*.html") ikut diperbarui.
// v49 -> v50: fitur baru — note bawaan (assets/default-notes/
// Welcome_to_Meimo.meimo) otomatis diimpor sekali di kunjungan pertama
// Home (src/js/notes/seed-default-notes.js, dipanggil dari
// notes-list.js), supaya user baru langsung punya satu catatan contoh
// begitu install/buka app pertama kali. File .meimo-nya & modul seeding
// baru ini ditambah ke precache list di bawah.
// v51 -> v52: fitur baru — coordinator satu-bottom-sheet-aktif global
// (src/js/toolbar/active-sheet.js, file baru, ditambah ke precache list
// di bawah) dipakai bareng oleh image-sheet.js/scene-sheet.js/
// music-sheet.js: sekarang maksimal cuma SATU bottom sheet (Gambar/
// Scene/Musik) yang boleh terbuka di seluruh editor — membuka salah satu
// sementara yang lain masih terbuka otomatis MEMBATALKAN (bukan cuma
// menutup) sheet lama itu, termasuk membuang placeholder/Scene yang
// baru saja disisipkan kalau sheet lama masih dalam mode "insert".
// v52 -> v53: fitur baru — bottom bar "Select Block / Copy Block / Paste
// Block" (placeholder) yang muncul saat user long-press + select teks di
// isi catatan (src/js/editor/block-selection-bar.js, file baru + src/css/
// block-selection-bar.css, file baru — keduanya ditambah ke precache list
// di bawah). FAB Outline (src/css/outline.css) ikut direvisi supaya naik
// sementara selagi bar ini terbuka. src/js/app.js & src/js/utils/dom.js
// ikut berubah (wiring init + supaya tap tombol bar tidak mengcollapse
// seleksi teks). Dinaikkan supaya klien yang sudah sempat cache versi lama
// src/js/app.js & src/js/utils/dom.js (cache-first, lihat cacheFirst() di
// bawah — tanpa menaikkan versi ini, file lama itu TETAP disajikan dari
// cache walau isinya sudah diganti di server, dan baru terpakai satu
// kunjungan BERIKUTNYA lagi karena stale-while-revalidate) langsung dapat
// versi terbaru begitu SW baru ini aktif.
// v53 -> v54: tweak — 3 tombol aksi di block-selection-bar.js (Select
// Block/Copy Block/Paste Block) jadi ICON-ONLY (label teksnya dilepas),
// src/css/block-selection-bar.css ikut disesuaikan (tombol jadi bulat
// 36x36, senada tombol batal). Tidak menambah file precache baru.
// v54 -> v55: tweak tampilan block-selection-bar.js supaya senada topbar —
// background-color disamakan (var(--color-surface), sebelumnya
// var(--color-bg)), padding vertikal disamakan persis (5px, sama seperti
// .note-topbar-row) supaya tinggi bar ini identik dengan topbar, ikon
// diperbesar ke var(--icon-md)/20px (sebelumnya 18px/16px berbeda-beda).
// src/css/block-selection-bar.css saja yang berubah.
// v55 -> v56: fitur baru — "Select Block" di block-selection-bar.js SEKARANG
// SUNGGUHAN (sebelumnya placeholder toast doang): menekan tombolnya menutup
// seleksi teks bawaan browser lalu mengaktifkan mode seleksi CUSTOM
// per-block lewat satu "probe" (handle) di jalur vertikal nempel tepi kanan
// layar yang bisa digeser naik/turun, snapping ke batas block (lihat
// src/js/editor/block-select-mode.js, file baru + src/css/
// block-select-mode.css, file baru — keduanya ditambah ke precache list di
// bawah, dan editor.html ikut nambah <link> ke CSS barunya). Copy Block/
// Paste Block MASIH placeholder. src/js/editor/block-selection-bar.js (wiring
// tombol Select Block + bar tetap terbuka selagi mode aktif), src/css/
// block-selection-bar.css (state .is-active tombol Select Block),
// src/css/outline.css (FAB Outline disembunyikan selagi mode aktif, bentrok
// posisi dengan jalur probe), dan src/js/utils/dom.js (jalur probe ikut
// dikecualikan dari pemindahan fokus mousedown) ikut berubah.
// v75 -> v76: fitur baru — Arsip. Note card (Home) dapat item menu titik-tiga
// baru "Arsipkan" (src/js/notes/note-card.js, dipakai lewat
// documentService.setArchived() yang sebelumnya sudah ada tapi belum
// terpakai di UI manapun), catatan yang diarsipkan hilang dari grid Home
// (sudah difilter listNotes({includeArchived:false}) sejak lama) dan cuma
// bisa diakses lewat halaman baru arsip.html (src/js/notes/arsip.js), yang
// dibuka lewat tombol ikon arsip baru di header Home — di sebelah kiri
// tombol About (index.html, src/css/layout.css .home-header-actions).
// arsip.html & arsip.js ditambahkan ke precache/APP_SHELL_FILES & dikenali
// resolveShellPath() di bawah, sama polanya persis dengan /trash.
// v76 -> v77: fitur baru — item menu "Download" (ekspor .meimo) ditambahkan
// ke menu titik-tiga note card (src/js/notes/note-card.js, modul baru
// src/js/notes/download-note.js), dipakai baik di Home (notes-list.js)
// maupun Arsip (arsip.js). Sebagai gantinya, daftar "Ekspor Satu Catatan"
// di cadangkan.html DIHAPUS total (markup-nya di cadangkan.html, list
// logic-nya di backup-import.js, style .export-card* di backup-import.css)
// — ekspor satu catatan sekarang bisa langsung dari note card di mana pun
// tampil, tidak perlu lagi buka halaman Cadangkan & Impor dulu.
// v77 -> v78: perbaikan unduhan .meimo/.zip di dalam APK — trik lama
// `<a download>` + blob: URL tidak berfungsi di WebView Android native.
// meimo-export.js & backup-service.js sekarang lewat modul baru
// src/js/utils/save-file.js (ditambahkan ke precache di bawah): di app
// native, tulis ke cache lalu buka Android Share Sheet; di browser tetap
// pakai trik blob lama. capacitor-back.js & capacitor-status-bar.js
// (status bar Android ikut warna tema — lihat theme-manager.js) sengaja
// TIDAK ditambah ke precache: sama seperti capacitor-back.js, keduanya
// no-op total di luar app native (Capacitor.isNativePlatform() false), dan
// service worker ini sendiri tidak pernah aktif di app native (lihat
// sw-register.js).
// v78 -> v79: dua bugfix status bar Android (isi filenya sudah ada di
// precache dari v78, dinaikkan di sini semata supaya klien lama ikut ambil
// isi terbaru): capacitor-status-bar.js — setBackgroundColor & setStyle
// dipisah try/catch (setBackgroundColor gagal di Android 15+ dulu ikut
// menggagalkan setStyle, bikin ikon status bar nyangkut putih di tema
// terang); layout.css — .home-header dapat padding-top: env(safe-area-
// inset-top) (dulu cuma .note-topbar/editor.html yang punya), supaya
// header Home/Sampah/Arsip/dll tidak ketutup status bar edge-to-edge.
const CACHE_VERSION = "v79";
const APP_SHELL_CACHE = `meimo-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `meimo-runtime-${CACHE_VERSION}`;
const FONT_CACHE = `meimo-fonts-${CACHE_VERSION}`;

const OFFLINE_FALLBACK_PAGE = "/index.html";

/** Semua file yang wajib ada sebelum app boleh dianggap "siap offline". */
const APP_SHELL_FILES = [
  "/index.html",
  "/editor.html",
  "/trash.html",
  "/arsip.html",
  "/font-manager.html",
  "/cadangkan.html",
  "/card-style.html",
  "/about.html",
  "/manifest.json",

  "/src/css/variables.css",
  "/src/css/themes.css",
  "/src/css/base.css",
  "/src/css/typography.css",
  "/src/css/layout.css",
  "/src/css/notes-list.css",
  "/src/css/toolbar.css",
  "/src/css/editor.css",
  "/src/css/image-sheet.css",
  "/src/css/animations.css",
  "/src/css/responsive.css",
  "/src/css/components.css",
  "/src/css/font-manager.css",
  "/src/css/backup-import.css",
  "/src/css/outline.css",
  "/src/css/block-selection-bar.css",
  "/src/css/block-select-mode.css",
  "/src/css/card-style.css",
  "/src/css/about.css",
  "/src/css/scene.css",
  "/src/css/scene-sheet.css",
  "/src/css/music.css",
  "/src/css/view-transitions.css",
  "/src/css/skeleton.css",

  "/src/js/app.js",
  "/src/js/router.js",

  "/src/js/db/db.js",
  "/src/js/db/notes-repository.js",
  "/src/js/db/fonts-repository.js",
  "/src/js/db/schema.js",

  "/src/js/editor/block-model.js",
  "/src/js/editor/commands.js",
  "/src/js/editor/editor-state.js",
  "/src/js/editor/editor.js",
  "/src/js/editor/history.js",
  "/src/js/editor/outline.js",
  "/src/js/editor/block-selection-bar.js",
  "/src/js/editor/block-select-mode.js",
  "/src/js/editor/paste-handler.js",
  "/src/js/editor/selection.js",
  "/src/js/editor/serializer.js",
  "/src/js/editor/image-clip-shapes.js",
  "/src/js/editor/scene-edges.js",
  "/src/js/editor/title-style.js",

  "/src/js/notes/note-card.js",
  "/src/js/notes/notes-list.js",
  "/src/js/notes/seed-default-notes.js",
  "/src/js/notes/pin.js",
  "/src/js/notes/download-note.js",
  "/src/js/notes/search.js",
  "/src/js/notes/sorting.js",
  "/src/js/notes/trash.js",
  "/src/js/notes/arsip.js",
  "/src/js/notes/backup-import.js",
  "/src/js/notes/card-style.js",
  "/src/js/notes/card-style-presets.js",
  "/src/js/notes/card-edge-outline.js",

  "/src/js/fonts/font-manager.js",

  "/src/js/pwa/install-prompt.js",
  "/src/js/pwa/sw-register.js",
  "/src/js/pwa/factory-reset.js",

  "/src/js/services/backup-service.js",
  "/src/js/services/backup-restore.js",
  "/src/js/services/document-service.js",
  "/src/js/services/image-service.js",
  "/src/js/services/font-service.js",
  "/src/js/services/meimo-export.js",
  "/src/js/services/meimo-import.js",
  "/src/js/services/audio-player-service.js",
  "/src/js/services/music-service.js",

  "/src/js/themes/theme-manager.js",

  "/src/js/toolbar/active-sheet.js",
  "/src/js/toolbar/color-picker.js",
  "/src/js/toolbar/highlight-picker.js",
  "/src/js/toolbar/image-sheet.js",
  "/src/js/toolbar/link-picker.js",
  "/src/js/toolbar/music-sheet.js",
  "/src/js/toolbar/scene-sheet.js",
  "/src/js/toolbar/toolbar-state-sync.js",
  "/src/js/toolbar/toolbar.js",
  "/src/js/toolbar/dropdowns/font-family-dropdown.js",
  "/src/js/toolbar/dropdowns/font-size-dropdown.js",
  "/src/js/toolbar/dropdowns/heading-dropdown.js",
  "/src/js/toolbar/dropdowns/letter-spacing-dropdown.js",
  "/src/js/toolbar/dropdowns/line-height-dropdown.js",

  "/src/js/utils/date-format.js",
  "/src/js/utils/debounce.js",
  "/src/js/utils/dom.js",
  "/src/js/utils/native-feel.js",
  "/src/js/utils/reload-on-restore.js",
  "/src/js/utils/save-file.js",
  "/src/js/utils/topbar-autohide.js",
  "/src/js/utils/trap-back-navigation.js",
  "/src/js/utils/uuid.js",
  "/src/js/utils/viewport-pin.js",
  "/src/js/utils/zip-writer.js",
  "/src/js/utils/zip-reader.js",

  "/src/components/floating-button.js",
  "/src/components/modal.js",
  "/src/components/toast.js",

  "/assets/icons/favicon.ico",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/icon-192-maskable.png",
  "/assets/icons/icon-512-maskable.png",
  "/assets/icons/apple-touch-icon.png",
  "/assets/splash/splash-screen.png",
  "/assets/default-notes/Welcome_to_Meimo.meimo",
];

/**
 * BUGFIX v34 -> v35: beberapa URL shell (mis. "/index.html",
 * "/cadangkan.html", "/trash.html", dst) sekarang di-redirect (301) oleh
 * .htaccess ke bentuk URL cantiknya (lihat htaccess di root project).
 * fetch() secara default MENGIKUTI redirect itu, jadi Response yang
 * didapat berstatus "redirected" (properti `.redirected` true / rantai
 * `.url` bukan lagi url yang diminta). Response seperti ini TIDAK BOLEH
 * disimpan ke Cache Storage lalu dipakai langsung untuk menjawab request
 * NAVIGASI — Chrome menolaknya dan navigasi (pindah halaman/refresh) gagal
 * total dengan net::ERR_FAILED, meski isi Response-nya sendiri sebenarnya
 * benar. Begitu tersimpan ke cache, rusaknya MENETAP (dipakai lagi di
 * kunjungan berikutnya) — ini kenapa gejalanya "kunjungan pertama mulus,
 * abis refresh/pindah halaman baru gagal, lalu gagal terus".
 * Fix: kalau res.redirected true, bikin ulang Response BERSIH (body &
 * header sama, tanpa metadata redirect/URL asing) sebelum dipakai/
 * disimpan. Response biasa (bukan hasil redirect) dikembalikan apa adanya.
 */
async function stripRedirectMeta(res) {
  if (!res.redirected) return res;
  return new Response(await res.clone().blob(), {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      // addAll gagal total kalau satu saja 404 — dipecah per-file supaya
      // satu aset hilang tidak menggagalkan seluruh instalasi SW.
      await Promise.all(
        APP_SHELL_FILES.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "no-cache" });
            if (!res.ok) return;
            // Lihat komentar lengkap di stripRedirectMeta() di bawah —
            // beberapa url di APP_SHELL_FILES sekarang di-redirect oleh
            // .htaccess ke bentuk cantiknya, jadi wajib dibersihkan dulu
            // sebelum disimpan ke cache.
            await cache.put(url, await stripRedirectMeta(res));
          } catch (_) {
            // Offline saat install (jarang terjadi) — file akan tercache
            // belakangan lewat runtime caching saat berhasil diakses.
          }
        })
      );
      // Aktifkan SW baru tanpa menunggu tab lama ditutup.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([APP_SHELL_CACHE, RUNTIME_CACHE, FONT_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => !keep.has(n)).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

function isSameOrigin(url) {
  return new URL(url).origin === self.location.origin;
}

function isGoogleFont(url) {
  const origin = new URL(url).origin;
  return origin === "https://fonts.googleapis.com" || origin === "https://fonts.gstatic.com";
}

/** Cache-first, lalu perbarui cache di background (stale-while-revalidate). */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    // Perbarui diam-diam, tidak perlu ditunggu oleh halaman.
    networkFetch;
    return cached;
  }

  const fresh = await networkFetch;
  if (fresh) return fresh;

  // Tidak ada cache & jaringan gagal — biar caller yang menangani (404/berantakan
  // lebih baik daripada Response kosong yang membingungkan).
  throw new Error("cacheFirst: tidak ada cache maupun jaringan untuk " + request.url);
}

/**
 * Petakan path navigasi APA PUN ke satu file shell precached yang benar.
 *  - /editor.html, /editor/<id>, /editor/<id>/  -> /editor.html
 *  - /card-style.html, /card-style/<id>, /...   -> /card-style.html
 *  - /trash.html, /trash/...                    -> /trash.html
 *  - /font-manager.html, /font-manager/...      -> /font-manager.html
 *  - /cadangkan.html, /cadangkan/...            -> /cadangkan.html
 *  - /about.html, /about/...                    -> /about.html
 *  - selainnya (/, /index.html, /library, dst.) -> /index.html
 * Dipakai baik untuk fallback offline maupun untuk memutuskan apakah
 * respons jaringan boleh disimpan ke cache (lihat cacheFirstNavigation).
 */
function resolveShellPath(pathname) {
  // BUGFIX v35 -> v36: SEMUA kondisi di bawah cuma cek bentuk "/xxx.html"
  // (persis) atau "/xxx/..." (ada "/" di belakang) — tidak ada satupun yang
  // cocok untuk URL cantik BARE tanpa apa-apa di belakangnya (mis. "/trash",
  // "/font-manager", "/cadangkan", "/about", atau "/editor" tanpa id dari
  // tombol "Catatan Baru"). htaccess (lihat rule 2b & 3d-3g) justru
  // mengizinkan bentuk bare persis ini, jadi kelima path itu SELALU jatuh ke
  // default "/index.html" paling bawah — persis kayak /card-style di v29 &
  // /cadangkan di v34, tapi kali ini pemicunya bare path, bukan pola baru.
  // Fix: tambah pengecekan "=== \"/editor\"" dkk di tiap kondisi.
  if (
    pathname === "/editor" ||
    pathname === "/editor.html" ||
    pathname.startsWith("/editor/")
  ) {
    return "/editor.html";
  }
  // BUGFIX v29: sebelumnya pola /card-style/<id> tidak dicek sama sekali di
  // sini, jadi jatuh ke default "/index.html" di baris paling bawah — itu
  // sebabnya halaman Customisasi Kartu note yang baru dibuat OFFLINE gagal
  // dibuka (yang tersaji malah daftar catatan, bukan card-style.html).
  // (/card-style sendiri tidak punya bentuk bare di htaccess — selalu
  // /card-style/<id> — jadi tidak butuh pengecekan bare di sini.)
  if (pathname === "/card-style.html" || pathname.startsWith("/card-style/")) {
    return "/card-style.html";
  }
  if (
    pathname === "/trash" ||
    pathname === "/trash.html" ||
    pathname.startsWith("/trash/")
  ) {
    return "/trash.html";
  }
  if (
    pathname === "/arsip" ||
    pathname === "/arsip.html" ||
    pathname.startsWith("/arsip/")
  ) {
    return "/arsip.html";
  }
  if (
    pathname === "/font-manager" ||
    pathname === "/font-manager.html" ||
    pathname.startsWith("/font-manager/")
  ) {
    return "/font-manager.html";
  }
  // BUGFIX v33 -> v34: pola /cadangkan (URL cantik halaman Cadangkan &
  // Impor) belum pernah dikenali di sini sama sekali, jadi selalu jatuh ke
  // default "/index.html" di baris paling bawah — makanya membuka halaman
  // Cadangkan & Impor (lewat tombol di FAB, shortcut, atau ketik langsung
  // di address bar) malah menampilkan Home/daftar catatan, BUKAN halaman
  // Cadangkan & Impor itu sendiri. cadangkan.html sendiri sudah lama ada
  // di precache (lihat APP_SHELL_FILES di atas), yang keliru cuma
  // pemetaan shell path-nya di sini.
  if (
    pathname === "/cadangkan" ||
    pathname === "/cadangkan.html" ||
    pathname.startsWith("/cadangkan/")
  ) {
    return "/cadangkan.html";
  }
  if (
    pathname === "/about" ||
    pathname === "/about.html" ||
    pathname.startsWith("/about/")
  ) {
    return "/about.html";
  }
  // BUGFIX v36 -> v37: /Download (URL cantik halaman instalasi PWA, lihat
  // htaccess rule 3c) SENGAJA tidak dimasukkan ke APP_SHELL_FILES/precache
  // — halaman ini cuma didatangi orang yang BELUM install app alias pasti
  // online, jadi tidak butuh dukungan offline. TAPI shellPath-nya tetap
  // harus dikenali di sini, karena cacheFirstNavigation() cek cache
  // SEBELUM ke jaringan sama sekali (lihat komentar di atas fungsi itu) —
  // tanpa ini, /Download ikut jatuh ke default "/index.html", dan begitu
  // index.html kepasang di cache (hampir pasti, dari kunjungan pertama ke
  // situs ini), /Download langsung disajikan sebagai Home yang SALAH walau
  // sedang online, bukan cuma pas offline. download.html memang tidak ada
  // di cache manapun (sesuai niatnya) — begitu shellPath-nya benar,
  // cache.match akan MISS, dan cacheFirstNavigation otomatis lanjut fetch
  // ke jaringan lalu menyajikan download.html yang sungguhan. Dicek
  // case-insensitive (regex /i) karena htaccess rule 3c juga pakai flag
  // [NC] (menerima /download, /Download, /DOWNLOAD, dst).
  if (/^\/download\/?$/i.test(pathname) || pathname === "/download.html") {
    return "/download.html";
  }
  return "/index.html";
}

/**
 * Cache-first untuk navigasi HTML.
 *
 * FIX v1.3.7: sebelumnya network-first — SETIAP pindah halaman (bahkan pas
 * online, bahkan file-nya sudah 100% ke-precache) selalu nunggu jaringan
 * dulu, cache cuma jadi fallback pas gagal. Selain bertentangan sama
 * prinsip "100% offline first" project ini, ini juga akar masalah nyata:
 * jeda nunggu network round-trip di setiap navigasi bikin Chrome/Android
 * (mode PWA standalone) mengira app-nya "lambat merespons", lalu nongolin
 * toolbar browser SUNGGUHAN (URL bar + tombol X + menu titik-tiga) sesaat
 * sebagai jalan keluar darurat — itu yang terlihat sebagai "kedip header
 * browser" tiap pindah halaman, BUKAN bug tampilan CSS.
 *
 * Sekarang: begitu ada di cache, LANGSUNG dipakai (instan, tanpa nunggu
 * jaringan sama sekali) — jaringan tetap jalan di BACKGROUND buat
 * memperbarui cache diam-diam (stale-while-revalidate), dipakai baru di
 * kunjungan berikutnya. Server (mis. rewrite .htaccess untuk /editor/<id>)
 * tetap ikut kepakai lewat request revalidate ini, cuma tidak lagi
 * memblokir render halaman yang sedang dibuka. Yang DICACHE tetap hanya
 * kalau path-nya persis sama dengan shell path-nya sendiri (mis.
 * /editor.html) — respons untuk URL dinamis seperti /editor/<id> TIDAK
 * disimpan satu-satu, supaya cache tidak membengkak dan supaya catatan
 * yang belum pernah dibuka online (mis. dibuat saat offline) tetap bisa
 * memakai shell yang sama. Browser tetap menampilkan URL asli
 * (/editor/<id>) di address bar walau body-nya dari cache /editor.html —
 * dari situ app.js membaca ID dari pathname seperti biasa dan memuat
 * catatannya dari IndexedDB (yang sudah tersimpan di situ sejak dibuat,
 * terlepas online/offline). Kalau belum ada di cache sama sekali (mis.
 * kunjungan pertama sebelum event "install" selesai) baru fallback nunggu
 * jaringan seperti sebelumnya.
 */
async function cacheFirstNavigation(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  const pathname = new URL(request.url).pathname;
  const shellPath = resolveShellPath(pathname);
  const cached = await cache.match(shellPath);

  // Selalu dicoba, tapi TIDAK PERNAH ditunggu kalau sudah ada versi cache
  // (fire-and-forget) — supaya navigasi yang sedang berjalan tetap instan.
  const revalidate = fetch(request)
    .then(async (fresh) => {
      if (fresh && fresh.ok) {
        // BUGFIX v34 -> v35 (lihat catatan lengkap di stripRedirectMeta()):
        // kalau seseorang navigasi LANGSUNG ke path *.html lama (mis. buka
        // bookmark/link lama /cadangkan.html), .htaccess me-redirect itu
        // ke bentuk cantiknya — fetch(request) di sini ikut mengikuti
        // redirect itu, jadi `fresh` bisa saja berstatus "redirected".
        // Response begini WAJIB dibersihkan dulu sebelum dipakai
        // menjawab navigasi ATAU disimpan ke cache (lihat pemakaiannya di
        // bawah & di install handler) — kalau tidak, Chrome menolak
        // meresponnya (net::ERR_FAILED) & cache jadi rusak permanen.
        const clean = await stripRedirectMeta(fresh);
        if (pathname === shellPath) cache.put(shellPath, clean.clone());
        return clean;
      }
      return fresh;
    })
    .catch(() => null);

  if (cached) {
    revalidate;
    return cached;
  }

  const fresh = await revalidate;
  if (fresh) return fresh;

  const fallback = await cache.match(OFFLINE_FALLBACK_PAGE);
  if (fallback) return fallback;
  return new Response(
    "<h1>Offline</h1><p>Halaman ini belum sempat tersimpan untuk mode offline.</p>",
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Hanya tangani GET — biarkan request lain (kalau ada) apa adanya.
  if (request.method !== "GET") return;

  const url = request.url;

  // Navigasi halaman (buka /, /editor.html, refresh, dsb).
  if (request.mode === "navigate") {
    event.respondWith(cacheFirstNavigation(request));
    return;
  }

  if (isSameOrigin(url)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  if (isGoogleFont(url)) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // Origin lain yang tidak dikenal (mis. CDN pihak ketiga) — biarkan lewat
  // jaringan seperti biasa, tidak dicache.
});
