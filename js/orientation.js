// Orientación física del teléfono, leída del sensor de gravedad. Hace falta porque
// con el giro de pantalla bloqueado la imagen sigue la pantalla, no el teléfono.
const IOS =
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

let lastAngle = null; // 0, 90, 180 o 270: giro antihorario respecto al vertical
const NEEDS_PERMISSION =
  typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function";
let permissionAnswered = false;

function onMotion(e) {
  const g = e.accelerationIncludingGravity;
  if (!g || g.x == null || g.y == null) return;
  // iOS informa los ejes con el signo invertido respecto a Android.
  const x = IOS ? -g.x : g.x;
  const y = IOS ? -g.y : g.y;
  // Teléfono casi plano (p. ej. fotografiando un papel en la mesa): se conserva
  // el último ángulo conocido, como hace la cámara nativa.
  if (Math.hypot(x, y) < 4) return;
  if (Math.abs(y) >= Math.abs(x)) lastAngle = y > 0 ? 0 : 180;
  else lastAngle = x > 0 ? 90 : 270;
}

export function startOrientation() {
  window.addEventListener("devicemotion", onMotion);
}

// iPhone exige pedir permiso al sensor desde un toque completo (click), no al
// empezar a tocar. Si se llama fuera de un toque falla y se reintenta en el siguiente.
export async function requestOrientationPermission() {
  if (!NEEDS_PERMISSION || permissionAnswered) return;
  try {
    await DeviceMotionEvent.requestPermission();
    permissionAnswered = true;
  } catch {
    // No venía de un toque: se volverá a pedir.
  }
}

export function permissionPending() {
  return NEEDS_PERMISSION && !permissionAnswered;
}

export function hasReading() {
  return lastAngle !== null;
}

// Espera a la primera lectura del sensor, como máximo ms milisegundos.
export async function waitForReading(ms) {
  const end = performance.now() + ms;
  while (lastAngle === null && performance.now() < end) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

function screenAngle() {
  const a = screen.orientation?.angle ?? window.orientation ?? 0;
  return ((a % 360) + 360) % 360;
}

// Grados que hay que girar la imagen en sentido antihorario para que quede derecha.
export function captureRotation() {
  if (lastAngle === null) return { rotation: 0, source: "pantalla" };
  return { rotation: (lastAngle - screenAngle() + 360) % 360, source: "sensor", phoneAngle: lastAngle };
}
