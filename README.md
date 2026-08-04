# Personal Notes PWA

**Versi: v1.7.1** (lihat [Changelog](#changelog) di bawah untuk riwayat versi)

Kerangka struktur folder untuk aplikasi PWA pencatatan pribadi (bukan markdown editor),
dibuat mengikuti `PROJECT_RULES.md`.

Status saat ini:
- Struktur folder & file lengkap (lihat `docs/ARCHITECTURE.md`).
- Token desain lengkap di `docs/DESIGN_SYSTEM.md`.
- Prototype layout statis: `index.html` (Home), `empty-state.html` (Empty State),
  `editor.html` (halaman editor).
- `editor.html` sudah pakai `contenteditable` untuk judul & isi, dengan mesin
  editor JSON (`src/js/editor/`) dan sebagian perintah format toolbar aktif
  (termasuk Font Family — lihat `font-manager.html` & `src/js/services/font-service.js`).
- Penyimpanan sudah jalan: IndexedDB (`src/js/db/`) dibungkus Repository
  layer (`notes-repository.js`), dipakai lewat Document Service
  (`src/js/services/document-service.js`). Autosave aktif di `app.js`.
  Editor **tidak pernah** membaca IndexedDB langsung — alurnya
  `Editor -> Document Service -> Repository -> IndexedDB`.

Lihat `docs/ARCHITECTURE.md` untuk penjelasan fungsi setiap file.

## Ringkasan Teknologi (sesuai PROJECT_RULES.md)
- HTML, CSS, Vanilla JavaScript (tanpa framework)
- Editor berbasis `contenteditable`
- Penyimpanan offline menggunakan IndexedDB
- Format dokumen: JSON internal aplikasi (bukan Markdown, bukan HTML mentah)
- PWA: offline, installable, manifest, service worker

## Halaman Cadangkan & Impor (`cadangkan.html`)

Semua aksi cadangkan/impor/ekspor ada di SATU halaman terpisah dari editor
(bukan tombol di topbar editor) — diakses dari FAB "Cadangkan & Impor" di
Home (`index.html`). Isinya 4 hal, masing-masing dijelaskan di bawah:
1. Tombol "Cadangkan Semua Catatan" (`backup-service.js`) — SEMUA note
   dibungkus jadi satu `.meimo` per note (LENGKAP dengan asset & kustomisasi
   tampilan, format sama persis dengan poin 4 di bawah), lalu semua
   `.meimo` itu digabung jadi SATU file `.zip`.
2. Tombol "Impor Catatan (.meimo)" (`meimo-import.js`, satu note + asset).
3. Tombol "Impor Cadangan (.zip)" (`backup-restore.js`) — SEMUA `.meimo`
   di dalam satu file `.zip` cadangan (hasil poin 1) diimpor sekaligus,
   lewat `importMeimoBytes()` yang sama dipakai poin 2. Ditolak tegas kalau
   zip yang dipilih tidak punya satu pun entry `.meimo` di dalamnya.
4. List semua catatan dengan tombol "Ekspor .meimo" per-baris
   (`meimo-export.js`, note itu SATU + asset-nya).

Logic render & wiring halaman ini ada di `src/js/notes/backup-import.js`.

## Format Ekspor `.meimo`

Satu catatan bisa diekspor jadi file `.meimo` — file ini SECARA TEKNIS adalah
zip biasa, cuma ekstensinya di-custom (pola yang sama dipakai `.docx`,
`.epub`, `.apk`, dst — semuanya "zip yang di-rename"). `.meimo` mewakili
SATU catatan, DENGAN asset-nya, supaya catatan itu bisa dipindah utuh ke
perangkat/app lain dan tetap lengkap.

`backup-service.js` (`exportAllNotes()`, tombol "Cadangkan Semua Catatan")
memakai format `.meimo` yang SAMA PERSIS untuk SETIAP note (lewat
`buildMeimoZipBytes()` yang diekspor `meimo-export.js`, dipakai ulang biar
tidak ada assembly logic yang digandakan), lalu membungkus semua `.meimo`
itu jadi satu file `.zip` luar berisi:
```
catatan-cadangan-2026-08-04.zip
├── backup-manifest.json   (formatVersion, exportedAt, daftar file .meimo)
├── Catatan Pertama.meimo
├── Catatan Kedua.meimo
└── ...                    (dst, satu .meimo per note, nama dari judulnya —
                             ditambah " (2)", " (3)" dst kalau ada judul
                             yang sama persis setelah disanitasi)
```
Restore dari file `.zip` ini bisa lewat tombol "Impor Cadangan (.zip)"
(`backup-restore.js`) — semua `.meimo` di dalamnya diimpor sekaligus dalam
satu klik. Unzip manual lalu Impor tiap `.meimo` satu-satu lewat tombol
"Impor Catatan (.meimo)" tetap bisa dipakai juga kalau mau (lihat bagian
"2. Impor" di bawah untuk status Import selengkapnya).

### 1. Ekspor — status: ✅ diimplementasikan (`src/js/services/meimo-export.js`)

- Dipanggil dengan `document` hasil `loadNote(id)` (Document Service) —

  BUKAN `state.getDocument()` lagi, karena sejak fitur ini pindah ke
  halaman Cadangkan & Impor, tidak ada lagi editor/state di memori untuk
  note yang dipilih dari list.
- Scan `document.blocks` (block `image`), `document.music` (per
  scene/divider/root), DAN `document.metadata.cardStyle.bgImageAssetId`
  (gambar latar kustomisasi kartu, lihat `notes/card-style.js`) buat
  kumpulin `assetId` yang BENAR-BENAR dirujuk — sengaja bukan
  `getAssetsByNoteId()`, supaya asset "yatim" (bekas gambar yang sudah
  dihapus dari editor tapi record binernya masih nyangkut di IndexedDB,
  lihat catatan di `commands.js` `removeImageBlock()`) tidak ikut kebawa ke
  file ekspor.
- `document.titleStyle` (style judul) & `document.metadata.cardStyle`
  (kustomisasi kartu selain gambar latar: font judul, bentuk edge, warna
  latar) tidak butuh perlakuan khusus di sini — keduanya bagian dari
  `document` yang diserialisasi apa adanya, jadi otomatis ikut terbawa.
- Susun struktur zip:
  ```
  document.meimo  (zip)
  ├── document.json
  └── assets/
      ├── <assetId>.<ext sesuai mimeType>
      └── ...
  ```
- Isi `document.json`:
  ```json
  {
    "meimoExport": { "formatVersion": 1, "exportedAt": "...", "app": "meimo" },
    "document": { /* seluruh model dokumen apa adanya, lihat DOCUMENT_MODEL.md */ },
    "assets": [
      { "assetId": "...", "file": "assets/xxx.png", "mimeType": "image/png" }
    ]
  }
  ```
  `assets` adalah manifest eksplisit (bukan cuma nebak dari isi
  `blocks`/`music`) — dipakai Import buat tahu persis mana yang harus
  di-assign ulang ID barunya & disambungkan lagi ke block/music yang
  merujuknya.
- Zip dibangun murni vanilla JS lewat `src/js/utils/zip-writer.js` (TANPA
  dependency eksternal/CDN, konsisten dengan prinsip project 100%
  offline-first) — method kompresi selalu **STORE** (tanpa DEFLATE), karena
  isi utama file `.meimo` (gambar/audio) sudah terkompresi formatnya
  sendiri, jadi DEFLATE ulang nyaris tidak menghemat apa-apa, sementara
  STORE jauh lebih sederhana & konsisten lintas browser.
- Nama file unduhan: `<judul catatan, sudah disanitize>.meimo`.
- Tombol "Ekspor .meimo" ada per-baris di list catatan halaman Cadangkan &
  Impor, BUKAN di topbar editor.

### 2. Impor — status: ✅ diimplementasikan (`src/js/services/meimo-import.js`)

- User pilih file lewat tombol "Impor Catatan (.meimo)" di halaman
  Cadangkan & Impor → dibaca lewat `src/js/utils/zip-reader.js` (pasangan
  `zip-writer.js`, sama-sama vanilla JS tanpa dependency — dukung method
  STORE *dan* DEFLATE lewat `DecompressionStream` bawaan browser, jaga-jaga
  kalau ada zip dari tool lain) → parse `document.json`.
- `meimoExport.formatVersion` WAJIB persis sama dengan versi yang dikenal
  app saat ini (`MEIMO_FORMAT_VERSION` di `meimo-export.js`) — beda dari
  `document.schemaVersion` yang itu versi struktur dokumen internal app
  (`db/schema.js` `DOCUMENT_SCHEMA_VERSION`). Tidak cocok → ditolak tegas
  dengan pesan jelas, bukan dipaksa lanjut menebak struktur.
- **Remap ID**: `document.id` SELALU diganti UUID baru (jangan pernah pakai
  apa adanya dari file, supaya tidak tabrakan/menimpa note lain yang
  kebetulan id-nya sama). Tiap `assetId` di manifest `assets` juga diganti
  baru — tapi BUKAN digenerate manual duluan, melainkan hasil balikan
  `saveImageAsset()` yang sesungguhnya (jalur yang SAMA dengan upload
  gambar/musik biasa), lalu dipetakan `assetId lama -> assetId baru` buat
  cari-ganti referensi di `blocks`/`music`. Block `id` & `sceneId` DI DALAM
  dokumen TIDAK perlu diganti — itu cuma unik dalam lingkup satu dokumen,
  bukan lintas note.
- `metadata` status per-device (pin/arsip/sampah) di-reset total, TIDAK
  dibawa dari file — status itu sifatnya per-device, bukan sesuatu yang
  masuk akal dibawa lintas device. `metadata.cardStyle` (kustomisasi kartu)
  BEDA CERITA: itu preferensi tampilan milik note-nya sendiri, jadi TETAP
  DIBAWA — termasuk `bgImageAssetId`-nya, yang disambungkan ulang lewat peta
  `assetId lama -> assetId baru` yang sama dipakai block `image`/`music` di
  atas (lihat `remapCardStyle()` di `meimo-import.js`).
- `document.titleStyle` (style judul) juga ikut dibawa apa adanya —
  sebelumnya field ini tidak disalin sama sekali ke note hasil import
  (bug), sudah diperbaiki.
- Font kustom (Font Manager) **tidak dibundle** di dalam `.meimo` — cuma
  nama font-nya yang tersimpan di `document.json`. Kalau font itu belum
  ter-install di device tujuan, tampilannya fallback ke font default (font
  kustom TIDAK termasuk lingkup file ini).
- File cadangan `.zip` dari `exportAllNotes()`/"Cadangkan Semua Catatan"
  sekarang punya jalur "impor sekaligus semua isi zip" lewat tombol
  "Impor Cadangan (.zip)" (`backup-restore.js`, `importMeimoBackupZip()`) —
  dibaca dulu lewat `readZipEntries()` (zip LUAR), tiap entry yang namanya
  berakhiran `.meimo` di dalamnya lalu diimpor satu-satu lewat
  `importMeimoBytes()` (fungsi inti yang sama dipakai `importMeimoFile()`
  di atas, cuma terima bytes langsung alih-alih `File`, supaya tidak ada
  logic parsing/remap ID yang digandakan). Kalau zip yang dipilih user
  ternyata TIDAK punya satu pun entry `.meimo` di dalamnya, ditolak tegas
  sebelum menulis apa pun ke IndexedDB — mencegah user yang salah pilih
  `.zip` sembarangan berakhir dengan hasil ambigu. Kegagalan pada satu
  entry (mis. salah satu `.meimo` korup) tidak menggagalkan entry lain —
  hasilnya tetap "sebagian berhasil" dengan ringkasan jumlah gagal
  ditampilkan ke user, bukan semua-atau-tidak-sama-sekali. Unzip manual
  lalu Impor satu-satu lewat tombol "Impor Catatan (.meimo)" tetap bisa
  dipakai juga kalau mau.

### 3. Custom ekstensi di `manifest.json` — status: ✅ registrasi awal, ⏳ belum "hidup" otomatis

`file_handlers` sudah didaftarkan di `manifest.json`, action-nya ke
halaman Cadangkan & Impor (bukan ke editor):
```json
"file_handlers": [
  { "action": "/cadangkan.html", "accept": { "application/x-meimo+zip": [".meimo"] } }
]
```
Efeknya nanti (di device yang sudah install PWA ini, browser Chromium):
file `.meimo` bisa di-double-click dari file manager → langsung buka
`/cadangkan.html`. **Baru registrasi saja** — belum benar-benar "nyambung"
otomatis, karena masih perlu `window.launchQueue.setConsumer(...)` dipasang
di `backup-import.js` buat benar-benar menangkap file yang di-double-click
dan memanggil `importMeimoFile()` dengannya (belum ada — untuk sekarang
Impor selalu lewat pilih-file manual via tombol). Safari/iOS juga belum
dukung `file_handlers` sama sekali — di situ pengalamannya tetap "download
file `.meimo` biasa", tidak ada auto-open; user tetap bisa Impor manual
lewat tombol seperti biasa di `cadangkan.html`.



## Changelog

Penomoran versi mengikuti [SemVer](https://semver.org/lang/id/) — format
`MAJOR.MINOR.PATCH`:
- **MAJOR**: perubahan besar yang tidak kompatibel/mengubah total cara pakai.
- **MINOR**: fitur baru yang tetap kompatibel dengan versi sebelumnya.
- **PATCH**: perbaikan bug atau penyesuaian kecil (mis. tweak tampilan),
  tanpa fitur baru.

Setiap ada perubahan yang di-deploy, versi di `manifest.json` (field
`"version"`) HARUS dinaikkan sesuai aturan di atas, dan ditambahkan satu
entri baru di bawah ini (versi terbaru paling atas).

### v1.7.1
- **Topbar editor, color bar level-3** (Warna Teks/Highlight,
  `.color-picker-bar`, `src/css/layout.css`): tambah `padding-top`
  (`var(--space-xs)`, 4px). Sebelumnya `padding-top: 0` bikin bagian atas
  outline ring swatch aktif (`.color-bar__swatch.is-active`, outline 2px +
  outline-offset 2px = menonjol 4px) ke-clip oleh baris ini sendiri —
  `overflow-x: auto` di elemen yang sama otomatis memaksa `overflow-y`
  ikut ke-clip juga, jadi potongan ring itu kelihatan seperti "ketutup"
  baris child bar level-2 (`.toolbar-child-bar`) tepat di atasnya, padahal
  cuma ke-crop. Padding baru menyediakan ruang di dalam baris itu sendiri
  supaya ring aktif ikut lolos ter-render penuh.
- **Bottom sheet Sisipkan Musik** (`src/js/toolbar/music-sheet.js`):
  rapikan layout & hapus dua baris teks yang cuma makan tempat tanpa
  nambah info baru — judul (\"Sisipkan Musik\"/\"Musik\") dan subjudul
  (\"Menempel di: Root Editor/Divider/Scene\") dihapus (beda dari
  image-sheet.js/scene-sheet.js yang masih pakai judul masing-masing,
  perubahan ini KHUSUS sheet musik). Section \"Berkas Musik\" (label +
  kotak nama berkas) dan tombol \"Pilih Lagu\" — sebelumnya dua section
  terpisah dengan jarak ganda — digabung jadi SATU section supaya
  tampil sebagai satu kelompok yang rapat, bukan dua blok mengambang
  sendiri-sendiri (`src/css/music.css`, class baru
  `.music-sheet__upload-btn` buat jarak atas tombolnya di dalam section
  gabungan itu).
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v50 -> v51).

### v1.7.0
- **Fitur baru: note bawaan di kunjungan pertama.** File `.meimo` bawaan
  ditaruh di folder baru `assets/default-notes/`
  (`Welcome_to_Meimo.meimo`) — begitu user baru pertama kali buka Home
  (IndexedDB masih kosong/belum pernah di-seed di device ini), file ini
  otomatis diimpor jadi catatan pertama lewat `importMeimoBytes()`
  (`services/meimo-import.js`), jalur yang sama dipakai tombol "Impor
  Catatan (.meimo)" manual.
  - File baru `src/js/notes/seed-default-notes.js` —
    `seedDefaultNotesIfNeeded()` dipanggil dari `notes-list.js` sebelum
    render pertama Home. Ditandai SEKALI seumur device lewat
    `localStorage` (key `meimo:defaultNotesSeeded`), termasuk kalau
    importnya gagal — supaya note bawaan tidak pernah muncul balik
    sendiri hanya karena user menghapus semua notenya sendiri.
  - Nambah note bawaan lain ke depannya cukup taruh file `.meimo`-nya di
    `assets/default-notes/` lalu tambahkan pathnya ke array
    `DEFAULT_NOTE_PATHS` di `seed-default-notes.js`.
  - `service-worker.js`: `assets/default-notes/Welcome_to_Meimo.meimo`
    & `src/js/notes/seed-default-notes.js` ditambah ke precache list
    supaya seeding tetap jalan biarpun user buka app pertama kali dalam
    kondisi offline (setelah PWA ter-install). Cache version dinaikkan
    v49 -> v50.

### v1.6.0
- **Fitur baru: shortcut "Reset Aplikasi"** di halaman Tentang
  (`about.html`) — double-click logo app di bagian atas halaman memicu
  dialog konfirmasi, lalu (kalau dikonfirmasi) unregister semua Service
  Worker + hapus semua Cache Storage + hard-navigate ke Home
  (`/index.html`). Berguna buat debug/troubleshoot kalau app-shell yang
  ke-cache Service Worker "nyangkut" di versi lama.
  - File baru `src/js/pwa/factory-reset.js` — dipasang cuma di
    `about.html`, lewat `dblclick` di `.about-hero__icon` (bukan single
    click, supaya tidak kepencet tidak sengaja) + `confirmDialog()`
    (komponen yang sama dipakai aksi destruktif lain seperti hapus
    permanen dari Sampah) sebelum benar-benar jalan.
  - **SENGAJA TIDAK menyentuh IndexedDB** — ini reset cache/PWA-shell
    saja, catatan user TIDAK ikut terhapus. Pesan di dialog konfirmasi
    menyebutkan ini secara eksplisit supaya tidak disalahpahami sebagai
    "hapus semua data".
  - `src/css/about.css`: `.about-hero__icon` ditambah
    `-webkit-user-drag: none; user-select: none;` supaya double-click
    cepat di logo tidak kena drag-ghost/selection highlight browser.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v48 -> v49);
  `src/js/pwa/factory-reset.js` ditambahkan ke precache list.

### v1.5.0
- **Fitur baru: "Impor Cadangan (.zip)"** di halaman Cadangkan & Impor —
  impor SEKALIGUS semua `.meimo` di dalam satu file `.zip` cadangan (hasil
  tombol "Cadangkan Semua Catatan"), tidak perlu lagi unzip manual & impor
  satu-satu. Detail implementasi & lokasi file ada di README bagian
  "Halaman Cadangkan & Impor" (poin 3) dan "Format Ekspor `.meimo`" §2.
  - File baru `src/js/services/backup-restore.js`
    (`importMeimoBackupZip()`) — baca zip luar lewat `zip-reader.js`,
    filter entry yang namanya berakhiran `.meimo`, tiap entry diimpor lewat
    fungsi inti `importMeimoBytes()` (baru, hasil pecah dari
    `importMeimoFile()` di `meimo-import.js` — sama-sama dipakai jalur
    impor satuan & jalur impor-dari-dalam-zip ini, tidak ada logic
    parsing/remap ID yang digandakan).
  - **Validasi**: kalau zip yang dipilih user tidak punya satu pun entry
    `.meimo` di dalamnya, ditolak tegas (pesan jelas, tidak ada yang
    ditulis ke IndexedDB) — mengantisipasi user salah pilih file `.zip`
    sembarangan yang bukan hasil "Cadangkan Semua Catatan".
  - Kegagalan pada satu entry `.meimo` (mis. korup) tidak menggagalkan
    entry lain — proses tetap lanjut ke entry berikutnya, hasil akhirnya
    ringkasan "N dari M berhasil (X gagal)" ditampilkan lewat toast,
    bukan semua-atau-tidak-sama-sekali.
  - `cadangkan.html`: tombol baru "Impor Cadangan (.zip)" (`accept=".zip"`)
    ditaruh di bawah tombol "Impor Catatan (.meimo)" yang sudah ada, dalam
    `.backup-actions` yang sama (styling dipakai ulang dari
    `backup-import.css`, tidak ada CSS baru).
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v47 -> v48);
  `src/js/services/backup-restore.js` ditambahkan ke precache list.

