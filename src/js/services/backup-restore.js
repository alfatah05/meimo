/**
 * backup-restore.js
 * Impor SEKALIGUS semua `.meimo` yang ada di dalam satu file `.zip`
 * cadangan (hasil "Cadangkan Semua Catatan", lihat backup-service.js) —
 * pasangan importer dari backup-service.js, sama seperti meimo-import.js
 * pasangan dari meimo-export.js.
 *
 * Sebelum fitur ini ada, restore dari `.zip` cadangan masih MANUAL: unzip
 * filenya dulu di luar app, lalu Impor tiap `.meimo` di dalamnya satu-satu
 * lewat tombol "Impor Catatan (.meimo)" (lihat README.md § "Impor").
 *
 * Setiap entry `.meimo` di dalam zip diimpor lewat importMeimoBytes() yang
 * SAMA PERSIS dipakai jalur impor satuan (meimo-import.js) — supaya tidak
 * ada logic parsing/remap ID yang digandakan, dan hasilnya identik (id note
 * baru, asset di-assign ulang, dst.) baik lewat tombol satuan maupun lewat
 * zip ini.
 */

import { readZipEntries } from "../utils/zip-reader.js";
import { importMeimoBytes } from "./meimo-import.js";

/** Entry dianggap ".meimo" kalau NAMANYA berakhiran ".meimo" (case-
 * insensitive) — dicek lewat regex di ujung string, bukan cuma `endsWith`
 * literal, supaya tetap kena walau tool zip lain menaruh entry-nya di
 * dalam subfolder atau ekstensinya kebetulan huruf besar. Entry lain di
 * dalam zip (mis. `backup-manifest.json`, yang memang bukan `.meimo`)
 * sengaja dilewati begitu saja, bukan dianggap gagal. */
function isMeimoEntryName(name) {
  return /\.meimo$/i.test(name);
}

/**
 * Baca satu file `.zip` cadangan, lalu IMPOR SEMUA `.meimo` di dalamnya
 * jadi catatan baru, satu per satu.
 *
 * Ditolak tegas (throw, tidak menulis apa pun ke IndexedDB) kalau di dalam
 * zip itu tidak ada SATU PUN entry `.meimo` — ini yang mencegah user yang
 * salah pilih file `.zip` sembarangan (bukan hasil "Cadangkan Semua
 * Catatan") berakhir dengan pesan ambigu semacam "berhasil impor 0
 * catatan"; dia langsung dapat pesan jelas kenapa file itu ditolak.
 *
 * Kegagalan pada SATU entry (mis. salah satu `.meimo` di dalamnya korup)
 * TIDAK menggagalkan seluruh proses — entry lain tetap dicoba satu-satu,
 * detail kegagalannya dikumpulkan di `failures` supaya pemanggil (UI) bisa
 * menampilkan ringkasan yang jujur (berapa berhasil, berapa gagal & kenapa)
 * alih-alih "semua-atau-tidak-sama-sekali".
 *
 * @param {File|Blob} file
 * @returns {Promise<{
 *   total: number,
 *   imported: Array<{noteId: string, title: string}>,
 *   failures: Array<{name: string, message: string}>,
 * }>}
 */
export async function importMeimoBackupZip(file) {
  if (!file) throw new Error("Tidak ada file yang dipilih.");

  const buf = await file.arrayBuffer();

  let entries;
  try {
    entries = await readZipEntries(buf);
  } catch {
    // readZipEntries() sudah melempar pesan yang cukup jelas untuk kasus
    // "bukan zip sama sekali" (struktur zip tidak ditemukan/rusak) — tidak
    // perlu dibungkus ulang, cukup diteruskan apa adanya. Catch di sini
    // cuma jaga-jaga kalau suatu saat pesannya berubah jadi kurang jelas.
    throw new Error("Bukan file .zip yang valid.");
  }

  const meimoEntries = entries.filter((entry) => isMeimoEntryName(entry.name));
  if (meimoEntries.length === 0) {
    throw new Error(
      "Tidak ada file .meimo di dalam .zip ini. Pastikan ini file cadangan " +
        'hasil tombol "Cadangkan Semua Catatan", bukan .zip lain.'
    );
  }

  const imported = [];
  const failures = [];

  for (const entry of meimoEntries) {
    try {
      const result = await importMeimoBytes(entry.data);
      imported.push(result);
    } catch (err) {
      console.error(`Gagal mengimpor "${entry.name}" dari dalam zip cadangan:`, err);
      failures.push({ name: entry.name, message: err.message || "Gagal diimpor." });
    }
  }

  return { total: meimoEntries.length, imported, failures };
}
