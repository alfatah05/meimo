/**
 * settings-repository.js
 * CRUD key-value ke object store SETTINGS di IndexedDB.
 * Hanya dipanggil lewat settings-service.js.
 */

import { withStore, requestToPromise } from "./db.js";
import { STORES } from "./schema.js";

export async function getSetting(key) {
  const row = await withStore(STORES.SETTINGS, "readonly", (store) =>
    requestToPromise(store.get(key))
  );
  return row ? row.value : undefined;
}

export async function setSetting(key, value) {
  await withStore(STORES.SETTINGS, "readwrite", (store) =>
    requestToPromise(store.put({ key, value }))
  );
  return value;
}

export async function deleteSetting(key) {
  await withStore(STORES.SETTINGS, "readwrite", (store) =>
    requestToPromise(store.delete(key))
  );
}