### v1.4.0
- **Ubah format "Cadangkan Semua Catatan"** (`backup-service.js`,
  `exportAllNotes()`): sebelumnya ekspor JSON polos semua note sekaligus,
  TANPA asset (gambar/musik/gambar-latar-kartu tidak ikut terbawa).
  Sekarang tiap note dibungkus jadi `.meimo` masing-masing — format yang
  SAMA PERSIS dengan tombol "Ekspor .meimo" per-baris (LENGKAP dengan
  asset & kustomisasi tampilan) — lalu semua `.meimo` itu digabung jadi
  SATU file `.zip` (`catatan-cadangan-<tanggal>.zip`), plus
  `backup-manifest.json` berisi metadata cadangan (formatVersion,
  exportedAt, daftar file).
  - `meimo-export.js`: logic assembly zip `.meimo` dipecah jadi fungsi baru
    `buildMeimoZipBytes(doc)` (bytes zip saja, tanpa memicu unduhan) —
    dipakai ulang oleh `backup-service.js` supaya format `.meimo` yang
    dihasilkan kedua jalur ekspor PERSIS sama, tidak ada logic yang
    digandakan. `safeFileNameFromTitle()` juga diekspor untuk alasan yang
    sama (penamaan file konsisten).
  - Nama entry `.meimo` di dalam zip dibuat unik kalau ada beberapa note
    dengan judul yang sama persis setelah disanitasi (ditambah akhiran
    " (2)", " (3)" dst, sama seperti pola rename file manager).
  - Restore dari `.zip` ini masih MANUAL: unzip filenya, lalu Impor tiap
    `.meimo` di dalamnya satu-satu lewat tombol "Impor Catatan (.meimo)"
    yang sudah ada — belum ada jalur "impor sekaligus semua isi zip".
  - Teks & komentar di `cadangkan.html`/`backup-import.js` disesuaikan
    (tidak lagi menyebut "file JSON").
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v46 -> v47).

