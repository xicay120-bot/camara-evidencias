// Subida a OneDrive con Microsoft Graph.
import { CONFIG } from "../config.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SIMPLE_LIMIT = 4 * 1024 * 1024;
const CHUNK = 320 * 1024 * 12; // las partes deben ser múltiplo de 320 KiB

export class GraphError extends Error {
  constructor(status, message, retryAfterS) {
    super(message);
    this.status = status;
    this.retryAfterS = retryAfterS;
  }
}

export function folderLabel() {
  return CONFIG.folderMode === "approot" ? "Aplicaciones/Cámara Evidencias" : CONFIG.folderName;
}

function itemUrl(relPath) {
  const base =
    CONFIG.folderMode === "approot"
      ? `${GRAPH}/me/drive/special/approot:`
      : `${GRAPH}/me/drive/root:/${encodeURIComponent(CONFIG.folderName)}`;
  return `${base}/${relPath.split("/").map(encodeURIComponent).join("/")}`;
}

async function check(res) {
  if (res.ok) return res.status === 204 ? null : res.json();
  let msg = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    if (body?.error?.message) msg = body.error.message;
  } catch {
    // respuesta sin JSON
  }
  const retry = Number(res.headers.get("Retry-After")) || null;
  throw new GraphError(res.status, msg, retry);
}

async function getItem(token, relPath) {
  const res = await fetch(`${itemUrl(relPath)}?$select=id,name,size,createdDateTime,webUrl`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return check(res);
}

// conflict: "fail" para la foto (si ya existe es que una subida anterior llegó
// pero se perdió la respuesta) o "replace" para el JSON de metadatos.
export async function uploadFile(token, relPath, data, contentType, conflict = "fail") {
  const size = data.byteLength;
  try {
    if (size <= SIMPLE_LIMIT) {
      const res = await fetch(`${itemUrl(relPath)}:/content?@microsoft.graph.conflictBehavior=${conflict}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
        body: data,
      });
      return await check(res);
    }
    return await uploadLarge(token, relPath, data, conflict);
  } catch (e) {
    if (conflict === "fail" && e instanceof GraphError && e.status === 409) {
      const existing = await getItem(token, relPath);
      if (existing.size === size) return existing;
      throw new GraphError(409, "Ya existe un archivo con ese nombre y distinto tamaño");
    }
    throw e;
  }
}

async function uploadLarge(token, relPath, data, conflict) {
  const session = await check(
    await fetch(`${itemUrl(relPath)}:/createUploadSession`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": conflict } }),
    })
  );
  const size = data.byteLength;
  let result = null;
  for (let start = 0; start < size; start += CHUNK) {
    const end = Math.min(start + CHUNK, size);
    // La URL de la sesión ya va autenticada: no se envía el token.
    const res = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${start}-${end - 1}/${size}` },
      body: data.slice(start, end),
    });
    result = await check(res);
  }
  return result;
}
