/**
 * music-sheet.js
 * Fitur "Insert Music" — lihat blok komentar "Musik" di editor/block-model.js
 * untuk model datanya (musik ditempel ke SECTION: Root Editor / Divider /
 * Scene, bukan ke posisi karakter seperti gambar). File ini menangani semua
 * sisi UI-nya:
 *
 *   1. Tombol play PERSISTEN di area catatan — satu per section yang punya
 *      musik (kiri-atas isi editor untuk Root, tepat di bawah Divider rata
 *      kiri, kiri-atas Scene). Beda dari chip "Scene" di scene-sheet.js
 *      (yang cuma muncul sementara saat section-nya fokus), tombol musik
 *      ini SELALU tampil selama section itu punya musik — jadi disinkronkan
 *      ulang ke DOM setiap `state.onChange` (renderAll() di editor.js selalu
 *      terjadi SEBELUM onChange dipicu, lihat editor.js), bukan cuma sekali.
 *   2. Tap SEKALI pada tombol -> toggle Play/Pause (lewat SATU instance
 *      audio global, lihat services/audio-player-service.js). Tap DUA KALI
 *      (double tap) -> buka bottom sheet untuk ganti/hapus musik section
 *      itu. Single tap SENGAJA ditunda ~280ms untuk membedakan dari awalan
 *      double tap (lihat wireButtonTap()) — begitu diminta spec ("Jangan
 *      membuka Bottom Sheet dengan single tap").
 *   3. Bottom sheet "Insert Music" (dibuka lewat tombol toolbar, ATAU lewat
 *      double-tap tombol play yang sudah ada) — tampilan & interaksinya
 *      disamakan dengan image-sheet.js/scene-sheet.js: overlay + panel naik
 *      dari bawah, reserved scroll space, kunci fokus catatan selama sheet
 *      terbuka.
 *
 * BEDA dari image-sheet.js: tidak ada "placeholder" yang disisipkan ke
 * model dulu (musik bukan block) — sheet baru menyentuh model sama sekali
 * saat tombol "Terapkan" (menyimpan file yang dipilih) atau "Hapus Musik"
 * (menghapus langsung, dengan konfirmasi ketuk-dua-kali) ditekan.
 */

import { createEl, qs } from "../utils/dom.js";
import {
  parseMusicKey,
  musicKeyForTarget,
} from "../editor/block-model.js";
import * as musicService from "../services/music-service.js";
import * as audioPlayerService from "../services/audio-player-service.js";
import { registerActiveSheet, clearActiveSheet } from "./active-sheet.js";
import { t } from "../i18n/i18n.js";

const PLAY_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>';

// Jeda maks (ms) antara tap pertama & kedua supaya masih dianggap double
// tap — kalau tap kedua tidak datang dalam jeda ini, tap pertama dianggap
// tunggal & aksi single-tap (toggle play) baru dijalankan.
const DOUBLE_TAP_MS = 280;

/* -------------------------------------------------------------------- */
/* Tombol play persisten                                                 */
/* -------------------------------------------------------------------- */

/** Bedakan tap tunggal (toggle play) dari tap dobel (buka sheet) pada
 * elemen yang sama — lihat blok komentar file ini untuk alasannya. */
function wireButtonTap(el, { onSingle, onDouble }) {
  let timer = null;
  el.addEventListener("click", (e) => {
    e.preventDefault();
    if (timer) {
      clearTimeout(timer);
      timer = null;
      onDouble(e);
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      onSingle(e);
    }, DOUBLE_TAP_MS);
  });
  // Cegah mousedown pada tombol memindahkan kursor teks/seleksi Scene yang
  // sedang berjalan sebelum handler click sempat jalan (pola sama seperti
  // chip "Scene" di scene-sheet.js).
  el.addEventListener("mousedown", (e) => e.preventDefault());
}

