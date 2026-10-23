import { CONFIG } from "../config.js";
import { startCamera, stopCamera, grabFrame, hasTorch, setTorch } from "./camera.js";
import { startGeo, stopGeo, geoStatus, currentPosition } from "./geo.js";
import * as clock from "./clock.js";
import { renderStamped, stampLines, makeThumb, sha256Hex, fileStamp, formatLocal, tzLabel } from "./watermark.js";
import { putPhoto, listPhotos } from "./db.js";
import { authEnabled, initAuth, currentUser, login, logout } from "./auth.js";
import { folderLabel } from "./graph.js";
import { syncAll } from "./sync.js";

const APP_VERSION = "0.1.0";
const $ = (id) => document.getElementById(id);
const video = $("viewfinder");

let torchOn = false;
let capturing = false;
let needsLogin = false;
let thumbUrls = [];

// ---------- avisos ----------

let toastTimer;
function toast(msg, ms = 2500) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

function setChip(el, text, state) {
  el.textContent = text;
  el.className = `chip${state ? ` ${state}` : ""}`;
}

function updateBanner() {
  const el = $("banner");
  let msg = "";
  if (!authEnabled()) {
    msg = "Modo demostración: falta configurar la app en Microsoft Entra. Las fotos se guardan en el teléfono pero no se suben.";
  } else if (!currentUser()) {
    msg = "Inicia sesión con tu cuenta de trabajo para que las fotos se suban a OneDrive.";
  } else if (needsLogin) {
    msg = "La sesión caducó. Toca tu nombre arriba para volver a iniciar sesión; las fotos siguen guardadas.";
  }
  el.textContent = msg;
  el.hidden = !msg;
}

// ---------- indicadores ----------

function updateNet() {
  setChip($("net"), navigator.onLine ? "En línea" : "Sin conexión", navigator.onLine ? "ok" : "warn");
}

function updateGps() {
  const s = geoStatus();
  const el = $("gps");
  if (s.state === "ok") setChip(el, `GPS ±${s.pos.accuracyM} m`, s.pos.accuracyM <= 30 ? "ok" : "warn");
  else if (s.state === "stale") setChip(el, "GPS antiguo", "warn");
  else if (s.state === "searching") setChip(el, "Buscando GPS…", "warn");
  else if (s.state === "denied") setChip(el, "GPS denegado", "bad");
  else setChip(el, "Sin GPS", "bad");
}

function updateClock() {
  const t = clock.now();
  setChip($("clock"), t.verified ? "Hora verificada" : "Hora no verificada", t.verified ? "ok" : "warn");
}

function updateAccount() {
  const el = $("account");
  if (!authEnabled()) {
    setChip(el, "Demo", "warn");
    el.classList.add("chip-btn");
    return;
  }
  const u = currentUser();
  setChip(el, u ? u.email : "Iniciar sesión", u ? (needsLogin ? "bad" : "") : "warn");
  el.classList.add("chip-btn");
}

async function refreshPhotos() {
  const photos = await listPhotos();
  const pending = photos.filter((p) => p.status === "pending").length;
  const badge = $("pendingBadge");
  badge.textContent = pending;
  badge.hidden = pending === 0;

  thumbUrls.forEach(URL.revokeObjectURL);
  thumbUrls = [];
  const img = $("lastThumb");
  if (photos[0]) {
    const url = URL.createObjectURL(new Blob([photos[0].thumb], { type: "image/jpeg" }));
    thumbUrls.push(url);
    img.src = url;
  } else {
    img.removeAttribute("src");
  }
  if (!$("gallery").hidden) renderGallery(photos);
}

// ---------- cámara ----------

async function openCamera() {
  $("cameraError").hidden = true;
  try {
    await startCamera(video);
    $("torch").hidden = !hasTorch();
    startGeo(updateGps);
  } catch (e) {
    const denied = e?.name === "NotAllowedError";
    $("cameraErrorText").textContent = denied
      ? "No hay permiso para usar la cámara. Actívalo en los ajustes del navegador y vuelve a intentarlo."
      : `No se pudo abrir la cámara (${e?.message || e}).`;
    $("cameraError").hidden = false;
  }
}