### v1.3.21
- Fix bug: skeleton loading di Home (`#homeSkeleton`, `index.html`) tidak
  ikut menutupi proses load font kustom — `boot()` di `notes-list.js`
  sudah benar nunggu `Promise.all([ensureInstalledFontsLoaded(),
  refreshData()])`, TAPI `render()` (yang menyembunyikan skeleton) dipanggil
  dari DALAM `refreshData()` sendiri, bukan setelah `Promise.all`-nya
  selesai. Baca metadata note dari IndexedDB (`refreshData`) hampir selalu
  jauh lebih cepat daripada decode font kustom jadi `FontFace`
  (`ensureInstalledFontsLoaded`), jadi urutan nyatanya: `refreshData()`
  selesai duluan → skeleton kehapus & note card yang judulnya pakai font
  kustom (`metadata.cardStyle.titleFont`) sempat ke-paint pakai font
  fallback dulu → beberapa saat kemudian font kustom baru kelar dimuat →
  card "meloncat" ganti ke font asli, padahal skeleton-nya sudah hilang
  jadi loncatan itu kelihatan jelas oleh user.
  - Fix: `refreshData()` sekarang HANYA fetch data (tidak lagi manggil
    `render()`); `render()` dipindah ke `boot()`, dipanggil sekali setelah
    `Promise.all` KEDUA promise (data & font) benar-benar selesai —
    skeleton jadi nutupin loading data MAUPUN font kustom sekaligus, baru
    hilang atomically bareng note card yang sudah pasti pakai font final.
  - Callback `initRefreshOnRestore()` (dipakai buat refresh data saat
    halaman dipulihkan dari bfcache lewat back HP) diganti dari
    `refreshData` ke `refreshAndRender()` (fetch + render) yang baru,
    supaya tetap fetch+render seperti sebelumnya — font kustom TIDAK
    perlu dimuat ulang di jalur ini karena state `document.fonts` ikut
    dipulihkan utuh oleh bfcache.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v45 -> v46).

