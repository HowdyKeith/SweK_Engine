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

import { defineMachine, applyEvent } from "../ui/machine.mjs";

export const BOMB_STATE = Object.freeze({
    IDLE:      "idle",
    HELD:      "held",
    PLANTING:  "planting",
    PLANTED:   "planted",
    DEFUSING:  "defusing",
    EXPLODED:  "exploded",
    DEFUSED:   "defused",
});

// v4602 -- the graph this file's own top-of-file comment already described in prose, made declared and
// auditable. Two honest wrinkles this migration did NOT paper over, found by reading the actual guards rather
// than trusting the header comment that named them:
//   IDLE is UNREACHABLE through this declared graph, and that is CORRECT, not a bug. The header comment says
//   "IDLE ... -> pickup(player) -> HELD", but pickup()'s own guard is `this.state !== BOMB_STATE.HELD` --
//   pickup only ever SUCCEEDS when the state is ALREADY held, so it can never fire FROM idle. IDLE is reached
//   exclusively through forceIdle(), an administrative override CSRoundManager.js calls from whatever live
//   state a round happens to end in (_concludeRound's `if (this.bomb.isLive()) this.bomb.forceIdle();`) --
//   not a domain event this graph should pretend to model. audit()'s own unreachable list is expected to say
//   exactly ["idle"], and tools/ship/csBomb-selfcheck.mjs asserts that rather than treating it as a defect.
//   reset() is the SAME kind of override (round restart, valid from any state) and is left outside the graph
//   for the same reason -- see its own method for why setting `this.state` directly there is correct.
export const BOMB_MACHINE = defineMachine({
    initial: "held",
    states: {
        idle:     { on: {} },
        held:     { on: { startPlant: "planting" } },
        planting: { on: { cancelPlant: "held", completePlant: "planted" } },
        planted:  { on: { startDefuse: "defusing", fuseExpired: "exploded" } },
        defusing: { on: { cancelDefuse: "planted", fuseExpired: "exploded", completeDefuse: "defused" } },
        exploded: { final: true },
        defused:  { final: true },
    },
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
        // applyEvent returns `this.state` UNCHANGED when the event does not apply from the current state --
        // that IS the guard the original `if (this.state !== HELD) return false;` expressed, just checked
        // against the declared graph instead of a private if.
        const to = applyEvent(BOMB_MACHINE, this.state, "startPlant", null);
        if (to === this.state) return false;
        this.state = to;
        this.x = x; this.y = y; this.z = z;
        this._plantProgress = 0;
        this.lastEvent = `startPlant at (${x|0},${z|0})`;
        return true;
    }

    cancelPlant() {
        const to = applyEvent(BOMB_MACHINE, this.state, "cancelPlant", null);
        if (to === this.state) return false;
        this.state = to;
        this._plantProgress = 0;
        this.lastEvent = "cancelPlant";
        return true;
    }

    /** Start defuse — caller validates CT within DEFUSE_RADIUS.
     *  v540 — hasKit shortens the defuse (5s vs 10s). */
    startDefuse(hasKit = false) {
        const to = applyEvent(BOMB_MACHINE, this.state, "startDefuse", null);
        if (to === this.state) return false;
        this.state = to;
        this._defuseProgress = 0;
        this._defuseHasKit = !!hasKit;
        this.lastEvent = "startDefuse";
        return true;
    }

    cancelDefuse() {
        const to = applyEvent(BOMB_MACHINE, this.state, "cancelDefuse", null);
        if (to === this.state) return false;
        this.state = to;
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

        // Decide the event from world state (elapsed progress against a duration), exactly what a tick-driven
        // caller has to do that RIG_JOB's event-driven callers never did -- see ui/machine.mjs's own note on
        // applyEvent(). The two checks inside DEFUSING stay two separate `if`s, not `if/else if`, ON PURPOSE:
        // the original used two independent `if` blocks with an early `return` in the first, so a tick large
        // enough to cross BOTH thresholds at once always resolves to the fuse expiring, never the defuse
        // completing -- preserved here by checking fuseExpired first and short-circuiting past completeDefuse.
        let event = null;
        if (this.state === BOMB_STATE.PLANTING) {
            this._plantProgress += dt;
            if (this._plantProgress >= PLANT_DURATION_S) event = "completePlant";
        } else if (this.state === BOMB_STATE.PLANTED) {
            this._fuseRemaining -= dt;
            if (this._fuseRemaining <= 0) { this._fuseRemaining = 0; event = "fuseExpired"; }
        } else if (this.state === BOMB_STATE.DEFUSING) {
            // Fuse keeps ticking while CT defuses — defuser races the timer
            this._fuseRemaining -= dt;
            this._defuseProgress += dt;
            if (this._fuseRemaining <= 0) { this._fuseRemaining = 0; event = "fuseExpired"; }
            else if (this._defuseProgress >= this._defuseDuration()) event = "completeDefuse";
        }
        if (!event) return null;

        const before = this.state;
        this.state = applyEvent(BOMB_MACHINE, this.state, event, null);
        if (this.state === before) return null;   // the guards above only ever raise a legal event, but stay honest rather than assume it

        // Side effects and lastEvent text, matching the original's exact wording per transition -- including
        // the EXPLODED-vs-"EXPLODED (during defuse)" distinction, which depends on the PRE-transition state
        // and so cannot live in a target-keyed onEnter map the way BossPhaseManager.js's side effects could.
        if (this.state === BOMB_STATE.PLANTED) {
            this._fuseRemaining = BOMB_TIMER_S;
            this._plantProgress = 0;
            this.lastEvent = "PLANTED";
        } else if (this.state === BOMB_STATE.EXPLODED) {
            this.lastEvent = before === BOMB_STATE.DEFUSING ? "EXPLODED (during defuse)" : "EXPLODED";
        } else if (this.state === BOMB_STATE.DEFUSED) {
            this.lastEvent = "DEFUSED";
        }
        // the target state name IS the transition label the original hard-coded ("planted"/"exploded"/"defused")
        return this.state;
    }

    /** Reset to fresh start-of-round state.
     *  v4602 -- an administrative override, valid from ANY state (a round can conclude, and so reset, while
     *  the bomb is held, planting, planted or defusing), not a domain event the graph declares. BOMB_MACHINE
     *  intentionally has no "reset" edges -- a graph where every state transitions to "held" on the same
     *  event would just be this same direct assignment wearing seven redundant declarations. */
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
     *  irrelevant to the round result but we mark it idle).
     *  v4602 -- the SAME kind of administrative override reset() is: CSRoundManager._concludeRound calls this
     *  from whatever live state the round happened to end in, not from one specific state a domain event
     *  would fire from. This is exactly why BOMB_MACHINE declares "idle" with no way IN through the graph --
     *  the only path to idle really is this override, and the graph says so by leaving it unreachable rather
     *  than inventing a fictitious event to paper over it. */
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
