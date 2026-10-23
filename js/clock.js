// Hora de referencia. El reloj del teléfono se puede cambiar, así que cuando hay
// conexión se lee la cabecera Date del propio servidor que aloja la app y se
// guarda el desfase. Entre sincronizaciones se avanza con performance.now(),
// que es monotónico y no cambia si alguien mueve el reloj del sistema.
const MAX_AGE_MS = 30 * 60 * 1000; // una sincronización vale 30 minutos
const MAX_DRIFT_MS = 5000; // más diferencia = el teléfono durmió o se cambió la hora

let sync = null; // { serverMs, perfMs, deviceMs }

export async function syncClock() {
  if (!navigator.onLine) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const t0 = performance.now();
    const res = await fetch(`./time.txt?t=${Date.now()}`, {
      method: "HEAD",
      cache: "no-store",
      signal: ctrl.signal,
    });
    const t1 = performance.now();
    const header = res.headers.get("Date");
    if (!header) return false;
    // La cabecera Date trunca a segundos (+500 ms de media) y llega tras medio viaje.
    const serverMs = Date.parse(header) + 500 + (t1 - t0) / 2;
    if (Number.isNaN(serverMs)) return false;
    sync = { serverMs, perfMs: t1, deviceMs: Date.now() };
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function lastSync() {
  return sync;
}

// Devuelve la hora a estampar y de dónde sale.
export function now() {
  const deviceMs = Date.now();
  const base = {
    deviceMs,
    lastSyncIso: sync ? new Date(sync.serverMs).toISOString() : null,
  };
  if (!sync) {
    return { ...base, ms: deviceMs, verified: false, offsetMs: null };
  }
  const perfElapsed = performance.now() - sync.perfMs;
  const deviceElapsed = deviceMs - sync.deviceMs;
  const serverNow = sync.serverMs + perfElapsed;
  const offsetMs = Math.round(deviceMs - serverNow);
  const consistent = Math.abs(deviceElapsed - perfElapsed) <= MAX_DRIFT_MS;
  if (perfElapsed <= MAX_AGE_MS && consistent) {
    return { ...base, ms: Math.round(serverNow), verified: true, offsetMs };
  }
  return { ...base, ms: deviceMs, verified: false, offsetMs };
}

export function needsSync() {
  if (!sync) return true;
  const t = now();
  return !t.verified || performance.now() - sync.perfMs > MAX_AGE_MS / 2;
}
