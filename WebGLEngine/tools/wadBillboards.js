// =============================================================
// FILE: /tools/wadBillboards.js
// ROUND: 393
// =============================================================
//
// Billboard infrastructure for WAD sprites. v380 decodes sprite
// lumps to RGBA frames; this module manages a billboard pool that
// can be rendered as camera-facing quads.
//
// THE RENDER PATH:
//   The engine's existing texture+mesh renderer expects (vertex
//   array, texture handle) pairs. This module produces those — it
//   builds a per-frame batch of camera-facing quads, one per live
//   billboard, with per-billboard texture handles for sprite frames.
//
// WHAT THIS MODULE DOES:
//   1. Sprite-frame texture caching — decoded RGBA → cached
//      `{ width, height, rgba, glTexture? }` records, keyed on
//      "NAME+FRAME+ROT".
//   2. Billboard pool — `{ id, x, y, z, name, frame, rot, alive }`
//      records the engine can spawn from a WAD THING list.
//   3. Per-frame orientation — quads face the camera around Y axis
//      (most sprite sheets are upright; not full 3-axis billboards).
//   4. Depth sort — alpha-tested sprites still need back-to-front
//      ordering against each other to avoid the "this tree is in
//      front of that tree from one angle only" bug.
//
// NOT IN THIS MODULE:
//   • Actual WebGL drawing — that's the engine's job. This module
//     exposes the data; main.js wires it to the existing draw path.
//   • Sprite frame animation — that's v396's job (animated textures
//     in general, including monster idle/walk cycles).
//
// USAGE:
//
//   import { BillboardManager } from "./tools/wadBillboards.js";
//   const bm = new BillboardManager({ cellSize: 16 });
//
//   // Spawn from WAD things:
//   const placements = window.wad.things(parsedMap);
//   for (const p of placements) {
//     const sprite = window.wad.spriteForThing(p.type);
//     if (!sprite) continue;
//     bm.spawn({ x: p.x, y: p.y, z: p.z, name: sprite, frame: "A", rot: 1 });
//   }
//
//   // Per frame:
//   const quads = bm.prepareFrame(window.camera);
//   for (const q of quads) drawTexturedQuad(q.texture, q.vertices);

/** Half-width and half-height of one billboard in world units. */
const DEFAULT_HALF_SIZE = 1.0;

/**
 * BillboardManager — pool + per-frame quad preparation.
 */
export class BillboardManager {
    constructor(opts = {}) {
        this.cellSize    = opts.cellSize    ?? 16;   // WAD units per voxel
        this.halfSize    = opts.halfSize    ?? DEFAULT_HALF_SIZE;
        this._billboards = new Map();  // id → record
        this._nextId     = 1;
        // Frame cache: "TROOA1" → { width, height, rgba, _disposed? }
        this._frames     = new Map();
        // Animation cursors (v396 will populate): name → currentFrame
        this._animState  = new Map();
    }

    /**
     * Register a decoded sprite frame for later rendering. The
     * engine's WAD-decode pipeline (v380) calls this with the RGBA
     * frame data; the renderer fetches the cache entry when it
     * draws.
     *
     * key format: "NAME+FRAME+ROT" — e.g. "TROOA1" for trooper, A
     * pose, rotation 1.
     */
    registerFrame(name, frame, rot, frameData) {
        const key = `${name}${frame}${rot}`;
        this._frames.set(key, frameData);
        return key;
    }

    /** Lookup a registered frame, or null. */
    getFrame(name, frame, rot) {
        return this._frames.get(`${name}${frame}${rot}`) ?? null;
    }

    /**
     * Spawn a billboard. Returns the new billboard's id. World
     * coords are in voxel units (the WAD voxelizer's output space).
     */
    spawn(opts) {
        const id = this._nextId++;
        this._billboards.set(id, {
            id,
            x: opts.x ?? 0,
            y: opts.y ?? 0,
            z: opts.z ?? 0,
            name:  opts.name  ?? "TROO",
            frame: opts.frame ?? "A",
            rot:   opts.rot   ?? 1,
            scale: opts.scale ?? 1,
            alive: true,
            tag:   opts.tag,        // free-form user data
        });
        return id;
    }

    despawn(id) {
        this._billboards.delete(id);
        this._animState.delete(id);  // v697 — drop animation state too
    }

    /**
     * v697 — Sprite animation round 2. Animate a billboard's `frame` field
     * over time. Frames is an array of frame letter codes like ["A","B"]
     * (matching what registerFrame() was called with). fps is frames per
     * second. The renderer continues to look up "NAME+FRAME+ROT" each draw,
     * so animation works as long as all the listed frames are registered.
     *
     *   bm.setAnimation(torchId, { frames: ["A","B","C","D"], fps: 8 });
     *
     * To stop animation, pass frames:null or call with empty array. The
     * billboard's last frame is preserved when stopped.
     *
     * Multiple billboards can share the same registered frames; each
     * billboard advances independently based on its own t0.
     */
    setAnimation(id, opts = {}) {
        const bb = this._billboards.get(id);
        if (!bb) return false;
        if (!opts.frames || !opts.frames.length) {
            this._animState.delete(id);
            return true;
        }
        this._animState.set(id, {
            frames: opts.frames.slice(),           // ["A","B","C",...]
            fps:    Math.max(0.1, opts.fps || 4),  // default 4fps Doom-style
            t0:     performance.now(),
            loop:   opts.loop !== false,           // default looping
        });
        return true;
    }

