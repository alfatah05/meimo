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
      // Amplitudo <= H/2 supaya gelombang penuh tidak ter-clamp.
      wavePoints(H * 0.45, 2.5);
      break;
    case "double-wave":
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const y =
          midBase +
          (Math.sin(t * Math.PI * 2 * 2) * H * 0.32 +
            Math.sin(t * Math.PI * 2 * 4) * H * 0.12) *
            (isTop ? 1 : -1);
        push((t * 100).toFixed(2), y);
      }
      break;
    case "ripple":
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const y =
          midBase +
          (Math.sin(t * Math.PI * 2 * 3.5) * H * 0.28 +
            Math.sin(t * Math.PI * 2 * 8) * H * 0.1) *
            (isTop ? 1 : -1);
        push((t * 100).toFixed(2), y);
      }
      break;
    case "stamp":
      bumpPoints(14, H * 0.85);
      break;
    case "stamp-fine":
      bumpPoints(22, H * 0.7);
      break;
    case "scallop":
      bumpPoints(8, H * 0.8);
      break;
    case "cloud":
      bumpPoints(5, H * 0.95);
      break;
    case "zigzag":
      zigzagPoints(9);
      break;
    case "pinked":
      zigzagPoints(16);
      break;
    case "saw": {
      // Gigi gergaji asimetris (naik curam, turun landai).
      const teeth = 8;
      for (let i = 0; i < teeth; i++) {
        const t0 = i / teeth;
        const tPeak = (i + 0.25) / teeth;
        const t1 = (i + 1) / teeth;
        const dir = isTop ? 1 : -1;
        push((t0 * 100).toFixed(2), outerBase);
        push((tPeak * 100).toFixed(2), outerBase + H * 0.75 * dir);
        push((t1 * 100).toFixed(2), outerBase);
      }
      break;
    }
    case "steps": {
      const steps = 7;
      for (let i = 0; i <= steps; i++) {
        const t0 = i / steps;
        const t1 = Math.min(1, (i + 0.48) / steps);
        const high = i % 2 === 0;
        const dir = isTop ? 1 : -1;
        const y = outerBase + (high ? H * 0.2 : H * 0.7) * dir;
        push((t0 * 100).toFixed(2), y);
        if (t1 > t0) push((t1 * 100).toFixed(2), y);
      }
      break;
    }
    case "torn":
      jaggedPoints(22, H / 2, 0.9);
      break;
    case "deckle":
      // Noise lebih halus dari torn — tepi kertas handmade.
      jaggedPoints(32, H / 2, 0.55);
      break;
    case "brush":
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const main = Math.sin(t * Math.PI * 2 * 1.6) * H * 0.3;
        const noise = Math.sin(t * Math.PI * 2 * 9 + 1.3) * H * 0.1;
        const y = midBase + (main + noise) * (isTop ? 1 : -1);
        push((t * 100).toFixed(2), y);
      }
      break;
    case "notch": {
      // Lekukan lembut di tengah tepi.
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const d = Math.abs(t - 0.5);
        const depth = d < 0.12 ? (1 - d / 0.12) * H * 0.7 : 0;
        const dir = isTop ? 1 : -1;
        const y = outerBase + (H * 0.15 + depth) * dir;
        push((t * 100).toFixed(2), y);
      }
      break;
    }
    case "arc": {
      // Satu lengkung lembut full-width.
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const bump = Math.sin(t * Math.PI); // 0 di ujung, 1 di tengah
        const dir = isTop ? 1 : -1;
        const y = outerBase + bump * H * 0.75 * dir;
        push((t * 100).toFixed(2), y);
      }
      break;
    }
    case "peaks": {
      // Beberapa puncak gunung lembut.
      const peaks = 3.5;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const local = (t * peaks) % 1;
        const bump = Math.sin(local * Math.PI);
        const dir = isTop ? 1 : -1;
        const y = outerBase + bump * H * 0.8 * dir;
        push((t * 100).toFixed(2), y);
      }
      break;
    }
    case "straight":
    default:
      // Fallback garis lurus (straight tidak membuat bar edge di serializer).
      push(0, outerBase);
      push(100, outerBase);
      break;
  }

  // Tutup polygon lewat sisi flat (menempel body) di kedua ujung.
  push(100, flatY);
  push(0, flatY);

  return `polygon(${points.join(", ")})`;
}
