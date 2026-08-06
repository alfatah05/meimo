# Build App Android Native (Capacitor + GitHub Actions)

Project meimo tetap web app statis 100% seperti sebelumnya (tidak ada build
step untuk versi web/PWA-nya). File-file di bagian ini HANYA menambahkan
lapisan pembungkus native Android di atasnya lewat [Capacitor](https://capacitorjs.com/),
tanpa mengubah cara kerja versi web/PWA sama sekali.

## Cara pakai (paling gampang — GitHub Actions)

1. Push repo ini ke GitHub (branch `main` atau `master`).
2. Buka tab **Actions** di repo → workflow **"Build Android App"** akan
   otomatis jalan tiap push, atau klik **Run workflow** untuk jalanin manual.
3. Setelah selesai (~5-10 menit), buka run-nya → bagian **Artifacts** →
   unduh:
   - `meimo-debug-apk` → `.apk` siap di-install langsung ke HP Android
     buat testing (aktifkan "Install dari sumber tidak dikenal" di HP).
   - `meimo-release-aab-unsigned` → `.aab` untuk upload ke Play Store,
     **belum ditandatangani** (lihat bagian "Signing untuk rilis" di bawah
     sebelum upload ke Play Console).

Tidak perlu install apa pun di komputer sendiri untuk cara ini — semuanya
jalan di server GitHub.

## Apa yang berubah dari project sebelumnya

- `package.json`, `capacitor.config.json`, `scripts/build-www.mjs`,
  `resources/` (icon & splash source), `.github/workflows/build-android.yml`
  — semua BARU, tidak menyentuh app web yang sudah ada.
- `src/js/pwa/native-bridge.js` — BARU, dimuat di semua 9 halaman HTML
  persis di sebelah `<script ... sw-register.js>`. Isinya cuma jalan kalau
  app dibuka di dalam shell native (`window.Capacitor` ada); di web/PWA
  biasa file ini otomatis tidak melakukan apa-apa.
- `src/js/services/backup-service.js` & `src/js/services/meimo-export.js`
  — `triggerBlobDownload()` sekarang lewat `saveOrShareBlob()` di
  `native-bridge.js`. Di web/PWA perilakunya SAMA PERSIS seperti
  sebelumnya. Alasan perubahan ini WAJIB: `<a download>` ke `blob:` URL
  (cara lama) tidak berfungsi di WebView Android — tanpa fix ini, tombol
  "Download .meimo" & "Cadangkan Semua Catatan" akan diam saja/tidak
  melakukan apa pun di app native.
- `manifest.json` versi → `1.19.0`, `service-worker.js` `CACHE_VERSION`
  → `v78`, entri baru di `README.md` → `## Changelog`, mengikuti aturan
  versioning project yang sudah ada.

**Tidak ada perubahan** ke routing pretty-URL (`/editor/<id>`, `/library`,
dst.) — itu sudah otomatis berfungsi di app native TANPA `htaccess`, karena
`service-worker.js` (`resolveShellPath()` + handler `fetch` untuk request
navigasi) memang sudah didesain untuk menyediakan fallback shell HTML yang
sama persis dengan yang dibutuhkan mode offline PWA. App native selalu
start dari `index.html` asli (bukan `/library`), lalu service worker yang
sudah aktif akan menangani semua navigasi berikutnya persis seperti saat
offline di browser.

## Kenapa folder `android/` tidak ikut di-commit

`android/` (folder proyek native Android hasil `npx cap add android`)
sengaja **tidak** disimpan di repo dan selalu dibuat ulang dari
`capacitor.config.json` setiap kali workflow jalan. Ini aman dilakukan
karena project ini tidak butuh satu pun kustomisasi kode native
(`MainActivity.java` dkk.) — semua perilaku native (tombol back, status
bar, splash, simpan/bagikan file ekspor) ditangani lewat plugin resmi
Capacitor + `native-bridge.js` di layer JS. Hasilnya repo tetap ringan.

## Plugin Capacitor yang dipasang & fungsinya

| Plugin | Untuk apa |
|---|---|
| `@capacitor/app` | Tangani tombol back hardware Android |
| `@capacitor/filesystem` + `@capacitor/share` | Ekspor `.meimo` / cadangan zip lewat lembar "Bagikan" native (karena `<a download>` tidak jalan di WebView) |
| `@capacitor/status-bar` | Warna status bar menyatu dengan tema gelap app |
| `@capacitor/splash-screen` | Splash screen native saat app dibuka |
| `@capacitor/keyboard` | Resize layout yang lebih baik saat keyboard muncul di editor |
| `@capacitor/assets` (dev) | Generate otomatis semua ukuran icon & splash Android dari `resources/icon.png` & `resources/splash.png` |

Fitur input file (unggah gambar di editor, font kustom di halaman Kelola
Font, gambar latar kartu) TIDAK butuh plugin tambahan — `<input type="file">`
sudah otomatis memicu file/camera picker native bawaan Capacitor.

## Build lokal (opsional, kalau punya Android Studio + JDK 21 terpasang)

```bash
npm install
npm run build          # -> www/
npx cap add android     # generate folder android/ (sekali saja / kalau belum ada)
npm run assets          # generate icon & splash
npx cap sync android
npx cap open android    # buka di Android Studio, atau:
cd android && ./gradlew assembleDebug
```

## Ganti App ID / nama app

Edit `appId` & `appName` di `capacitor.config.json`, lalu hapus folder
`android/` lokal (kalau ada) dan `npx cap add android` ulang — TIDAK perlu
edit file Gradle manual karena `android/` selalu di-generate fresh dari
config ini.

## Signing untuk rilis Play Store

`.aab` yang dihasilkan workflow **belum ditandatangani** (unsigned) —
Play Console tidak akan menerimanya langsung. Cara paling simpel: aktifkan
[Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
lalu tanda-tangani `.aab` ini dengan key upload sendiri sebelum di-upload
(lewat `jarsigner`/`apksigner`, atau setup keystore + `signingConfigs` di
`android/app/build.gradle` kalau mau signing otomatis di CI — butuh
menyimpan keystore sebagai GitHub Secret, tidak disiapkan di sini karena
butuh keystore milik kamu sendiri).

## Yang belum ikut dimigrasikan (opsional, follow-up)

- Asosiasi file `.meimo` (`file_handlers` di `manifest.json`) belum
  diaktifkan di Android — butuh intent-filter tambahan di
  `AndroidManifest.xml`, yang berarti butuh sedikit kustomisasi native
  (bertentangan dengan pendekatan "tanpa folder `android/` di-commit" di
  atas kalau mau permanen). Bisa ditambahkan belakangan kalau dibutuhkan.
- Bug lama "insert gambar di editor kadang gagal 3x di Android" (Chrome)
  belum tentu otomatis hilang di WebView native — perlu ditest ulang
  setelah build pertama, karena mesin render/file-picker-nya berbeda dari
  Chrome mobile.
