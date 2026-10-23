// Sube la cola pendiente a OneDrive. Cada foto se sube primero y después su JSON
// de metadatos, que incluye la hora de subida registrada por Microsoft.
import { CONFIG } from "../config.js";
import { listPhotos, putPhoto, deletePhoto } from "./db.js";
import { getToken, NeedsLoginError } from "./auth.js";
import { uploadFile, GraphError, folderLabel } from "./graph.js";

let running = null;

export function syncAll(onUpdate) {
  if (!running) running = doSync(onUpdate).finally(() => (running = null));
  return running;
}

// Devuelve { uploaded, failed, needsLogin, offline }.
async function doSync(onUpdate) {
  const summary = { uploaded: 0, failed: 0, needsLogin: false, offline: false };
  if (!navigator.onLine) {
    summary.offline = true;
    return summary;
  }
  const pending = (await listPhotos()).filter((r) => r.status === "pending").reverse();
  for (const rec of pending) {
    try {
      const token = await getToken();
      await uploadOne(token, rec);
      summary.uploaded++;
    } catch (e) {
      if (e instanceof NeedsLoginError) {
        summary.needsLogin = true;
        break;
      }
      rec.attempts = (rec.attempts || 0) + 1;
      rec.lastError = describe(e);
      await putPhoto(rec);
      summary.failed++;
      // Sin red o servicio saturado: no tiene sentido seguir con las demás.
      if (!(e instanceof GraphError) || e.status === 429 || e.status >= 500) break;
    } finally {
      onUpdate?.();
    }
  }
  await purgeOld();
  return summary;
}

async function uploadOne(token, rec) {
  const relPhoto = `${rec.folder}/${rec.fileName}`;
  if (!rec.remote) {
    const item = await uploadFile(token, relPhoto, rec.photo, "image/jpeg", "fail");
    rec.remote = {
      id: item.id,
      webUrl: item.webUrl,
      serverCreatedAt: item.createdDateTime,
      path: `${folderLabel()}/${relPhoto}`,
    };
    await putPhoto(rec);
  }
  const meta = {
    ...rec.meta,
    subida: {
      ruta_onedrive: rec.remote.path,
      id_onedrive: rec.remote.id,
      hora_registrada_por_onedrive: rec.remote.serverCreatedAt,
    },
  };
  const json = new TextEncoder().encode(JSON.stringify(meta, null, 2));
  await uploadFile(token, relPhoto.replace(/\.jpg$/, ".json"), json.buffer, "application/json", "replace");
  rec.status = "uploaded";
  rec.uploadedAt = Date.now();
  rec.lastError = null;
  await putPhoto(rec);
}

function describe(e) {
  if (e instanceof GraphError) {
    if (e.status === 507) return "OneDrive sin espacio";
    if (e.status === 403) return "Sin permiso para escribir en OneDrive";
    return `OneDrive: ${e.message}`;
  }
  if (e instanceof TypeError) return "Sin conexión con OneDrive";
  return e?.message || String(e);
}

async function purgeOld() {
  const limit = Date.now() - CONFIG.keepUploadedDays * 24 * 3600 * 1000;
  for (const rec of await listPhotos()) {
    if (rec.status === "uploaded" && rec.uploadedAt < limit) await deletePhoto(rec.id);
  }
}