    /**
     * v697 — Per-frame tick. Call this once per render frame BEFORE
     * iterating billboards for draw, so the renderer sees the up-to-date
     * `frame` field. Cost is O(animated_billboards), not O(all_billboards),
     * because non-animated ones aren't in _animState.
     *
     * v699 — Also handles 8-direction rotation pick for billboards that
     * have a facing direction set. The view-angle math is:
     *
     *   relAngle = atan2(camera.z - bb.z, camera.x - bb.x) - bb.facingYaw
     *   rotIdx   = round((relAngle + π) / (π/4)) mod 8 + 1     // 1..8
     *
     * Doom's convention: rot 1 = facing the viewer (front), rot 5 = back,
     * 3 = right side, 7 = left side; 2/4/6/8 are the diagonals. The
     * generated sprite-sheet must be laid out in this order if you want
     * the matches to look right.
     */
    update(nowMs, camera = null) {
        const now = nowMs == null ? performance.now() : nowMs;
        // Animation pass
        if (this._animState.size > 0) {
            for (const [id, a] of this._animState) {
                const bb = this._billboards.get(id);
                if (!bb || !bb.alive) { this._animState.delete(id); continue; }
                const elapsed = (now - a.t0) / 1000;       // seconds
                const total = a.frames.length;
                let idx = Math.floor(elapsed * a.fps);
                if (a.loop) {
                    idx = ((idx % total) + total) % total;
                } else {
                    if (idx >= total) idx = total - 1;
                }
                bb.frame = a.frames[idx];
            }
        }
        // v699 — 8-direction rotation pass. Only billboards with a
        // _facingYaw set get their rot updated. Camera is optional;
        // engines that don't expose it can call update() without it.
        if (camera && typeof camera.position === "object") {
            const cx = camera.position.x, cz = camera.position.z;
            const HALF_PI = Math.PI / 2;
            const EIGHTH  = Math.PI / 4;
            for (const bb of this._billboards.values()) {
                if (typeof bb._facingYaw !== "number") continue;
                // Angle FROM bb TO camera, in world space:
                const camAngle = Math.atan2(cz - bb.z, cx - bb.x);
                // Subtract bb's facing — Doom convention assumes the
                // entity's "forward" is yaw=0 looking +X.
                let rel = camAngle - bb._facingYaw;
                // Normalize to [0, 2π)
                rel = ((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                // Map to 1..8: viewer-facing (rot 1) at rel ≈ 0
                let idx = Math.round(rel / EIGHTH) % 8;     // 0..7
                bb.rot = String((idx % 8) + 1);             // "1".."8"
            }
        }
    }

    /**
     * v699 — Set an entity's facing yaw (in radians). Once set, the
     * billboard becomes 8-direction-aware: its `rot` field is updated
     * each call to update() based on the angle between camera and entity.
     * Pass null to clear (returns to static rot use).
     */
    setFacing(id, yawRadians) {
        const bb = this._billboards.get(id);
        if (!bb) return false;
        if (yawRadians == null) delete bb._facingYaw;
        else bb._facingYaw = yawRadians;
        return true;
    }

    /** All currently-alive billboard records (live array, don't mutate). */
    list() {
        return Array.from(this._billboards.values());
    }

    count() {
        return this._billboards.size;
    }

    clear() {
        this._billboards.clear();
    }

    /**
     * Spawn many billboards in bulk from a list of WAD placements
     * (output of window.wad.things(...)). Picks the sprite name via
     * the caller-supplied resolver — typically window.wad.spriteForThing.
     *
     * Returns the array of new billboard ids.
     *
     *   bm.spawnFromPlacements(placements, window.wad.spriteForThing,
     *                            { unitsPerVoxel: 16, baseY: 2, centerWX, centerWZ });
     */
    spawnFromPlacements(placements, spriteResolver, opts = {}) {
        const ups       = opts.unitsPerVoxel ?? this.cellSize;
        const baseY     = opts.baseY        ?? 0;
        const centerWX  = opts.centerWX      ?? 0;
        const centerWZ  = opts.centerWZ      ?? 0;
        const ids = [];
        for (const p of placements) {
            const name = spriteResolver(p.type);
            if (!name) continue;
            const vx = Math.round((p.x - centerWX) / ups);
            const vz = Math.round((p.y - centerWZ) / ups);
            const id = this.spawn({
                x: vx, y: baseY + 1, z: vz,
                name,
                frame: "A",
                rot:   1,
                tag:   { type: p.type, kind: p.kind, label: p.label, angle: p.angle },
            });
            ids.push(id);
        }
        return ids;
    }

    /**
     * Prepare a list of camera-facing quad render records for the
     * current frame. The engine's drawing code consumes this.
     *
     * Returned shape per entry:
     *   {
     *     id, name, frame, rot,
     *     texture:  { width, height, rgba },   // from frame cache
     *     vertices: Float32Array(20),            // 4 verts × (x,y,z,u,v)
     *     distance: <Number>,                    // squared dist for sort
     *   }
     *
     * Vertices are pre-billboarded so the quad faces the camera
     * around the Y axis. Two triangles share the corner verts;
     * caller uses indices [0,1,2, 0,2,3] for the quad.
     *
     * Quads are sorted FAR-TO-NEAR for correct alpha rendering when
     * blending; alpha-tested-only renderers can ignore the sort.
     */
    prepareFrame(camera) {
        if (!camera?.position) return [];
        const cx = camera.position.x;
        const cy = camera.position.y;
        const cz = camera.position.z;
        const out = [];

        for (const b of this._billboards.values()) {
            if (!b.alive) continue;
            const tex = this.getFrame(b.name, b.frame, b.rot);
            if (!tex) continue;

            // Direction from billboard to camera, projected on XZ plane.
            // Y-axis billboarding: the quad's "right" vector is the
            // camera-to-billboard vector rotated 90° around Y.
            const dx = cx - b.x;
            const dz = cz - b.z;
            const dist2 = dx * dx + (cy - b.y) * (cy - b.y) + dz * dz;
            const len = Math.hypot(dx, dz);
            // "right" is perpendicular to look direction on XZ plane.
            // If the billboard sits at the camera position (len ≈ 0),
            // default to world X for "right".
            let rx, rz;
            if (len < 1e-6) {
                rx = 1; rz = 0;
            } else {
                rx = -dz / len;     // perpendicular: rotate by +90° around Y
                rz =  dx / len;
            }

            // Scale by sprite aspect ratio. half-width follows the
            // sprite's pixel width; half-height follows pixel height.
            // Both scaled by b.scale.
            const aspectScale = b.scale * this.halfSize;
            const hw = (tex.width  / 64) * aspectScale;   // 64 = nominal sprite size
            const hh = (tex.height / 64) * aspectScale;

            // 4 vertices: (x, y, z, u, v) per corner. Order:
            //   0: bottom-left  (-right, -up, uv 0,1)
            //   1: bottom-right (+right, -up, uv 1,1)
            //   2: top-right    (+right, +up, uv 1,0)
            //   3: top-left     (-right, +up, uv 0,0)
            const verts = new Float32Array(20);
            verts[0]  = b.x - rx * hw; verts[1]  = b.y - hh; verts[2]  = b.z - rz * hw; verts[3]  = 0; verts[4]  = 1;
            verts[5]  = b.x + rx * hw; verts[6]  = b.y - hh; verts[7]  = b.z + rz * hw; verts[8]  = 1; verts[9]  = 1;
            verts[10] = b.x + rx * hw; verts[11] = b.y + hh; verts[12] = b.z + rz * hw; verts[13] = 1; verts[14] = 0;
            verts[15] = b.x - rx * hw; verts[16] = b.y + hh; verts[17] = b.z - rz * hw; verts[18] = 0; verts[19] = 0;

            out.push({
                id: b.id,
                name:  b.name,
                frame: b.frame,
                rot:   b.rot,
                texture: tex,
                vertices: verts,
                distance: dist2,
            });
        }

        // Far-to-near sort. Larger distance first.
        out.sort((a, b) => b.distance - a.distance);
        return out;
    }
}

/**
 * Build a BillboardManager and bulk-register every sprite frame in
 * a WAD's spriteAnim map. Returns the manager. Useful for one-shot
 * setup at WAD load time.
 *
 *   const bm = await registerWadSprites(wadFile, palette, decodeFn);
 *
 * decodeFn is window.wad.spriteFrame (so this module doesn't need
 * to know how to decode itself — keeps it independent of the
 * specific WAD loader implementation).
 */
export function registerWadSprites(decodeFn, spriteNames, opts = {}) {
    const bm = new BillboardManager(opts);
    let registered = 0;
    for (const name of spriteNames) {
        // Try rotations 0..8, frames A..Z, until decodeFn returns null
        // for a few in a row. This is cheap and graceful — we don't
        // need to know the exact frame inventory up front.
        for (const frameLetter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
            let consecutiveMisses = 0;
            for (let rot = 0; rot <= 8; rot++) {
                const data = decodeFn(name, frameLetter, rot);
                if (data) {
                    bm.registerFrame(name, frameLetter, rot, data);
                    registered++;
                    consecutiveMisses = 0;
                } else {
                    consecutiveMisses++;
                }
            }
            if (consecutiveMisses === 9) break;     // no frames for this letter
        }
    }
    return { manager: bm, registeredCount: registered };
}