### v1.3.20
- Halaman Tentang (`about.html`): hapus semua strip panjang (em dash `—`)
  dari teks yang tampil ke user (judul tab, paragraf deskripsi, daftar
  fitur, footer) — diganti tanda baca biasa (titik dua/koma) sesuai
  konteks kalimat supaya tetap enak dibaca.
- Halaman Tentang: judul bagian "Dibuat Oleh" diganti jadi "Kontributor".
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v44 -> v45).

### v1.3.19
- Fix (nyata kali ini): **skeleton loading di halaman editor (`.editor-skeleton`)
  tetap tidak pernah kelihatan** meski sudah "diperbaiki" di v1.3.18 —
  penyebab v1.3.18 (durasi tampil kelewat cepat) memang nyata, tapi ada
  bug lain yang lebih mendasar dan belum ketahuan sampai dicek langsung
  lewat headless browser (bukan cuma baca CSS): overlay skeleton
  (`.editor-skeleton.skeleton-overlay`, `position:absolute; inset:0`)
  butuh `.note-content` (containing block-nya) untuk punya tinggi >0
  selama loading — dipasang lewat `min-height: 100%`. Persentase itu
  **tidak pernah resolve** di semua browser yang dicoba: `.note-content`
  adalah block child biasa (bukan flex item) dari `.note-scroll-area`,
  dan persentase height butuh containing block dengan tinggi
  "specified" eksplisit — bukan cuma hasil hitungan `flex:1` dua level
  di atas (`.note-page`). Akibatnya `.note-content` kolaps ke tinggi 0
  pas loading (title/body `display:none`, skeleton-nya sendiri
  `position:absolute` jadi keluar dari flow), overlay-nya ikut kolaps ke
  0×0 — skeleton tidak pernah ke-paint ke layar sama sekali, terlepas
  dari durasi tampilnya, karena memang tidak punya ukuran apa pun.
  - Fix: pindahkan `position: relative` (containing block overlay) dari
    `.note-content` ke `.note-scroll-area` (`src/css/layout.css`) —
    ancestor yang tingginya sudah pasti definitif dari `flex: 1`, tanpa
    lewat rantai percentage-height yang rapuh. CSS positioning tidak
    mengharuskan containing block jadi parent langsung di DOM, jadi
    tidak perlu ubah struktur HTML/JS sama sekali.
  - Ikutan fix: `.editor-skeleton` diberi `padding` eksplisit
    (`src/css/skeleton.css`) menyamai padding `.note-scroll-area` —
    sebelumnya `padding: inherit` di `.skeleton-overlay` menyalin
    padding dari parent DOM (`.note-content`, yang memang 0), bukan dari
    containing block barunya, jadi tanpa fix ini baris pertama skeleton
    akan ketutup topbar mengambang (`position:fixed`).
  - Sudah diverifikasi ulang dengan headless Chrome: overlay skeleton
    sekarang benar-benar ke-paint (punya ukuran & posisi yang benar,
    sejajar dengan `#editorTitle`/`#editorBody` sungguhan) selama
    `.note-content.is-loading` aktif, dan perilaku scroll editor untuk
    catatan panjang tidak berubah sama sekali dibanding sebelumnya.
- `manifest.json` `version` & `CACHE_VERSION` di `service-worker.js`
  dinaikkan (v43 -> v44).

### v1.3.18
- Fix: **skeleton loading di halaman editor (`.editor-skeleton`) nyaris
  tidak pernah kelihatan** — `boot()` (`src/js/app.js`) melepas class
  `.is-loading` begitu 2 `await`-nya selesai
  (`ensureInstalledFontsLoaded()`, `documentService.loadNote()`), yang
  keduanya baca dari cache/IndexedDB lokal dan biasanya kelar dalam
  hitungan beberapa milidetik — seringkali LEBIH CEPAT dari satu frame
  render browser, jadi skeleton kehapus dari DOM sebelum sempat benar-benar
  ke-paint ke layar sama sekali (bukan bug CSS/wiring — keduanya sudah
  benar sejak v1.3.13, cuma durasi tampilnya yang nyaris nol).
  - Fix: tambah `MIN_SKELETON_VISIBLE_MS` (220ms) — waktu mulai `boot()`
    dicatat (`performance.now()`), dan pelepasan `.is-loading` ditunda
    (kalau perlu) sampai durasi itu terlampaui. Kalau loading-nya sendiri
    sudah lebih lambat dari 220ms (device lambat/banyak font kustom), TIDAK
    ada tambahan delay sama sekali — cuma menjamin batas bawah, bukan
    menambah delay tetap ke semua kondisi.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v42 -> v43).

### v1.3.17
- **Skeleton loading Home (`index.html`) dibuat lebih akurat mengikuti
  layout kartu asli** (`.home-skeleton__pinned-card`/`.home-skeleton__card`,
  `src/css/skeleton.css`) — dua ketidaksesuaian dengan kartu sungguhan
  (`note-card.js`) diperbaiki:
  - Header kartu (baris judul) sebelumnya cuma satu bar polos memanjang;
    sekarang ditambah placeholder bulat di kanan (28px untuk grid card,
    22px untuk pinned card, meniru `.note-card__menu-btn`/
    `.pinned-card__menu-btn` persis ukurannya) — karena tombol menu
    titik-tiga SELALU dirender di kartu asli (`notes-list.js` selalu
    memberi `onTrash`/`onTogglePin` ke `createNoteCard()`/
    `createPinnedCard()`), sebelumnya bar judul skeleton jadi kelihatan
    lebih lebar dari kartu sungguhan yang bakal menggantikannya.
  - Footer kartu (grid, bukan pinned) sebelumnya 2 skeleton-bar dengan
    `justify-content: space-between` — padahal `.note-card__footer` di
    kartu asli cuma berisi SATU `<span>` (teks "Diubah ...", rata kiri).
    Diganti jadi satu bar saja.
  - Skeleton kartu pinned tidak lagi punya `height: 84px` tetap — kartu
    pinned asli tingginya mengikuti isi (judul + snippet + padding), jadi
    skeleton-nya dibiarkan menyesuaikan tinggi konten juga, bukan
    dipatok satu angka.
- Editor.html sudah punya skeleton loading sejak v1.3.13
  (`.editor-skeleton`, dipasang lewat class `.is-loading` di
  `.note-content`, lihat `app.js` `boot()`) — dicek ulang, sudah jalan
  dengan benar dan proporsinya (tinggi baris 13px + gap 14px = 27px,
  cocok dengan `line-height` sungguhan `.note-body-field` yaitu
  `18px * var(--leading-snug) 1.5`), jadi tidak ada perubahan di halaman
  ini pada rilis ini.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v41 -> v42).

### v1.3.16
- Fix: pratinjau di halaman Customisasi Kartu (`card-style.html`) sekarang
  lebarnya SAMA PERSIS dengan lebar kartu asli di Notes List (`.notes-grid`)
  — sebelumnya dibatasi `max-width: 280px` tetap di semua ukuran layar,
  jadi tidak akurat mewakili lebar kartu sungguhan yang ikut kolom grid
  responsif (1 kolom di layar sempit, 2/3 kolom di layar lebih lebar).
  `.card-style-preview` sekarang pakai `grid-template-columns` yang sama
  persis dengan `.notes-grid` (lihat `src/css/notes-list.css`), sehingga
  kartu pratinjau (satu-satunya child, jatuh ke kolom pertama) otomatis
  dapat lebar yang identik di breakpoint manapun.
