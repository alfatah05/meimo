/**
 * sorting.js
 * Opsi & logika pengurutan Notes List (Home): "Terakhir diubah", "Pertama
 * dibuat", "Terakhir dibuat". Preferensi urutan disimpan di localStorage
 * (bukan dokumen — sama seperti preferensi tema di theme-manager.js) supaya
 * tetap konsisten dipakai ulang saat app dibuka lagi.
 */

import { t } from "../i18n/i18n.js";

export const SORT_STORAGE_KEY = "meimo-notes-sort";

export const SORT_OPTIONS = [
  { id: "updatedAt", labelKey: "home.sort.updatedAt" },
  { id: "createdAtAsc", labelKey: "home.sort.createdAtAsc" },
  { id: "createdAtDesc", labelKey: "home.sort.createdAtDesc" },
];

export function sortOptionLabel(opt) {
  return t(opt.labelKey || opt.label || opt.id);
}


const DEFAULT_SORT = "updatedAt";

const COMPARATORS = {
  updatedAt: (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  createdAtAsc: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  createdAtDesc: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
};

/** Id urutan yang sedang aktif (default: "updatedAt"). */
export function getSort() {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY);
    if (stored && COMPARATORS[stored]) return stored;
  } catch (_) {
    // localStorage tidak tersedia (mis. private mode) — pakai default saja.
  }
  return DEFAULT_SORT;
}

/** Simpan & terapkan urutan baru. Mengembalikan id urutan yang benar-benar dipakai. */
export function setSort(sortId) {
  const valid = COMPARATORS[sortId] ? sortId : DEFAULT_SORT;
  try {
    localStorage.setItem(SORT_STORAGE_KEY, valid);
  } catch (_) {
    // Tidak fatal — urutan tetap berlaku untuk sesi berjalan saja.
  }
  return valid;
}

/** Urutkan salinan array note sesuai id urutan yang diberikan. */
export function sortNotes(notes, sortId) {
  const comparator = COMPARATORS[sortId] || COMPARATORS[DEFAULT_SORT];
  return [...notes].sort(comparator);
}
