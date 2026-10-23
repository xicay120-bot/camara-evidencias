// Estampa fecha, hora, GPS y usuario dentro de la imagen y la codifica en JPEG.
const pad = (n, w = 2) => String(n).padStart(w, "0");

export function tzLabel(ms) {
  const off = -new Date(ms).getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `UTC${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function formatLocal(ms) {
  const d = new Date(ms);
  return (
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function fileStamp(ms) {
  const d = new Date(ms);
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function stampLines({ time, gps, user, shortId }) {
  const lines = [
    `${formatLocal(time.ms)} (${tzLabel(time.ms)}) · ` +
      (time.verified ? "hora verificada" : "hora del teléfono, no verificada"),
    gps
      ? `GPS ${gps.lat.toFixed(6)}, ${gps.lon.toFixed(6)} ±${gps.accuracyM} m` +
        (gps.fixAgeS > 120 ? ` (posición de hace ${Math.round(gps.fixAgeS / 60)} min)` : "")
      : "GPS no disponible",
    `${user || "sin sesión"} · ID ${shortId}`,
  ];
  return lines;
}

function toBlob(canvas, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo codificar la imagen"))), "image/jpeg", quality)
  );
}

// source: ImageBitmap o canvas. rotation: grados antihorarios (0, 90, 180, 270)
// para enderezar la imagen antes de estampar. Devuelve { blob, width, height }.
export async function renderStamped(source, lines, { maxSide, quality }, rotation = 0) {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const sw = Math.round(source.width * scale);
  const sh = Math.round(source.height * scale);
  const sideways = rotation === 90 || rotation === 270;
  const w = sideways ? sh : sw;
  const h = sideways ? sw : sh;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((-rotation * Math.PI) / 180);
  ctx.drawImage(source, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();

  const font = Math.max(14, Math.round(Math.min(w, h) * 0.03));
  const lineH = Math.round(font * 1.35);
  const padding = Math.round(font * 0.6);
  const bandH = lineH * lines.length + padding * 2;

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, h - bandH, w, bandH);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "top";
  ctx.font = `600 ${font}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  lines.forEach((line, i) => {
    ctx.fillText(line, padding, h - bandH + padding + i * lineH, w - padding * 2);
  });

  const blob = await toBlob(canvas, quality);
  return { blob, width: w, height: h };
}

export async function makeThumb(blob, side = 240) {
  const bmp = await createImageBitmap(blob);
  const scale = side / Math.max(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return toBlob(canvas, 0.7);
}

export async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
