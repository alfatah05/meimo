/**
 * card-edge-outline.js
 * Menghasilkan `clip-path: polygon(...)` UTUH untuk SATU KARTU NOTE penuh
 * (bukan cuma satu bar tepi lepas seperti editor/scene-edges.js) — tepi
 * ATAS & BAWAH kartu dibentuk (scallop/robek/ombak/dst), kedua SISI
 * (kiri-kanan) selalu tetap lurus supaya kartu tetap terlihat rapi di
 * grid. Bahasa bentuknya sengaja disamakan dengan Edge Style "Scene" di
 * editor (lihat editor/scene-edges.js & EDGE_LABELS di toolbar/scene-sheet.js)
 * supaya konsisten satu aplikasi, tapi dihitung terpisah di sini karena di
 * sini yang dibentuk adalah GARIS KELILING SATU KARTU UTUH (loop tertutup
 * atas+bawah+kedua sisi sekaligus), bukan satu bar dekorasi lepas.
 *
 * Hasil clip-path-nya STATIS (dihitung sekali saat modul ini dimuat, lihat
 * CARD_EDGE_CLIP di bawah) — tidak perlu dihitung ulang saat resize, karena
 * titik-x pakai persen (%) yang otomatis ikut lebar kartu, dan titik-y tepi
 * pakai px tetap / `calc(100% - Npx)` yang otomatis ikut tinggi kartu.
 *
 * Semua kurva DETERMINISTIK (fungsi hash trigonometri semu-acak, seeded per
 * titik) — bukan Math.random — supaya bentuknya tidak "berkedip" beda tiap
 * kali daftar kartu dirender ulang.
 */

// Tinggi band tepi (px) — seberapa dalam bentuk (scallop/robek/dst) masuk
// dari tepi kartu ke arah tengah. Sengaja kecil supaya tidak memakan
// banyak ruang judul/snippet kartu.
const EDGE_BAND = 12;

// Jumlah segmen sepanjang lebar kartu untuk kurva halus (wave/cloud/brush).
const N = 40;

function pseudoRandom(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x); // [0, 1)
}

const clampBand = (y) => Math.max(0, Math.min(EDGE_BAND, y));

/**
 * Titik satu tepi (dipakai identik untuk atas & bawah, lalu di-mirror lewat
 * transformasi koordinat di buildCardOutlineClipPath). `y` bernilai 0 di
 * batas TERLUAR kartu (titik yang paling "menonjol keluar", mis. puncak
 * scallop) dan EDGE_BAND di batas dalam/rata (menyatu ke isi kartu).
 * @returns {{t: number, y: number}[]} t dalam rentang [0, 1] (posisi lebar)
 */
function edgeCurvePoints(style) {
  const mid = EDGE_BAND / 2;
  const pts = [];

  switch (style) {
    case "stamp": {
      // Perangko — deretan scallop kecil rapat, meniru lubang perforasi
      // di tepi perangko pos.
      const bumps = 14;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const local = (t * bumps) % 1;
        const bump = Math.sin(local * Math.PI); // 0 di lembah, 1 di puncak
        pts.push({ t, y: clampBand(EDGE_BAND - bump * EDGE_BAND * 0.95) });
      }
      break;
    }
    case "cloud": {
      // Awan — scallop besar & jarang.
      const bumps = 4.5;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const local = (t * bumps) % 1;
        const bump = Math.sin(local * Math.PI);
        pts.push({ t, y: clampBand(EDGE_BAND - bump * EDGE_BAND) });
      }
      break;
    }
    case "torn": {
      // Sobekan kertas — garis patah-patah tak beraturan, deterministik
      // lewat hash trigonometri semu-acak (bukan Math.random).
      const segments = 22;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const seed = i * 7.13 + (i % 2 === 0 ? 1.7 : 0);
        const r = pseudoRandom(seed) * 2 - 1; // [-1, 1)
        pts.push({ t, y: clampBand(mid + r * mid * 0.95) });
      }
      break;
    }
    case "wave": {
      // Ombak — gelombang halus beraturan.
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const y = mid + Math.sin(t * Math.PI * 2 * 2.5) * mid * 0.9;
        pts.push({ t, y: clampBand(y) });
      }
      break;
    }
    case "zigzag": {
      const teeth = 9;
      for (let i = 0; i <= teeth * 2; i++) {
        const t = i / (teeth * 2);
        const high = i % 2 === 0;
        pts.push({ t, y: clampBand(high ? 0 : EDGE_BAND * 0.75) });
      }
      break;
    }
    case "brush": {
      // Sapuan kuas — gelombang utama + noise frekuensi tinggi beramplitudo
      // kecil, memberi kesan sapuan yang tidak rapi.
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const main = Math.sin(t * Math.PI * 2 * 1.6) * EDGE_BAND * 0.35;
        const noise = Math.sin(t * Math.PI * 2 * 9 + 1.3) * EDGE_BAND * 0.12;
        pts.push({ t, y: clampBand(mid + main + noise) });
      }
      break;
    }
    default:
      pts.push({ t: 0, y: EDGE_BAND }, { t: 1, y: EDGE_BAND });
  }

  return pts;
}

/**
 * Bangun clip-path polygon UTUH satu kartu untuk sebuah preset bentuk tepi.
 * Urutan titik: tepi ATAS (kiri->kanan), lalu sisi kanan (implisit, garis
 * lurus dari titik terakhir atas ke titik pertama bawah), tepi BAWAH
 * (kanan->kiri, memakai kurva sama yang di-mirror lewat `calc(100% - y)`),
 * lalu sisi kiri (implisit, clip-path otomatis menutup loop dari titik
 * terakhir kembali ke titik pertama).
 * @param {string} style - salah satu key di edgeCurvePoints
 * @returns {string} nilai siap pakai untuk CSS `clip-path`
 */
function buildCardOutlineClipPath(style) {
  const curve = edgeCurvePoints(style);
  const top = curve.map((p) => `${(p.t * 100).toFixed(2)}% ${p.y.toFixed(1)}px`);
  const bottom = [...curve]
    .reverse()
    .map((p) => `${(p.t * 100).toFixed(2)}% calc(100% - ${p.y.toFixed(1)}px)`);
  return `polygon(${[...top, ...bottom].join(", ")})`;
}

/** Clip-path siap pakai per preset — dihitung sekali saat modul dimuat,
 * dipakai langsung sebagai `clipPath` di EDGE_SHAPES (card-style-presets.js). */
export const CARD_EDGE_CLIP = Object.freeze({
  stamp: buildCardOutlineClipPath("stamp"),
  cloud: buildCardOutlineClipPath("cloud"),
  torn: buildCardOutlineClipPath("torn"),
  wave: buildCardOutlineClipPath("wave"),
  zigzag: buildCardOutlineClipPath("zigzag"),
  brush: buildCardOutlineClipPath("brush"),
});
