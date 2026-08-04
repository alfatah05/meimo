/**
 * pin.js
 * Aksi "Sematkan" / "Lepas Sematan" satu catatan — dipicu dari menu
 * titik-tiga di note card (lihat notes/note-card.js openCardMenu, item
 * "Sematkan"). Status pin tersimpan di note.metadata.pinned lewat
 * Document Service (setPinned); catatan yang disematkan dipisah ke strip
 * "Pinned" tersendiri di atas grid (lihat notes-list.js render()).
 *
 * Modul kecil terpisah (bukan langsung di notes-list.js) mengikuti pola
 * sorting.js/search.js: logika aksi murni di sini, notes-list.js tinggal
 * memanggilnya lalu memperbarui state list & merender ulang.
 */

import { setPinned } from "../services/document-service.js";
import { showToast } from "../../components/toast.js";

/**
 * Balik status pin sebuah catatan (pinned -> lepas, lepas -> pinned) dan
 * tampilkan toast konfirmasi singkat.
 * @param {object} note
 * @returns {Promise<object>} note dengan metadata.pinned terbaru
 */
export async function toggleNotePin(note) {
  const nextPinned = !(note.metadata && note.metadata.pinned);
  const updated = await setPinned(note.id, nextPinned);
  const title = note.title || "Catatan";
  showToast(nextPinned ? `"${title}" disematkan.` : `"${title}" dilepas dari sematan.`);
  return updated;
}
