// hostResolve.js — auto-pick a live host from a preference-ordered list by
// probing each one's /api/health. For external clients (the engine bridge, a
// combined launcher) that want to switch between the Node TaskerBridge and the
// VBA transmitter automatically: prefer one, fall back when it's down.
//
// The panel itself does NOT need this — it's served BY whichever host and uses
// relative ./api/* paths, so it works on either without changes.
//
//   import { resolveHost } from "./hostResolve.js";
//   const base = await resolveHost([
//     "http://localhost:8790",            // Node TaskerBridge (preferred)
//     "http://192.168.11.20:8099"          // VBA transmitter (fallback)
//   ]);
//   if (base) (await fetch(base + "/api/tasks")) ...; else /* nothing up */

export async function probe(origin, timeoutMs = 1200) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(origin.replace(/\/+$/, "") + "/api/health", { signal: ctrl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

// First reachable origin in preference order, or null if none answer.
export async function resolveHost(candidates) {
  for (const c of candidates) {
    if (await probe(c)) return c.replace(/\/+$/, "");
  }
  return null;
}