- Fitur baru: skeleton loading di halaman Customisasi Kartu — sebelumnya
  halaman ini kelihatan kosong sesaat (kedip putih) selagi `boot()`
  (`src/js/notes/card-style.js`) menunggu `loadNote()` dan
  data font (IndexedDB) sebelum sempat merender apa pun. Bentuknya sengaja
  DIBEDAKAN dari skeleton grid kartu (Home) maupun skeleton baris list
  generik (Font Library/Cadangkan/Sampah) — dibuat mengikuti layout ASLI
  halaman ini section per section (Pratinjau, Font Judul, Bentuk Edge,
  Warna Latar, Gambar Latar), termasuk pratinjau kartunya sendiri yang
  ikut memakai grid kolom responsif yang sama seperti fix di atas.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v40 -> v41).

### v1.3.15
- **Fitur baru: toggle "Set as Current Style"** — tombol icon-only (tanpa
  label, icon bintang/pin) di paling kanan child bar Text & Style. Saat
  aktif, format yang lagi berlaku di posisi kursor (Bold/Italic/Underline/
  Strikethrough/Font/Font Size/Warna Teks/Highlight, PLUS Line Height &
  Letter Spacing) **tidak ikut reset saat user menekan Enter** — baris baru
  hasil Enter langsung melanjutkan gaya yang sama, bukan balik ke default.
  Perataan Teks sudah otomatis ikut terbawa dari dulu (tidak terkait
  toggle ini) — Heading tetap TIDAK ikut terbawa (baris baru selalu jadi
  paragraph/lanjutan list biasa, sama seperti editor lain Notion/Google
  Docs), begitu juga Link (properti Insert, bukan Text/Style, jadi
  sengaja dikecualikan biar link tidak "menular" tanpa disengaja ke
  kalimat berikutnya).
  - SATU state dibagi DUA tombol (`btnKeepStyleText` & `btnKeepStyleStyle`)
    — toggle ini cuma ada di child Text & Style (bukan List/Block/Insert,
    sesuai scope-nya), tampilannya selalu disinkronkan bareng supaya
    gampang diakses dari kelompok mana pun yang sedang dibuka. Murni
    preferensi UI sesi berjalan (`keepStyleOnEnter`, `editor-state.js`) —
    TIDAK disimpan ke document/JSON, TIDAK ikut undo/redo, reset tiap
    buka ulang catatan.
  - Implementasi: `handleEnter()` (`editor.js`) — saat toggle aktif, ambil
    format efektif di kursor (`effectiveMarksAtCollapsedCaret()`, baru
    diekspor dari `commands.js`) SEBELUM block displit, lalu terapkan ke
    block baru lewat DUA jalur sekaligus (saling melengkapi, bukan
    duplikat): langsung ke `marks` run kosong hasil split (kalau splitnya
    persis di ujung teks) SEKALIGUS `state.setPendingMarks()` (jalur yang
    sama dipakai toolbar klik format saat kursor collapsed) — supaya tetap
    benar walau `pendingMarks` sempat kehapus duluan oleh event caret-move
    lain sebelum sempat mengetik apa pun.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v39 -> v40).

### v1.3.14
- **Highlight nilai yang lagi aktif di SEMUA dropdown & color bar level-3
  topbar editor** (Heading, Font Family, Font Size, Perataan Teks, Line
  Height, Letter Spacing, Warna Teks, Highlight) — sebelumnya cuma Line
  Height & Letter Spacing yang punya highlight item aktif (`.is-active`),
  sisanya cuma update teks label tombol tanpa nunjukin pilihan yang lagi
  dipakai di dalam daftarnya sendiri.
  - Heading: item level heading (termasuk "Paragraf") yang cocok dengan
    block kursor sekarang dikasih `.toolbar-panel__item.is-active`.
  - Font Family & Font Size: sama, ditambah nilai default (Inter / 16px,
    atau 48px khusus saat mode judul) ikut di-highlight walau markanya
    `null` (belum di-override eksplisit).
  - Perataan Teks: item align yang cocok di-highlight sejak panel dibuka
    (sebelumnya cuma ikon tombol trigger yang berubah, daftar di
    dropdownnya sendiri tidak pernah nunjukin mana yang aktif).
  - Warna Teks & Highlight (`color-picker.js`/`highlight-picker.js`, style
    `.color-bar__swatch.is-active` di `toolbar.css` sudah ada sebelumnya
    tapi belum pernah dipasang lewat JS): swatch yang cocok dikasih
    outline aksen, termasuk swatch "Default"/"Tanpa Highlight" (nilai
    `null`). Kalau warna aktif hasil pilihan kustom (bukan salah satu
    preset), wrapper "Kustom"-nya yang di-highlight, dan `<input
    type="color">`-nya ikut disamakan nilainya.
  - Semuanya baca dari sumber yang sama dengan update label tombol
    (`toolbar-state-sync.js` `collectMarksInSelection()`/`title-style.js`),
    jadi otomatis ikut ter-update tiap kursor/seleksi pindah atau saat
    fokus masuk/keluar judul — tidak ada listener baru yang ditambahkan.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v38 -> v39).

### v1.3.13
- **Redesain skeleton loading jadi OVERLAY penuh** — dipakai di semua
  halaman yang punya skeleton (index.html, trash.html, font-manager.html,
  cadangkan.html, editor.html).
  - Sebelumnya: skeleton cuma elemen biasa di alur dokumen (in-flow). Kalau
    ada bagian HTML LAIN di halaman yang sama yang sudah selesai dimuat
    lebih dulu — mis. section "Font Bawaan" di halaman Kelola Font
    (datanya sinkron/hardcoded, tidak pernah nunggu apa pun) atau tombol
    "Cadangkan Semua Catatan"/"Impor" statis di halaman Cadangkan & Impor
    — bagian itu ikut kepakai ruang di ATAS skeleton, jadi skeleton-nya
    kedorong turun alih-alih menutup dari paling atas, dan bagian yang
    sudah kel-load itu sempat kelihatan padahal halaman belum lengkap.
  - Sekarang: skeleton jadi overlay `position:absolute` (`inset:0`, class
    baru `.skeleton-overlay` di `skeleton.css`) yang menutup SELURUH area
    konten — termasuk bagian yang sudah lebih dulu selesai dirender —
    kecuali header/topbar (tetap kelihatan seperti biasa selama loading).
    Container konten (`.home-content` untuk index/trash/font-manager/
    cadangkan, `.note-content` untuk editor — lihat `layout.css`) dibikin
    `position: relative` sebagai containing block-nya, dan dijamin minimal
    setinggi viewport yang tersisa di bawah header/topbar (`flex: 1` /
    `min-height: 100%`), jadi overlay tetap menutup penuh sampai ke bawah
    layar walau kontennya sendiri masih pendek/kosong.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v37 -> v38).

### v1.3.12
- **Bugfix: `/Download` (URL cantik halaman instalasi PWA) disajikan
  sebagai Home, bukan halaman download-nya sendiri — kejadian walau
  sedang ONLINE**, begitu `/index.html` kepasang di cache (hampir pasti
  terjadi dari kunjungan pertama ke situs ini).
  - Akar masalah: `resolveShellPath()` (`service-worker.js`) belum
    mengenal pola `/Download` sama sekali, jadi jatuh ke default
    `/index.html`. Karena navigasi di service worker ini cache-first
    (cek cache SEBELUM ke jaringan, lihat `cacheFirstNavigation()`),
    begitu `/index.html` ada di cache, `/Download` langsung disajikan
    dari situ — salah — tanpa sempat coba ke jaringan sama sekali.
  - `download.html` sendiri **tetap sengaja tidak** ditambah ke
    `APP_SHELL_FILES`/precache — halaman ini cuma didatangi orang yang
    belum install app (pasti online), jadi tidak perlu dukungan offline.
  - Fix: tambah pengecekan `/Download` (case-insensitive, sesuai flag
    `[NC]` di `htaccess` rule 3c) di `resolveShellPath()` supaya
    `shellPath`-nya benar → cache MISS (karena memang tidak di-precache)
    → otomatis lanjut fetch ke jaringan → `download.html` yang
    sungguhan tersaji.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v36 -> v37).

