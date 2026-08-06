/**
 * db.js
 * Inisialisasi & pengelolaan koneksi IndexedDB. Satu-satunya file yang
 * boleh memanggil API `indexedDB.*` mentah di seluruh aplikasi.
 *
 * notes-repository.js memakai helper di sini untuk transaksi; tidak ada
 * modul lain (editor, toolbar, notes list, dst) yang boleh mengimpor file
 * ini secara langsung — itu melanggar arsitektur:
 *   Editor -> Document Service -> Repository -> IndexedDB
 */

import { DB_NAME, DB_VERSION, applyUpgrade } from "./schema.js";

let dbPromise = null;

/**
 * Semua transaksi yang SEDANG berjalan (belum sempat memicu
 * oncomplete/onerror/onabort), dari withStore() manapun yang sedang aktif.
 *
 * PENTING — kenapa ini perlu: mitigasi sebelumnya (menutup `dbPromise` lewat
 * db.close() saat timeout / saat halaman terlihat lagi) HANYA membuang
 * REFERENSI KONEKSI, bukan membatalkan transaksi yang sudah kadung berjalan
 * di koneksi lama itu. IndexedDB mengeksekusi transaksi ke STORE yang sama
 * berurutan sesuai urutan dibuat — LINTAS KONEKSI sekalipun. Kalau satu
 * transaksi macet permanen (tidak pernah memicu event apa pun, mis. karena
 * proses tab sempat "dibekukan" browser tepat saat native picker foto/kamera
 * terbuka — lihat toolbar/image-sheet.js), transaksi itu TETAP "mengantre"
 * di store-nya walau koneksinya sudah ditutup, dan akan memblokir SEMUA
 * transaksi baru ke store yang sama selamanya — walau lewat koneksi baru
 * sekalipun. Ini yang menjelaskan kenapa gagalnya makin sering setelah
 * beberapa kali sisip gambar dalam satu sesi, dan akhirnya permanen: setiap
 * transaksi macet yang menumpuk menambah antrean yang tidak akan pernah
 * habis. Solusinya: simpan referensi tx di sini supaya bisa di-abort() PAKSA
 * (bukan cuma ditutup koneksinya) begitu terdeteksi macet — abort() yang
 * sungguhan melepas lock transaksi itu di store-nya.
 */
const activeTransactions = new Set();

function forceAbort(tx) {
  if (!tx) return;
  activeTransactions.delete(tx);
  try {
    tx.abort();
  } catch (_) {
    // Sudah selesai/batal duluan — abaikan.
  }
}

/** Bungkus IDBRequest jadi Promise. */
export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Buka (atau pakai ulang) koneksi database. Idempotent — dipanggil
 * berkali-kali tetap memakai satu koneksi yang sama (singleton promise).
 */
export function openDB() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB tidak tersedia di browser ini."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      applyUpgrade(request.result);
    };

    request.onsuccess = () => {
      const db = request.result;
      // Jika ada koneksi lain (tab lain) yang butuh upgrade versi,
      // lepas koneksi ini supaya tidak memblokir & buat ulang saat dipakai lagi.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      reject(request.error);
    };

    request.onblocked = () => {
      reject(new Error("Upgrade database diblokir — tutup tab lain yang membuka aplikasi ini, lalu coba lagi."));
    };
  });

  return dbPromise;
}

/**
 * Beberapa browser mobile (Android Chrome termasuk, bukan cuma Safari iOS)
 * diketahui membuat transaksi IndexedDB yang sedang berjalan jadi "macet" —
 * tidak pernah memicu oncomplete/onerror/onabort — begitu halaman sempat
 * di-background-kan, misalnya PERSIS saat native picker foto/kamera terbuka
 * untuk unggah gambar (lihat toolbar/image-sheet.js).
 *
 * Versi mitigasi SEBELUMNYA di sini hanya membuang `dbPromise` & memanggil
 * db.close() begitu halaman terlihat lagi — itu TIDAK CUKUP: db.close()
 * tidak membatalkan transaksi yang sudah kadung berjalan di koneksi lama,
 * cuma mencegah transaksi BARU memakainya. Transaksi macet itu tetap
 * "mengantre" di store-nya (lihat catatan `activeTransactions` di atas) dan
 * memblokir SEMUA transaksi berikutnya ke store yang sama, walau lewat
 * koneksi baru sekalipun — makin banyak gambar yang sempat "macet dulu baru
 * berhasil" dalam satu sesi, makin banyak juga transaksi macet yang
 * menumpuk & tidak pernah habis, sampai akhirnya SETIAP percobaan berikutnya
 * pasti gagal (persis pola yang dilaporkan: gambar ke-3 dst tidak pernah
 * bisa lagi walau diulang berkali-kali).
 *
 * Mitigasi di sini: begitu halaman terlihat lagi, beri jeda singkat dulu
 * (transaksi yang SUNGGUHAN cuma tertunda — bukan macet permanen — biasanya
 * langsung menyelesaikan diri sendiri begitu proses tab tidak lagi
 * dibekukan, lalu otomatis menghapus dirinya dari `activeTransactions` lewat
 * oncomplete/onerror di withStore()). Transaksi yang MASIH tersisa setelah
 * jeda itu baru dianggap benar-benar macet & di-abort() PAKSA — supaya
 * lock-nya di store benar-benar terlepas — baru koneksinya dibuang.
 */
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;

    setTimeout(() => {
      for (const tx of activeTransactions) forceAbort(tx);

      if (!dbPromise) return;
      const stale = dbPromise;
      dbPromise = null;
      stale
        .then((db) => {
          try {
            db.close();
          } catch (_) {
            // sudah tertutup / dalam keadaan aneh — abaikan.
          }
        })
        .catch(() => {});
    }, 300);
  });
}

