/**
 * backup-import.js
 * Render & pengelolaan halaman Cadangkan & Impor (cadangkan.html):
 *   - "Cadangkan Semua Catatan" -> exportAllNotes() (backup-service.js,
 *     satu `.meimo` per note — LENGKAP dengan asset — dibungkus jadi satu
 *     file `.zip`).
 *   - "Impor Catatan (.meimo)" -> importMeimoFile() (meimo-import.js, SATU
 *     note DENGAN asset, dari file .meimo).
 *   - "Impor Cadangan (.zip)" -> importMeimoBackupZip() (backup-restore.js,
 *     SEMUA .meimo di dalam satu file .zip cadangan, diimpor sekaligus).
 *
 * Halaman ini SEBELUMNYA juga menampilkan daftar semua catatan dengan
 * tombol "Ekspor .meimo" per-baris — daftar itu sudah DIHAPUS. Ekspor satu
 * catatan sekarang lewat item menu "Download" di menu titik-tiga note card
 * (bisa dari Home maupun Arsip — lihat notes/note-card.js openCardMenu()
 * & notes/download-note.js), jadi tidak perlu lagi ke halaman ini dulu
 * cuma buat mengunduh satu catatan.
 */

import { exportAllNotes } from "../services/backup-service.js";
import { importMeimoFile } from "../services/meimo-import.js";
import { importMeimoBackupZip } from "../services/backup-restore.js";
import { showToast } from "../../components/toast.js";

async function boot() {
  const backupBtn = document.getElementById("btnBackupAll");
  const importBtn = document.getElementById("btnImportMeimo");
  const importInput = document.getElementById("importFileInput");
  const importZipBtn = document.getElementById("btnImportBackupZip");
  const importZipInput = document.getElementById("importBackupZipInput");

  if (backupBtn) {
    backupBtn.addEventListener("click", async () => {
      backupBtn.disabled = true;
      try {
        const { noteCount, savedTo } = await exportAllNotes();
        if (noteCount === 0) {
          showToast("Belum ada catatan untuk dicadangkan.");
        } else if (savedTo?.method === "share") {
          showToast(`Cadangan ${noteCount} catatan dibagikan lewat sheet — pilih tempat menyimpannya.`);
        } else if (savedTo?.method === "failed") {
          showToast("Gagal membuat cadangan. Coba lagi.", { tone: "danger" });
        } else {
          showToast(`Cadangan ${noteCount} catatan (lengkap dengan gambar/musik) berhasil diunduh ke folder Documents.`);
        }
      } catch (err) {
        console.error("Gagal membuat cadangan:", err);
        showToast("Gagal membuat cadangan. Coba lagi.", { tone: "danger" });
      } finally {
        backupBtn.disabled = false;
      }
    });
  }

  if (importBtn && importInput) {
    importBtn.addEventListener("click", () => importInput.click());

    importInput.addEventListener("change", async () => {
      const file = importInput.files && importInput.files[0];
      importInput.value = ""; // reset, supaya pilih file yang SAMA lagi tetap memicu "change"
      if (!file) return;

      importBtn.disabled = true;
      try {
        const { title } = await importMeimoFile(file);
        showToast(`"${title}" berhasil diimpor.`);
      } catch (err) {
        console.error("Gagal mengimpor .meimo:", err);
        showToast(err.message || "Gagal mengimpor file. Pastikan ini file .meimo yang valid.", {
          tone: "danger",
        });
      } finally {
        importBtn.disabled = false;
      }
    });
  }

  if (importZipBtn && importZipInput) {
    importZipBtn.addEventListener("click", () => importZipInput.click());

    importZipInput.addEventListener("change", async () => {
      const file = importZipInput.files && importZipInput.files[0];
      importZipInput.value = ""; // reset, supaya pilih file yang SAMA lagi tetap memicu "change"
      if (!file) return;

      importZipBtn.disabled = true;
      try {
        const { total, imported, failures } = await importMeimoBackupZip(file);
        if (failures.length === 0) {
          showToast(`${imported.length} dari ${total} catatan berhasil diimpor.`);
        } else if (imported.length === 0) {
          // Semua entry .meimo yang ADA di dalam zip gagal diimpor (bukan
          // "zip tidak punya .meimo sama sekali" — itu sudah ditolak lebih
          // dulu lewat throw di importMeimoBackupZip() dan masuk ke catch
          // di bawah, bukan lewat cabang ini).
          showToast(`Gagal mengimpor semua ${total} catatan dari zip ini.`, { tone: "danger" });
        } else {
          showToast(
            `${imported.length} dari ${total} catatan berhasil diimpor (${failures.length} gagal).`,
            { tone: "danger", duration: 4200 }
          );
        }
      } catch (err) {
        console.error("Gagal mengimpor .zip cadangan:", err);
        showToast(err.message || "Gagal mengimpor file. Pastikan ini file .zip cadangan yang valid.", {
          tone: "danger",
        });
      } finally {
        importZipBtn.disabled = false;
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
