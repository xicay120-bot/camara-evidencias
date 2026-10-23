// GPS continuo mientras la cámara está abierta, para tener una posición lista
// al disparar. El GPS funciona sin datos móviles, pero en interiores puede tardar.
let watchId = null;
let last = null;
let lastError = null;

export function startGeo(onChange) {
  if (!("geolocation" in navigator) || watchId !== null) return;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      last = pos;
      lastError = null;
      onChange?.();
    },
    (err) => {
      lastError = err;
      onChange?.();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 60000 }
  );
}

export function stopGeo() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

// Posición actual o null. fixAgeS indica hace cuántos segundos se obtuvo.
export function currentPosition() {
  if (!last) return null;
  const c = last.coords;
  return {
    lat: c.latitude,
    lon: c.longitude,
    accuracyM: Math.round(c.accuracy),
    altitudeM: c.altitude == null ? null : Math.round(c.altitude),
    fixAgeS: Math.max(0, Math.round((Date.now() - last.timestamp) / 1000)),
  };
}

export function geoStatus() {
  if (!("geolocation" in navigator)) return { state: "unsupported" };
  if (lastError?.code === 1) return { state: "denied" };
  const p = currentPosition();
  if (!p) return { state: "searching" };
  if (p.fixAgeS > 120) return { state: "stale", pos: p };
  return { state: "ok", pos: p };
}
