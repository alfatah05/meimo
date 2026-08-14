/**
 * voice-record-sheet.js
 * Bottom sheet perekaman suara + real-time transcription (Web Speech API)
 * ke editor. Dibuka dari FAB Home lewat /editor?voice=1.
 *
 * Anti-duplikat:
 * - Hanya memproses result BARU (event.resultIndex …)
 * - Setiap final = satu segmen; interim hanya di preview
 * - Dedupe overlap di ujung teks yang sudah tertulis (prefix/suffix)
 * - continuous=true + restart hati-hati di onend
 */

import { createEl } from "../utils/dom.js";
import { registerActiveSheet, clearActiveSheet } from "../toolbar/active-sheet.js";
import { insertPastedText } from "./commands.js";
import { isVoidBlockType, blockTextLength } from "./block-model.js";
import * as selectionApi from "./selection.js";
import { showToast } from "../../components/toast.js";
import { t, getLanguage } from "../i18n/i18n.js";

const CLOSE_ANIM_MS = 180;
const SpeechRecognition =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

function formatTimer(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Hitung bagian `incoming` yang BELUM ada di ujung `existing`.
 * Contoh:
 *   existing="melakukan kekerasan", incoming="melakukan kekerasan atau melukai"
 *   → " atau melukai"
 *   existing="melakukan kekerasan atau", incoming="melakukan kekerasan"
 *   → "" (incoming sudah tercakup)
 */
function uniqueTail(existing, incoming) {
  const a = normalize(existing);
  const b = normalize(incoming);
  if (!b) return "";
  if (!a) return String(incoming).trim();

  // Incoming sudah ada di ujung existing → skip total.
  if (a.endsWith(b)) return "";

  // Incoming memuat existing sebagai prefix → ambil sisanya.
  if (b.startsWith(a)) {
    // Potong dari string asli (bukan normalized) secukupnya.
    // Cari overlap di string asli dengan pendekatan kasar: ambil kata-kata baru.
    const aWords = a.split(" ").filter(Boolean);
    const bWords = b.split(" ").filter(Boolean);
    let i = 0;
    while (i < aWords.length && i < bWords.length && aWords[i] === bWords[i]) i++;
    const newWords = bWords.slice(i);
    return newWords.length ? newWords.join(" ") : "";
  }

  // Cari suffix existing yang jadi prefix incoming (overlap parsial).
  const aWords = a.split(" ").filter(Boolean);
  const bWords = b.split(" ").filter(Boolean);
  let bestOverlap = 0;
  const maxCheck = Math.min(aWords.length, bWords.length);
  for (let k = 1; k <= maxCheck; k++) {
    const suffix = aWords.slice(-k).join(" ");
    const prefix = bWords.slice(0, k).join(" ");
    if (suffix === prefix) bestOverlap = k;
  }
  if (bestOverlap > 0) {
    const newWords = bWords.slice(bestOverlap);
    return newWords.length ? newWords.join(" ") : "";
  }

  // Tidak ada overlap — anggap segmen baru sepenuhnya.
  return String(incoming).trim();
}

/**
 * Sisipkan baris ke akhir dokumen.
 * - 1 elemen  → gabung ke block terakhir (atau isi paragraph kosong)
 * - ≥2 elemen → block baru per baris (mirip paste multi-line / Enter)
 */
function appendTranscriptLines(editor, state, lines) {
  if (!lines || !lines.length) return;
  const cleaned = lines.map((l) => String(l ?? ""));
  if (!cleaned.some((l) => l.trim())) return;

  const blocks = state.getDocument().blocks || [];
  let targetIndex = blocks.length - 1;
  while (targetIndex >= 0 && isVoidBlockType(blocks[targetIndex].type)) {
    targetIndex--;
  }
  if (targetIndex < 0) targetIndex = 0;

  const targetBlock = blocks[targetIndex];
  const offset = targetBlock ? blockTextLength(targetBlock) : 0;

  if (!editor.bodyEl.contains(document.activeElement)) {
    try {
      editor.bodyEl.focus({ preventScroll: true });
    } catch (_) {
      editor.bodyEl.focus();
    }
  }

  selectionApi.setModelSelection(editor.bodyEl, {
    startBlockIndex: targetIndex,
    startOffset: offset,
    endBlockIndex: targetIndex,
    endOffset: offset,
  });

  editor.runCommand(insertPastedText, cleaned);
}

export function openVoiceRecordSheet({ editor, state, onFinished } = {}) {
  if (!SpeechRecognition) {
    showToast(t("voice.unsupported"));
    return;
  }

  // Jangan biarkan keyboard editor muncul selama sheet rekam aktif:
  // blur fokus yang ada + blok focusin ke contenteditable.
  const editorTitleEl = document.getElementById("editorTitle");
  const editorBodyEl = editor && editor.bodyEl ? editor.bodyEl : document.getElementById("editorBody");
  try {
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
  } catch (_) {}
  const blockFocus = (e) => {
    const t = e.target;
    if (t === editorTitleEl || t === editorBodyEl || (editorBodyEl && editorBodyEl.contains(t))) {
      e.preventDefault();
      try { t.blur && t.blur(); } catch (_) {}
    }
  };
  document.addEventListener("focusin", blockFocus, true);

  let recognition = null;
  let isPaused = false;
  let isClosed = false;
  let startedAt = 0;
  let accumulatedMs = 0;
  let timerRaf = null;
  let interimText = "";
  /** Semua teks yang sudah ditulis ke editor (untuk dedupe overlap). */
  let writtenText = "";
  /** Index result terakhir yang sudah diproses di sesi recognition berjalan. */
  let lastProcessedIndex = -1;
  let restartTimer = null;

  const overlay = createEl("div", { className: "voice-record-overlay" });
  const sheet = createEl("div", { className: "voice-record-sheet image-sheet" });

  const header = createEl("div", { className: "voice-record-sheet__header" });
  const indicator = createEl("div", { className: "voice-record-sheet__indicator" });
  const dot = createEl("div", { className: "voice-record-sheet__dot" });
  const pulse = createEl("div", { className: "voice-record-sheet__pulse" });
  indicator.append(dot, pulse);

  const titleGroup = createEl("div", { className: "voice-record-sheet__title-group" });
  const titleEl = createEl("div", {
    className: "voice-record-sheet__title",
    text: t("voice.title"),
  });
  const statusEl = createEl("div", {
    className: "voice-record-sheet__status",
    text: t("voice.listening"),
  });
  titleGroup.append(titleEl, statusEl);

  const timerEl = createEl("div", {
    className: "voice-record-sheet__timer",
    text: "00:00",
  });

  header.append(indicator, titleGroup, timerEl);

  const errorEl = createEl("div", {
    className: "voice-record-sheet__error",
    text: "",
  });

  const previewEl = createEl("div", {
    className: "voice-record-sheet__preview",
  });

  const actions = createEl("div", { className: "voice-record-sheet__actions" });
  const pauseBtn = createEl("button", {
    className: "voice-record-sheet__btn voice-record-sheet__btn--ghost",
    type: "button",
    text: t("voice.pause"),
  });
  const finishBtn = createEl("button", {
    className: "voice-record-sheet__btn voice-record-sheet__btn--primary",
    type: "button",
    text: t("voice.done"),
  });
  actions.append(pauseBtn, finishBtn);

  sheet.append(header, errorEl, previewEl, actions);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  function showError(msg) {
    errorEl.textContent = msg || "";
    errorEl.classList.toggle("is-visible", !!msg);
  }

  function updatePreview(text) {
    interimText = text || "";
    previewEl.textContent = interimText;
    previewEl.classList.toggle("has-text", !!interimText);
  }

  function tickTimer() {
    if (isClosed || isPaused) return;
    const elapsed = accumulatedMs + (performance.now() - startedAt);
    timerEl.textContent = formatTimer(elapsed);
    timerRaf = requestAnimationFrame(tickTimer);
  }

  function startTimer() {
    startedAt = performance.now();
    if (timerRaf) cancelAnimationFrame(timerRaf);
    timerRaf = requestAnimationFrame(tickTimer);
  }

  function pauseTimer() {
    if (!isPaused) accumulatedMs += performance.now() - startedAt;
    if (timerRaf) {
      cancelAnimationFrame(timerRaf);
      timerRaf = null;
    }
  }

  function commitSegment(raw) {
    const incoming = String(raw || "").trim();
    if (!incoming) return;

    const tail = uniqueTail(writtenText, incoming);
    if (!tail) return;

    try {
      // Segmen pertama isi paragraph kosong; selanjutnya selalu baris baru
      // supaya hasil rekaman tidak nyampur jadi satu blok panjang.
      if (!writtenText) {
        appendTranscriptLines(editor, state, [tail]);
      } else {
        appendTranscriptLines(editor, state, ["", tail]);
      }
      writtenText = (writtenText + "\n" + tail).replace(/\n+/g, "\n").trim();
    } catch (err) {
      console.error("Gagal menyisipkan transkrip:", err);
    }
  }

  function handleResults(event) {
    if (isClosed || isPaused) return;

    let interim = "";
    // Hanya result yang belum diproses. resultIndex = index pertama yang
    // berubah di event ini; kita juga jaga lastProcessedIndex untuk jaga-jaga
    // kalau engine mengulang index yang sama.
    const start = Math.max(event.resultIndex, lastProcessedIndex + 1);

    for (let i = start; i < event.results.length; i++) {
      const res = event.results[i];
      const transcript = res[0] ? res[0].transcript : "";
      if (res.isFinal) {
        commitSegment(transcript);
        lastProcessedIndex = i;
      } else {
        interim += transcript;
      }
    }

    // Interim dari result yang belum final (boleh dari resultIndex).
    if (!interim) {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) {
          interim += event.results[i][0] ? event.results[i][0].transcript : "";
        }
      }
    }
    updatePreview(interim);
  }

  function stopRecognitionSoft() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    try {
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.stop();
      }
    } catch (_) {}
  }

  function setPaused(next) {
    isPaused = next;
    sheet.classList.toggle("is-paused", isPaused);
    pauseBtn.textContent = isPaused ? t("voice.resume") : t("voice.pause");
    statusEl.textContent = isPaused ? t("voice.paused") : t("voice.listening");
    if (isPaused) {
      pauseTimer();
      if (interimText.trim()) {
        commitSegment(interimText);
        updatePreview("");
      }
      stopRecognitionSoft();
    } else {
      startTimer();
      lastProcessedIndex = -1;
      setupRecognition();
    }
  }

  function doCancel() {
    close();
  }

  function close(opts = {}) {
    if (isClosed) return;
    isClosed = true;
    pauseTimer();
    stopRecognitionSoft();
    recognition = null;
    document.removeEventListener("focusin", blockFocus, true);
    clearActiveSheet(doCancel);
    overlay.classList.remove("is-open");
    setTimeout(() => {
      overlay.remove();
      // Setelah Selesai: fokus baris terakhir supaya keyboard baru muncul.
      if (opts.finished && typeof onFinished === "function") {
        try { onFinished(); } catch (e) { console.warn("[voice] onFinished:", e); }
      }
    }, CLOSE_ANIM_MS);
  }

  function setupRecognition() {
    stopRecognitionSoft();
    lastProcessedIndex = -1;

    recognition = new SpeechRecognition();
    const lang = getLanguage();
    recognition.lang = lang === "ja" ? "ja-JP" : lang === "id" ? "id-ID" : "en-US";
    // continuous=false lebih stabil anti-duplikat di Chrome mobile:
    // setiap final = satu frase, lalu kita restart manual.
    // Tetap real-time karena restart segera setelah onend.
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      handleResults(event);
    };

    recognition.onerror = (event) => {
      if (isClosed) return;
      const code = event.error || "";
      if (code === "aborted" || code === "no-speech") return;
      if (code === "not-allowed" || code === "service-not-allowed") {
        showError(t("voice.err.micDenied"));
        statusEl.textContent = t("voice.status.denied");
        setPaused(true);
        return;
      }
      if (code === "network") {
        showError(t("voice.err.offline"));
        return;
      }
      console.warn("SpeechRecognition error:", code);
    };

    recognition.onend = () => {
      if (isClosed || isPaused) return;
      // Restart dengan sedikit jeda supaya tidak bentrok dengan stop/start
      // dan mengurangi re-transkripsi audio yang sama.
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        restartTimer = null;
        if (isClosed || isPaused) return;
        lastProcessedIndex = -1;
        try {
          recognition.start();
        } catch (_) {
          // InvalidStateError kalau masih running — coba buat instance baru.
          try {
            setupRecognition();
          } catch (e2) {
            console.warn("restart recognition failed", e2);
          }
        }
      }, 80);
    };

    try {
      recognition.start();
    } catch (err) {
      showError(t("voice.err.start"));
      console.error(err);
    }
  }

  pauseBtn.addEventListener("click", () => {
    if (isClosed) return;
    setPaused(!isPaused);
  });

  finishBtn.addEventListener("click", () => {
    if (interimText.trim()) {
      commitSegment(interimText);
      updatePreview("");
    }
    close({ finished: true });
    showToast(t("voice.finished"));
  });

  registerActiveSheet(doCancel);

  requestAnimationFrame(() => {
    overlay.classList.add("is-open");
  });

  startTimer();

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        if (!isClosed) setupRecognition();
      })
      .catch((err) => {
        console.warn("getUserMedia:", err);
        showError(t("voice.err.micRequired"));
        statusEl.textContent = t("voice.status.denied");
        setPaused(true);
      });
  } else {
    setupRecognition();
  }
}

export function shouldAutoOpenVoiceRecord() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("voice") === "1" || params.get("record") === "1";
  } catch (_) {
    return false;
  }
}

export function clearVoiceQueryFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("voice") && !url.searchParams.has("record")) return;
    url.searchParams.delete("voice");
    url.searchParams.delete("record");
    window.history.replaceState({}, "", url);
  } catch (_) {}
}
