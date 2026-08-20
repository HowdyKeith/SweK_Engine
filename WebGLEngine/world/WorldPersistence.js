// FILE: world/WorldPersistence.js
// VERSION: v2 - INDEXEDDB-BACKED, LOCALSTORAGE-FALLBACK
//
// Round 168 (v663): rewritten from localStorage to IndexedDB for the world
// payload. localStorage's ~5MB cap was hitting users with large modified-
// chunk counts (110k+ voxels post-CaveCarver) which caused the periodic
// main-thread lockups patched with a circuit breaker in v662. IDB removes
// the cap (per-origin storage is typically 50%+ of free disk on Chrome),
// stores Uint8Arrays directly (no base64 inflate), and writes
// asynchronously so the main thread isn't blocked on the storage call.
//
// What stays in localStorage:
//   - The camera pose (small, no benefit from migration)
//   - A "clear pending" flag (sync marker; solves the race between clear()
//     and an immediate page reload — IDB delete is async and may not
//     complete before unload, but the flag persists and the next load
//     catches it)
//
// Backwards compatibility: on first IDB load, if IDB is empty, we look
// for the legacy `voxelengine.worldDiff` localStorage entry, decode its
// base64-encoded chunks, write them to IDB, and remove the legacy key.
// Existing players don't lose their builds across this upgrade.

const DB_NAME       = "voxelengine";
const DB_VERSION    = 1;
const STORE_WORLD   = "world";
const WORLD_KEY     = "current";

const STORAGE_KEY_WORLD          = "voxelengine.worldDiff";       // legacy, migration source
const STORAGE_KEY_CAMERA         = "voxelengine.camera";          // still localStorage
const STORAGE_KEY_CLEAR_PENDING  = "voxelengine.clearPending";    // sync race-fix flag

const VERSION = 2;  // payload now stores Uint8Array directly (v1 was base64 strings)

