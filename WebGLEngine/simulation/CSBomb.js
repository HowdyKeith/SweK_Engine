// FILE: simulation/CSBomb.js
// VERSION: v1 — round 324
//
// CS-style bomb. State machine:
//
//   IDLE (no one holds it; the carrier was killed or the bomb was dropped)
//     → pickup(player) → HELD
//   HELD (player carrying)
//     → drop(x,y,z) → IDLE
//     → startPlant(zone) → PLANTING
//   PLANTING (holding E in plant zone, 3s)
//     → cancelPlant() → HELD
//     → completePlant() → PLANTED
//   PLANTED (35s timer ticking)
//     → startDefuse(player) → DEFUSING
//     → tick reaches 0 → EXPLODED
//   DEFUSING (CT holding E within range)
//     → cancelDefuse() → PLANTED
//     → completeDefuse() → DEFUSED
//   EXPLODED, DEFUSED → terminal until reset()
//
// Defuse default: 5 seconds (kit-equivalent simplification; CS has
// 5s with kit, 10s without).

export const BOMB_STATE = Object.freeze({
    IDLE:      "idle",
    HELD:      "held",
    PLANTING:  "planting",
    PLANTED:   "planted",
    DEFUSING:  "defusing",
    EXPLODED:  "exploded",
    DEFUSED:   "defused",
});

export const PLANT_DURATION_S    = 3.0;
// v540 — defuse kit: with a kit defuse is fast (5s), without it slow (10s),
// matching CS. DEFUSE_DURATION_S kept as the with-kit alias for back-compat.
export const DEFUSE_WITH_KIT_S   = 5.0;
export const DEFUSE_NO_KIT_S     = 10.0;
export const DEFUSE_DURATION_S   = DEFUSE_WITH_KIT_S;
export const BOMB_TIMER_S        = 35.0;
export const DEFUSE_RADIUS       = 2.5;   // meters/voxels — must be within this to start defuse

export class CSBomb {
    constructor({ initialHolder = "t" } = {}) {
        this.state = BOMB_STATE.HELD;       // round starts with T holding
        this.holder = initialHolder;        // "t" | "ct" | null

        // World position (set when planted or dropped)
        this.x = 0;
        this.y = 0;
        this.z = 0;

        // Plant progress (when state === PLANTING)
        this._plantProgress = 0;

        // Time remaining until detonation (when PLANTED or DEFUSING)
        this._fueseRemaining_unused = 0;   // (reserved field, see below)
        this._fuseRemaining = BOMB_TIMER_S;

        // Defuse progress (when state === DEFUSING)
        this._defuseProgress = 0;
        // v540 — whether the active defuser has a kit (set on startDefuse)
        this._defuseHasKit = false;

        // Bookkeeping for inspection
        this.lastEvent = null;   // string description of last transition

        // v330 — carrier model. The bomb is held by ONE specific entity
        // (player or bot). When the carrier dies, the bomb drops at
        // their last known position; another T entity can walk up and
        // pick it up. Only the current carrier is eligible to plant.
        //
        //   carrierId: "player" | botEntityId (number) | null when dropped
        //   dropped:   true when no carrier (bomb is on the ground)
        //   dropX/dropZ: world position when dropped (rendered there)
        //
        // While carrierId is non-null, the bomb is "in hand" and not
        // separately rendered (the carrier mesh occludes it). When
        // dropped, main.js spawns a prop entity at dropX/dropZ.
        this.carrierId = null;
        this.dropped = false;
        this.dropX = 0;
        this.dropZ = 0;
    }

    // -- Inspection ----------------------------------------------------------

    /** True while the bomb can still influence the round. */
    isLive() {
        return this.state !== BOMB_STATE.EXPLODED &&
               this.state !== BOMB_STATE.DEFUSED;
    }

    isPlanted() {
        return this.state === BOMB_STATE.PLANTED ||
               this.state === BOMB_STATE.DEFUSING;
    }

    isHeld() { return this.state === BOMB_STATE.HELD; }

    timeRemaining() { return this._fuseRemaining; }
    plantProgress() { return this._plantProgress / PLANT_DURATION_S; }
    defuseProgress() { return this._defuseProgress / this._defuseDuration(); }
    // v540 — effective defuse time depends on whether the defuser has a kit
    _defuseDuration() { return this._defuseHasKit ? DEFUSE_WITH_KIT_S : DEFUSE_NO_KIT_S; }
    defuseHasKit() { return this._defuseHasKit; }

    /** World position when PLANTED. Returns null while held. */
    location() {
        if (!this.isPlanted() && this.state !== BOMB_STATE.IDLE) return null;
        return { x: this.x, y: this.y, z: this.z };
    }

    // -- Transitions ---------------------------------------------------------

    /**
     * Begin planting at a specific world position. Caller validates
     * that the position is inside a plant zone (CSRoundManager does this).
     */
    startPlant(x, y, z) {
        if (this.state !== BOMB_STATE.HELD) return false;
        this.state = BOMB_STATE.PLANTING;
        this.x = x; this.y = y; this.z = z;
        this._plantProgress = 0;
        this.lastEvent = `startPlant at (${x|0},${z|0})`;
        return true;
    }

    cancelPlant() {
        if (this.state !== BOMB_STATE.PLANTING) return false;
        this.state = BOMB_STATE.HELD;
        this._plantProgress = 0;
        this.lastEvent = "cancelPlant";
        return true;
    }

