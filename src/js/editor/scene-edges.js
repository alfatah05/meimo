/**
 * scene-edges.js
 * Menghasilkan bentuk tepi (Edge Style) sebuah Scene sebagai `clip-path:
 * polygon(...)` CSS — dipakai BERSAMA oleh serializer.js (merender Scene
 * sungguhan di editor) dan toolbar/scene-sheet.js (preview kecil tiap
 * preset di bottom sheet), supaya preview yang dilihat user di sheet
 * dijamin sama persis dengan hasil render aslinya (satu sumber kebenaran).
 *
 * Titik-x dinyatakan dalam PERSEN lebar elemen, titik-y dalam PIXEL tinggi
 * elemen — clip-path CSS mendukung campuran satuan begini per titik, jadi
 * bentuknya otomatis menyesuaikan lebar Scene tanpa perlu dihitung ulang
 * lewat JS saat resize (cuma tinggi bar edge yang tetap/fixed, lihat
 * SCENE_EDGE_HEIGHT di scene.css).
 *
 * Semua fungsi di sini DETERMINISTIK (tidak memakai Math.random) — mis.
 * bentuk "torn" (robek) tetap sama setiap kali dirender ulang, memakai
 * fungsi hash trigonometri semu-acak yang seeded dari index titik, BUKAN
 * generator acak sungguhan — supaya bentuknya tidak "berkedip" beda tiap
 * kali dokumen di-render ulang (mis. setelah mengetik).
 */

// Tinggi bar edge (px) — HARUS sama dengan --scene-edge-height di scene.css.
export const SCENE_EDGE_HEIGHT = 22;

function pseudoRandom(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x); // [0, 1)
}

/**
 * @param {string} style - salah satu SCENE_EDGE_STYLES (block-model.js)
 * @param {"top"|"bottom"} side - tepi atas atau bawah Scene
 * @param {number} height - tinggi bar (px), default SCENE_EDGE_HEIGHT
 * @returns {string} nilai siap pakai untuk `clip-path` (mis. "polygon(0% 0px, ...)")
 */
export function buildEdgeClipPath(style, side, height = SCENE_EDGE_HEIGHT) {
  const H = height;
  const isTop = side === "top";
  // `flat` = sisi yang menempel rapat ke body Scene (harus lurus penuh
  // supaya tidak ada celah), `outer` = batas jauh yang boleh berbentuk.
  const flatY = isTop ? H : 0;
  const outerBase = isTop ? 0 : H;
  // BUG FIX: gelombang dua-arah (wave/torn/brush) HARUS berosilasi di
  // sekitar titik TENGAH bar (H/2), bukan di sekitar `outerBase` (0 atau H).
  // `push()` di bawah meng-clamp y ke [0, H] — kalau pusat osilasinya ada
  // TEPAT di batas 0/H (outerBase), separuh dari tiap gelombang selalu
  // bernilai negatif/lebih dari H dan ke-clamp rata jadi garis lurus, jadi
  // yang kelihatan cuma tonjolan kecil di atas garis lurus, bukan gelombang
  // penuh — dari jauh nyaris tidak beda dari edge "straight" biasa.
  // Berosilasi di H/2 memastikan kedua sisi gelombang tetap di dalam
  // rentang [0, H] (selama amplitudo <= H/2) sehingga tidak pernah ke-clamp.
  const midBase = H / 2;
  // Sudut jauh (outer) dari sisi berlawanan arah gelombang, dipakai untuk
  // menutup polygon secara lurus di kedua ujung kiri/kanan.
  const points = [];
  const push = (xPct, y) => points.push(`${xPct}% ${Math.max(0, Math.min(H, y)).toFixed(1)}px`);

  const N = 48; // jumlah segmen sepanjang lebar — cukup halus untuk kurva

  function wavePoints(amplitude, cycles, phase = 0) {
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = midBase + Math.sin(t * Math.PI * 2 * cycles + phase) * amplitude * (isTop ? 1 : -1);
      push((t * 100).toFixed(2), y);
    }
  }

  function bumpPoints(bumpCount, amplitude) {
    // Deretan tonjolan setengah-lingkaran (efek "scallop"), dipakai untuk
    // preset "stamp" (kecil banyak) & "cloud" (besar sedikit).
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const local = (t * bumpCount) % 1; // posisi dalam satu tonjolan [0,1)
      const bump = Math.sin(local * Math.PI); // 0 di tepi tonjolan, 1 di puncak
      const y = outerBase + bump * amplitude * (isTop ? 1 : -1);
      push((t * 100).toFixed(2), y);
    }
  }

  function jaggedPoints(segments, amplitude, roughness) {
    // Garis patah-patah tidak beraturan (efek "robek"), lewat hash
    // trigonometri semu-acak yang seeded per titik + sisi, deterministik.
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const seed = i * (isTop ? 7.13 : 3.71) + (i % 2 === 0 ? 1.7 : 0);
      const r = pseudoRandom(seed) * 2 - 1; // [-1, 1)
      const y = midBase + r * amplitude * roughness * (isTop ? 1 : -1);
      push((t * 100).toFixed(2), y);
    }
  }

  function zigzagPoints(teeth) {
    for (let i = 0; i <= teeth * 2; i++) {
      const t = i / (teeth * 2);
      const high = i % 2 === 0;
      const y = high ? outerBase : outerBase + H * 0.7 * (isTop ? 1 : -1);
      push((t * 100).toFixed(2), y);
    }
  }

  switch (style) {
    case "wave":
      // Amplitudo dikecilkan dari H*0.55 -> H*0.45: sekarang berosilasi di
      // H/2 (lihat komentar `midBase` di atas), jadi amplitudo harus <= H/2
      // supaya kedua puncak gelombang tetap penuh kelihatan, tidak ke-clamp.
      wavePoints(H * 0.45, 2.5);
      break;
    case "stamp":
      bumpPoints(14, H * 0.85);
      break;
    case "cloud":
      bumpPoints(5, H * 0.95);
      break;
    case "zigzag":
      zigzagPoints(9);
      break;
    case "torn":
      // amplitudo*roughness dikecilkan dari H*0.9 -> H/2*0.9 supaya pas di
      // dalam rentang [0, H] sekarang jaggedPoints() berosilasi di H/2.
      jaggedPoints(22, H / 2, 0.9);
      break;
    case "brush":
      // Gelombang kasar: gelombang utama + gelombang sekunder frekuensi
      // tinggi beramplitudo kecil, memberi kesan sapuan kuas yang tidak rapi.
      // Amplitudo gabungan dikecilkan (0.4H+0.12H -> 0.3H+0.1H) supaya <= H/2
      // sekarang berosilasi di H/2, bukan di outerBase.
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const main = Math.sin(t * Math.PI * 2 * 1.6) * H * 0.3;
        const noise = Math.sin(t * Math.PI * 2 * 9 + 1.3) * H * 0.1;
        const y = midBase + (main + noise) * (isTop ? 1 : -1);
        push((t * 100).toFixed(2), y);
      }
      break;
    case "straight":
    default:
      // Tidak dipakai secara langsung (lihat SCENE_EDGE_STYLES "straight" —
      // serializer.js/scene-sheet.js melewati pembuatan bar edge sama
      // sekali untuk preset ini), tapi tetap sediakan fallback aman berupa
      // garis lurus kalau terpanggil.
      push(0, outerBase);
      push(100, outerBase);
      break;
  }

  // Tutup polygon lewat sisi flat (menempel body) di kedua ujung.
  push(100, flatY);
  push(0, flatY);

  return `polygon(${points.join(", ")})`;
}