function base64ToUint8(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export class WorldPersistence {
    constructor(world) {
        this.world = world;
        this.lastSaveTimestamp = 0;
        this.lastSaveBytes = 0;
        this.lastLoadCount = 0;

        // Defense-in-depth circuit breaker. IDB rarely hits quota (50%+
        // of free disk is huge) but if it ever does — full disk, browser
        // storage policy, private browsing — we still want to avoid
        // rebuilding the payload every 30s. Retained from v662.
        this._quotaExceeded = false;

        this._db = null;
        this._dbPromise = this._openDb();
    }

    _openDb() {
        return new Promise((resolve) => {
            if (typeof indexedDB === "undefined") {
                console.warn("[WorldPersistence] indexedDB unavailable — persistence is disabled this session");
                resolve(null);
                return;
            }
            let req;
            try { req = indexedDB.open(DB_NAME, DB_VERSION); }
            catch (e) { console.warn("[WorldPersistence] IDB open threw:", e?.message); resolve(null); return; }
            req.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_WORLD)) {
                    db.createObjectStore(STORE_WORLD);
                }
            };
            req.onsuccess = () => {
                this._db = req.result;
                resolve(req.result);
            };
            req.onerror = () => {
                console.warn("[WorldPersistence] IDB open failed:", req.error?.message || "(no message)");
                resolve(null);
            };
            req.onblocked = () => {
                console.warn("[WorldPersistence] IDB open blocked — another tab holds the DB. Close other engine tabs.");
            };
        });
    }

    async save() {
        if (this._quotaExceeded) {
            return { ok: false, error: "quota exceeded (circuit-broken; resumeAutosave() to retry)", fatalQuota: true };
        }

        // Build payload. Uint8Array stored DIRECTLY in IDB — no base64
        // inflate, structured-clone preserves the binary as-is.
        const chunks = [];
        for (const c of this.world.chunks.values()) {
            if (!c._modified) continue;
            chunks.push({
                cx: c.cx,
                cz: c.cz,
                v: c.voxels.slice(),   // copy so subsequent edits don't mutate the saved snapshot mid-write
            });
        }
        const payload = {
            version: VERSION,
            timestamp: Date.now(),
            chunks,
        };
        const approxBytes = chunks.reduce((sum, ch) => sum + ch.v.byteLength, 0) + 128;

        const db = await this._dbPromise;
        if (!db) {
            return { ok: false, error: "IDB unavailable" };
        }

        try {
            await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_WORLD, "readwrite");
                tx.objectStore(STORE_WORLD).put(payload, WORLD_KEY);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
            });
            this.lastSaveTimestamp = payload.timestamp;
            this.lastSaveBytes     = approxBytes;
            return { ok: true, chunks: chunks.length, bytes: approxBytes, backend: "idb" };
        } catch (e) {
            const msg = e?.message || "IDB write failed";
            if (/quota|QuotaExceeded/i.test(msg)) {
                this._quotaExceeded = true;
                return { ok: false, error: msg, fatalQuota: true, jsonBytes: approxBytes };
            }
            return { ok: false, error: msg };
        }
    }

    async load() {
        // Round 168 — race fix. If a prior session called clear() and
        // immediately reloaded, the async IDB delete may have been cut
        // short by page unload. The sync localStorage flag below catches
        // that: we wipe IDB before loading so the "reset" sticks.
        try {
            if (localStorage.getItem(STORAGE_KEY_CLEAR_PENDING) === "1") {
                console.log("[WorldPersistence] pending clear detected — wiping IDB before load");
                await this._clearIdb();
                localStorage.removeItem(STORAGE_KEY_CLEAR_PENDING);
            }
        } catch {}

        const db = await this._dbPromise;
        let payload = null;
        let backend = "idb";
        if (db) {
            try {
                payload = await new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_WORLD, "readonly");
                    const req = tx.objectStore(STORE_WORLD).get(WORLD_KEY);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => reject(req.error);
                });
            } catch (e) {
                console.warn("[WorldPersistence] IDB read failed:", e?.message);
            }
        }

        // First-run migration: IDB is empty but legacy localStorage has data
        if (!payload) {
            const migrated = await this._tryMigrateFromLocalStorage();
            if (migrated) { payload = migrated; backend = "idb (migrated)"; }
        }

        if (!payload) return { ok: false, error: "no save" };
        if (payload.version !== VERSION && payload.version !== 1) {
            return { ok: false, error: `version mismatch ${payload.version}` };
        }
        if (!Array.isArray(payload.chunks)) return { ok: false, error: "no chunks array" };

        let restored = 0, skipped = 0;
        for (const sav of payload.chunks) {
            const chunk = this.world.chunks.get(`${sav.cx},${sav.cz}`);
            if (!chunk) { skipped++; continue; }
            let bytes;
            if (typeof sav.v === "string") {
                bytes = base64ToUint8(sav.v);          // legacy v1 format
            } else if (sav.v instanceof Uint8Array) {
                bytes = sav.v;
            } else if (sav.v && sav.v.buffer) {
                bytes = new Uint8Array(sav.v.buffer);   // structured-clone may rehydrate as plain object in odd cases
            } else {
                skipped++; continue;
            }
            if (bytes.length !== chunk.voxels.length) { skipped++; continue; }
            chunk.voxels.set(bytes);
            chunk.dirty = true;
            chunk._modified = true;
            restored++;
        }
        this.lastLoadCount = restored;
        return {
            ok: true,
            restored,
            skipped,
            ageMs: Date.now() - payload.timestamp,
            backend,
        };
    }

    async _tryMigrateFromLocalStorage() {
        let raw;
        try { raw = localStorage.getItem(STORAGE_KEY_WORLD); }
        catch { return null; }
        if (!raw) return null;

        let legacy;
        try { legacy = JSON.parse(raw); }
        catch { return null; }
        if (!legacy || !Array.isArray(legacy.chunks)) return null;

        // Convert v1 base64-string chunks to v2 Uint8Array chunks for IDB
        const idbPayload = {
            version: VERSION,
            timestamp: legacy.timestamp || Date.now(),
            chunks: legacy.chunks.map(c => ({
                cx: c.cx,
                cz: c.cz,
                v:  typeof c.v === "string" ? base64ToUint8(c.v) : c.v,
            })),
        };

        const db = await this._dbPromise;
        if (db) {
            try {
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_WORLD, "readwrite");
                    tx.objectStore(STORE_WORLD).put(idbPayload, WORLD_KEY);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
                try { localStorage.removeItem(STORAGE_KEY_WORLD); } catch {}
                console.log(`[WorldPersistence] migrated ${idbPayload.chunks.length} chunks from localStorage to IDB`);
            } catch (e) {
                console.warn("[WorldPersistence] migration write to IDB failed:", e?.message);
                // Still return the parsed payload so this session can apply it,
                // even though the migration didn't stick.
            }
        }
        return idbPayload;
    }

    clear() {
        // Round 168 — clear() is called synchronously and often followed by
        // an immediate location.reload(). The IDB delete is async and may
        // not complete before unload. We solve that with a synchronous
        // localStorage flag the next load() honors. Also clears in-memory
        // _modified flags so a beforeunload save in the next few ms doesn't
        // re-write what we just asked to forget.
        try {
            localStorage.setItem(STORAGE_KEY_CLEAR_PENDING, "1");
            localStorage.removeItem(STORAGE_KEY_WORLD);   // also drop any legacy data
        } catch {}
        for (const c of this.world.chunks.values()) {
            c._modified = false;
        }
        // Fire-and-forget IDB clear. If unload races us, the flag above
        // catches it on next load.
        this._clearIdb().catch(() => {});
        return { ok: true };
    }

    async _clearIdb() {
        const db = await this._dbPromise;
        if (!db) return;
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_WORLD, "readwrite");
            tx.objectStore(STORE_WORLD).delete(WORLD_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    saveCamera(cam) {
        try {
            const payload = JSON.stringify({
                position: { ...cam.position },
                yaw: cam.yaw,
                pitch: cam.pitch,
                timestamp: Date.now(),
            });
            localStorage.setItem(STORAGE_KEY_CAMERA, payload);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e?.message };
        }
    }

    loadCamera(cam) {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_CAMERA);
            if (!raw) return { ok: false, error: "no camera save" };
            const data = JSON.parse(raw);
            if (data.position) {
                cam.position.x = +data.position.x || 0;
                cam.position.y = +data.position.y || 0;
                cam.position.z = +data.position.z || 0;
            }
            if (Number.isFinite(+data.yaw))   cam.yaw   = +data.yaw;
            if (Number.isFinite(+data.pitch)) cam.pitch = +data.pitch;
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e?.message };
        }
    }

    clearCamera() {
        try {
            localStorage.removeItem(STORAGE_KEY_CAMERA);
            return { ok: true };
        } catch { return { ok: false }; }
    }

    snapshot() {
        let modified = 0;
        for (const c of this.world.chunks.values()) {
            if (c._modified) modified++;
        }
        return {
            modified,
            lastSaveBytes: this.lastSaveBytes,
            lastSaveAgo: this.lastSaveTimestamp
                ? Math.round((Date.now() - this.lastSaveTimestamp) / 1000)
                : null,
            backend: this._db ? "indexeddb" : "(unavailable)",
            quotaExceeded: this._quotaExceeded,
        };
    }

    resumeAutosave() {
        this._quotaExceeded = false;
        return { ok: true, message: "autosave re-armed; next save() will retry" };
    }
}
