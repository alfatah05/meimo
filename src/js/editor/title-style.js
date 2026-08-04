/**
 * title-style.js
 * Menerapkan `document.titleStyle` (lihat block-model.js createDocument)
 * sebagai inline style ke #editorTitle.
 *
 * Beda dari format isi catatan (bold/italic/warna dst. — per-karakter,
 * lewat model `runs`/`marks`, lihat commands.js & serializer.js), style
 * judul berlaku untuk SELURUH field judul sekaligus: judul cuma satu baris
 * teks polos (textContent, lihat app.js), jadi tidak ada konsep "seleksi
 * sebagian teks judul diformat beda". Field yang kosong/null berarti pakai
 * default dari CSS (.note-title-field, lihat src/css/typography.css).
 */

/** Terapkan `style` ke elemen judul. `style` boleh `null`/`undefined` —
 * berarti kembali ke tampilan default (semua inline style dilepas). */
export function applyTitleStyle(titleEl, style) {
  if (!titleEl) return;
  const s = style || {};
  titleEl.style.fontFamily = s.fontFamily ? `"${s.fontFamily}"` : "";
  titleEl.style.fontSize = s.fontSize ? `${s.fontSize}px` : "";
  titleEl.style.color = s.color || "";
  titleEl.style.textAlign = s.align || "";
  titleEl.style.letterSpacing = typeof s.letterSpacing === "number" ? `${s.letterSpacing}px` : "";
  // Default judul BOLD (lihat .note-title-field di typography.css, sudah
  // var(--weight-semibold) secara default) — cuma di-override ke berat
  // normal saat user MEMATIKAN Bold secara eksplisit lewat toolbar
  // (bold === false). `bold` yang null/undefined tetap dianggap bold,
  // lihat isTitleBold() di bawah.
  titleEl.style.fontWeight = s.bold === false ? "var(--weight-regular)" : "";
}

/** Judul default-nya BOLD — cuma dianggap tidak-bold kalau `titleStyle.bold`
 * secara eksplisit `false` (dimatikan lewat toolbar). Dipakai toolbar.js
 * untuk menentukan status aktif tombol Bold & nilai baru saat di-toggle. */
export function isTitleBold(style) {
  return !style || style.bold !== false;
}
