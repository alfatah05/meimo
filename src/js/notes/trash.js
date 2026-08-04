/**
 * trash.js
 * Render & pengelolaan halaman Sampah (trash.html): daftar catatan yang
 * sudah dipindahkan ke Sampah (metadata.trashed = true), dengan aksi
 * Pulihkan & Hapus Permanen. Sumber data tetap lewat Document Service —
 * sesuai DOCUMENT_MODEL.md, catatan di Sampah adalah soft-delete (data
 * masih ada), bukan hard-delete.
 */

import {
  listNotes,
  getSnippet,
  restoreFromTrash,
  permanentlyDeleteNote,
} from "../services/document-service.js";
import { createEl } from "../utils/dom.js";
import { formatRelativeDate } from "../utils/date-format.js";
import { showToast } from "../../components/toast.js";
import { confirmDialog } from "../../components/modal.js";

function byTrashedAtDesc(a, b) {
  return new Date(b.metadata.trashedAt || 0).getTime() - new Date(a.metadata.trashedAt || 0).getTime();
}

function createTrashCard(note, onChange) {
  const card = createEl("div", { className: "note-card trash-card anim-slide-up" });

  const header = createEl("div", { className: "note-card__header" });
  header.appendChild(
    createEl("div", { className: "note-card__title", text: note.title || "Tanpa judul" })
  );

  const snippet = createEl("p", {
    className: "note-card__snippet",
    text: getSnippet(note) || "Catatan kosong.",
  });

  const footer = createEl("div", { className: "note-card__footer" });
  footer.appendChild(
    createEl("span", { text: `Dihapus ${formatRelativeDate(note.metadata.trashedAt)}` })
  );

  const actions = createEl("div", { className: "trash-card__actions" });
  const restoreBtn = createEl("button", {
    className: "trash-card__btn",
    text: "Pulihkan",
    attrs: { type: "button" },
  });
  const deleteBtn = createEl("button", {
    className: "trash-card__btn trash-card__btn--danger",
    text: "Hapus Permanen",
    attrs: { type: "button" },
  });

  restoreBtn.addEventListener("click", async () => {
    await restoreFromTrash(note.id);
    showToast("Catatan dipulihkan.");
    onChange();
  });

  deleteBtn.addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: "Hapus permanen?",
      message: `"${note.title || "Catatan tanpa judul"}" akan dihapus permanen dan tidak bisa dikembalikan.`,
      confirmLabel: "Hapus Permanen",
    });
    if (!confirmed) return;
    await permanentlyDeleteNote(note.id);
    showToast("Catatan dihapus permanen.");
    onChange();
  });

  actions.append(restoreBtn, deleteBtn);
  card.append(header, snippet, footer, actions);
  return card;
}

async function boot() {
  const grid = document.getElementById("trashGrid");
  const section = document.getElementById("trashSection");
  const sectionSkeleton = document.getElementById("trashSectionSkeleton");
  const emptyState = document.getElementById("trashEmptyState");
  if (!grid) return;

  async function load() {
    try {
      const all = await listNotes({ includeTrashed: true, includeArchived: true });
      const trashed = all.filter((note) => note.metadata.trashed).sort(byTrashedAtDesc);

      grid.innerHTML = "";
      if (trashed.length === 0) {
        section.hidden = true;
        emptyState.hidden = false;
      } else {
        section.hidden = false;
        emptyState.hidden = true;
        for (const note of trashed) grid.appendChild(createTrashCard(note, load));
      }
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
