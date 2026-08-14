/**
 * card-edge-outline.js
 * Menghasilkan `clip-path: polygon(...)` untuk keliling satu kartu note.
 * Tepi atas+bawah dibentuk; sisi kiri/kanan tetap lurus.
 *
 * EDGE_BAND sengaja kecil (~8px) supaya bentuk tidak memotong judul/snippet.
 */

// Kedalaman tepi (px) — jangan diperbesar; isi kartu harus aman.
const EDGE_BAND = 8;
const N = 48;

function pseudoRandom(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const clampBand = (y, band = EDGE_BAND) => Math.max(0, Math.min(band, y));

/**
 * @param {string} style
 * @param {number} [band]
 * @returns {{t: number, y: number}[]}
 */
function edgeCurvePoints(style, band = EDGE_BAND) {
  const mid = band / 2;
  const pts = [];

  switch (style) {
    case "stamp": {
      const bumps = 16;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const local = (t * bumps) % 1;
        const bump = Math.sin(local * Math.PI);
        pts.push({ t, y: clampBand(band - bump * band * 0.9, band) });
      }
      break;
    }
    case "stamp-fine": {
      const bumps = 22;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const local = (t * bumps) % 1;
        const bump = Math.sin(local * Math.PI);
        pts.push({ t, y: clampBand(band - bump * band * 0.75, band) });
      }
      break;
    }
    case "cloud": {
      const bumps = 5;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const local = (t * bumps) % 1;
        const bump = Math.sin(local * Math.PI);
        pts.push({ t, y: clampBand(band - bump * band * 0.85, band) });
      }
      break;
    }
    case "scallop": {
      const bumps = 8;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const local = (t * bumps) % 1;
        const bump = Math.sin(local * Math.PI);
        pts.push({ t, y: clampBand(band - bump * band * 0.8, band) });
      }
      break;
    }
    case "torn": {
      const segments = 24;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const seed = i * 7.13 + (i % 2 === 0 ? 1.7 : 0);
        const r = pseudoRandom(seed) * 2 - 1;
        pts.push({ t, y: clampBand(mid + r * mid * 0.85, band) });
      }
      break;
    }
    case "deckle": {
      // Tepi kertas handmade — noise lebih halus dari torn.
      const segments = 32;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const r1 = pseudoRandom(i * 3.17) * 2 - 1;
        const r2 = pseudoRandom(i * 9.41 + 2) * 2 - 1;
        pts.push({ t, y: clampBand(mid + r1 * mid * 0.55 + r2 * mid * 0.25, band) });
      }
      break;
    }
    case "wave": {
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const y = mid + Math.sin(t * Math.PI * 2 * 2.5) * mid * 0.85;
        pts.push({ t, y: clampBand(y, band) });
      }
      break;
    }
    case "ripple": {
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const y =
          mid +
          Math.sin(t * Math.PI * 2 * 3.5) * mid * 0.55 +
          Math.sin(t * Math.PI * 2 * 7) * mid * 0.2;
        pts.push({ t, y: clampBand(y, band) });
      }
      break;
    }
    case "double-wave": {
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const y = mid + Math.sin(t * Math.PI * 2 * 2) * mid * 0.7 + Math.sin(t * Math.PI * 2 * 4) * mid * 0.25;
        pts.push({ t, y: clampBand(y, band) });
      }
      break;
    }
    case "zigzag": {
      const teeth = 10;
      for (let i = 0; i <= teeth * 2; i++) {
        const t = i / (teeth * 2);
        const high = i % 2 === 0;
        pts.push({ t, y: clampBand(high ? band * 0.15 : band * 0.85, band) });
      }
      break;
    }
    case "pinked": {
      // Tepi gunting zig-zag kecil (pinking shears).
      const teeth = 18;
      for (let i = 0; i <= teeth * 2; i++) {
        const t = i / (teeth * 2);
        const high = i % 2 === 0;
        pts.push({ t, y: clampBand(high ? band * 0.2 : band * 0.75, band) });
      }
      break;
    }
    case "steps": {
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const t0 = i / steps;
        const t1 = Math.min(1, (i + 0.45) / steps);
        const high = i % 2 === 0;
        const y = high ? band * 0.25 : band * 0.75;
        pts.push({ t: t0, y: clampBand(y, band) });
        if (t1 > t0) pts.push({ t: t1, y: clampBand(y, band) });
      }
      break;
    }
    case "brush": {
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const main = Math.sin(t * Math.PI * 2 * 1.6) * band * 0.3;
        const noise = Math.sin(t * Math.PI * 2 * 9 + 1.3) * band * 0.1;
        pts.push({ t, y: clampBand(mid + main + noise, band) });
      }
      break;
    }
    case "notch": {
      // Lekukan kecil di tengah tepi (tiket).
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const d = Math.abs(t - 0.5);
        const notch = d < 0.08 ? (1 - d / 0.08) * band * 0.85 : 0;
        pts.push({ t, y: clampBand(band * 0.2 + notch, band) });
      }
      break;
    }
    default:
      pts.push({ t: 0, y: band }, { t: 1, y: band });
  }

  return pts;
}

function buildCardOutlineClipPath(style, band = EDGE_BAND) {
  const curve = edgeCurvePoints(style, band);
  const top = curve.map((p) => `${(p.t * 100).toFixed(2)}% ${p.y.toFixed(1)}px`);
  const bottom = [...curve]
    .reverse()
    .map((p) => `${(p.t * 100).toFixed(2)}% calc(100% - ${p.y.toFixed(1)}px)`);
  return `polygon(${[...top, ...bottom].join(", ")})`;
}

/** Clip-path siap pakai per preset. */
export const CARD_EDGE_CLIP = Object.freeze({
  stamp: buildCardOutlineClipPath("stamp"),
  "stamp-fine": buildCardOutlineClipPath("stamp-fine"),
  cloud: buildCardOutlineClipPath("cloud"),
  scallop: buildCardOutlineClipPath("scallop"),
  torn: buildCardOutlineClipPath("torn"),
  deckle: buildCardOutlineClipPath("deckle"),
  wave: buildCardOutlineClipPath("wave"),
  ripple: buildCardOutlineClipPath("ripple"),
  "double-wave": buildCardOutlineClipPath("double-wave"),
  zigzag: buildCardOutlineClipPath("zigzag"),
  pinked: buildCardOutlineClipPath("pinked"),
  steps: buildCardOutlineClipPath("steps"),
  brush: buildCardOutlineClipPath("brush"),
  notch: buildCardOutlineClipPath("notch"),
});
