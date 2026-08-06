/**
 * arsip.js
 * Render & pengelolaan halaman Arsip (arsip.html): daftar catatan yang
 * sudah diarsipkan (metadata.archived = true), diakses lewat tombol ikon
 * arsip di header Home (di sebelah kiri tombol About — lihat index.html).
 *
 * Kartu di sini memakai createNoteCard() yang SAMA PERSIS dengan yang di
 * Home (notes/note-card.js) — jadi catatan yang diarsipkan tetap bisa
 * langsung dibuka di editor seperti biasa (soft-state, bukan hapus data,
 * sesuai pola Pin/Archive/Trash di document-service.js), lengkap dengan
 * kustomisasi tampilan kartunya. Menu titik-tiga di sini menawarkan
 * "Batalkan Arsip" (bukan "Arsipkan"), "Download" (.meimo), & "Hapus" —
 * TANPA "Sematkan", karena catatan yang masih diarsipkan tidak tampil di
 * strip Pinned Home mana pun.
 *
 * Sumber data tetap lewat Document Service, bukan IndexedDB langsung.
 */

import * as documentService from "../services/document-service.js";
import { createNoteCard } from "./note-card.js";
import { sortNotes } from "./sorting.js";
import { downloadNoteAsMeimo } from "./download-note.js";
import { showToast } from "../../components/toast.js";

function byUpdatedAtDesc(notes) {
  return sortNotes(notes, "updatedAt");
}

async function boot() {
  const grid = document.getElementById("arsipGrid");
  const section = document.getElementById("arsipSection");
  const sectionSkeleton = document.getElementById("arsipSectionSkeleton");
  const emptyState = document.getElementById("arsipEmptyState");
  if (!grid) return;

  let archivedNotes = [];

  function render() {
    grid.innerHTML = "";
    if (archivedNotes.length === 0) {
      section.hidden = true;
      emptyState.hidden = false;
    } else {
      section.hidden = false;
      emptyState.hidden = true;
      for (const note of archivedNotes) {
        grid.appendChild(
          createNoteCard(note, { onTrash: handleTrash, onUnarchive: handleUnarchive, onDownload: downloadNoteAsMeimo })
        );
      }
    }
  }

  /** Pindahkan satu catatan dari Arsip ke Sampah, lalu render ulang dengan Undo. */
  async function handleTrash(note) {
    await documentService.moveToTrash(note.id);
    archivedNotes = archivedNotes.filter((n) => n.id !== note.id);
    render();
    showToast(`"${note.title || "Catatan"}" dipindahkan ke Sampah.`, {
      actionLabel: "Urungkan",
      onAction: async () => {
        await documentService.restoreFromTrash(note.id);
        await load();
      },
    });
  }

  /** Batalkan arsip satu catatan (kembali muncul di Home), lalu render ulang dengan Undo. */
  async function handleUnarchive(note) {
    await documentService.setArchived(note.id, false);
    archivedNotes = archivedNotes.filter((n) => n.id !== note.id);
    render();
    showToast(`"${note.title || "Catatan"}" dikeluarkan dari Arsip.`, {
      actionLabel: "Urungkan",
      onAction: async () => {
        await documentService.setArchived(note.id, true);
        await load();
      },
    });
  }

  async function load() {
    try {
      const all = await documentService.listNotes({ includeTrashed: false, includeArchived: true });
      archivedNotes = byUpdatedAtDesc(all.filter((note) => note.metadata.archived));
      render();
    } finally {
      if (sectionSkeleton) sectionSkeleton.hidden = true;
    }
  }

  await load();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
