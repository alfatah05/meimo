# Aturan untuk AI

File ini berisi aturan yang WAJIB diikuti AI saat mengerjakan project
Personal Notes PWA ini. Baca file ini dulu sebelum mengerjakan perubahan
apa pun.

---

## 1. Cek semua file tidak kosong sebelum di-zip/export

**Latar belakang:** pernah kejadian beberapa file inti (`src/js/utils/dom.js`,
`trash.html`, dan beberapa file lain) jadi 0 byte di hasil export/zip
project — bukan karena diedit sengaja, tapi entah kenapa hilang isinya pas
proses export/zip. Akibatnya app stuck di skeleton loading dan halaman
Sampah/Trash hilang total, dan butuh beberapa kali bolak-balik zip buat
ketahuan sumber masalahnya.

**Aturan:** SETIAP KALI sebelum menyerahkan hasil kerja dalam bentuk zip
(atau file mana pun) ke user, WAJIB jalankan pengecekan file 0 byte
terlebih dahulu:

1. Cari semua file kosong di project (bukan folder):
   ```bash
   find . -type f -size 0
   ```
2. Untuk SETIAP file yang muncul di hasil pencarian itu, cek dulu apakah
   file tersebut memang benar-benar tidak dipakai (tidak ada yang
   `import`/`<script src>`/`<link href>` ke situ) — kalau ya, boleh
   dibiarkan kosong. Cek dengan:
   ```bash
   grep -rn "nama-file.ext" . --include="*.js" --include="*.html" --include="*.css"
   ```
3. Kalau file kosong itu TERNYATA dipakai/di-reference di tempat lain
   (baik lewat `import`, `<script>`, `<link>`, atau dipanggil manual di
   kode), STOP — file itu rusak/kosong secara tidak sengaja. JANGAN
   lanjut zip sebelum isi file itu dipulihkan (dari versi sebelumnya yang
   masih utuh, atau ditulis ulang).
4. Setelah semua file kosong sudah diverifikasi aman (tidak dipakai) atau
   sudah dipulihkan isinya, baru boleh lanjut bikin zip & serahkan ke user.
5. Sebagai pengecekan tambahan, jalankan syntax check ke semua file JS
   sebelum menyerahkan hasil:
   ```bash
   find . -name "*.js" -not -path "*/node_modules/*" | while read f; do
     node --check "$f" || echo "SYNTAX ERROR: $f"
   done
   ```

Jangan asumsikan file yang "tidak diubah" pasti aman — proses zip/export
sendiri bisa jadi sumber masalahnya, bukan cuma perubahan kode yang
disengaja.

---

## 2. Penomoran versi (SemVer)

Penomoran versi mengikuti [SemVer](https://semver.org/lang/id/) — format
`MAJOR.MINOR.PATCH`:
- **MAJOR**: perubahan besar yang tidak kompatibel/mengubah total cara pakai.
- **MINOR**: fitur baru yang tetap kompatibel dengan versi sebelumnya.
- **PATCH**: perbaikan bug atau penyesuaian kecil (mis. tweak tampilan),
  tanpa fitur baru.

Setiap ada perubahan yang di-deploy, versi HARUS dinaikkan sesuai aturan
di atas, di SEMUA tempat berikut (jangan sampai ada yang kelewat/gak
sinkron):

- `manifest.json` — field `"version"`.
- `README.md` — baris `**Versi: vX.X.X**` di bagian atas, DAN tambahkan
  satu entri baru di section `## Changelog` (versi terbaru paling atas).
- `service-worker.js` — `CACHE_VERSION` dinaikkan (mis. `"v77"` →
  `"v78"`), supaya klien yang masih pegang cache lama dipaksa ambil file
  baru begitu service worker versi baru aktif. Ini PENTING terutama kalau
  ada file yang isinya diperbaiki/dipulihkan (bukan cuma fitur baru) —
  tanpa cache version naik, browser user bisa tetap kelihatan "berhasil"
  padahal masih menjalankan file lama dari cache, bukan file yang baru
  diperbaiki.
