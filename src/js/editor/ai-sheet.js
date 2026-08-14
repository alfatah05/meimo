/**
 * ai-sheet.js
 * FAB "AI" + bottom sheet prompt ke Gemini (gemini-3.6-flash).
 *
 * - Ada seleksi → teks terpilih jadi konteks + diganti hasil AI
 * - Tidak ada seleksi → hasil disisipkan di posisi kursor
 * - Output JSON terstruktur (heading/quote/list/scene/…) lalu dianimasikan
 *   seperti mengetik di editor
 * - FAB hanya tampil saat ada kursor di #editorBody
 * - Overlay sheet pointer-events:none → catatan di belakang tetap bisa di-scroll
 */

import { createEl } from "../utils/dom.js";
import { registerActiveSheet, closeActiveSheet, clearActiveSheet } from "../toolbar/active-sheet.js";
import { insertPastedText, pasteBlockClipboard } from "./commands.js";
import {
  blockText,
  isVoidBlockType,
  isListItemType,
  createBlock,
  createRun,
  createSceneMeta,
  SCENE_EDGE_STYLES,
  SCENE_PADDING_PRESETS,
  blockTextLength,
} from "./block-model.js";
import { uuid } from "../utils/uuid.js";
import { showToast } from "../../components/toast.js";
import { getAiApiKey, getAiModel } from "../services/settings-service.js";
import { t } from "../i18n/i18n.js";

const AI_SHEET_ICON =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75L19 14z"/><path d="M5 15l.5 1.5L7 17l-1.5.5L5 19l-.5-1.5L3 17l1.5-.5L5 15z"/></svg>';

function buildAiSheetHeader(title, subtitle) {
  const head = createEl("div", { className: "ai-sheet__head" });
  // Tanpa strip/handle di atas — user sering mengira sheet bisa di-drag.
  const brand = createEl("div", { className: "ai-sheet__brand" });
  const icon = createEl("div", { className: "ai-sheet__brand-icon" });
  icon.innerHTML = AI_SHEET_ICON;
  brand.appendChild(icon);
  const texts = createEl("div", { className: "ai-sheet__brand-text" });
  const titleEl = createEl("div", { className: "ai-sheet__brand-title", text: title });
  texts.appendChild(titleEl);
  let subEl = null;
  if (subtitle) {
    subEl = createEl("div", { className: "ai-sheet__brand-sub", text: subtitle });
    texts.appendChild(subEl);
  }
  brand.appendChild(texts);
  head.appendChild(brand);
  head.__titleEl = titleEl;
  head.__subEl = subEl;
  return head;
}


function geminiEndpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

const CLOSE_ANIM_MS = 180;
const TYPE_CHAR_MS = 14; // delay per karakter (typewriter)
const TYPE_BLOCK_PAUSE_MS = 120; // jeda antar block

const SCENE_BG_MAP = {
  rose: "var(--scene-bg-rose)",
  cherry: "var(--scene-bg-cherry)",
  coral: "var(--scene-bg-coral)",
  peach: "var(--scene-bg-peach)",
  amber: "var(--scene-bg-amber)",
  gold: "var(--scene-bg-gold)",
  lime: "var(--scene-bg-lime)",
  olive: "var(--scene-bg-olive)",
  mint: "var(--scene-bg-mint)",
  teal: "var(--scene-bg-teal)",
  aqua: "var(--scene-bg-aqua)",
  sky: "var(--scene-bg-sky)",
  indigo: "var(--scene-bg-indigo)",
  periwinkle: "var(--scene-bg-periwinkle)",
  lavender: "var(--scene-bg-lavender)",
  plum: "var(--scene-bg-plum)",
  grape: "var(--scene-bg-grape)",
  slate: "var(--scene-bg-slate)",
  gray: "var(--scene-bg-gray)",
};

const HIGHLIGHT_KEYS = new Set([
  "amber", "peach", "rose", "grape", "lavender", "sky", "aqua", "mint", "lime",
]);

const VALID_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "quote",
  "bulleted-list-item",
  "numbered-list-item",
  "checklist-item",
  "divider",
]);