### v1.3.11
- **Bugfix: semua URL cantik BARE (tanpa `.html` & tanpa apa-apa lagi di
  belakangnya) tersaji sebagai Home, bukan halamannya sendiri** — kejadian
  di `/trash`, `/font-manager`, `/cadangkan`, `/about`, dan `/editor` tanpa
  id (dipicu tombol "Catatan Baru").
  - Akar masalah: tiap kondisi di `resolveShellPath()` (`service-worker.js`)
    cuma cek bentuk `"/xxx.html"` (persis) atau `"/xxx/..."` (ada `/` di
    belakang) — tidak ada satupun yang cocok untuk bentuk bare `"/xxx"`
    polos, padahal `htaccess` (rule 2b & 3d-3g) justru mengizinkan bentuk
    itu. Akibatnya kelima path itu selalu jatuh ke default `/index.html` di
    baris paling bawah fungsi tersebut.
  - Fix: tambah pengecekan `pathname === "/xxx"` di kelima kondisi terkait
    (`/editor`, `/trash`, `/font-manager`, `/cadangkan`, `/about`).
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v35 -> v36).

### v1.3.10
- **Bugfix KRUSIAL (regresi dari v1.3.9): situs jadi "tidak dapat
  dijangkau" (`net::ERR_FAILED`) setiap refresh/pindah halaman**, begitu
  Service Worker baru selesai precache & mulai mengontrol halaman. Gejala:
  kunjungan pertama selalu mulus (SW belum aktif), tapi refresh/navigasi
  berikutnya langsung gagal — dan tetap gagal walau cache/SW di-unregister
  manual, karena begitu SW terpasang lagi, precache-nya ikut rusak lagi.
  - Akar masalah: redirect `*.html` -> URL cantik yang ditambah ke
    `htaccess` di v1.3.9 (`/index.html` -> `/library`, `/cadangkan.html`
    -> `/cadangkan`, dst) bikin `fetch()` yang dipakai `service-worker.js`
    buat precache & revalidate (`resolveShellPath`/`cacheFirstNavigation`)
    ikut mengikuti redirect itu. Response hasilnya berstatus "redirected"
    (`res.redirected === true`) — Response seperti ini TIDAK BOLEH
    disimpan ke Cache Storage lalu dipakai langsung menjawab request
    navigasi: Chrome menolaknya dan navigasinya gagal total dengan
    `net::ERR_FAILED`, meski isi Response-nya sendiri sebenarnya benar.
    Begitu tersimpan ke cache (saat `install`), rusaknya menetap.
  - Fix: `service-worker.js` — fungsi baru `stripRedirectMeta()` membungkus
    ulang Response yang "redirected" jadi Response bersih (body & header
    sama, tanpa metadata redirect/URL asing) sebelum dipakai/disimpan.
    Dipakai baik di precache (`install` handler) maupun di jalur
    revalidate (`cacheFirstNavigation`).
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v34 -> v35).

### v1.3.9
- **Bugfix: halaman Cadangkan & Impor (`cadangkan.html`) tidak bisa
  dibuka.** Akar masalah ada di `resolveShellPath()` (`service-worker.js`):
  fungsi ini memetakan SEMUA URL navigasi ke satu file shell precached yang
  sesuai (lihat komentar `cacheFirstNavigation()`), tapi pola `/cadangkan`
  belum pernah dikenali sama sekali di sana — beda dari `/editor`,
  `/card-style`, `/trash`, `/font-manager`, `/about` yang semuanya sudah
  ada case-nya masing-masing. Akibatnya path itu selalu jatuh ke default
  paling bawah (`/index.html`), jadi begitu Service Worker aktif, membuka
  halaman Cadangkan & Impor (dari FAB, shortcut, atau ketik URL-nya
  langsung) malah selalu menyajikan Home/daftar catatan dari cache — bukan
  halaman Cadangkan & Impor itu sendiri. `cadangkan.html` sendiri sudah
  lama ada di precache (`APP_SHELL_FILES`), jadi bug ini murni salah
  pemetaan, bukan file yang hilang. Fix: tambah case `/cadangkan` &
  `/cadangkan/...` -> `/cadangkan.html` di `resolveShellPath()`.
- **Semua halaman sekarang pakai URL cantik, tidak ada lagi `.html` yang
  tampil di address bar** — melengkapi apa yang sebelumnya baru berlaku
  untuk `/editor`, `/library`, `/card-style`, dan `/Download`:
  - `htaccess`: tambah rewrite INTERNAL untuk `/cadangkan`, `/trash`,
    `/font-manager`, `/about`, dan `/editor` tanpa id (dipakai tombol
    "Catatan Baru"). Juga tambah redirect 301 dari semua nama file
    `*.html` lama ke bentuk cantiknya (dijaga lewat `RewriteCond
    %{THE_REQUEST}` supaya tidak bentrok/infinite-loop dengan rewrite
    internal `/library` <-> `index.html` yang sudah ada).
  - `index.html`: link FAB & tombol "Tentang" (`/about.html`,
    `/cadangkan.html`, `/trash.html`, `/font-manager.html`,
    `/editor.html`) diganti ke bentuk cantiknya.
  - `src/js/toolbar/dropdowns/font-family-dropdown.js`: link "Kelola Font"
    di dropdown Font Family diganti ke `/font-manager`.
  - `download.html`: dua `window.location.href` yang mengarahkan balik ke
    app (setelah tombol instal PWA diklik) diganti dari `/index.html` ke
    `/library`.
  - `manifest.json`: `start_url`, `id`, `shortcuts[0].url`, dan
    `file_handlers[0].action` disesuaikan ke `/library`, `/editor`, dan
    `/cadangkan`. **Catatan:** karena `id` ikut berubah, PWA yang sudah
    terpasang oleh user lama bisa dianggap browser sebagai app "baru"
    (bukan update in-place) — ini trade-off yang sepadan supaya identitas
    URL app konsisten ke depannya, tapi ada baiknya diketahui sebelum
    deploy.
  - `service-worker.js`: `resolveShellPath()` juga diperluas kenal pola
    `/about/...` (sebelumnya cuma exact match `/about.html`, sekarang
    konsisten dengan pola lain yang boleh punya trailing slash).
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v33 -> v34).

### v1.3.8
- Fix di halaman Home (`index.html`): skeleton loading (`#homeSkeleton`)
  kelihatan numpuk bareng list card note yang asli — bukan digantikan
  langsung. Akar masalah: di `boot()` (`src/js/notes/notes-list.js`),
  `ensureInstalledFontsLoaded()` dan `refreshData()` (yang manggil
  `render()`, penampil card asli) dijalankan bareng lewat `Promise.all`,
  tapi skeleton baru disembunyikan setelah KEDUANYA selesai. Kalau load
  font kustom lebih lama dari load data note, `render()` sudah sempat
  jalan & nampilin card asli duluan, SEMENTARA skeleton di atasnya belum
  disembunyikan — keduanya kelihatan bareng sesaat.
  - Fix: baris penyembunyi skeleton dipindah ke paling awal fungsi
    `render()` sendiri (bukan digantungkan ke `Promise.all` di `boot()`),
    supaya skeleton hilang ATOMIK bersamaan dengan konten asli pertama
    kali dirender — tidak ada lagi jeda di mana keduanya sama-sama
    kelihatan.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v32 -> v33).

### v1.3.7
- Fix akar masalah SEBENARNYA di balik "kedip putih + header browser"
  pas pindah halaman di PWA terinstall (laporan lanjutan dari v1.3.6,
  ternyata itu benar-benar toolbar browser asli, bukan bug CSS/skeleton
  kita). Penyebab: strategi navigasi HTML di `service-worker.js` selama
  ini **network-first** — SETIAP pindah halaman (walau file-nya sudah
  100% ke-precache) selalu nunggu jaringan dulu, cache cuma dipakai
  kalau network gagal total. Jeda nunggu network round-trip itu bikin
  Chrome/Android (mode PWA standalone) mengira app-nya lambat merespons,
  lalu menampilkan toolbar browser SUNGGUHAN (URL bar + tombol X + menu
  titik-tiga) sesaat sebagai jalan keluar darurat — itu yang terlihat di
  screenshot, bukan elemen halaman kita sama sekali.
  - Fix: `networkFirstNavigation()` diganti `cacheFirstNavigation()` —
    begitu shell ada di cache, LANGSUNG dipakai instan tanpa nunggu
    jaringan sama sekali; jaringan tetap jalan di background buat
    memperbarui cache diam-diam (stale-while-revalidate, dipakai baru di
    kunjungan berikutnya). Ini juga lebih konsisten dengan prinsip "100%
    offline first" project ini — sebelumnya navigasi online tidak
    benar-benar "offline first", cuma fallback ke cache saat gagal.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v31 -> v32).

