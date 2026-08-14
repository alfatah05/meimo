/**
 * date-format.js
 * Helper format tanggal (createdAt/updatedAt) untuk ditampilkan di
 * Notes List — mis. footer note card "Updated 2 hr ago".
 */

import { t } from "../i18n/i18n.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Format tanggal ISO menjadi teks relatif sesuai bahasa UI aktif
 * (mis. "Just now", "5 min ago", "Yesterday").
 * Mengembalikan string kosong bila `isoString` tidak valid.
 */
export function formatRelativeDate(isoString, now = new Date()) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Math.max(0, now.getTime() - date.getTime());

  if (diffMs < MINUTE) return t("date.justNow");
  if (diffMs < HOUR) return t("date.minutesAgo", { n: Math.floor(diffMs / MINUTE) });
  if (diffMs < DAY) return t("date.hoursAgo", { n: Math.floor(diffMs / HOUR) });

  const days = Math.floor(diffMs / DAY);
  if (days === 1) return t("date.yesterday");
  if (days < 7) return t("date.daysAgo", { n: days });

  const weeks = Math.floor(diffMs / WEEK);
  if (weeks === 1) return t("date.lastWeek");
  if (diffMs < MONTH) return t("date.weeksAgo", { n: weeks });

  const months = Math.floor(diffMs / MONTH);
  if (months === 1) return t("date.lastMonth");
  if (diffMs < YEAR) return t("date.monthsAgo", { n: months });

  const years = Math.floor(diffMs / YEAR);
  return years === 1 ? t("date.lastYear") : t("date.yearsAgo", { n: years });
}
