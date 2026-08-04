/**
 * search.js
 * Pencarian realtime berdasarkan judul dan isi catatan. Isi catatan
 * diambil sebagai teks polos lewat Document Service (getPlainText) —
 * bukan dari model blocks/HTML mentah secara langsung.
 */

import { getPlainText } from "../services/document-service.js";

/** Apakah satu note cocok dengan query (judul ATAU isi, case-insensitive). */
export function matchesQuery(note, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return true;

  const title = (note.title || "").toLowerCase();
  if (title.includes(q)) return true;

  const content = getPlainText(note).toLowerCase();
  return content.includes(q);
}

/** Filter array note berdasarkan query. Query kosong -> kembalikan semua. */
export function filterNotes(notes, query) {
  const q = (query || "").trim();
  if (!q) return notes;
  return notes.filter((note) => matchesQuery(note, q));
}
