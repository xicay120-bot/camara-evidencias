// Orientación física del teléfono, leída del sensor de gravedad. Hace falta porque
// con el giro de pantalla bloqueado la imagen sigue la pantalla, no el teléfono.
const IOS =
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

let lastAngle = null; // 0, 90, 180 o 270: giro antihorario respecto al vertical

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

// iPhone exige pedir permiso al sensor dentro de un toque del usuario.
export async function requestOrientationPermission() {
  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      await DeviceMotionEvent.requestPermission();
    } catch {
      // Sin permiso se usa la orientación de la pantalla.
    }
  }
}

function screenAngle() {
  const a = screen.orientation?.angle ?? window.orientation ?? 0;
  return ((a % 360) + 360) % 360;
}

// Grados que hay que girar la imagen en sentido antihorario para que quede derecha.
export function captureRotation() {
  if (lastAngle === null) return { rotation: 0, source: "pantalla" };
  return { rotation: (lastAngle - screenAngle() + 360) % 360, source: "sensor" };
}