function setButtonPlayingVisual(btn, playing) {
  btn.classList.toggle("is-playing", playing);
  const icon = qs(".music-player__icon", btn);
  if (icon) icon.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
  btn.setAttribute("aria-label", playing ? t("music.pause") : t("music.play"));
}

function buildMusicButton(key, meta, { onSingleTap, onDoubleTap }) {
  const btn = createEl("button", {
    className: "music-player",
    attrs: {
      type: "button",
      "data-music-key": key,
      "data-asset-id": meta.assetId || "",
      "aria-label": t("music.play"),
      contenteditable: "false",
    },
  });
  btn.appendChild(createEl("span", { className: "music-player__icon", html: PLAY_ICON }));
  btn.appendChild(
    createEl("span", { className: "music-player__label", text: meta.fileName || t("music.fallbackName") })
  );
  setButtonPlayingVisual(btn, audioPlayerService.isKeyPlaying(key));
  wireButtonTap(btn, {
    onSingle: () => onSingleTap(key, btn),
    onDouble: () => onDoubleTap(key),
  });
  return btn;
}

/** Kumpulkan section mana saja yang SEHARUSNYA punya tombol play saat ini
 * (dari `document.music` + `document.blocks` yang masih ada), dipetakan
 * lewat musicKey -> info penempatan. Dipanggil ulang setiap sinkronisasi —
 * lihat syncAllMusicButtons(). */
function collectDesiredMusic(state) {
  const doc = state.getDocument();
  const musicMap = doc.music || {};
  const desired = new Map();

  if (musicMap.root && musicMap.root.assetId) {
    desired.set("root", { meta: musicMap.root, kind: "root" });
  }

  const seenScenes = new Set();
  for (const block of doc.blocks) {
    if (block.sceneId && !seenScenes.has(block.sceneId)) {
      seenScenes.add(block.sceneId);
      const key = `scene:${block.sceneId}`;
      const meta = musicMap[key];
      if (meta && meta.assetId) desired.set(key, { meta, kind: "scene", sceneId: block.sceneId });
    }
    if (block.type === "divider" && !block.sceneId) {
      const key = `divider:${block.id}`;
      const meta = musicMap[key];
      if (meta && meta.assetId) desired.set(key, { meta, kind: "divider", blockId: block.id });
    }
  }
  return desired;
}

/**
 * Sinkronkan tombol play di DOM supaya persis sama dengan `desired`
 * (idempotent — aman dipanggil berkali-kali, termasuk setelah render
 * PARSIAL yang tidak menyentuh tombol yang sudah terpasang sama sekali).
 * Tombol untuk musik yang sudah tidak ada lagi (dihapus/section-nya
 * hilang) dibuang; tombol yang belum ada tapi seharusnya ada dipasang ke
 * lokasi yang benar (awal bodyEl / setelah elemen Divider / awal wrapper
 * Scene) — lokasi-lokasi itu SENDIRI dibangun ulang total setiap full
 * render (lihat editor.js renderAll()), jadi tombol lama yang menempel di
 * situ otomatis ikut lenyap bersamanya tanpa perlu dibuang manual di sini.
 */