    /** Start defuse — caller validates CT within DEFUSE_RADIUS.
     *  v540 — hasKit shortens the defuse (5s vs 10s). */
    startDefuse(hasKit = false) {
        if (this.state !== BOMB_STATE.PLANTED) return false;
        this.state = BOMB_STATE.DEFUSING;
        this._defuseProgress = 0;
        this._defuseHasKit = !!hasKit;
        this.lastEvent = "startDefuse";
        return true;
    }

    cancelDefuse() {
        if (this.state !== BOMB_STATE.DEFUSING) return false;
        this.state = BOMB_STATE.PLANTED;
        this._defuseProgress = 0;
        this.lastEvent = "cancelDefuse";
        return true;
    }

    /**
     * Tick the bomb forward by `dt` seconds. Returns a transition
     * label if the state changed this tick (e.g. "planted", "exploded",
     * "defused"), otherwise null.
     */
    tick(dt) {
        if (!this.isLive()) return null;

        if (this.state === BOMB_STATE.PLANTING) {
            this._plantProgress += dt;
            if (this._plantProgress >= PLANT_DURATION_S) {
                this.state = BOMB_STATE.PLANTED;
                this._fuseRemaining = BOMB_TIMER_S;
                this._plantProgress = 0;
                this.lastEvent = "PLANTED";
                return "planted";
            }
        } else if (this.state === BOMB_STATE.PLANTED) {
            this._fuseRemaining -= dt;
            if (this._fuseRemaining <= 0) {
                this._fuseRemaining = 0;
                this.state = BOMB_STATE.EXPLODED;
                this.lastEvent = "EXPLODED";
                return "exploded";
            }
        } else if (this.state === BOMB_STATE.DEFUSING) {
            // Fuse keeps ticking while CT defuses — defuser races the timer
            this._fuseRemaining -= dt;
            this._defuseProgress += dt;
            if (this._fuseRemaining <= 0) {
                this._fuseRemaining = 0;
                this.state = BOMB_STATE.EXPLODED;
                this.lastEvent = "EXPLODED (during defuse)";
                return "exploded";
            }
            if (this._defuseProgress >= this._defuseDuration()) {
                this.state = BOMB_STATE.DEFUSED;
                this.lastEvent = "DEFUSED";
                return "defused";
            }
        }
        return null;
    }

    /** Reset to fresh start-of-round state. */
    reset(initialHolder = "t") {
        this.state = BOMB_STATE.HELD;
        this.holder = initialHolder;
        this.x = this.y = this.z = 0;
        this._plantProgress = 0;
        this._defuseProgress = 0;
        this._defuseHasKit = false;   // v540
        this._fuseRemaining = BOMB_TIMER_S;
        this.lastEvent = "reset";
        // v330 — carrier resets along with bomb state
        this.carrierId = null;
        this.dropped = false;
        this.dropX = 0;
        this.dropZ = 0;
    }

    /** Force-set to a terminal state. Used by CSRoundManager on
     *  edge cases (e.g. timer expires with no plant — bomb becomes
     *  irrelevant to the round result but we mark it idle). */
    forceIdle() {
        this.state = BOMB_STATE.IDLE;
        this.holder = null;
        this.lastEvent = "forceIdle";
    }

    // -- v330 carrier API ----------------------------------------------------

    /** Assign initial carrier at round start. Should be called once
     *  after reset(). Carrier is an entity id (number) or "player". */
    assignInitialCarrier(entityId) {
        this.carrierId = entityId;
        this.dropped = false;
        this.lastEvent = `assignInitialCarrier(${entityId})`;
    }

    /** Mark the bomb as dropped at a world position. Carrier dies or
     *  voluntarily drops. Resets state to HELD (the bomb is on the
     *  ground, can be picked up) but with no current carrier.
     *  Only valid when state is HELD or PLANTING. */
    drop(x, z) {
        if (this.state !== BOMB_STATE.HELD && this.state !== BOMB_STATE.PLANTING) {
            return false;
        }
        if (this.state === BOMB_STATE.PLANTING) {
            this._plantProgress = 0;
            this.state = BOMB_STATE.HELD;
        }
        this.carrierId = null;
        this.dropped = true;
        this.dropX = x;
        this.dropZ = z;
        this.lastEvent = `drop at (${x|0},${z|0})`;
        return true;
    }

    /** Pick up the dropped bomb. Sets the new carrier. Only valid
     *  while the bomb is in HELD-dropped state. */
    pickup(entityId) {
        if (!this.dropped || this.state !== BOMB_STATE.HELD) return false;
        this.carrierId = entityId;
        this.dropped = false;
        this.lastEvent = `pickup by ${entityId}`;
        return true;
    }

    /** True when this actor (by id) is the current bomb carrier. */
    isCarrier(entityId) {
        return this.carrierId === entityId;
    }

    /** Position of the dropped bomb (null if not dropped). */
    getDropPos() {
        return this.dropped ? { x: this.dropX, z: this.dropZ } : null;
    }
}

// Pure helper — point in axis-aligned rectangle. Used by both the
// bomb logic and tests to validate plant zones.
export function pointInZone(x, z, zone) {
    return x >= zone.x0 && x <= zone.x1 &&
           z >= zone.z0 && z <= zone.z1;
}

// Distance squared between two XZ points (Y ignored — defuse is
// roughly horizontal range on flat sites).
export function distSqXZ(ax, az, bx, bz) {
    const dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
}
