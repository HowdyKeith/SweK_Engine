// FILE: simulation/CivilianRagdollSystem.js
// VERSION: v1 — round 308
//
// Lightweight ragdoll system for civilians. Civilians don't have rigged
// GLB meshes — they're tiny static cubes (wad_pickup_health placeholder).
// So instead of using the full skeletal Ragdoll integration, we build a
// PROCEDURAL 6-bone stick-figure humanoid at death time, feed it to the
// existing Ragdoll PBD class, then render each bone as a small colored
// cube via DebrisRenderer.
//
// Shape (parent indices):
//   0 = pelvis      (root, parent=-1)
//   1 = spine/head  (parent 0)
//   2 = left arm    (parent 1)
//   3 = right arm   (parent 1)
//   4 = left leg    (parent 0)
//   5 = right leg   (parent 0)
//
// Six bones is enough to read as "person knocked flying" while staying
// far cheaper than the kaiju rig (55 joints for RobotExpressive). A pool
// of 32 active civilians = 192 bones × few-substep Verlet ≈ negligible.
//
// Public API:
//   const sys = new CivilianRagdollSystem({ world });
//   sys.spawn({ x, y, z, hitDir, hitMag, scale, colors });
//   sys.tick(dt);
//   sys.getInstanceData() → { data, count }  // for debrisRenderer.render
//   sys.snapshot();
//   sys.clear();

import { Ragdoll } from "./Ragdoll.js";

const MAX_ACTIVE = 32;
const LIFETIME_SEC = 3.0;
const KICK_PER_DAMAGE = 18;
const KICK_LIFT = 5;
const KICK_MAX = 22;

// Default colors per bone. Caller can override via opts.colors.
// Format: [r, g, b] floats 0..1.
const DEFAULT_COLORS = [
    [0.45, 0.30, 0.25],   // 0 pelvis — pants
    [0.85, 0.70, 0.55],   // 1 head/spine combined — skin/torso
    [0.85, 0.70, 0.55],   // 2 left arm — skin
    [0.85, 0.70, 0.55],   // 3 right arm — skin
    [0.45, 0.30, 0.25],   // 4 left leg — pants
    [0.45, 0.30, 0.25],   // 5 right leg — pants
];

// Bone visual scale (size of each instanced cube)
const BONE_SCALES = [
    0.22,   // pelvis
    0.32,   // head/spine (larger to read as the "body")
    0.16,   // left arm
    0.16,   // right arm
    0.18,   // left leg
    0.18,   // right leg
];

// Procedural humanoid rest pose (parent-local translations) for civilian
// scale 1.0. Caller's `scale` multiplies these. Note the head/spine
// merge: we don't put the head on a separate bone because we want only
// 6 total — bone 1 IS the head + torso single unit.
function _buildAnimator(scale) {
    const s = scale ?? 1.0;
    const nodes = [
        { parent: -1, name: "pelvis" },
        { parent:  0, name: "spine_head" },
        { parent:  1, name: "arm_L" },
        { parent:  1, name: "arm_R" },
        { parent:  0, name: "leg_L" },
        { parent:  0, name: "leg_R" },
    ];
    const localT = [
        [0,   0,    0  ],   // pelvis at root
        [0,   0.6,  0  ] .map(v => v * s),   // spine/head ~0.6 above pelvis
        [-0.45, 0.55, 0].map(v => v * s),    // left arm out and up
        [ 0.45, 0.55, 0].map(v => v * s),    // right arm out and up
        [-0.15, -0.55, 0].map(v => v * s),   // left leg down
        [ 0.15, -0.55, 0].map(v => v * s),   // right leg down
    ];
    // Identity rotations on every bone
    const localR = [
        [0,0,0,1],[0,0,0,1],[0,0,0,1],[0,0,0,1],[0,0,0,1],[0,0,0,1],
    ];
    return { nodes, localT, localR, onPose: null };
}

export class CivilianRagdollSystem {
    constructor({ world = null } = {}) {
        this.world = world;
        // Active list — each entry: { ragdoll, colors, scales, ageSec }
        this._active = [];
        this.stats = { spawned: 0, despawned: 0, evicted: 0 };
        // Reusable Float32Array for getInstanceData — grows on demand.
        // 6 bones × 7 floats per instance = 42 floats per ragdoll;
        // 32 ragdolls × 6 bones = 192 instances at full saturation.
        this._instBuf = new Float32Array(MAX_ACTIVE * 6 * 7);
    }

