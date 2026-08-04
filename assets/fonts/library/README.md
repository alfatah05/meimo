# Font Library

Folder ini adalah **Font Library** aplikasi: kumpulan font yang bisa diunduh
user lewat halaman **Kelola Font** (`font-manager.html`), lalu dipakai di
editor lewat dropdown Font Family.

Ini BUKAN tempat font langsung dipakai — font hanya bisa dipilih di editor
kalau sudah "terpasang" (sudah diunduh & tersimpan ke IndexedDB lewat
Font Manager). Lihat `src/js/services/font-service.js`.

## Cara menambah font baru

1. Taruh berkas font (`.woff2` disarankan, `.woff`/`.ttf`/`.otf` juga
   didukung browser) LANGSUNG di folder ini, TANPA subfolder — misal
   `assets/fonts/library/poppins-regular.woff2`. (Catatan: sempat dicoba
   satu subfolder per font, tapi di sejumlah hosting subfolder baru di
   bawah `library/` kena 403 Forbidden — entah karena hotlink protection,
   permission, atau aturan server lain. Struktur flat ini lebih aman lintas
   hosting.)
2. Tambahkan satu entri ke array `fonts` di `manifest.json` (lihat contoh
   di bawah). Halaman Font Manager & dropdown Font Family di editor
   membaca daftar ini langsung dari `manifest.json` — tidak perlu ubah
   kode JS sama sekali.

## Skema satu entri font

```json
{
  "id": "poppins",
  "name": "Poppins",
  "family": "Poppins",
  "category": "sans-serif",
  "files": [
    { "weight": 400, "style": "normal", "url": "/assets/fonts/library/poppins-regular.woff2" },
    { "weight": 700, "style": "normal", "url": "/assets/fonts/library/poppins-bold.woff2" }
  ]
}
```

Keterangan field:
- `id` — slug unik, dipakai sebagai key penyimpanan di IndexedDB. Jangan
  diubah setelah dipakai (mengubahnya = font lama dianggap font baru).
- `name` — nama yang ditampilkan ke user di Font Manager & dropdown.
- `family` — nilai CSS `font-family` untuk font ini (biasanya sama dengan
  `name`).
- `category` — opsional, sekadar label (`"sans-serif"`, `"serif"`,
  `"monospace"`, `"display"`, dst).
- `files` — daftar berkas font untuk family ini. Minimal 1 berkas
  (`weight: 400, style: "normal"`). Boleh lebih dari satu untuk bold/italic.
  `url` harus path yang bisa diakses langsung dari root situs (mulai
  dengan `/assets/fonts/library/...`), dan nama berkasnya harus unik
  (karena semua berkas ada di folder yang sama, tanpa subfolder) —
  disarankan diawali id fontnya, mis. `poppins-regular.woff2`.
- Ingat: setiap kali menambah/mengganti berkas di sini atau mengubah
  `manifest.json`, naikkan `CACHE_VERSION` di `/service-worker.js` —
  kalau tidak, browser yang sudah pernah membuka app akan tetap memakai
  `manifest.json`/berkas font versi lama dari cache.

## Dua font bawaan

Aplikasi sudah menyertakan 2 font bawaan (Inter & Georgia) yang SELALU
tersedia di dropdown Font Family tanpa perlu diunduh — keduanya
didefinisikan di kode (`BUILTIN_FONTS` pada `font-service.js`), bukan di
folder ini. Folder & `manifest.json` ini khusus untuk font TAMBAHAN yang
sifatnya opsional (harus diunduh dulu oleh user).