function syncAllMusicButtons(editor, state, handlers) {
  const desired = collectDesiredMusic(state);
  const existingEls = Array.from(editor.bodyEl.querySelectorAll("[data-music-key]"));
  const existingKeys = new Set();

  for (const el of existingEls) {
    const key = el.dataset.musicKey;
    if (!desired.has(key)) {
      el.remove();
      continue;
    }
    existingKeys.add(key);
    const info = desired.get(key);
    const labelEl = qs(".music-player__label", el);
    if (labelEl && info.meta.fileName && labelEl.textContent !== info.meta.fileName) {
      labelEl.textContent = info.meta.fileName;
    }
    if (el.dataset.assetId !== (info.meta.assetId || "")) {
      el.dataset.assetId = info.meta.assetId || "";
      delete el.dataset.hydrated;
      delete el.dataset.url;
    }
  }

  for (const [key, info] of desired) {
    if (existingKeys.has(key)) continue;
    const btn = buildMusicButton(key, info.meta, handlers);
    if (info.kind === "root") {
      btn.classList.add("music-player--root");
      editor.bodyEl.insertBefore(btn, editor.bodyEl.firstChild);
    } else if (info.kind === "divider") {
      btn.classList.add("music-player--divider");
      const dividerEl = qs(`[data-block-id="${info.blockId}"]`, editor.bodyEl);
      if (dividerEl) dividerEl.insertAdjacentElement("afterend", btn);
    } else if (info.kind === "scene") {
      btn.classList.add("music-player--scene");
      const wrapperEl = qs(`.editor-scene[data-scene-id="${info.sceneId}"]`, editor.bodyEl);
      if (wrapperEl) wrapperEl.insertBefore(btn, wrapperEl.firstChild);
    }
  }

  musicService.hydrateMusicButtons(editor.bodyEl);
}

/** Kalau musik yang SEDANG diputar ternyata baru saja hilang dari dokumen
 * (Divider/Scene-nya dihapus, atau musiknya sendiri dihapus lewat sheet),
 * hentikan playback-nya juga — jangan biarkan audio terus terdengar tanpa
 * tombol yang bisa menghentikannya. Dipanggil setiap `state.onChange`. */
function enforceActiveKeyStillValid(state) {
  const active = audioPlayerService.getState();
  if (!active.key) return;
  if (!state.getMusic(active.key)) audioPlayerService.stopAll();
}

/* -------------------------------------------------------------------- */
/* Bottom sheet "Insert Music"                                           */
/* -------------------------------------------------------------------- */

/**
 * @param {object} opts
 * @param {object} opts.editor - instance dari createEditor() (editor.js)
 * @param {object} opts.state - editor state (editor-state.js)
 * @param {object} opts.target - `{ type: 'root'|'divider'|'scene', id? }`,
 *   lihat block-model.js findMusicTargetAt()/parseMusicKey().
 */
