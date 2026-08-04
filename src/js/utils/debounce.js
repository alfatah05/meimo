/**
 * debounce.js
 * Menunda eksekusi fungsi sampai tidak ada pemanggilan baru dalam `wait` ms.
 * Dipakai misalnya untuk auto-save & search realtime.
 */

export function debounce(fn, wait = 300) {
  let timer = null;
  function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  }
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}