### v1.3.6
- Fix bug offline: halaman Customisasi Kartu (`/card-style/<id>`) tidak
  bisa dibuka saat offline (yang tersaji malah daftar catatan/index.html).
  Akar masalah: `resolveShellPath()` di `service-worker.js` cuma kenal
  pola URL `/editor/`, `/trash/`, `/font-manager/` — pola `/card-style/`
  belum ditambahkan sama sekali, jadi selalu jatuh ke default
  `/index.html`. Ditambah pengenalan pola `/card-style/` (dan
  `/about.html`) di sana.
  - Ditemukan juga saat penelusuran: `card-style.html` & `about.html`,
    beserta seluruh file JS/CSS yang benar-benar dipakainya (ditelusuri
    dari import graph ES module tiap halaman, bukan cuma daftar lama)
    ternyata belum ikut di-precache — kalau dibiarkan, shell-nya sudah
    benar pun modulnya tetap gagal di-fetch pas offline. ~20 file
    ditambahkan ke `APP_SHELL_FILES` (lihat komentar changelog di
    `service-worker.js` untuk daftar lengkapnya).
- Fix "kedip putih" (blank flash) saat navigasi ke halaman yang lebih
  berat (`font-manager.html` bagian Font Library, `cadangkan.html`,
  `trash.html`). Ketiganya (beda dari `index.html`/`editor.html`) tidak
  punya skeleton loading sama sekali — kontainer listnya kosong selagi
  menunggu `await` ke IndexedDB/manifest font, sehingga sesaat cuma
  terlihat header + area kosong. Ditambahkan skeleton generik
  (`.list-skeleton`, `src/css/skeleton.css`) yang tampil instan dari
  HTML (tanpa nunggu JS), disembunyikan lewat `try/finally` di
  `font-manager.js`/`backup-import.js`/`trash.js` begitu data asli
  selesai dirender (termasuk kalau gagal, biar skeleton tidak nyangkut).
- Fix strip putih di area status-bar/notch saat app dibuka sebagai PWA
  terinstall (standalone) — tidak muncul saat dibuka di tab browser
  biasa. Akar masalah: `background-color` cuma dipasang di `<body>`
  (`src/css/base.css`), `<html>` dibiarkan default (transparan -> putih
  UA). Di mode standalone, area status-bar/notch itu bagian render
  `<html>` sendiri (bukan chrome asli browser lagi seperti di tab
  browser), jadi kalau tidak berwarna, area itu — dan celah sesaat saat
  cross-document View Transition menukar snapshot halaman — balik ke
  putih default, kelihatan seperti sisa "header browser". Fix: pasang
  `background-color: var(--color-bg)` juga di `<html>`.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v28 -> v31).

### v1.3.5
- Fix bug: paste dari strip clipboard Gboard tidak masuk ke model dokumen
  (teks cuma "nempel" di DOM, hilang begitu ada render ulang). Akar
  masalah: `handlePaste()` (`src/js/editor/paste-handler.js`) cuma pernah
  terpanggil lewat event `"paste"` — tapi di banyak device, paste dari
  strip Gboard tidak pernah memicu event itu sama sekali, browser malah
  melaporkannya sebagai `"beforeinput"` biasa dengan `inputType:
  "insertText"`, persis seperti event mengetik normal (bug yang sama juga
  pernah dilaporkan di editor lain seperti Tiptap), sehingga lolos ke
  jalur native.
  - Fix di `handleBeforeInput` (`src/js/editor/editor.js`): tambah
    pembeda — insertText hasil mengetik satu huruf/kata tidak pernah
    mengandung newline (`\n`), sedangkan hasil tempel multi-baris pasti
    mengandung itu. Begitu terdeteksi ada `\n` di `e.data` pada event
    `insertText`, itu dicegat (`preventDefault`) lalu diarahkan ke jalur
    model yang benar (`insertPastedText`, dipecah per baris) — sama
    seperti paste dari long-press/menu konteks.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v27 -> v28).

### v1.3.4
- Tambah indikator kecil "tombol ini punya dropdown/color picker" (segitiga
  tipis di pojok kanan-bawah) di child bar (baris 2) topbar editor — gaya
  & implementasinya sama persis seperti `.toolbar-btn--group::after` yang
  sudah ada untuk 5 menu level-1 (Text/Style/List/Block/Insert): border-trick
  tanpa markup tambahan, warna ikut `currentColor` (otomatis jadi warna aksen
  saat tombolnya `.is-open`).
  - Dipasang di 9 tombol yang membuka dropdown lewat `openPanel()` (Heading,
    Font Family, Font Size, Perataan Teks, Line Height, Letter Spacing,
    Hyperlink) atau color picker lewat `openColorBar()` (Warna Teks,
    Highlight) — lihat `src/js/utils/dom.js`.
  - SENGAJA TIDAK dipasang di tombol aksi langsung sekali klik
    (Bold/Italic/Underline/Strikethrough, Ordered/Unordered List, Checklist,
    Quote, Divider) maupun tombol yang membuka bottom sheet, bukan dropdown
    (Sisipkan Gambar/Scene/Musik).
  - Class baru `toolbar-btn--has-dropdown` (`src/css/toolbar.css`), ditambah
    ke tombolnya masing-masing di `editor.html`.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v26 -> v27).

### v1.3.3
- Fix: menu FAB (Home, tombol "+") dan dropdown menu titik-tiga note card
  (`.note-card__menu-btn`/`.pinned-card__menu-btn`) tidak pernah kelihatan
  menutup dengan animasi saat diklik. Dua penyebab terpisah, sama-sama
  diperbaiki:
  1. `close()` di `openPanel()` (`src/js/utils/dom.js`) — dipakai bareng
     oleh dropdown titik-tiga note card, panel "Ganti Tema" di FAB, DAN
     semua dropdown toolbar editor (Font Family/Size, Heading, Letter/Line
     Spacing, Align) — selama ini langsung `panelEl.remove()` begitu
     ditutup, tanpa animasi keluar apa pun. Fix: tambah state `is-closing`
     yang memicu `@keyframes panelOut` baru (kebalikan `panelIn`) di
     `src/css/toolbar.css`, elemen baru benar-benar dilepas dari DOM
     setelah animasinya kelar (durasi disinkronkan lewat
     `PANEL_CLOSE_ANIM_MS`/`var(--anim-scale)`).
  2. Item menu yang berupa link navigasi native langsung (FAB: "Catatan
     Baru"/"Sampah"/"Cadangkan"/"Font Library"; dropdown note card:
     "Customisasi") sebelumnya tidak dikasih handler klik sama sekali —
     tautan langsung berpindah halaman sementara menu/dropdown masih
     penuh terbuka di snapshot "halaman lama" yang diambil cross-document
     View Transition (`@view-transition` di `view-transitions.css`, aktif
     untuk semua navigasi), jadi kelihatan seperti menunya tidak pernah
     menutup. Fix: tambah handler klik (tanpa `preventDefault`, navigasi
     native tetap jalan) yang memanggil `setOpen(false)` (FAB,
     `src/components/floating-button.js`) / `closeAllPanels()` (note card,
     `src/js/notes/note-card.js`) lebih dulu.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v25 -> v26).