const VALID_ALIGN = new Set(["left", "center", "right", "justify"]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildSystemInstruction() {
  return `Kamu adalah asisten penulisan di aplikasi catatan Meimo.

FORMAT OUTPUT (WAJIB):
Balas HANYA dengan JSON valid (tanpa markdown code fence, tanpa penjelasan di luar JSON) berbentuk:

{
  "blocks": [
    // daftar block dari atas ke bawah
  ]
}

TIPE BLOCK yang didukung:
1. paragraph — teks biasa
   { "type": "paragraph", "text": "...", "align": "left|center|right|justify" }
2. heading — judul H1–H6
   { "type": "heading", "level": 1-6, "text": "..." }
3. quote — kutipan (blockquote)
   { "type": "quote", "text": "..." }
4. bulleted-list-item — bullet list
   { "type": "bulleted-list-item", "text": "..." }
5. numbered-list-item — numbered list
   { "type": "numbered-list-item", "text": "..." }
6. checklist-item — checklist (centang)
   { "type": "checklist-item", "text": "...", "checked": false }
7. divider — garis pemisah (tanpa teks)
   { "type": "divider" }
8. scene — grup visual (background + padding + tepi) yang berisi block anak
   {
     "type": "scene",
     "background": "mint|peach|rose|lavender|sky|aqua|amber|gold|lime|teal|indigo|grape|coral|cherry|olive|periwinkle|plum|slate|gray",
     "padding": "none|sm|md|lg|xl",
     "edge": "straight|wave|torn|stamp|zigzag|cloud|brush",
     "blocks": [ /* block anak */ ]
   }

MARKS INLINE di field "text" (opsional):
- **tebal** → bold
- *miring* → italic
- __garis bawah__ → underline
- ~~coret~~ → strikethrough
Boleh juga "runs": [{ "text": "...", "bold": true, "color": "#4a55c7", "highlight": "amber" }]

ATURAN:
- Output HANYA JSON.
- Bahasa ikuti permintaan user.
- Jangan buat block image.
- DEFAULT = paragraph biasa. Tulis natural seperti catatan, jangan
  berlebihan struktur.
- JANGAN pakai heading (type "heading") kecuali user secara eksplisit
  minta judul/heading/H1–H6.
- JANGAN pakai list (bulleted-list-item, numbered-list-item, checklist-item)
  kecuali user secara eksplisit minta list, bullet, poin, checklist, atau
  penomoran.
- JANGAN pakai quote atau divider kecuali user minta.
- Block "scene" HANYA boleh dipakai kalau user MEMINTA secara eksplisit
  (mis. menyebut kata "scene", "background", "bingkai warna", "di dalam
  kotak mint", dll). Kalau tidak diminta, JANGAN bungkus dengan scene.
- Formatting inline (bold/italic/warna/highlight) boleh secukupnya bila
  memang membantu, tapi jangan memaksa struktur judul/list.`;
}

function getSelectedText(state, sel) {
  if (!sel || sel.collapsed) return "";
  const blocks = state.getDocument().blocks;
  const parts = [];
  for (let i = sel.startBlockIndex; i <= sel.endBlockIndex; i++) {
    const block = blocks[i];
    if (!block || isVoidBlockType(block.type)) {
      if (i < sel.endBlockIndex) parts.push("");
      continue;
    }
    const text = blockText(block);
    if (i === sel.startBlockIndex && i === sel.endBlockIndex) {
      parts.push(text.slice(sel.startOffset, sel.endOffset));
    } else if (i === sel.startBlockIndex) {
      parts.push(text.slice(sel.startOffset));
    } else if (i === sel.endBlockIndex) {
      parts.push(text.slice(0, sel.endOffset));
    } else {
      parts.push(text);
    }
  }
  return parts.join("\n");
}

function buildUserPrompt(userPrompt, selectedText, insertMode = "replace") {
  if (selectedText && selectedText.trim()) {
    if (insertMode === "new") {
      return (
        `Teks konteks yang dipilih user (JANGAN dihapus; dipakai hanya sebagai acuan):\n` +
        `"""\n${selectedText}\n"""\n\n` +
        `Permintaan user: ${userPrompt}\n\n` +
        `Hasilkan JSON blocks BARU yang akan disisipkan DI BAWAH block teks terpilih. ` +
        `Jangan mengulang teks konteks kecuali diminta.`
      );
    }
    return (
      `Teks yang dipilih user (akan diganti sesuai permintaan):\n` +
      `"""\n${selectedText}\n"""\n\n` +
      `Permintaan user: ${userPrompt}\n\n` +
      `Hasilkan JSON blocks yang MENGGANTIKAN teks terpilih.`
    );
  }
  return (
    `Permintaan user: ${userPrompt}\n\n` +
    `Hasilkan JSON blocks untuk disisipkan di posisi kursor.`
  );
}

function parseInlineMarkup(text) {
  if (!text) return [createRun("")];
  const runs = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|~~[^~]+~~)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(createRun(text.slice(last, m.index)));
    const tok = m[0];
    if (tok.startsWith("**") && tok.endsWith("**")) {
      runs.push(createRun(tok.slice(2, -2), { bold: true }));
    } else if (tok.startsWith("~~") && tok.endsWith("~~")) {
      runs.push(createRun(tok.slice(2, -2), { strike: true }));
    } else if (tok.startsWith("__") && tok.endsWith("__")) {
      runs.push(createRun(tok.slice(2, -2), { underline: true }));
    } else if (tok.startsWith("*") && tok.endsWith("*")) {
      runs.push(createRun(tok.slice(1, -1), { italic: true }));
    } else {
      runs.push(createRun(tok));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) runs.push(createRun(text.slice(last)));
  if (!runs.length) runs.push(createRun(text));
  return runs;
}

function runsFromSpec(spec) {
  if (Array.isArray(spec.runs) && spec.runs.length) {
    return spec.runs.map((r) => {
      const marks = {};
      if (r.bold) marks.bold = true;
      if (r.italic) marks.italic = true;
      if (r.underline) marks.underline = true;
      if (r.strike) marks.strike = true;
      if (r.color && typeof r.color === "string") marks.color = r.color;
      if (r.highlight && (HIGHLIGHT_KEYS.has(r.highlight) || /^#/.test(r.highlight))) {
        marks.highlight = r.highlight;
      }
      if (typeof r.fontSize === "number") marks.fontSize = r.fontSize;
      if (r.fontFamily) marks.fontFamily = r.fontFamily;
      if (r.link) marks.link = r.link;
      return createRun(String(r.text || ""), marks);
    });
  }
  return parseInlineMarkup(String(spec.text || ""));
}

function normalizeSceneBg(name) {
  if (!name || typeof name !== "string") return SCENE_BG_MAP.mint;
  const key = name.trim().toLowerCase().replace(/^var\(--scene-bg-/, "").replace(/\)$/, "");
  if (SCENE_BG_MAP[key]) return SCENE_BG_MAP[key];
  if (name.startsWith("var(--scene-bg-") || name.startsWith("#") || name.startsWith("rgb")) {
    return name;
  }
  return SCENE_BG_MAP.mint;
}

function normalizeEdge(edge) {
  const e = String(edge || "straight").toLowerCase();
  return SCENE_EDGE_STYLES.includes(e) ? e : "straight";
}

function normalizePadding(pad) {
  const p = String(pad || "md").toLowerCase();
  return Object.prototype.hasOwnProperty.call(SCENE_PADDING_PRESETS, p) ? p : "md";
}

function specToBlock(spec, sceneId = null) {
  const type = String(spec.type || "paragraph").toLowerCase();
  if (type === "divider") return createBlock({ type: "divider", sceneId });
  if (!VALID_BLOCK_TYPES.has(type)) {
    return createBlock({
      type: "paragraph",
      runs: runsFromSpec(spec),
      sceneId,
      align: VALID_ALIGN.has(spec.align) ? spec.align : "left",
    });
  }
  const level = type === "heading" ? Math.min(6, Math.max(1, Number(spec.level) || 2)) : null;
  return createBlock({
    type,
    level,
    runs: runsFromSpec(spec),
    sceneId,
    align: VALID_ALIGN.has(spec.align) ? spec.align : "left",
    checked: type === "checklist-item" ? !!spec.checked : undefined,
  });
}

function parseAiJsonToInsertion(rawText, ambientSceneId = null) {
  let cleaned = String(rawText || "").trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (_) {
    return null;
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.blocks) ? data.blocks : null;
  if (!list || !list.length) return null;

  const insertBlocks = [];
  const scenesPatch = {};

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const t = String(item.type || "").toLowerCase();
    if (t === "scene") {
      const sceneId = uuid();
      const children = Array.isArray(item.blocks) ? item.blocks : [];
      if (!children.length) {
        insertBlocks.push(createBlock({ type: "paragraph", runs: [createRun("")], sceneId }));
      } else {
        for (const child of children) {
          if (String(child?.type || "").toLowerCase() === "scene") continue;
          insertBlocks.push(specToBlock(child, sceneId));
        }
      }
      scenesPatch[sceneId] = createSceneMeta({
        backgroundColor: normalizeSceneBg(item.background || item.backgroundColor),
        padding: normalizePadding(item.padding),
        edgeStyle: normalizeEdge(item.edge || item.edgeStyle),
      });
      continue;
    }
    // BUGFIX: dulu block non-"scene" dari AI SELALU dipaksa sceneId: null,
    // walau kursor sedang ada DI DALAM scene yang sudah ada. Akibatnya
    // block sisipan AI "memutus" rangkaian sceneId yang sama pada block
    // sebelum & sesudah kursor — renderer scene mengelompokkan block
    // berdasarkan sceneId yang SAMA & BERURUTAN, jadi satu scene lama
    // kelihatan kebelah jadi dua kotak terpisah begitu AI selesai
    // menyisip. Sekarang block non-"scene" mewarisi sceneId ambient
    // (sceneId milik block tempat kursor berada saat sheet AI dibuka),
    // supaya kalau kursor memang di dalam scene, sisipan AI ikut masuk
    // ke scene yang sama alih-alih memecahnya jadi dua.
    insertBlocks.push(specToBlock(item, ambientSceneId));
  }
  if (!insertBlocks.length) return null;

  // BUGFIX: sama seperti insertDivider() manual di commands.js — divider
  // adalah garis pemisah visual, jadi block TEPAT setelahnya seharusnya
  // tidak "mewarisi" tipe list-item (bullet/nomor/checklist), walau AI
  // sendiri yang menaruhnya begitu di JSON-nya. Cuma block yang LANGSUNG
  // menempel setelah divider yang dipaksa jadi paragraph — list-list lain
  // yang lebih jauh di bawah divider tidak disentuh.
  for (let i = 0; i < insertBlocks.length - 1; i++) {
    if (insertBlocks[i].type !== "divider") continue;
    const next = insertBlocks[i + 1];
    if (next && isListItemType(next.type)) {
      insertBlocks[i + 1] = { ...next, type: "paragraph", checked: undefined, level: null };
    }
  }

  return { insertBlocks, scenesPatch, musicPatch: {} };
}

