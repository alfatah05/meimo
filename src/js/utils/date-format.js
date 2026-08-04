/**
 * date-format.js
 * Helper format tanggal (createdAt/updatedAt) untuk ditampilkan di
 * Notes List — mis. footer note card "Diubah 2 jam lalu".
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Format tanggal ISO menjadi teks relatif berbahasa Indonesia
 * (mis. "Baru saja", "5 menit lalu", "kemarin", "3 hari lalu").
 * Mengembalikan string kosong bila `isoString` tidak valid.
 */
export function formatRelativeDate(isoString, now = new Date()) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Math.max(0, now.getTime() - date.getTime());

  if (diffMs < MINUTE) return "Baru saja";
  if (diffMs < HOUR) return `${Math.floor(diffMs / MINUTE)} menit lalu`;
  if (diffMs < DAY) return `${Math.floor(diffMs / HOUR)} jam lalu`;

  const days = Math.floor(diffMs / DAY);
  if (days === 1) return "kemarin";
  if (days < 7) return `${days} hari lalu`;

  const weeks = Math.floor(diffMs / WEEK);
  if (weeks === 1) return "minggu lalu";
  if (diffMs < MONTH) return `${weeks} minggu lalu`;

  const months = Math.floor(diffMs / MONTH);
  if (months === 1) return "bulan lalu";
  if (diffMs < YEAR) return `${months} bulan lalu`;

  const years = Math.floor(diffMs / YEAR);
  return years === 1 ? "tahun lalu" : `${years} tahun lalu`;
}
