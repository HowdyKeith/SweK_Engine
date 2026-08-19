// FILE: rig/jointEmitter.js
// VERSION: v1 (v828 — POC of bone-anchored particle emitters)
//
// Wraps the engine's existing particle system so emitters spawn from
// rig bone world positions. Useful for kaiju attacks (Round 30 — plasma
// from mouth, fire from tail) and any "this effect comes from THIS part
// of the body" need.
//
// API (window.jointEmitter after install):
//   .add(id, opts) — opts: {
//       ownerId,             // RigSystem owner (binding's layerId or ghostId)
//       boneName,            // resolved to boneIdx via rigSystem.boneIdxByName
//       rate?,               // particles/sec (default 30)
//       config?,             // particle spawn config (vx/vy/vz range, color, ttl)
//   }
//   .update(id, opts)
//   .remove(id)
//   .pause(id) / .resume(id)
//   .tick(dt)              — called per frame; emits accumulated particles
//
// The actual particles.spawn() call uses the engine's existing API. If
// particles aren't available, emitters tick silently (no errors).

export class JointEmitter {
    constructor() {
        this.emitters = new Map();   // id → { ownerId, boneIdx, rate, config, _accum, _paused }
        this._tmpVec = [0, 0, 0];
    }

    add(id, opts = {}) {
        if (this.emitters.has(id)) return this.update(id, opts);
        if (!opts.ownerId)  return { error: "ownerId required" };
        if (!opts.boneName && opts.boneIdx == null) return { error: "boneName or boneIdx required" };

        const boneIdx = opts.boneIdx ?? window.rigSystem?.boneIdxByName(opts.ownerId, opts.boneName);
        if (boneIdx == null || boneIdx < 0) {
            return { error: `bone "${opts.boneName}" not found on owner "${opts.ownerId}"` };
        }
        this.emitters.set(id, {
            ownerId: opts.ownerId,
            boneIdx,
            boneName: opts.boneName,        // v834 — saved for persistence (re-resolve idx on restore)
            rate: opts.rate ?? 30,
            config: opts.config || null,
            _accum: 0,
            _paused: false,
        });
        this._scheduleSave();
        return { ok: true, boneIdx };
    }

    update(id, opts = {}) {
        const e = this.emitters.get(id);
        if (!e) return { error: `no emitter "${id}"` };
        if (opts.rate    != null) e.rate    = opts.rate;
        if (opts.config  != null) e.config  = opts.config;
        if (opts.ownerId != null) e.ownerId = opts.ownerId;
        if (opts.boneName) {
            const bi = window.rigSystem?.boneIdxByName(e.ownerId, opts.boneName);
            if (bi != null && bi >= 0) { e.boneIdx = bi; e.boneName = opts.boneName; }
        }
        this._scheduleSave();
        return { ok: true };
    }

    remove(id)  { this.emitters.delete(id); this._scheduleSave(); }
    pause(id)   { const e = this.emitters.get(id); if (e) e._paused = true; this._scheduleSave(); }
    resume(id)  { const e = this.emitters.get(id); if (e) e._paused = false; this._scheduleSave(); }
    list()      { return [...this.emitters.keys()]; }
    clear()     { this.emitters.clear(); this._scheduleSave(); }

    // v834 — persistence
    save() {
        try {
            const data = [];
            for (const [id, e] of this.emitters.entries()) {
                // Skip emitters whose config is a function — can't serialize.
                // Caller's responsibility to re-add those after reload.
                if (typeof e.config === "function") continue;
                data.push({
                    id, ownerId: e.ownerId, boneName: e.boneName,
                    rate: e.rate, config: e.config, paused: e._paused,
                });
            }
            localStorage.setItem("engine:jointEmitter:v1", JSON.stringify(data));
            return { ok: true, count: data.length };
        } catch (e) { return { error: e?.message }; }
    }
    restore() {
        try {
            const raw = localStorage.getItem("engine:jointEmitter:v1");
            if (!raw) return { ok: true, restored: 0 };
            const data = JSON.parse(raw);
            let restored = 0;
            for (const item of data) {
                if (!item.ownerId || !item.boneName) continue;
                const r = this.add(item.id, {
                    ownerId: item.ownerId, boneName: item.boneName,
                    rate: item.rate, config: item.config,
                });
                if (r.ok) {
                    if (item.paused) this.pause(item.id);
                    restored++;
                }
            }
            return { ok: true, restored };
        } catch (e) { return { error: e?.message }; }
    }
    clearStorage() {
        try { localStorage.removeItem("engine:jointEmitter:v1"); return { ok: true }; }
        catch (e) { return { error: e?.message }; }
    }
    _scheduleSave() {
        if (this._saveTimer) return;
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            this.save();
        }, 250);
    }

    /**
     * Per-frame tick: emits accumulated particles from each emitter's
     * current bone world position. Called by the engine main loop.
     * Silently no-ops if particles or rigSystem are unavailable.
     */
    tick(dt) {
        if (!window.particles?.spawn || !window.rigSystem) return;
        const rng = Math.random;
        for (const e of this.emitters.values()) {
            if (e._paused) continue;
            // v835 — skip emission if the bone is detached (limb flew off).
            // Bridge owns the detached set; query through rigSystem.
            const bridge = window.rigSystem._entityBridges?.get(e.ownerId);
            if (bridge?.isDetached?.(e.boneIdx)) continue;
            e._accum += e.rate * dt;
            const n = Math.floor(e._accum);
            if (n <= 0) continue;
            e._accum -= n;
            const wp = window.rigSystem.getBoneWorldPos(e.ownerId, e.boneIdx);
            if (!wp) continue;        // bone not resolvable (rig detached?)
            // Generate particles. The config can be a function (called
            // per particle with a sample of {pos, rng}) or an object
            // (used as-is, with pos merged in).
            for (let i = 0; i < n; i++) {
                let spawnArg;
                if (typeof e.config === "function") {
                    spawnArg = e.config({ pos: wp, rng });
                } else if (e.config && typeof e.config === "object") {
                    // Merge bone position into the static config
                    spawnArg = { ...e.config, x: wp[0], y: wp[1], z: wp[2] };
                    // Randomize velocity if min/max ranges are specified
                    if (Array.isArray(e.config.vxRange)) spawnArg.vx = _rand(e.config.vxRange[0], e.config.vxRange[1]);
                    if (Array.isArray(e.config.vyRange)) spawnArg.vy = _rand(e.config.vyRange[0], e.config.vyRange[1]);
                    if (Array.isArray(e.config.vzRange)) spawnArg.vz = _rand(e.config.vzRange[0], e.config.vzRange[1]);
                } else {
                    spawnArg = {
                        x: wp[0], y: wp[1], z: wp[2],
                        vx: _rand(-1, 1), vy: _rand(1, 3), vz: _rand(-1, 1),
                        ttl: 1.0, size: 0.4,
                        r: 1, g: 0.7, b: 0.3, a: 0.8,
                        gravity: -2,
                    };
                }
                try { window.particles.spawn(spawnArg); } catch (err) { /* particles API gated */ }
            }
        }
    }
}

function _rand(min, max) { return min + Math.random() * (max - min); }

export function installJointEmitterGlobal() {
    if (!window.jointEmitter) {
        window.jointEmitter = new JointEmitter();
        // v834 — auto-restore from localStorage. Deferred to next tick
        // so rigSystem is fully initialized + bone lookups can succeed.
        if (typeof setTimeout !== "undefined") {
            setTimeout(() => {
                try { window.jointEmitter.restore(); } catch (e) {}
            }, 0);
        }
    }
    return window.jointEmitter;
}