function openMusicSheet({ editor, state, target }) {
  // Daftarkan `doCancel` sebagai sheet aktif — otomatis menutup sheet lain.
  registerActiveSheet(doCancel);

  const key = musicKeyForTarget(target);
  const existing = state.getMusic(key);
  const hasMusicAtOpen = !!(existing && existing.assetId);

  let pendingFile = null;
  let pendingBytesPromise = null;
  let pendingMimeType = null;
  let pendingFileName = null;
  let isBusy = false;

  const ICON = {
    music: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    delete: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  };

  const overlay = createEl("div", { className: "music-sheet-overlay image-sheet-overlay" });
  const sheet = createEl("div", { className: "music-sheet image-sheet image-sheet--compact" });
  overlay.appendChild(sheet);

  const mainCol = createEl("div", { className: "music-sheet__main-col" });

  /* ---- Pilih lagu: kiri nama (transparan) + kanan icon 40px ---- */
  const fileInput = createEl("input", { attrs: { type: "file", accept: "audio/*" } });
  fileInput.hidden = true;

  const pickBtn = createEl("button", {
    className: "music-sheet__pick-btn",
    attrs: { type: "button", "aria-label": t("music.pick") },
  });
  const pickName = createEl("span", { className: "music-sheet__pick-name", text: t("music.pick") });
  const pickIcon = createEl("span", {
    className: "music-sheet__pick-icon",
    html: ICON.music,
  });
  pickBtn.append(pickName, pickIcon);

  function updateFileLabel() {
    if (pendingFileName) pickName.textContent = pendingFileName;
    else if (existing && existing.fileName) pickName.textContent = existing.fileName;
    else pickName.textContent = t("music.pick");
    pickBtn.classList.toggle("has-file", !!(pendingFileName || (existing && existing.fileName)));
  }
  updateFileLabel();

  pickBtn.addEventListener("click", () => {
    if (isBusy) return;
    fileInput.click();
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    pendingFile = file;
    pendingMimeType = file.type;
    pendingFileName = file.name;
    pendingBytesPromise = file.arrayBuffer();
    updateFileLabel();
    updateApplyState();
  });

  mainCol.append(pickBtn, fileInput);

  // Spacer biar actions nempel bawah
  mainCol.appendChild(createEl("div", { className: "music-sheet__spacer" }));

  /* ---- Batal / Terapkan / Delete ---- */
  const actions = createEl("div", { className: "image-sheet__actions music-sheet__actions-row" });
  const cancelBtn = createEl("button", {
    className: "image-sheet__btn image-sheet__btn--ghost",
    attrs: { type: "button" },
    text: t("sheet.cancel"),
  });
  const applyBtn = createEl("button", {
    className: "image-sheet__btn image-sheet__btn--primary",
    attrs: { type: "button" },
    text: t("sheet.apply"),
  });
  actions.append(cancelBtn, applyBtn);

  let deleteArmed = false;
  let deleteArmTimer = null;
  let deleteBtn = null;
  if (hasMusicAtOpen) {
    deleteBtn = createEl("button", {
      className: "image-sheet__icon-btn image-sheet__icon-btn--danger music-sheet__delete-btn",
      attrs: { type: "button", "aria-label": t("music.delete") },
      html: ICON.delete,
    });
    function resetDeleteArm() {
      deleteArmed = false;
      deleteBtn.classList.remove("is-armed");
      deleteBtn.innerHTML = ICON.delete;
      deleteBtn.setAttribute("aria-label", t("music.delete"));
    }
    deleteBtn.addEventListener("click", () => {
      if (isBusy) return;
      if (!deleteArmed) {
        deleteArmed = true;
        deleteBtn.classList.add("is-armed");
        deleteBtn.innerHTML = ICON.check;
        deleteBtn.setAttribute("aria-label", t("music.deleteConfirm"));
        deleteArmTimer = setTimeout(resetDeleteArm, 3000);
        return;
      }
      clearTimeout(deleteArmTimer);
      if (audioPlayerService.isKeyActive(key)) audioPlayerService.stopAll();
      editor.removeSectionMusic(target);
      close();
    });
    actions.appendChild(deleteBtn);
  }
  mainCol.appendChild(actions);

  const errorEl = createEl("div", { className: "image-sheet__error music-sheet__error" });
  mainCol.appendChild(errorEl);
  sheet.appendChild(mainCol);

  function updateApplyState() {
    applyBtn.disabled = !hasMusicAtOpen && !pendingFile;
  }
  updateApplyState();

  function doCancel() {
    if (isBusy) return;
    close();
  }

  function setBusy(busy) {
    isBusy = busy;
    cancelBtn.disabled = busy;
    if (deleteBtn) deleteBtn.disabled = busy;
    pickBtn.disabled = busy;
    applyBtn.disabled = busy || (!hasMusicAtOpen && !pendingFile);
    applyBtn.textContent = busy ? t("sheet.saving") : t("sheet.apply");
  }

  function withApplyTimeout(promise, ms = 26000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Waktu simpan habis.")), ms);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        }
      );
    });
  }

  async function doApply() {
    if (isBusy || applyBtn.disabled) return;

    if (!pendingFile) {
      close();
      return;
    }

    setBusy(true);
    errorEl.textContent = "";
    try {
      const noteId = state.getDocument().id;
      const bytes = await pendingBytesPromise;
      const assetId = await withApplyTimeout(musicService.saveMusic(noteId, bytes, pendingMimeType));
      editor.setSectionMusic(target, {
        assetId,
        fileName: pendingFileName,
        mimeType: pendingMimeType,
      });
      close();
    } catch (err) {
      console.error("[music-sheet] Gagal menyimpan musik:", err);
      setBusy(false);
      const isFileReadError = err && (err.name === "NotReadableError" || /could not be read/i.test(err.message || ""));
      errorEl.textContent = isFileReadError
        ? t("music.err.read")
        : t("music.err.save");
    }
  }

  cancelBtn.addEventListener("click", doCancel);
  applyBtn.addEventListener("click", doApply);

  const noteContentEl = qs(".note-content");
  function preventEditorFocus(e) {
    if (noteContentEl && noteContentEl.contains(e.target) && e.target !== noteContentEl) {
      e.target.blur();
    }
  }
  function lockNoteContent() {
    if (noteContentEl) noteContentEl.classList.add("note-content--sheet-locked");
    document.addEventListener("focusin", preventEditorFocus);
  }
  function unlockNoteContent() {
    if (noteContentEl) noteContentEl.classList.remove("note-content--sheet-locked");
    document.removeEventListener("focusin", preventEditorFocus);
  }

  const root = document.documentElement;
  let sheetResizeObserver = null;
  function setReservedSpace(px) {
    root.style.setProperty("--music-sheet-space", `${Math.max(0, Math.round(px))}px`);
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

  function close() {
    clearTimeout(deleteArmTimer);
    overlay.classList.remove("is-open");
    stopReservingSpace();
    unlockNoteContent();
    setTimeout(() => overlay.remove(), 180);
    clearActiveSheet(doCancel);
  }

  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }
  lockNoteContent();

  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add("is-open");
    setTimeout(() => startReservingSpace(), 200);
  });
}