### v1.3.2
- Fix akar masalah sebenarnya di balik seri bug transisi back HP (kepotong
  -> dobel -> ada jeda putih sebelum animasi di v1.3.0/v1.3.1): ternyata
  navigasi back/traverse yang dipulihkan dari bfcache itu SENDIRI SUDAH
  otomatis dapat animasi View Transition dari browser (spesifikasinya
  menghitung "activating a document from bfcache" sebagai kondisi valid),
  jadi setiap kali kita paksa navigasi TAMBAHAN sesudahnya
  (`location.reload()`/`location.replace()`, dicoba di versi-versi
  sebelumnya) — hasilnya selalu dua navigasi yang saling tumpuk/ganggu satu
  sama lain (kepotong, dobel, atau jeda putih), bukan satu transisi mulus.
  Fix final: `reload-on-restore.js` (`src/js/utils/`) sekarang TIDAK PERNAH
  memicu navigasi apa pun lagi — cuma menyediakan `initRefreshOnRestore()`,
  dipanggil halaman Home (`notes-list.js`) buat fetch ulang data & render
  ulang ke DOM yang sudah ada (diam-diam, tanpa navigasi/reload sama
  sekali), supaya animasi bfcache-restore bawaan browser tidak pernah
  diganggu. Header `Cache-Control: no-store` yang sempat ditambah di
  `htaccess` di v1.3.1 dicabut lagi (tidak dibutuhkan, malah jadi penyebab
  jeda putihnya). Halaman lain yang draft-nya rawan rusak kalau di-refresh
  diam-diam (editor, Customisasi Kartu) sengaja tidak ikut refresh
  otomatis ini.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v24 -> v25).

### v1.3.1
- Fix: animasi transisi kelihatan "dobel" saat balik pakai back HP —
  halaman muncul instan tanpa animasi dulu (dipulihkan dari bfcache), baru
  ketimpa animasi navigasi kedua dari `reload-on-restore.js`. Akar
  masalahnya bfcache itu sendiri yang tetap terpakai. Fix: tambah header
  `Cache-Control: no-store` untuk semua halaman HTML (lihat `htaccess`,
  butuh `mod_headers`) supaya halaman TIDAK PERNAH masuk bfcache — back HP
  jadi selalu navigasi "traverse" asli & fresh, otomatis dapat SATU animasi
  View Transition, tanpa `reload-on-restore.js` perlu memicu navigasi kedua
  sama sekali. `reload-on-restore.js` sekarang cuma fallback kalau ada
  browser yang entah kenapa tetap bfcache meski headernya sudah dipasang.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v23 -> v24).

### v1.3.0
- Fix: transisi halaman kepotong (kelihatan seperti refresh manual biasa)
  saat balik pakai tombol/gesture back BAWAAN HP — beda dengan tombol back
  di dalam app yang transisinya mulus. Penyebabnya: `reload-on-restore.js`
  (dipasang di semua halaman) memaksa `location.reload()` saat halaman
  dipulihkan dari bfcache, dan navigasi bertipe "reload" SENGAJA dikecualikan
  dari cross-document View Transition oleh spesifikasi. Fix: ganti jadi
  `location.replace(location.href)` — tetap reload penuh & fresh (data
  ter-update, tanpa nambah history entry baru), tapi navigationType-nya
  push/replace sehingga ikut kena animasi `view-transitions.css`, hasilnya
  identik dengan pakai tombol back di dalam app.
- Fitur baru: back HP di halaman Home (index/`/library`) sekarang "mentok"
  di situ — tidak lagi tembus ke halaman yang dikunjungi sebelum index
  dibuka. Implementasi: `src/js/utils/trap-back-navigation.js` (dipasang
  khusus di `notes-list.js`), lewat trik `history.pushState` dummy entry
  yang didorong ulang tiap kali `popstate` (back) terpicu.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v22 -> v23);
  `src/js/utils/trap-back-navigation.js` ditambahkan ke precache list.

### v1.2.2
- Tombol menu titik-tiga di note card (halaman Home/index, `.note-card__menu-btn`)
  sekarang selalu punya latar lingkaran hitam semi-transparan
  (`rgba(0, 0, 0, 0.4)`, gelap sedikit lagi `0.6` saat hover/terbuka) dengan
  icon putih — sebelumnya latar transparan & icon abu-abu, cuma dikasih
  latar samar saat hover, jadi kurang kebaca kalau kartu punya gambar latar
  kustomisasi yang terang.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v21 -> v22).

### v1.2.1
- Fix bug di halaman Customisasi Kartu (`card-style.js`): pratinjau gambar
  latar kartu tidak ter-update saat memilih gambar baru untuk MENGGANTI
  gambar latar yang sudah ada sebelumnya (padahal setelah tombol Simpan
  ditekan, gambar sebenarnya sudah tersimpan dengan benar — cuma
  pratinjaunya yang tidak ikut berubah). Penyebabnya race condition:
  `note-card.js` `applyStoredCardStyle()` memuat gambar latar LAMA secara
  ASYNC lewat `getObjectUrl()`, dan promise itu bisa resolve belakangan lalu
  menimpa balik `--card-bg-image` yang barusan di-set ke gambar baru. Fix:
  saat ada pratinjau gambar baru yang belum disimpan (`pendingPreviewUrl`),
  `bgImageAssetId` yang dikirim ke `createNoteCard()` di-null-kan supaya
  `note-card.js` tidak ikut memuat gambar lama sama sekali.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v20 -> v21).

### v1.2.0
- Bottom sheet gambar: gambar yang diunggah sekarang **dikonversi ke WebP
  dulu** (`src/js/services/image-service.js` `convertToWebp()`) sebelum
  tampil di pratinjau dan sebelum disimpan ke IndexedDB. Konversinya murni
  lewat Canvas API bawaan browser (decode -> gambar ke `<canvas>` -> encode
  ulang), TIDAK memanggil layanan eksternal apa pun, jadi tetap jalan
  sepenuhnya offline.
  - GIF (animasi) & file yang sudah WebP dilewati apa adanya (tidak
    dikonversi ulang) supaya animasi GIF tidak hilang.
  - Kalau konversi gagal (format tidak didukung dsb.), otomatis fallback ke
    file asli tanpa gagal total.
- Tombol "Unggah Gambar" sekarang menampilkan **ikon loading (spinner)** +
  teks "Mengonversi…" selama proses konversi berlangsung (tombol dikunci
  sementara), supaya kalau gambarnya besar & konversinya agak lama, user
  tahu ada proses yang sedang berjalan.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v19 -> v20).

### v1.1.1
- Bottom sheet gambar: rentang slider **Lebar** & **Tinggi** disamakan,
  keduanya sekarang 10px - 640px (sebelumnya Lebar 80-640px, Tinggi
  80-480px berbeda sendiri-sendiri).
- Bottom sheet gambar: jarak slider **Border Radius** (paling bawah) ke
  tombol Batal/Terapkan ditambah — sebelumnya kelihatan terlalu nempel.
- Semua bottom sheet di editor (Sisipkan/Edit Gambar, Scene, Musik) —
  ketiganya berbagi komponen sheet yang sama — sekarang dibatasi
  `max-height: 40vh` (40% tinggi layar) dan tetap bisa di-scroll kalau
  isinya lebih panjang dari itu (sebelumnya 66vh).
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v18 -> v19).

### v1.1.0
- Bottom sheet gambar (Sisipkan/Edit Gambar): fitur baru toggle **"Latar
  Transparan"** — begitu aktif, kotak/frame di belakang gambar dilepas jadi
  transparan, supaya area transparan (kanal alpha) gambar PNG benar-benar
  tembus ke warna latar catatan/scene di baliknya, bukan ketutup warna
  frame default.
- `document.blocks[].transparentBg` (boolean, default `false`) ditambahkan
  ke model block gambar — otomatis ikut ter-export/import lewat `.meimo`
  dan backup JSON karena keduanya menyerialisasi block apa adanya.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v17 -> v18).

### v1.0.1
- Highlight di editor: `border-radius` diperbesar (3px -> 5px) supaya sudut
  highlight lebih kerasa membulat.
- Highlight di editor: ditambah `padding-inline` (~0.2em) di kiri-kanan teks
  yang di-highlight, jadi ada jarak/"napas" dari teks di sekitarnya —
  tanpa menambah karakter spasi sungguhan ke teks aslinya.
- `CACHE_VERSION` di `service-worker.js` dinaikkan (v16 -> v17) karena
  `src/css/editor.css` berubah.

### v1.0.0
- Baseline/rilis awal sebelum pencatatan versi ini dimulai.