function plainTextFallback(raw) {
  return String(raw || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
    .replace(/\r\n?/g, "\n")
    .split("\n");
}

async function callGemini(userPrompt, selectedText, insertMode = "replace") {
  const apiKey = (await getAiApiKey()) || "";
  const model = (await getAiModel()) || "gemini-3.1-flash-lite";
  if (!apiKey) {
    throw new Error("API key AI belum diisi. Buka Pengaturan → Fitur AI untuk menambahkan API key Gemini.");
  }

  const res = await fetch(`${geminiEndpoint(model)}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemInstruction() }] },
      contents: [{ role: "user", parts: [{ text: buildUserPrompt(userPrompt, selectedText, insertMode) }] }],
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || JSON.stringify(errBody);
    } catch (_) {
      detail = await res.text().catch(() => "");
    }
    throw new Error(detail || `Gemini HTTP ${res.status}`);
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text.trim()) throw new Error(t("ai.sheet.emptyResponse"));
  return text.trim();
}

/**
 * Typewriter: sisipkan block satu per satu, isi teksnya karakter demi karakter.
 * void/divider langsung muncul; block berteks digrow run-nya.
 */
/**
 * BUGFIX: dua masalah scroll yang dilaporkan pas AI mulai menyisip teks:
 *
 * 1. "Teleport" ke atas editor pas AI PERTAMA mulai ngetik — `.focus()`
 *    tanpa opsi apa pun bikin browser otomatis scroll-into-view elemen
 *    yang di-focus (di sini `editor.bodyEl`, yaitu SELURUH area body
 *    catatan). Browser tidak tahu-menahu soal posisi kursor di dalamnya,
 *    jadi yang dibawa "ke pandangan" adalah bounding box bodyEl secara
 *    kasar — hasilnya kelihatan seperti lompat ke atas dokumen walau
 *    kursor sebenarnya ada di tengah/bawah. Fix: `{ preventScroll: true }`
 *    supaya focus() TIDAK memicu auto-scroll bawaan browser sama sekali
 *    — scroll sepenuhnya diambil alih oleh keepAiCaretInView() di bawah.
 *
 * 2. Tidak ada auto-scroll SAMA SEKALI mengikuti teks yang lagi diketik
 *    AI — begitu teks tumbuh melewati tepi bawah layar, area yang lagi
 *    diketik jadi tidak kelihatan tanpa user scroll manual. Fix:
 *    keepAiCaretInView() dipanggil tiap kali render setelah karakter baru
 *    disisip, cek dulu apakah posisi kursor SUDAH di luar/dekat tepi
 *    viewport (pakai getBoundingClientRect, bukan asal panggil terus-
 *    terusan) baru scrollIntoView({ behavior:"smooth", block:"nearest" })
 *    — supaya tidak retrigger smooth-scroll tiap karakter kalau memang
 *    sudah kelihatan (bisa terasa "gemeteran" kalau dipaksa tiap huruf).
 *    Pakai window.getSelection() (bukan cari elemen block spesifik by id)
 *    supaya jalan sama persis baik untuk typewriterInsert (JSON/block)
 *    maupun typewriterPlain (fallback teks polos).
 */
function keepAiCaretInView() {
  const sel = window.getSelection ? window.getSelection() : null;
  if (!sel || sel.rangeCount === 0) return;
  const node = sel.focusNode;
  if (!node) return;
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!el || typeof el.getBoundingClientRect !== "function") return;

  const rect = el.getBoundingClientRect();
  if (rect.top === 0 && rect.bottom === 0 && rect.left === 0) return; // elemen belum ke-layout

  const viewportH = window.innerHeight || document.documentElement.clientHeight;
  const margin = 32; // jarak aman dari tepi atas/bawah (topbar, FAB, dsb)
  const isOutOfView = rect.bottom > viewportH - margin || rect.top < margin;
  if (isOutOfView) {
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

async function typewriterInsert(editor, state, insertion, savedSel, cancelledRef, insertMode = "replace") {
  const { insertBlocks, scenesPatch } = insertion;
  if (!insertBlocks.length) return;

  // Pastikan fokusus di body editor dulu
  editor.bodyEl.focus({ preventScroll: true });
  if (savedSel) editor.restoreSelection(savedSel);

  let sel = editor.getModelSelection() || savedSel;
  if (!sel) {
    // Fallback: caret di block terakhir
    const n = state.getDocument().blocks.length;
    sel = {
      startBlockIndex: Math.max(0, n - 1),
      startOffset: 0,
      endBlockIndex: Math.max(0, n - 1),
      endOffset: 0,
      collapsed: true,
    };
    editor.restoreSelection(sel);
  }
  if (sel && !sel.collapsed) {
    if (insertMode === "new") {
      // Buat baru: jangan hapus seleksi — sisip di bawah block terakhir seleksi.
      const endIdx = sel.endBlockIndex;
      const endBlock = state.getBlock(endIdx);
      const len = endBlock ? blockTextLength(endBlock) : 0;
      sel = {
        startBlockIndex: endIdx,
        startOffset: len,
        endBlockIndex: endIdx,
        endOffset: len,
        collapsed: true,
      };
      editor.restoreSelection(sel);
    } else {
      // Mengganti: hapus teks terpilih dulu, lalu isi hasil AI.
      editor.runCommand(insertPastedText, [""]);
      sel = editor.getModelSelection() || { ...sel, endBlockIndex: sel.startBlockIndex, endOffset: sel.startOffset, collapsed: true };
    }
  }
  if (!sel) {
    console.error("[ai-sheet] tidak ada posisi kursor untuk insert");
    showToast(t("ai.sheet.insertFail"), { tone: "danger" });
    return;
  }

  // Terapkan scene meta di awal (visual siap saat block scene masuk)
  for (const [sceneId, meta] of Object.entries(scenesPatch || {})) {
    if (typeof state.setScene === "function") state.setScene(sceneId, meta);
  }

  // BUGFIX: dulu tiap block AI di-paste SATU PER SATU lewat pasteBlockClipboard
  // di dalam loop ini — dan pasteBlockClipboard SELALU memecah (splitBlockAt)
  // block di posisi kursor, persis seperti menekan Enter. Karena kursor
  // "typewriter" berhenti tepat di AKHIR block yang baru selesai diketik,
  // setiap split BERIKUTNYA menghasilkan satu block KOSONG sisa — list-item
  // kosong kalau block sumbernya list, paragraph kosong kalau bukan — yang
  // ikut tersisip nyangkut di dokumen. Untuk N block AI ini menghasilkan
  // (N-1) block kosong nyasar: persis gejala "list dobel" (mis. 5 list
  // berisi teks + 4 list kosong) dan "beberapa baris Enter kosong" di bawah
  // hasil AI yang dilaporkan user.
  //
  // Perbaikan: split HANYA SEKALI di awal (untuk memisahkan konten sebelum
  // & sesudah kursor), sisipkan SEMUA placeholder block sekaligus dalam satu
  // pasteBlockClipboard, baru isi teksnya satu per satu TANPA split
  // tambahan. state.replaceBlocks(idx, idx, [...]) untuk satu block tidak
  // mengubah panjang array, jadi index tiap placeholder tetap valid
  // sepanjang animasi — tidak perlu split ulang tiap block.
  const placeholders = insertBlocks.map((fullBlock) => {
    const isVoid = fullBlock.type === "divider" || fullBlock.type === "image";
    return isVoid ? fullBlock : { ...fullBlock, runs: [createRun("")] };
  });

  const pasteResult = editor.runCommand(
    pasteBlockClipboard,
    { insertBlocks: placeholders, scenesPatch: {}, musicPatch: {} },
    sel
  );
  if (!pasteResult) {
    console.warn("[ai-sheet] pasteBlockClipboard gagal menyisipkan placeholder");
    return;
  }

  for (let bi = 0; bi < insertBlocks.length; bi++) {
    if (cancelledRef.cancelled) return;

    const fullBlock = insertBlocks[bi];
    const isVoid = fullBlock.type === "divider" || fullBlock.type === "image";

    // Cari index block placeholder yang tadi disisipkan, by id (andal
    // walau banyak block lain di dokumen).
    const doc = state.getDocument();
    const blockIndex = doc.blocks.findIndex((b) => b.id === fullBlock.id);
    if (blockIndex < 0) {
      await sleep(TYPE_BLOCK_PAUSE_MS);
      continue;
    }

    if (isVoid) {
      // divider/image sudah utuh sejak awal; cukup pindahkan caret & jeda.
      editor.restoreSelection({
        startBlockIndex: blockIndex,
        startOffset: 0,
        endBlockIndex: blockIndex,
        endOffset: 0,
        collapsed: true,
      });
      keepAiCaretInView();
      await sleep(TYPE_BLOCK_PAUSE_MS);
      continue;
    }

    // Kumpulkan karakter dari full runs (dengan marks per-run)
    const fullRuns = fullBlock.runs || [createRun("")];
    const chars = []; // { ch, marks }
    for (const run of fullRuns) {
      const marks = run.marks || {};
      for (const ch of run.text || "") {
        chars.push({ ch, marks });
      }
    }

    if (!chars.length) {
      await sleep(TYPE_BLOCK_PAUSE_MS);
      continue;
    }

    // Grow teks di block target
    let built = "";
    let currentMarks = null;
    const grownRuns = [];

    const flushRun = (text, marks) => {
      if (!text) return;
      grownRuns.push(createRun(text, marks || {}));
    };

    for (let ci = 0; ci < chars.length; ci++) {
      if (cancelledRef.cancelled) return;
      const { ch, marks } = chars[ci];
      const marksKey = JSON.stringify(marks);
      const prevKey = currentMarks === null ? null : JSON.stringify(currentMarks);

      if (currentMarks === null) {
        currentMarks = marks;
        built = ch;
      } else if (marksKey === prevKey) {
        built += ch;
      } else {
        flushRun(built, currentMarks);
        currentMarks = marks;
        built = ch;
      }

      // Update model tiap karakter (atau tiap beberapa untuk performa)
      const snapshotRuns = grownRuns.concat(built ? [createRun(built, currentMarks || {})] : []);
      const block = state.getBlock(blockIndex);
      if (block) {
        const next = { ...block, runs: snapshotRuns.length ? snapshotRuns : [createRun("")] };
        state.replaceBlocks(blockIndex, blockIndex, [next]);
        // BUGFIX: dulu editor.renderAll() dipanggil di SINI — artinya tiap
        // 1 karakter, SELURUH dokumen (semua block) dibongkar (innerHTML="")
        // lalu dibangun ulang dari nol. Untuk animasi ~14ms/karakter itu
        // jadi ratusan kali destroy+rebuild DOM per detik → scroll browser
        // "melompat" balik ke atas tiap kali innerHTML dikosongkan lalu
        // caret dipulihkan lagi ke bawah (efeknya: editor keliatan
        // blink naik-turun antara area yang diketik & area atas), dan di HP
        // ini juga yang bikin virtual keyboard nyangkut (node yang difokus
        // keyboard terus-terusan diganti node baru). Cukup re-render BLOCK
        // yang sedang diketik saja.
        if (typeof editor.rerenderBlockAt === "function") editor.rerenderBlockAt(blockIndex);
        else if (typeof editor.renderAll === "function") editor.renderAll();
        const len = blockTextLength(next);
        editor.restoreSelection({
          startBlockIndex: blockIndex,
          startOffset: len,
          endBlockIndex: blockIndex,
          endOffset: len,
          collapsed: true,
        });
        if (typeof state.emitChange === "function") {
          state.emitChange({ type: "ai-type", blockIndex });
        }
        keepAiCaretInView();
      }

      // Jeda: lebih cepat di spasi/newline
      const delay = ch === " " || ch === "\n" ? TYPE_CHAR_MS * 0.6 : TYPE_CHAR_MS;
      await sleep(delay);
    }

    // Final flush
    if (built) flushRun(built, currentMarks);
    const finalBlock = state.getBlock(blockIndex);
    if (finalBlock && grownRuns.length) {
      state.replaceBlocks(blockIndex, blockIndex, [{ ...finalBlock, runs: grownRuns }]);
      if (typeof editor.rerenderBlockAt === "function") editor.rerenderBlockAt(blockIndex);
      else if (typeof editor.renderAll === "function") editor.renderAll();
      if (typeof state.emitChange === "function") state.emitChange({ type: "ai-type-done", blockIndex });
    }

    // Pindah caret ke akhir block (siap block berikutnya di insert setelahnya)
    const done = state.getBlock(blockIndex);
    if (done) {
      const len = blockTextLength(done);
      editor.restoreSelection({
        startBlockIndex: blockIndex,
        startOffset: len,
        endBlockIndex: blockIndex,
        endOffset: len,
        collapsed: true,
      });
      keepAiCaretInView();
    }

    await sleep(TYPE_BLOCK_PAUSE_MS);
  }
}

/**
 * Typewriter untuk plain text (fallback non-JSON).
 */
async function typewriterPlain(editor, state, lines, savedSel, cancelledRef, insertMode = "replace") {
  if (savedSel) editor.restoreSelection(savedSel);
  else editor.bodyEl.focus({ preventScroll: true });

  const text = (lines || []).join("\n");
  if (!text) return;

  const sel0 = editor.getModelSelection() || savedSel;
  if (sel0 && !sel0.collapsed) {
    if (insertMode === "new") {
      const endIdx = sel0.endBlockIndex;
      const endBlock = state && state.getBlock ? state.getBlock(endIdx) : null;
      const len = endBlock ? blockTextLength(endBlock) : sel0.endOffset;
      editor.restoreSelection({
        startBlockIndex: endIdx,
        startOffset: len,
        endBlockIndex: endIdx,
        endOffset: len,
        collapsed: true,
      });
    } else {
      editor.runCommand(insertPastedText, [""]);
    }
  }

  // Anchor: posisi awal setelah clear
  const anchor = editor.getModelSelection() || savedSel;
  if (!anchor) return;

  for (let i = 1; i <= text.length; i++) {
    if (cancelledRef.cancelled) return;
    editor.restoreSelection(anchor);
    const slice = text.slice(0, i);
    const sliceLines = slice.replace(/\r\n?/g, "\n").split("\n");
    editor.runCommand(insertPastedText, sliceLines);
    // caret di akhir hasil insert — next loop restore ke anchor lalu replace lagi
    // (insertPastedText replace di range anchor yang collapsed = insert, tapi
    //  setelah insert caret pindah; kita selalu restore anchor lalu insert
    //  full slice → efektif "grow")
    keepAiCaretInView();
    const ch = text[i - 1];
    await sleep(ch === " " || ch === "\n" ? TYPE_CHAR_MS * 0.6 : TYPE_CHAR_MS);
  }
}

async function openAiSheet({ editor, state, savedSel, selectedText }) {
  closeActiveSheet();

  let sheetClosed = false;
  let isBusy = false;
  const cancelledRef = { cancelled: false };

  const overlay = createEl("div", { className: "ai-sheet-overlay" });
  const sheet = createEl("div", { className: "ai-sheet image-sheet" });
  overlay.appendChild(sheet);

  function close() {
    if (sheetClosed) return;
    sheetClosed = true;
    document.body.classList.remove("is-ai-generating");
    overlay.classList.remove("is-open");
    try {
      document.removeEventListener("selectionchange", onEditorSelectionChange);
      if (editor.bodyEl) {
        editor.bodyEl.removeEventListener("mouseup", onEditorSelectionChange);
        editor.bodyEl.removeEventListener("keyup", onEditorSelectionChange);
        editor.bodyEl.removeEventListener("touchend", onEditorSelectionChange);
      }
    } catch (_) {}
    try {
      if (typeof stopReservingSpace === "function") stopReservingSpace();
    } catch (_) {}
    setTimeout(() => overlay.remove(), CLOSE_ANIM_MS);
    clearActiveSheet(doCancel);
  }

  function doCancel() {
    // Hanya Batal user yang membatalkan typewriter — close() setelah
    // generate sukses JANGAN set cancelled, kalau tidak teks tidak pernah
    // sempat diketik ke editor.
    cancelledRef.cancelled = true;
    close();
  }

  // Cek API key — kalau belum diisi, tampilkan sheet "belum aktif".
  let hasApiKey = false;
  try {
    hasApiKey = !!(await getAiApiKey());
  } catch (_) {
    hasApiKey = false;
  }

  if (!hasApiKey) {
    registerActiveSheet(doCancel);
    sheet.appendChild(
      buildAiSheetHeader(t("ai.sheet.inactiveTitle"), t("ai.sheet.inactiveSub"))
    );
    const inactive = createEl("div", { className: "ai-sheet__inactive" });
    inactive.appendChild(
      createEl("p", {
        className: "ai-sheet__inactive-msg",
        text: t("ai.sheet.inactiveBody"),
      })
    );
    sheet.appendChild(inactive);
    const actionsOff = createEl("div", { className: "ai-sheet__actions image-sheet__actions" });
    const cancelBtnOff = createEl("button", {
      className: "image-sheet__btn image-sheet__btn--ghost",
      text: t("ai.sheet.cancel"),
      attrs: { type: "button" },
    });
    const settingsBtn = createEl("button", {
      className: "image-sheet__btn image-sheet__btn--primary ai-sheet__generate-btn",
      text: t("ai.sheet.settings"),
      attrs: { type: "button" },
    });
    cancelBtnOff.addEventListener("click", doCancel);
    settingsBtn.addEventListener("click", () => {
      doCancel();
      setTimeout(() => {
        if (window.__MEIMO_SPA__) {
          import("../router.js")
            .then((r) => {
              if (r && typeof r.navigate === "function") r.navigate("/fitur-ai");
              else window.location.assign("/fitur-ai");
            })
            .catch(() => window.location.assign("/fitur-ai"));
        } else {
          window.location.assign("/fitur-ai");
        }
      }, CLOSE_ANIM_MS);
    });
    actionsOff.append(cancelBtnOff, settingsBtn);
    sheet.appendChild(actionsOff);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("is-open"));
    return;
  }

  registerActiveSheet(doCancel);

  // Posisi generate bisa berubah selama sheet terbuka: ikuti kursor/seleksi
  // user di editor (overlay pointer-events: none).
  let liveSel = savedSel || null;
  let liveSelectedText = selectedText || "";
  let insertMode = liveSelectedText.trim() ? "replace" : "replace";

  const modeTitle = liveSelectedText.trim() ? t("ai.sheet.editTitle") : t("ai.sheet.insertTitle");
  const modeSub = liveSelectedText.trim()
    ? t("ai.sheet.editSub")
    : t("ai.sheet.insertSub");
  const headerEl = buildAiSheetHeader(modeTitle, modeSub);
  sheet.appendChild(headerEl);

  // Konteks + mode toggle (tampil hanya saat ada seleksi teks)
  const preview = createEl("div", { className: "ai-sheet__selection-preview" });
  preview.appendChild(
    createEl("div", { className: "ai-sheet__selection-label", text: t("ai.sheet.context") })
  );
  const previewBody = createEl("div", { className: "ai-sheet__selection-body", text: "" });
  preview.appendChild(previewBody);
  sheet.appendChild(preview);

  const modeRow = createEl("div", { className: "ai-sheet__mode-row" });
  const modeToggle = createEl("div", {
    className: "ai-sheet__mode-toggle",
    attrs: { role: "group", "aria-label": t("ai.sheet.modeAria") },
  });
  const btnReplace = createEl("button", {
    className: "ai-sheet__mode-btn is-active",
    attrs: { type: "button", "data-mode": "replace" },
    text: t("ai.sheet.replace"),
  });
  const btnNew = createEl("button", {
    className: "ai-sheet__mode-btn",
    attrs: { type: "button", "data-mode": "new" },
    text: t("ai.sheet.createNew"),
  });
  function setMode(mode) {
    insertMode = mode;
    btnReplace.classList.toggle("is-active", mode === "replace");
    btnNew.classList.toggle("is-active", mode === "new");
  }
  btnReplace.addEventListener("click", () => setMode("replace"));
  btnNew.addEventListener("click", () => setMode("new"));
  modeToggle.append(btnReplace, btnNew);
  modeRow.appendChild(modeToggle);
  sheet.appendChild(modeRow);

  function refreshContextUI() {
    const hasCtx = !!(liveSelectedText && liveSelectedText.trim());
    preview.hidden = !hasCtx;
    modeRow.hidden = !hasCtx;
    if (hasCtx) {
      const shown =
        liveSelectedText.length > 280
          ? liveSelectedText.slice(0, 280) + "…"
          : liveSelectedText;
      previewBody.textContent = shown;
      if (headerEl.__titleEl) headerEl.__titleEl.textContent = t("ai.sheet.editTitle");
      if (headerEl.__subEl) {
        headerEl.__subEl.textContent = t("ai.sheet.editSub");
      }
    } else {
      if (headerEl.__titleEl) headerEl.__titleEl.textContent = t("ai.sheet.insertTitle");
      if (headerEl.__subEl) {
        headerEl.__subEl.textContent = t("ai.sheet.insertSub");
      }
      // Tanpa seleksi, mode sisip tidak relevan — reset ke replace default.
      setMode("replace");
    }
    if (textarea) {
      textarea.placeholder = hasCtx
        ? t("ai.sheet.placeholderEdit")
        : t("ai.sheet.placeholderInsert");
    }
  }

  const promptSection = createEl("div", { className: "ai-sheet__section" });
  promptSection.appendChild(
    createEl("div", { className: "ai-sheet__prompt-label", text: t("ai.sheet.prompt") })
  );
  const textarea = createEl("textarea", {
    className: "ai-sheet__prompt",
    attrs: {
      rows: "5",
      placeholder: selectedText
        ? t("ai.sheet.placeholderEditLong")
        : t("ai.sheet.placeholderInsertLong"),
      "aria-label": t("ai.sheet.promptAria"),
    },
  });
  promptSection.appendChild(textarea);
  sheet.appendChild(promptSection);

  // Sinkronkan UI konteks dengan seleksi saat ini, lalu pantau perubahan kursor.
  refreshContextUI();

  function onEditorSelectionChange() {
    if (sheetClosed || isBusy) return;
    // Jangan timpa liveSel saat fokus di dalam sheet (prompt textarea).
    const ae = document.activeElement;
    if (ae && sheet.contains(ae)) return;
    try {
      const sel = editor.getModelSelection();
      if (!sel) return;
      liveSel = {
        startBlockIndex: sel.startBlockIndex,
        startOffset: sel.startOffset,
        endBlockIndex: sel.endBlockIndex,
        endOffset: sel.endOffset,
        collapsed: !!sel.collapsed,
      };
      liveSelectedText = getSelectedText(state, liveSel) || "";
      refreshContextUI();
    } catch (_) {}
  }

  document.addEventListener("selectionchange", onEditorSelectionChange);
  // Juga pantau pointer di editor body (lebih andal di mobile).
  if (editor.bodyEl) {
    editor.bodyEl.addEventListener("mouseup", onEditorSelectionChange);
    editor.bodyEl.addEventListener("keyup", onEditorSelectionChange);
    editor.bodyEl.addEventListener("touchend", onEditorSelectionChange);
  }



  // Generating panel (tanpa skeleton shimmer)
  const genPanel = createEl("div", {
    className: "ai-sheet__generating",
    attrs: { hidden: true, "aria-live": "polite" },
  });
  genPanel.innerHTML =
    '<div class="ai-gen-orb" aria-hidden="true">' +
    '<span class="ai-gen-orb__ring"></span>' +
    '<span class="ai-gen-orb__ring"></span>' +
    '<span class="ai-gen-orb__core">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75L19 14z"/><path d="M5 15l.5 1.5L7 17l-1.5.5L5 19l-.5-1.5L3 17l1.5-.5L5 15z"/></svg>' +
    "</span></div>" +
    '<div class="ai-gen-copy">' +
    '<div class="ai-gen-title">AI sedang menulis<span class="ai-gen-dots"></span></div>' +
    '<div class="ai-gen-sub">Merangkai block Meimo…</div></div>';
  sheet.appendChild(genPanel);

  const statusEl = createEl("div", {
    className: "ai-sheet__status",
    attrs: { hidden: true },
  });
  sheet.appendChild(statusEl);

  const actions = createEl("div", { className: "ai-sheet__actions image-sheet__actions" });
  const cancelBtn = createEl("button", {
    className: "image-sheet__btn image-sheet__btn--ghost",
    attrs: { type: "button" },
    text: t("ai.sheet.cancel"),
  });
  const generateBtn = createEl("button", {
    className: "image-sheet__btn image-sheet__btn--primary ai-sheet__generate-btn",
    attrs: { type: "button" },
    html: '<span class="ai-sheet__btn-label">' + t("ai.sheet.generate") + '</span>',
  });
  actions.append(cancelBtn, generateBtn);
  sheet.appendChild(actions);

  // ---- Ruang scroll cadangan setinggi sheet ----
  // Sama pola dengan --image-sheet-space/--scene-sheet-space/--music-sheet-space
  // (lihat layout.css & toolbar/image-sheet.js): tanpa ini, sheet AI (yang
  // pointer-events:none di overlay-nya, jadi editor di belakang TETAP bisa
  // di-scroll) menutupi baris paling bawah editor karena .note-scroll-area
  // tidak tahu perlu kasih padding-bottom ekstra setinggi sheet.
  const root = document.documentElement;
  let sheetResizeObserver = null;
  function setReservedSpace(px) {
    root.style.setProperty("--ai-sheet-space", `${Math.max(0, Math.round(px))}px`);
  }
  function startReservingSpace() {
    setReservedSpace(sheet.getBoundingClientRect().height);
    if (window.ResizeObserver) {
      sheetResizeObserver = new ResizeObserver(() => setReservedSpace(sheet.getBoundingClientRect().height));
      sheetResizeObserver.observe(sheet);
    }
  }
  function stopReservingSpace() {
    if (sheetResizeObserver) {
      sheetResizeObserver.disconnect();
      sheetResizeObserver = null;
    }
    setReservedSpace(0);
  }

  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add("is-open");
    // Tunggu transisi buka selesai dulu supaya tinggi sheet yang diukur
    // adalah layout final (bukan di tengah animasi translateY).
    setTimeout(() => {
      if (!sheetClosed) startReservingSpace();
    }, 200);
  });
  setTimeout(() => {
    if (!sheetClosed) textarea.focus();
  }, 60);

  function setStatus(msg, tone = "info") {
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.className = "ai-sheet__status";
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.className = `ai-sheet__status ai-sheet__status--${tone}`;
  }

  function setBusy(busy) {
    isBusy = busy;
    generateBtn.disabled = busy;
    cancelBtn.disabled = false; // tetap bisa batal saat generate
    textarea.disabled = busy;
    generateBtn.classList.toggle("is-busy", busy);
    const label = generateBtn.querySelector(".ai-sheet__btn-label");
    if (label) label.textContent = busy ? "Menulis…" : "Generate";

    genPanel.hidden = !busy;
    sheet.classList.toggle("is-generating", busy);
    document.body.classList.toggle("is-ai-generating", busy);
    if (busy) {
      promptSection.hidden = true;
      const prev = sheet.querySelector(".ai-sheet__selection-preview");
      if (prev) prev.hidden = true;
      const modeRow = sheet.querySelector(".ai-sheet__mode-row");
      if (modeRow) modeRow.hidden = true;
    } else {
      promptSection.hidden = false;
      const prev = sheet.querySelector(".ai-sheet__selection-preview");
      if (prev) prev.hidden = false;
      const modeRow = sheet.querySelector(".ai-sheet__mode-row");
      if (modeRow) modeRow.hidden = false;
    }
  }

  cancelBtn.addEventListener("click", doCancel);


  async function handleGenerate() {
    if (isBusy || sheetClosed) return;
    const userPrompt = textarea.value.trim();
    if (!userPrompt) {
      setStatus(t("ai.sheet.needPrompt"), "error");
      textarea.focus();
      return;
    }

    setBusy(true);
    setStatus("");
    cancelledRef.cancelled = false;

    try {
      const raw = await callGemini(userPrompt, liveSelectedText, insertMode);
      if (sheetClosed || cancelledRef.cancelled) return;

      // Kalau kursor lagi di dalam scene, block AI (yang bukan tipe
      // "scene" eksplisit dari AI) harus ikut masuk scene yang sama —
      // lihat komentar BUGFIX di parseAiJsonToInsertion().
      const cursorBlock = liveSel ? state.getBlock(liveSel.startBlockIndex) : null;
      const ambientSceneId = cursorBlock ? cursorBlock.sceneId || null : null;
      const insertion = parseAiJsonToInsertion(raw, ambientSceneId);
      console.log("[ai-sheet] raw length:", raw.length, "parsed blocks:", insertion ? insertion.insertBlocks.length : 0);

      // Tutup sheet dulu supaya user lihat animasi ngetik di editor.
      // SENGAJA tidak set cancelledRef — typewriter harus tetap jalan.
      close();
      document.body.classList.add("is-ai-typing");

      try {
        if (insertion) {
          await typewriterInsert(editor, state, insertion, liveSel, cancelledRef, insertMode);
        } else {
          console.warn("[ai-sheet] JSON parse gagal, fallback plain text");
          await typewriterPlain(editor, state, plainTextFallback(raw), liveSel, cancelledRef, insertMode);
        }
        if (!cancelledRef.cancelled) {
          showToast(liveSelectedText && insertMode === "replace" ? "Teks diganti oleh AI" : "Konten AI disisipkan");
        }
      } finally {
        document.body.classList.remove("is-ai-typing");
      }
    } catch (err) {
      console.error("[ai-sheet]", err);
      document.body.classList.remove("is-ai-typing");
      if (sheetClosed) return;
      setBusy(false);
      setStatus(err?.message || "Gagal memanggil Gemini", "error");
    }
  }

  generateBtn.addEventListener("click", handleGenerate);
  textarea.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleGenerate();
    }
  });
}

/**
 * Pasang FAB AI — hanya tampil saat ada kursor di editor body.
 */
export function initAiSheet({ editor, state }) {
  if (!editor || !state) return;

  const bodyEl = editor.bodyEl;
  const fabEl = createEl("button", {
    className: "ai-fab",
    attrs: {
      type: "button",
      "aria-label": t("ai.fab"),
      title: t("ai.fab"),
    },
    html:
      '<span class="ai-fab__label">' + t("ai.fab") + '</span>' +
      '<span class="ai-fab__icon" aria-hidden="true">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75L19 14z"/><path d="M5 15l.5 1.5L7 17l-1.5.5L5 19l-.5-1.5L3 17l1.5-.5L5 15z"/></svg>' +
      "</span>",
  });

  let pendingSel = null;
  let pendingSelectedText = "";
  let isFabVisible = false;
  /** Label intro cuma sekali per load halaman editor. */
  let labelCycleDone = false;
  let labelShowTimer = null;
  let labelHideTimer = null;
  let showDelayTimer = null;
  let keyboardWaitTimer = null;

  function hasEditorCursor() {
    const sel = editor.getModelSelection();
    if (sel) return true;
    const ae = document.activeElement;
    if (ae && (ae === bodyEl || bodyEl.contains(ae))) return true;
    return false;
  }

  function clearShowTimers() {
    if (showDelayTimer) {
      clearTimeout(showDelayTimer);
      showDelayTimer = null;
    }
    if (keyboardWaitTimer) {
      clearInterval(keyboardWaitTimer);
      keyboardWaitTimer = null;
    }
  }

  function clearLabelTimers() {
    if (labelShowTimer) {
      clearTimeout(labelShowTimer);
      labelShowTimer = null;
    }
    if (labelHideTimer) {
      clearTimeout(labelHideTimer);
      labelHideTimer = null;
    }
  }

  function startLabelCycle() {
    if (labelCycleDone) return;
    // Muncul dulu sebagai lingkaran; 1 dtk kemudian label; 5 dtk kemudian nutup.
    clearLabelTimers();
    fabEl.classList.remove("is-labeled", "is-label-hiding");
    labelShowTimer = setTimeout(() => {
      labelShowTimer = null;
      if (!isFabVisible || labelCycleDone) return;
      fabEl.classList.remove("is-label-hiding");
      fabEl.classList.add("is-labeled");
      labelHideTimer = setTimeout(() => {
        labelHideTimer = null;
        if (!fabEl.classList.contains("is-labeled")) return;
        fabEl.classList.add("is-label-hiding");
        fabEl.classList.remove("is-labeled");
        // Lepas class hiding setelah animasi selesai
        setTimeout(() => fabEl.classList.remove("is-label-hiding"), 340);
        labelCycleDone = true;
      }, 5000);
    }, 1000);
  }

  function isOnline() {
    return typeof navigator !== "undefined" ? navigator.onLine !== false : true;
  }

  function updateFabVisibility() {
    if (document.body.classList.contains("is-ai-generating")) return;
    if (document.body.classList.contains("is-ai-typing")) {
      requestFabVisible(false);
      return;
    }
    if (document.body.classList.contains("is-block-select-mode")) {
      requestFabVisible(false);
      return;
    }
    // Sidebar outline terbuka: sembunyikan FAB AI (sidebar di atas FAB).
    // Muncul lagi otomatis lewat focusin setelah user fokus editor lagi.
    if (document.body.classList.contains("is-outline-open")) {
      requestFabVisible(false);
      return;
    }
    // Offline: sembunyikan FAB AI (butuh jaringan ke Gemini).
    if (!isOnline()) {
      requestFabVisible(false);
      return;
    }
    requestFabVisible(hasEditorCursor());
  }

  /**
   * Tampilkan FAB setelah keyboard kebuka (mobile). Desktop: delay singkat.
   * body.is-keyboard-open di-set viewport-pin.js.
   */
  function requestFabVisible(show) {
    if (!show) {
      clearShowTimers();
      setFabVisible(false);
      return;
    }
    if (isFabVisible) return;

    const keyboardOpen = document.body.classList.contains("is-keyboard-open");
    // Touch / mobile: tunggu keyboard. Desktop: delay kecil biar tidak
    // "nyembul" sebelum layout settle.
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

    clearShowTimers();
    if (keyboardOpen || !coarse) {
      showDelayTimer = setTimeout(() => {
        showDelayTimer = null;
        if (hasEditorCursor()) setFabVisible(true);
      }, keyboardOpen ? 120 : 220);
      return;
    }

    // Tunggu is-keyboard-open, fallback 450ms supaya tidak stuck.
    const onKeyboard = () => {
      if (!document.body.classList.contains("is-keyboard-open")) return;
      document.body.removeEventListener("transitionrun", onKeyboard);
      clearShowTimers();
      if (hasEditorCursor()) setFabVisible(true);
    };
    // Poll class — tidak ada event khusus; pakai interval pendek + fallback.
    keyboardWaitTimer = setInterval(() => {
      if (document.body.classList.contains("is-keyboard-open")) {
        clearShowTimers();
        if (hasEditorCursor()) setFabVisible(true);
      }
    }, 50);
    showDelayTimer = setTimeout(() => {
      clearShowTimers();
      if (hasEditorCursor()) setFabVisible(true);
    }, 450);
  }

  function setFabVisible(show) {
    if (show === isFabVisible) return;
    isFabVisible = show;
    if (show) {
      fabEl.classList.remove("is-hiding");
      fabEl.classList.add("is-visible");
      startLabelCycle();
    } else {
      clearLabelTimers();
      fabEl.classList.remove("is-visible", "is-labeled", "is-label-hiding");
      fabEl.classList.add("is-hiding");
    }
  }

  fabEl.addEventListener("animationend", (e) => {
    if (e.animationName === "aiFabOut") fabEl.classList.remove("is-hiding");
  });

  fabEl.addEventListener("mousedown", (e) => {
    e.preventDefault();
    pendingSel = editor.getModelSelection();
    pendingSelectedText = getSelectedText(state, pendingSel);
  });

  fabEl.addEventListener("click", () => {
    openAiSheet({
      editor,
      state,
      savedSel: pendingSel,
      selectedText: pendingSelectedText || "",
    });
  });

  document.body.appendChild(fabEl);

  // Visibility listeners
  document.addEventListener("selectionchange", updateFabVisibility);
  bodyEl.addEventListener("focusin", updateFabVisibility);
  bodyEl.addEventListener("focusout", () => {
    // delay sedikit: klik FAB memicu focusout dulu
    setTimeout(updateFabVisibility, 30);
  });
  document.addEventListener("focusin", updateFabVisibility);
  if (typeof state.onChange === "function") {
    state.onChange(() => updateFabVisibility());
  }
  window.addEventListener("online", updateFabVisibility);
  window.addEventListener("offline", updateFabVisibility);

  // Initial: biasanya belum ada fokus → sembunyi
  updateFabVisibility();
}