/* -------------------------------------------------------------------- */
/* Entry point                                                           */
/* -------------------------------------------------------------------- */

/**
 * Pasang tombol "Insert Music" di floating toolbar, seluruh sinkronisasi
 * tombol play persisten di area catatan, serta pemutaran musiknya (lewat
 * services/audio-player-service.js).
 */
export function initMusicFeature(button, editor, state) {
  const handlers = {
    onSingleTap: (key, btn) => {
      const assetId = btn.dataset.assetId;
      if (!assetId) return;
      const url = btn.dataset.url;
      if (url) {
        audioPlayerService.playToggle(key, url);
      } else {
        musicService.getObjectUrl(assetId).then((resolvedUrl) => {
          if (resolvedUrl) {
            btn.dataset.url = resolvedUrl;
            audioPlayerService.playToggle(key, resolvedUrl);
          }
        });
      }
    },
    onDoubleTap: (key) => {
      if (editor.bodyEl.getAttribute("contenteditable") === "false") return; // mode Read Only
      openMusicSheet({ editor, state, target: parseMusicKey(key) });
    },
  };

  function sync() {
    syncAllMusicButtons(editor, state, handlers);
    enforceActiveKeyStillValid(state);
  }

  // Ikon Play/Pause SEMUA tombol yang sedang terpasang disinkronkan lewat
  // SATU langganan global (query DOM langsung tiap kali state playback
  // berubah), BUKAN satu langganan per tombol — supaya tidak ada listener
  // yatim menumpuk tiap kali tombol dibangun ulang oleh full render
  // (lihat blok komentar panjang di atas syncAllMusicButtons()).
  audioPlayerService.onChange(({ key, isPlaying }) => {
    const buttons = editor.bodyEl.querySelectorAll("[data-music-key]");
    buttons.forEach((btn) => {
      setButtonPlayingVisual(btn, btn.dataset.musicKey === key && isPlaying);
    });
  });

  if (typeof state.onChange === "function") state.onChange(sync);
  sync(); // sinkronisasi awal — renderAll() pertama (di createEditor) terjadi
  // sebelum initMusicFeature() ini dipanggil (lihat app.js), jadi butuh
  // satu panggilan manual supaya musik yang sudah ada dari sebelumnya
  // (note lama yang dibuka lagi) langsung tampil tombolnya.

  if (!button) return;
  button.addEventListener("click", () => {
    const target = editor.getMusicTargetAtCursor();
    openMusicSheet({ editor, state, target });
  });
}
