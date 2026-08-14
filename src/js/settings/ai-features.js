/**
 * ai-features.js
 * Halaman Fitur AI — API key Gemini + model (IndexedDB via settings-service).
 */

import {
  AI_MODELS,
  getAiApiKey,
  setAiApiKey,
  getAiModel,
  setAiModel,
} from "../services/settings-service.js";
import { showToast } from "../../components/toast.js";
import { t, initI18n } from "../i18n/i18n.js";

async function boot() {
  initI18n();
  const apiInput = document.getElementById("settingsAiApiKey");
  const modelSelect = document.getElementById("settingsAiModel");
  const saveBtn = document.getElementById("settingsAiSaveBtn");
  const toggleKeyBtn = document.getElementById("settingsAiToggleKey");

  if (modelSelect) {
    modelSelect.innerHTML = "";
    for (const m of AI_MODELS) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.label;
      modelSelect.appendChild(opt);
    }
  }

  try {
    if (apiInput) apiInput.value = await getAiApiKey();
    if (modelSelect) modelSelect.value = await getAiModel();
  } catch (err) {
    console.warn("[ai-features] load:", err);
  }

  if (toggleKeyBtn && apiInput) {
    toggleKeyBtn.addEventListener("click", () => {
      const show = apiInput.type === "password";
      apiInput.type = show ? "text" : "password";
      toggleKeyBtn.textContent = show ? t("ai.hide") : t("ai.show");
      toggleKeyBtn.setAttribute("aria-pressed", show ? "true" : "false");
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      try {
        await setAiApiKey(apiInput ? apiInput.value : "");
        await setAiModel(modelSelect ? modelSelect.value : "");
        showToast(t("ai.saved"));
      } catch (err) {
        console.error(err);
        showToast(t("ai.saveFail"), { tone: "danger" });
      } finally {
        saveBtn.disabled = false;
      }
    });
  }
}

export async function initAiFeatures() {
  return boot();
}

if (!window.__MEIMO_SPA__) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
