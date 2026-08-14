/**
 * settings-service.js
 * Preferensi user (API key AI, model, dll.) lewat settings-repository.
 */

import * as settingsRepo from "../db/settings-repository.js";

export const AI_API_KEY_SETTING = "aiApiKey";
export const AI_MODEL_SETTING = "aiModel";

export const AI_MODELS = [
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    desc: "Lebih cepat & hemat — cocok untuk catatan harian",
  },
  {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    desc: "Lebih pintar — cocok untuk teks panjang & struktur",
  },
];

export const DEFAULT_AI_MODEL = "gemini-3.1-flash-lite";

export async function getAiApiKey() {
  const v = await settingsRepo.getSetting(AI_API_KEY_SETTING);
  return typeof v === "string" ? v : "";
}

export async function setAiApiKey(key) {
  return settingsRepo.setSetting(AI_API_KEY_SETTING, String(key || "").trim());
}

export async function getAiModel() {
  const v = await settingsRepo.getSetting(AI_MODEL_SETTING);
  if (AI_MODELS.some((m) => m.id === v)) return v;
  return DEFAULT_AI_MODEL;
}

export async function setAiModel(modelId) {
  const id = AI_MODELS.some((m) => m.id === modelId) ? modelId : DEFAULT_AI_MODEL;
  await settingsRepo.setSetting(AI_MODEL_SETTING, id);
  return id;
}