    /**
     * Spawn a civilian ragdoll at (x,y,z).
     *
     * @param {Object} opts
     * @param {number} opts.x,y,z   World position (pelvis-bone target)
     * @param {{x,y,z}} [opts.hitDir]    Direction the body should fly (unit vec)
     * @param {number} [opts.hitMag]     Damage magnitude — scales fling
     * @param {number} [opts.scale]      Body scale (matches civilian visual)
     * @param {number[][]} [opts.colors] Per-bone RGB overrides
     */
    spawn(opts = {}) {
        const { x = 0, y = 0, z = 0, hitDir = null, hitMag = 1, scale = 0.5, colors = null } = opts;

        // Cap pool: evict oldest if full
        if (this._active.length >= MAX_ACTIVE) {
            const evicted = this._active.shift();
            try { evicted.ragdoll.dispose(); } catch {}
            this.stats.evicted++;
        }

        // Build a fresh procedural animator for this civilian
        const animator = _buildAnimator(scale);

        // Initial velocity: hit direction × magnitude, plus always-on lift
        let initialVelocity;
        if (hitDir && Number.isFinite(hitMag)) {
            const lateral = Math.min(KICK_MAX, Math.max(2, hitMag * KICK_PER_DAMAGE));
            initialVelocity = {
                x: (hitDir.x ?? 0) * lateral,
                y: (hitDir.y ?? 0) * lateral + KICK_LIFT,
                z: (hitDir.z ?? 0) * lateral,
            };
        } else {
            // Spontaneous death (no hit info): small random kick
            initialVelocity = {
                x: (Math.random() - 0.5) * 3,
                y: 3 + Math.random() * 2,
                z: (Math.random() - 0.5) * 3,
            };
        }

        let ragdoll;
        try {
            ragdoll = new Ragdoll({
                animator,
                rootPos: { x, y, z },
                groundY: y - 1,
                world: this.world,
                initialVelocity,
                maxLifetimeSec: LIFETIME_SEC,
                // Civilians are small — angle limits less critical, accept defaults
            });
        } catch (e) {
            console.warn("[CivilianRagdoll] spawn failed:", e?.message ?? e);
            return null;
        }

        // Per-civilian color shuffle: vary pants + skin slightly so they
        // don't all look identical
        const baseColors = colors || DEFAULT_COLORS;
        const tinted = baseColors.map(c => {
            const jitter = (Math.random() - 0.5) * 0.08;
            return [
                Math.min(1, Math.max(0, c[0] + jitter)),
                Math.min(1, Math.max(0, c[1] + jitter)),
                Math.min(1, Math.max(0, c[2] + jitter)),
            ];
        });

        this._active.push({
            ragdoll,
            colors: tinted,
            scales: BONE_SCALES,
            ageSec: 0,
        });
        this.stats.spawned++;
        return ragdoll;
    }

    tick(dt) {
        if (dt > 0.1) dt = 0.1;          // clamp on big stalls
        const survivors = [];
        for (const entry of this._active) {
            entry.ageSec += dt;
            // Tick the underlying ragdoll physics (handles its own
            // active-extension lifetime — round 303). If the ragdoll
            // self-disposes (energy below activeExtensionEnergy past
            // soft cap), `active` flips to false.
            try {
                entry.ragdoll.tick(dt);
            } catch (e) {
                console.warn("[CivilianRagdoll] tick error:", e?.message ?? e);
                try { entry.ragdoll.dispose(); } catch {}
                this.stats.despawned++;
                continue;
            }
            if (!entry.ragdoll.active) {
                this.stats.despawned++;
                continue;
            }
            // Hard cap: if for some reason the ragdoll won't despawn
            // (e.g. KE never drops below threshold), force it past 2×
            // lifetime so we never leak entries.
            if (entry.ageSec > LIFETIME_SEC * 2) {
                try { entry.ragdoll.dispose(); } catch {}
                this.stats.despawned++;
                continue;
            }
            survivors.push(entry);
        }
        this._active = survivors;
    }

    /**
     * Pack all active civilian-ragdoll bones into the DebrisRenderer's
     * per-instance layout: [x, y, z, scale, r, g, b].
     *
     * Each ragdoll contributes its 6 bones. The buffer is sized once at
     * MAX_ACTIVE × 6 × 7 floats; we only write the live slice.
     */
    getInstanceData() {
        let n = 0;
        const buf = this._instBuf;
        for (const entry of this._active) {
            const wp = entry.ragdoll.worldPos;
            const colors = entry.colors;
            const scales = entry.scales;
            // Optional: fade scale near end of life so they shrink-vanish
            const lifeFrac = Math.max(0.25, 1 - (entry.ageSec / LIFETIME_SEC));
            for (let b = 0; b < wp.length; b++) {
                const o = n * 7;
                buf[o + 0] = wp[b][0];
                buf[o + 1] = wp[b][1];
                buf[o + 2] = wp[b][2];
                buf[o + 3] = scales[b] * lifeFrac;
                const c = colors[b];
                buf[o + 4] = c[0];
                buf[o + 5] = c[1];
                buf[o + 6] = c[2];
                n++;
                // Safety: never write past buffer
                if (n * 7 >= buf.length) break;
            }
            if (n * 7 >= buf.length) break;
        }
        return { data: buf, count: n };
    }

    snapshot() {
        return {
            active: this._active.length,
            ...this.stats,
        };
    }

    clear() {
        for (const e of this._active) {
            try { e.ragdoll.dispose(); } catch {}
        }
        this._active = [];
    }
}

export function makeCivilianRagdollSystem(deps) {
    return new CivilianRagdollSystem(deps);
}
