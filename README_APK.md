# Build APK Meimo lewat GitHub Actions

Semua sudah disiapkan supaya kamu **tidak perlu install Android Studio**.
GitHub yang build APK-nya, kamu tinggal download hasilnya.

## Apa yang berubah dari versi web

- Penyimpanan catatan & asset (gambar/musik) **tidak lagi pakai IndexedDB**,
  tapi file biasa lewat plugin `@capacitor/filesystem`, disimpan di folder
  privat app di penyimpanan eksternal Android (`Directory.External`,
  setara `Android/data/id.meimo.notes/files/meimo-data/` di HP kamu).
  - **Tidak butuh izin storage apa pun** dari user.
  - **Ikut terhapus kalau app di-uninstall** — ini sesuai pilihan kamu.
  - App tetap 100% offline (semua file HTML/CSS/JS sudah dibundel ke
    dalam APK, tidak fetch apa pun dari internet).
- File yang berubah: `src/js/db/fs-storage.js` (baru, ganti `db.js`),
  `src/js/db/notes-repository.js`, `src/js/db/fonts-repository.js`,
  `src/js/db/schema.js` (bagian IndexedDB dibuang). Editor, toolbar,
  Notes List, dst — **tidak ada yang diubah**, karena semuanya lewat
  Document Service yang sudah jadi satu-satunya pintu ke Repository.

## Langkah 1 — Push ke GitHub

```bash
git init
git add .
git commit -m "Setup Capacitor untuk build APK"
git branch -M main
git remote add origin https://github.com/<username>/<nama-repo>.git
git push -u origin main
```

## Langkah 2 — Tunggu build otomatis

Begitu ter-push ke branch `main`, workflow di
`.github/workflows/build-apk.yml` otomatis jalan (tab **Actions** di
repo GitHub kamu). Bisa juga dipicu manual: tab **Actions** →
**Build APK** → **Run workflow**.

Yang dilakukan workflow itu, urut:
1. Install Node.js 20 + JDK 21 + Android SDK.
2. `npm install` (unduh Capacitor + esbuild).
3. `npm run build` → generate folder `www/` (file statis + plugin Filesystem
   yang dibundel).
4. `npx cap add android` (generate folder `android/` dari nol tiap run).
5. `npx cap sync android` → salin `www/` ke project Android.
6. `./gradlew assembleDebug` → build APK.

## Langkah 3 — Download APK

Setelah workflow selesai (ikon centang hijau), buka run tersebut →
bagian **Artifacts** di bawah → download **meimo-debug-apk**. Isinya
`app-debug.apk`, tinggal kirim ke HP Android (lewat Google Drive, kabel USB,
dsb) lalu install (aktifkan dulu "Izinkan dari sumber ini/Unknown sources"
saat diminta).

## Catatan tentang APK debug ini

- APK ini ditandatangani pakai **debug key otomatis** dari Android SDK —
  cukup untuk kamu pakai/tes sendiri, **tidak bisa diupload ke Play Store**
  (Play Store butuh release build + keystore sendiri). Kalau nanti butuh itu,
  bilang saja, aku bantu siapkan step release + signing-nya (perlu keystore
  yang kamu simpan sendiri, tidak boleh ada di repo publik).
- Setiap kali kamu push perubahan kode, workflow build ulang otomatis —
  artifact lama tetap ada per-run, tinggal ambil yang terbaru.

## Kalau mau develop/build lokal (opsional, butuh Android Studio)

```bash
npm install
npm run build
npx cap add android      # sekali saja
npx cap sync android
npx cap open android     # buka di Android Studio, tinggal klik Run
```