const TRANSACTION_TIMEOUT_MS = 10000;

/**
 * Jaring pengaman umum: transaksi yang tidak kunjung memicu
 * oncomplete/onerror/onabort dalam waktu wajar (lihat catatan
 * `activeTransactions` & visibilitychange di atas untuk skenario paling
 * umum penyebabnya) tidak boleh membuat operasi seperti simpan gambar
 * "menggantung selamanya" dari sudut pandang UI (tombol tetap disabled,
 * bottom sheet tidak pernah tertutup). Kalau timeout kena, `onTimeout`
 * (dipanggil dari withStore() di bawah) yang menangani abort() paksa +
 * pembuangan koneksi lama.
 */
function withTimeout(promise, ms, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (onTimeout) onTimeout();
      reject(new Error("Database tidak merespons — coba lagi."));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** True bila error kemungkinan besar berasal dari koneksi IndexedDB yang
 * sudah "zombie"/tertutup — kasus yang di-retry otomatis oleh withStore(),
 * BUKAN error asli dari data/executor (mis. constraint gagal) yang harus
 * tetap dilempar apa adanya ke pemanggil. */
function isStaleConnectionError(err) {
  if (!err) return false;
  if (err.message === "Database tidak merespons — coba lagi.") return true;
  // Transaksi ini yang di-abort() paksa oleh kita sendiri (lihat
  // forceAbort() & visibilitychange handler di atas) karena terdeteksi
  // macet setelah halaman sempat di-background-kan — bukan error asli dari
  // data/executor, jadi tetap layak di-retry otomatis.
  if (err.message === "Transaksi database dibatalkan paksa (halaman sempat berpindah ke background).") return true;
  // db.transaction() melempar ini secara sinkron kalau koneksinya sudah
  // ditutup (mis. oleh visibilitychange handler di atas) tepat sebelum
  // dipakai lagi.
  if (err.name === "InvalidStateError") return true;
  return false;
}

/**
 * Jalankan sebuah transaksi terhadap satu/lebih object store.
 *
 * @param {string|string[]} storeNames - nama store yang dipakai transaksi.
 * @param {"readonly"|"readwrite"} mode
 * @param {(stores: IDBObjectStore|IDBObjectStore[], tx: IDBTransaction) => Promise<any>} executor
 * @param {boolean} [_isRetry] - internal, jangan diisi manual oleh pemanggil.
 * @returns {Promise<any>} hasil dari `executor`, resolve setelah transaksi commit.
 */
export async function withStore(storeNames, mode, executor, _isRetry = false) {
  const db = await openDB();

  // Dideklarasikan di scope terluar (bukan di dalam Promise executor seperti
  // sebelumnya) supaya bisa di-daftarkan ke `activeTransactions` & di-abort
  // paksa dari withTimeout()/jalur retry di bawah — inti perbaikannya, lihat
  // catatan panjang `activeTransactions` & visibilitychange di atas berkas.
  let tx;

  const txPromise = new Promise((resolve, reject) => {
    try {
      tx = db.transaction(storeNames, mode);
    } catch (err) {
      // Koneksi sudah tertutup/rusak — lempar lewat reject supaya jalur
      // retry di bawah yang menangani, bukan meledak sinkron ke pemanggil.
      reject(err);
      return;
    }
    activeTransactions.add(tx);
    const stores = Array.isArray(storeNames)
      ? storeNames.map((name) => tx.objectStore(name))
      : tx.objectStore(storeNames);

    let result;
    let settled = false;

    Promise.resolve(executor(stores, tx))
      .then((value) => {
        result = value;
      })
      .catch((err) => {
        settled = true;
        // Batalkan transaksi bila executor gagal sebelum tx selesai sendiri.
        forceAbort(tx);
        reject(err);
      });

    tx.oncomplete = () => {
      activeTransactions.delete(tx);
      if (!settled) resolve(result);
    };
    tx.onerror = () => {
      activeTransactions.delete(tx);
      if (!settled) reject(tx.error);
    };
    tx.onabort = () => {
      activeTransactions.delete(tx);
      if (!settled) reject(tx.error || new Error("Transaksi database dibatalkan."));
    };
  });

  try {
    const res = await withTimeout(txPromise, TRANSACTION_TIMEOUT_MS, () => {
      // Abort PAKSA transaksi yang macet dulu (melepas lock-nya di store),
      // BARU tutup koneksinya — cuma menutup koneksi (seperti versi
      // sebelumnya) tidak melepas lock itu & transaksi ini akan tetap
      // menyumbat antrean store-nya selamanya. Lihat catatan
      // `activeTransactions` di atas berkas untuk kenapa ini penting.
      forceAbort(tx);
      dbPromise = null;
      try {
        db.close();
      } catch (_) {
        // sudah tertutup / dalam keadaan aneh — abaikan.
      }
    });
    return res;
  } catch (err) {
    const stale = isStaleConnectionError(err);
    if (_isRetry || !stale) throw err;

    // Koneksi yang barusan dipakai kemungkinan besar "zombie" (macet
    // setelah halaman di-background-kan, mis. native picker foto/kamera —
    // lihat catatan visibilitychange & withTimeout di atas). Abort paksa
    // transaksinya (kalau masih ada & belum di-abort oleh withTimeout di
    // atas), buang koneksi itu, & coba SEKALI lagi otomatis pakai koneksi
    // baru yang segar, supaya user TIDAK perlu menekan "Terapkan" berkali-
    // kali secara manual saat mengalami ini.
    forceAbort(tx);
    dbPromise = null;
    try {
      db.close();
    } catch (_) {
      // abaikan.
    }
    return withStore(storeNames, mode, executor, true);
  }
}
