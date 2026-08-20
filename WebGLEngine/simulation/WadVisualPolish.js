// =============================================================================
// FILE: /simulation/WadVisualPolish.js
// ROUND: 222
// =============================================================================
//
// Tiny per-frame ticker that animates the static OBJ entities spawned
// by OllamaLevelGenerator: pickups bob and rotate so they read as
// "collectible items" instead of crates sitting on the floor; the exit
// portal slowly turns when closed and pulses faster (with a vertical
// bounce) when it opens after level clear.
//
// Strategy: walk the FPSShooter._pickups Map + the active _exitInfo
// each frame; for each, fetch the ECS Position component and write to
// y + yaw. The renderer reads Position each frame, so the visual
// updates immediately. No new render path, no shader work.
//
// API:
//   const polish = new WadVisualPolish({ fpsShooter, ecsWorld });
//   polish.tick(dt);   // called from main loop
// =============================================================================

const PICKUP_BOB_AMPLITUDE = 0.18;    // voxels
const PICKUP_BOB_HZ        = 1.2;     // bobs per second
const PICKUP_YAW_RATE      = 1.4;     // radians/sec

const EXIT_IDLE_YAW_RATE   = 0.3;     // gentle turn while inactive
const EXIT_OPEN_YAW_RATE   = 1.8;     // faster turn after level clear
const EXIT_OPEN_BOB        = 0.25;    // vertical oscillation amplitude
const EXIT_OPEN_BOB_HZ     = 0.9;

export class WadVisualPolish {
    constructor({ fpsShooter, ecsWorld }) {
        this.fpsShooter = fpsShooter;
        this.ecsWorld = ecsWorld;
        this._t = 0;
        // Per-entity baseline Y captured on first sight so we don't
        // drift the ground anchor over time. Map<entityId, baseY>.
        this._baseY = new Map();
    }

    tick(dt) {
        this._t += dt;
        if (!this.ecsWorld?.getComponent) return;

        // --- Pickups: bob + slow yaw ---
        const pickups = this.fpsShooter?._pickups;
        if (pickups && pickups.size > 0) {
            for (const [id, pu] of pickups) {
                const pos = this._getPos(id);
                if (!pos) continue;
                if (!this._baseY.has(id)) this._baseY.set(id, pos.y);
                const baseY = this._baseY.get(id);
                // Offset each pickup by ID so they bob out of phase
                const phase = (id % 16) * 0.4;
                pos.y = baseY + Math.sin(this._t * Math.PI * 2 * PICKUP_BOB_HZ + phase) * PICKUP_BOB_AMPLITUDE;
                pos.yaw = (pos.yaw || 0) + PICKUP_YAW_RATE * dt;
            }
        }

        // --- Exit portal: idle slow turn, post-clear faster + bob ---
        const exitInfo = this.fpsShooter?._exitInfo;
        const exitId = exitInfo?.id;
        if (exitId != null) {
            const pos = this._getPos(exitId);
            if (pos) {
                if (!this._baseY.has(exitId)) this._baseY.set(exitId, pos.y);
                const baseY = this._baseY.get(exitId);
                const isOpen = this.fpsShooter._exitOpen === true;
                if (isOpen) {
                    pos.y = baseY + Math.sin(this._t * Math.PI * 2 * EXIT_OPEN_BOB_HZ) * EXIT_OPEN_BOB;
                    pos.yaw = (pos.yaw || 0) + EXIT_OPEN_YAW_RATE * dt;
                } else {
                    pos.y = baseY;
                    pos.yaw = (pos.yaw || 0) + EXIT_IDLE_YAW_RATE * dt;
                }
            }
        }

        // --- Round 223 — Teleporter portals: synchronized spin + bob ---
        // Both endpoints of a pair rotate at the same rate (visually
        // signalling "these go together"). Bob amplitude is smaller
        // than the exit portal so the difference reads clearly.
        const portalPairs = this.fpsShooter?._portalPairs;
        if (portalPairs && portalPairs.length > 0) {
            const PORTAL_SPIN_RATE = 1.1;        // rad/s
            const PORTAL_BOB = 0.12;
            const PORTAL_BOB_HZ = 0.7;
            for (const pair of portalPairs) {
                for (const side of ["a", "b"]) {
                    const ep = pair[side];
                    if (!ep) continue;
                    const pos = this._getPos(ep.id);
                    if (!pos) continue;
                    if (!this._baseY.has(ep.id)) this._baseY.set(ep.id, pos.y);
                    const baseY = this._baseY.get(ep.id);
                    pos.y = baseY + Math.sin(this._t * Math.PI * 2 * PORTAL_BOB_HZ) * PORTAL_BOB;
                    pos.yaw = (pos.yaw || 0) + PORTAL_SPIN_RATE * dt;
                }
            }
        }

        // --- Round 224 — Jump pads: rapid pulse so they read as "active" ---
        const jumpPads = this.fpsShooter?.ollamaLevelGen?.getLastJumpPads?.();
        if (jumpPads && jumpPads.length > 0) {
            const PAD_SPIN_RATE = 2.4;       // faster than portals — energetic
            const PAD_BOB = 0.08;
            const PAD_BOB_HZ = 2.0;          // 2 Hz visible pulse
            for (const pad of jumpPads) {
                const pos = this._getPos(pad.id);
                if (!pos) continue;
                if (!this._baseY.has(pad.id)) this._baseY.set(pad.id, pos.y);
                const baseY = this._baseY.get(pad.id);
                pos.y = baseY + Math.sin(this._t * Math.PI * 2 * PAD_BOB_HZ) * PAD_BOB;
                pos.yaw = (pos.yaw || 0) + PAD_SPIN_RATE * dt;
            }
        }

        // Garbage-collect baselines for entities that no longer exist
        // (despawned on pickup collection). Cheap to do once a second.
        if ((this._t | 0) !== (this._lastGcSec | 0)) {
            this._lastGcSec = this._t | 0;
            for (const id of [...this._baseY.keys()]) {
                if (id === exitId) continue;
                if (!pickups?.has(id)) this._baseY.delete(id);
            }
        }
    }

    _getPos(entityId) {
        if (!this.ecsWorld?.getComponent) return null;
        try {
            return this.ecsWorld.getComponent(entityId, "Position");
        } catch { return null; }
    }
}
