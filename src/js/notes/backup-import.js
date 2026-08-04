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
 *   - List catatan dengan tombol "Ekspor" per-baris -> exportNoteAsMeimo()
 *     (meimo-export.js) untuk note itu saja.
 * Sumber data list tetap lewat Document Service, sama seperti trash.js/
 * notes-list.js — lihat catatan arsitektur di app.js.
 */

import { listNotes, loadNote, getSnippet } from "../services/document-service.js";
import { exportAllNotes } from "../services/backup-service.js";
import { exportNoteAsMeimo } from "../services/meimo-export.js";
import { importMeimoFile } from "../services/meimo-import.js";
import { importMeimoBackupZip } from "../services/backup-restore.js";
import { createEl } from "../utils/dom.js";
import { formatRelativeDate } from "../utils/date-format.js";
import { showToast } from "../../components/toast.js";

const EXPORT_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 3v12"></path><polyline points="7 10 12 15 17 10"></polyline><path d="M4 19h16"></path></svg>';

function byUpdatedAtDesc(a, b) {
  return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
}

function createExportCard(note) {
  const card = createEl("div", { className: "note-card export-card anim-slide-up" });

  const header = createEl("div", { className: "note-card__header" });
  header.appendChild(
    createEl("div", { className: "note-card__title", text: note.title || "Tanpa judul" })
  );

  const snippet = createEl("p", {
    className: "note-card__snippet",
    text: getSnippet(note) || "Catatan kosong.",
  });

  const footer = createEl("div", { className: "note-card__footer" });
  footer.appendChild(createEl("span", { text: `Diubah ${formatRelativeDate(note.updatedAt)}` }));

  const actions = createEl("div", { className: "export-card__actions" });
  const exportBtn = createEl("button", {
    className: "export-card__btn",
    attrs: { type: "button" },
    html: `${EXPORT_ICON_SVG}<span>Ekspor .meimo</span>`,
  });

  exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    try {
      // Muat ulang note-nya (bukan pakai objek `note` dari daftar) supaya
      // isi yang diekspor selalu versi TERBARU yang tersimpan — daftar di
      // halaman ini bisa saja sudah agak basi kalau note itu baru saja
      // diedit di tab/jendela lain.
      const freshDoc = await loadNote(note.id);
      if (!freshDoc) {
        showToast("Catatan tidak ditemukan (mungkin sudah dihapus).", { tone: "danger" });
        return;
      }
      const { fileName } = await exportNoteAsMeimo(freshDoc);
      showToast(`Diunduh sebagai ${fileName}`);
    } catch (err) {
      console.error("Gagal mengekspor catatan:", err);
      showToast("Gagal mengekspor catatan. Coba lagi.", { tone: "danger" });
    } finally {
      exportBtn.disabled = false;
    }
  });

  actions.appendChild(exportBtn);
  card.append(header, snippet, footer, actions);
  return card;
}

async function boot() {
  const backupBtn = document.getElementById("btnBackupAll");
  const importBtn = document.getElementById("btnImportMeimo");
  const importInput = document.getElementById("importFileInput");
  const importZipBtn = document.getElementById("btnImportBackupZip");
  const importZipInput = document.getElementById("importBackupZipInput");
  const listEl = document.getElementById("exportList");
  const listSection = document.getElementById("exportListSection");
  const listSkeleton = document.getElementById("exportListSkeleton");
  const emptyState = document.getElementById("exportEmptyState");

  async function loadList() {
    if (!listEl) return;
    try {
      // includeArchived: true — note yang diarsipkan tetap boleh diekspor
      // satuan dari sini, cuma yang di Sampah (trashed) yang disembunyikan.
      const notes = await listNotes({ includeTrashed: false, includeArchived: true });
      notes.sort(byUpdatedAtDesc);

      listEl.innerHTML = "";
      if (notes.length === 0) {
        listSection.hidden = true;
        emptyState.hidden = false;
      } else {
        listSection.hidden = false;
        emptyState.hidden = true;
        for (const note of notes) listEl.appendChild(createExportCard(note));
      }
    } finally {
      // Sama seperti font-manager.js: skeleton cuma buat load pertama,
      // biar tidak "kedip putih" pas navigasi ke halaman ini.
      if (listSkeleton) listSkeleton.hidden = true;
    }
  }

  if (backupBtn) {
    backupBtn.addEventListener("click", async () => {
      backupBtn.disabled = true;
      try {
        const { noteCount } = await exportAllNotes();
        showToast(
          noteCount > 0
            ? `Cadangan ${noteCount} catatan (lengkap dengan gambar/musik) berhasil diunduh.`
            : "Belum ada catatan untuk dicadangkan."
        );
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
        await loadList();
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
        if (imported.length > 0) await loadList();
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

  await loadList();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