function closeCamera() {
  stopCamera();
  stopGeo();
  torchOn = false;
  $("torch").classList.remove("on");
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function capture() {
  if (capturing) return;
  capturing = true;
  $("shutter").disabled = true;
  // La hora y la posición se fijan al pulsar, antes de procesar la imagen.
  const time = clock.now();
  const gps = currentPosition();
  const flash = $("flash");
  flash.classList.add("on");
  requestAnimationFrame(() => requestAnimationFrame(() => flash.classList.remove("on")));

  try {
    const frame = await grabFrame(video);
    const id = newId();
    const shortId = id.replace(/-/g, "").slice(0, 8).toUpperCase();
    const user = currentUser();
    const lines = stampLines({ time, gps, user: user?.email, shortId });
    const { blob, width, height } = await renderStamped(frame, lines, CONFIG);
    frame.close?.();

    const photo = await blob.arrayBuffer();
    const thumb = await (await makeThumb(blob)).arrayBuffer();
    const sha256 = await sha256Hex(photo);
    const d = new Date(time.ms);
    const folder = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const fileName = `EVID_${fileStamp(time.ms)}_${shortId}.jpg`;

    const meta = {
      app: "Cámara Evidencias",
      version: APP_VERSION,
      id,
      archivo: fileName,
      sha256,
      tamano_bytes: photo.byteLength,
      resolucion: `${width}x${height}`,
      usuario: user ? { nombre: user.name, correo: user.email } : null,
      captura: {
        hora_utc: new Date(time.ms).toISOString(),
        hora_local: `${formatLocal(time.ms)} (${tzLabel(time.ms)})`,
        zona_horaria: Intl.DateTimeFormat().resolvedOptions().timeZone,
        hora_verificada: time.verified,
        hora_del_telefono_utc: new Date(time.deviceMs).toISOString(),
        desfase_reloj_telefono_ms: time.offsetMs,
        ultima_sincronizacion_utc: time.lastSyncIso,
      },
      gps: gps
        ? {
            latitud: gps.lat,
            longitud: gps.lon,
            precision_m: gps.accuracyM,
            altitud_m: gps.altitudeM,
            antiguedad_posicion_s: gps.fixAgeS,
          }
        : null,
      dispositivo: { navegador: navigator.userAgent },
      marca_de_agua: lines,
    };

    await putPhoto({
      id,
      fileName,
      folder,
      createdAt: time.ms,
      photo,
      thumb,
      sha256,
      meta,
      status: "pending",
      attempts: 0,
      lastError: null,
      remote: null,
      uploadedAt: null,
    });
    navigator.storage?.persist?.();
    await refreshPhotos();
    toast(navigator.onLine ? "Foto guardada. Subiendo…" : "Foto guardada. Se subirá cuando haya conexión.");
    runSync();
  } catch (e) {
    toast(`No se pudo guardar la foto: ${e?.message || e}`, 4000);
  } finally {
    capturing = false;
    $("shutter").disabled = false;
  }
}

// ---------- subida ----------

async function runSync({ manual = false } = {}) {
  if (!authEnabled()) {
    if (manual) toast("Modo demostración: no hay subida configurada.");
    return;
  }
  if (!currentUser()) {
    if (manual) toast("Primero inicia sesión.");
    return;
  }
  if (clock.needsSync()) clock.syncClock().then(updateClock);
  const res = await syncAll(refreshPhotos);
  needsLogin = res.needsLogin;
  updateAccount();
  updateBanner();
  if (manual) {
    if (res.offline) toast("Sin conexión. Se reintentará automáticamente.");
    else if (res.needsLogin) toast("La sesión caducó: vuelve a iniciar sesión.");
    else if (res.failed) toast("Algunas fotos no se pudieron subir. Revisa el detalle.");
    else toast(res.uploaded ? `${res.uploaded} foto(s) subidas.` : "No hay nada pendiente.");
  } else if (res.uploaded) {
    toast(`${res.uploaded} foto(s) subidas a OneDrive.`);
  }
  await refreshPhotos();
}

// ---------- galería ----------

function stateText(p) {
  if (p.status === "uploaded") return ["Subida a OneDrive ✓", "ok"];
  if (p.lastError) return [`Pendiente · ${p.lastError}`, "bad"];
  return ["Pendiente de subir", "warn"];
}

function renderGallery(photos) {
  const pending = photos.filter((p) => p.status === "pending").length;
  $("gallerySummary").textContent =
    `${pending} pendiente(s) · ${photos.length - pending} subida(s). Carpeta: OneDrive/${folderLabel()}. ` +
    `Las subidas se borran del teléfono a los ${CONFIG.keepUploadedDays} días.`;

  const list = $("list");
  list.replaceChildren();
  for (const p of photos) {
    const li = document.createElement("li");
    li.className = "item";
    const img = document.createElement("img");
    const url = URL.createObjectURL(new Blob([p.thumb], { type: "image/jpeg" }));
    thumbUrls.push(url);
    img.src = url;
    img.alt = "";

    const info = document.createElement("div");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = p.fileName;
    const [text, cls] = stateText(p);
    const state = document.createElement("div");
    state.className = `state ${cls}`;
    state.textContent = text;
    info.append(name, state);

    const btn = document.createElement("button");
    btn.className = "btn export";
    btn.type = "button";
    btn.textContent = "Exportar";
    btn.addEventListener("click", () => exportPhoto(p));

    li.append(img, info, btn);
    list.append(li);
  }
}

async function exportPhoto(p) {
  const files = [
    new File([p.photo], p.fileName, { type: "image/jpeg" }),
    new File([JSON.stringify(p.meta, null, 2)], p.fileName.replace(/\.jpg$/, ".json"), { type: "application/json" }),
  ];
  try {
    if (navigator.canShare?.({ files })) {
      await navigator.share({ files, title: p.fileName });
      return;
    }
  } catch (e) {
    if (e?.name === "AbortError") return;
  }
  // Sin "compartir": descarga directa.
  for (const f of files) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
}

// ---------- arranque ----------

async function main() {
  updateNet();
  updateClock();

  try {
    await initAuth();
  } catch (e) {
    toast(`Error de inicio de sesión: ${e?.message || e}`, 5000);
  }
  updateAccount();
  updateBanner();

  $("shutter").addEventListener("click", capture);
  $("retryCamera").addEventListener("click", openCamera);
  $("torch").addEventListener("click", async () => {
    torchOn = !torchOn;
    await setTorch(torchOn).catch(() => {});
    $("torch").classList.toggle("on", torchOn);
  });
  $("account").addEventListener("click", () => {
    if (!authEnabled()) return toast("Falta el clientId en config.js (ver README).", 4000);
    const u = currentUser();
    if (!u || needsLogin) return login();
    if (confirm(`Sesión: ${u.email}\n\n¿Cerrar sesión? Las fotos pendientes se conservan.`)) logout();
  });
  $("openGallery").addEventListener("click", async () => {
    $("gallery").hidden = false;
    await refreshPhotos();
  });
  $("closeGallery").addEventListener("click", () => ($("gallery").hidden = true));
  $("syncNow").addEventListener("click", async () => {
    $("syncNow").disabled = true;
    try {
      await runSync({ manual: true });
    } finally {
      $("syncNow").disabled = false;
    }
  });

  window.addEventListener("online", () => {
    updateNet();
    clock.syncClock().then(updateClock);
    runSync();
  });
  window.addEventListener("offline", updateNet);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      closeCamera();
    } else {
      openCamera();
      clock.syncClock().then(updateClock);
      runSync();
    }
  });
  setInterval(updateClock, 10000);
  setInterval(() => {
    if (clock.needsSync()) clock.syncClock().then(updateClock);
    runSync();
  }, 60000);

  await clock.syncClock();
  updateClock();
  await refreshPhotos();
  await openCamera();
  runSync();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

main();
