// WebGLEngine/render/voxelSave.mjs -- v4521 (Sandbox on the device, round 5: save and load)
//
// *** THE SANDBOX'S SAVE, ON THE DEVICE WORLD, IN THE SANDBOX'S OWN FORMAT. *** world/WorldPersistence.js writes every chunk that
// diverged from the generator (_modified, set by every setVoxel) into IndexedDB as { version, timestamp, chunks: [{ cx, cz, v }] }
// and reads it back onto a freshly generated world; the camera pose goes to localStorage. Since v4521 the payload and its
// application are METHODS (buildPayload, validatePayload, applyPayload) that save() and load() call, so the device page saves
// what index.html saves and a gate holds the format without a browser. What this module adds is the device side:
//
//   saveWorld(state, persistence)        persistence.save() plus the count of modified chunks and the bytes
//   loadWorld(state, persistence)        persistence.load(), then round 4's syncDirty: a restored chunk is dirty, so its slot
//                                        (and its neighbours') follow -- the load reaches the device the way every writer does
//   exportPayload / importPayload        the payload as a JSON-safe object (voxels base64), the shape a file or a peer carries
//   payloadHash / payloadBytes           what a gate compares and a HUD reports
//   orbitToCam / camToOrbit              the page's orbit (yaw, pitch, dist, target) in the sandbox's camera pose (position, yaw,
//                                        pitch) so saveCamera / loadCamera store it, and back
//   modifiedChunks(world)                the count the HUD shows and autosave watches
"use strict";
import { WorldPersistence } from "../world/WorldPersistence.js";
import { syncDirty } from "./voxelDamage.mjs";

export const SAVE = Object.freeze({ autosaveMs: 30000 });

export function modifiedChunks(world) { let n = 0; for (const c of world.chunks.values()) if (c._modified) n++; return n; }
export function payloadBytes(payload) { return payload.chunks.reduce((s, c) => s + (c.v.byteLength || c.v.length || 0), 0) + 128; }
export function payloadHash(payload) {
    let h = 0x811c9dc5; const mix = (b) => { h ^= b; h = Math.imul(h, 0x01000193); };
    for (const c of [...payload.chunks].sort((a, b) => a.cx - b.cx || a.cz - b.cz)) { mix(c.cx & 255); mix(c.cz & 255); const v = typeof c.v === "string" ? b64ToBytes(c.v) : c.v; for (let i = 0; i < v.length; i++) mix(v[i]); }
    return (h >>> 0).toString(16).padStart(8, "0");
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function bytesToB64(bytes) {
    if (typeof btoa === "function") { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
    let out = ""; for (let i = 0; i < bytes.length; i += 3) { const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2], n = (a << 16) | ((b || 0) << 8) | (c || 0); out += B64[n >> 18] + B64[(n >> 12) & 63] + (b == null ? "=" : B64[(n >> 6) & 63]) + (c == null ? "=" : B64[n & 63]); } return out;
}
export function b64ToBytes(str) {
    if (typeof atob === "function") { const bin = atob(str), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
    const clean = str.replace(/=+$/, ""), out = new Uint8Array(Math.floor(clean.length * 3 / 4)); let o = 0;
    for (let i = 0; i < clean.length; i += 4) { const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63); out[o++] = n >> 16; if (i + 2 < clean.length) out[o++] = (n >> 8) & 255; if (i + 3 < clean.length) out[o++] = n & 255; }
    return out;
}

/** the payload as JSON-safe data: the same fields, the voxels base64 (WorldPersistence's own legacy v1 spelling, which load() still reads) */
export function exportPayload(payload) { return { version: payload.version, timestamp: payload.timestamp, chunks: payload.chunks.map((c) => ({ cx: c.cx, cz: c.cz, v: bytesToB64(c.v) })) }; }
export function importPayload(obj) {
    const refusal = WorldPersistence.validatePayload(obj); if (refusal) throw new Error("voxelSave: " + refusal);
    return { version: obj.version, timestamp: obj.timestamp, chunks: obj.chunks.map((c) => ({ cx: c.cx | 0, cz: c.cz | 0, v: typeof c.v === "string" ? b64ToBytes(c.v) : Uint8Array.from(c.v) })) };
}

export async function saveWorld(state, persistence) { const r = await persistence.save(); return { ...r, modified: modifiedChunks(state.world) }; }
export async function loadWorld(state, persistence) { const r = await persistence.load(); const sync = r.ok ? syncDirty(state) : { chunks: [], dirty: 0 }; return { load: r, sync }; }
/** a payload applied straight to the state's world (an import, a peer's save), then synced */
export function applyToState(state, persistence, payload) { const refusal = WorldPersistence.validatePayload(payload); if (refusal) return { ok: false, error: refusal }; const r = persistence.applyPayload(payload); return { ok: true, ...r, sync: syncDirty(state) }; }

/** the page's orbit as the sandbox's camera pose: position is the eye, yaw and pitch the orbit's own */
export function orbitToCam({ yaw, pitch, dist, target = [0, 0, 0] }) {
    return { position: { x: target[0] + Math.sin(yaw) * Math.cos(pitch) * dist, y: target[1] + Math.sin(pitch) * dist, z: target[2] + Math.cos(yaw) * Math.cos(pitch) * dist }, yaw, pitch };
}
export function camToOrbit(cam, target = [0, 0, 0]) {
    const dx = cam.position.x - target[0], dy = cam.position.y - target[1], dz = cam.position.z - target[2];
    return { yaw: cam.yaw, pitch: cam.pitch, dist: Math.hypot(dx, dy, dz), target: target.slice() };
}
export { WorldPersistence };
