// FILE: simulation/HellgateManager.js
// VERSION: v1 — round 425
//
// HELLGATES + HELLSPAWN + CIV WAR AI
// ----------------------------------
// A self-contained siege system that layers on top of the existing
// civilization sim WITHOUT mutating CivilizationManager or KaijuManager.
// It reads civ positions, spawns its own entities, and emits typed
// events on the civ event bus so the NarrativeEngine reacts.
//
// Three coupled systems:
//
//   1. HELLGATES — lava portals that open, pulse, and pump out hellspawn.
//      Lifecycle: opening → active (spawns on a cadence, capped) →
//      closing → closed. Each gate has HP; damage it to force it closed.
//
//   2. HELLSPAWN — emerge from a gate, lock onto the NEAREST living civ,
//      march to it, and besiege it. Sustained contact raises that civ's
//      siege level; at 1.0 the civ is overwhelmed (emits a "death" event)
//      and the swarm retargets. Hellspawn have HP and can be killed.
//
//   3. CIV WAR AI — the "smarter civ" layer. Each civ tracks a panic
//      level from its proximity to gates + hellspawn. A panicked civ
//      fights back: on a cooldown it fires a retaliation projectile at
//      the nearest hellspawn, killing it on a hit. Civs under heavy siege
//      panic hardest and fire fastest — a real two-sided battle.
//
// RENDERING / SIDE EFFECTS are injected via an `fx` object so the core
// stays a pure, headless, testable simulation. All fx methods are
// optional (default no-ops); the engine wiring backs them with the
// router (entity spawn/move/despawn), GPUParticles (portal fire), and
// ProjectileManager (fireballs + civ missiles).

import { defineMachine, applyEvent } from "../ui/machine.mjs";

const OPEN_TIME       = 2.0;    // s, portal grows
const CLOSE_TIME      = 1.5;    // s, portal collapses
const GATE_MAX_HP     = 100;
const SPAWN_INTERVAL  = 2.5;    // s between hellspawn from an active gate
const MAX_ALIVE_PER_GATE = 6;
const TOTAL_SPAWN_CAP = 40;     // hard cap across all gates (perf guard)

const HS_HP           = 20;
const HS_SPEED        = 6.0;    // units/s
const HS_CONTACT      = 5.0;    // distance at which it besieges a civ
const SIEGE_RATE      = 0.12;   // siege level / s while a hellspawn is in contact
const SIEGE_DECAY     = 0.05;   // siege relief / s when nothing is besieging

const THREAT_RADIUS   = 45;     // a gate/hellspawn inside this scares a civ
const PANIC_RISE      = 0.9;    // panic / s at point-blank threat
const PANIC_DECAY     = 0.35;   // panic relief / s when safe
const RETALIATE_RANGE = 55;     // civ can shoot a hellspawn within this
const RETALIATE_CD    = 1.4;    // s base cooldown between civ shots
const HS_SPAWN_Y      = 1.5;

let _seq = 1;

// v4605 -- the gate lifecycle (gate.state on each entry of `gates`, the one explicit named-state field in this
// file), made a declared graph the same way BossPhaseManager.js and CSBomb.js already did. THIS ONE COMES OUT
// FULLY CLEAN -- every state reachable, none dead -- closer to BossPhaseManager's clean baseline than to
// CSBomb's harder case with its unreachable-on-purpose idle. damageGate() and closeAll() both fit as declared
// events (hpZero / forceClose) rather than administrative bypasses, because both are guarded by a specific,
// narrow source-state set ({opening, active} -> closing) -- precisely what a declared transition expresses,
// not what one has to route AROUND.
//
// ONE WRINKLE THAT STILL STAYS OUTSIDE applyEvent(), and is worth naming rather than losing quietly: closeAll()
// resets g.age = 0 on EVERY non-closed gate it touches, INCLUDING a gate that is already "closing" -- calling
// closeAll() a second time genuinely restarts that gate's close timer, extending how long it takes to actually
// close. applyEvent() never re-fires onEnter for a same-state transition (see ui/machine.mjs's own header:
// "never ... on a same-state loop") -- correctly, since nothing actually CHANGED state -- but the original's
// unconditional age reset is a real, observable behaviour that has nothing to do with the transition itself.
// It is timer bookkeeping, not a state change, so closeAll() keeps it as a bare `g.age = 0` alongside the
// applyEvent() call rather than forcing a fake closing->closing self-edge into the graph just to smuggle a
// side effect through onEnter.
//
// STRUCTURAL NOTE for whoever touches this next: unlike BossPhaseManager/CSBomb (one manager-wide instance
// apiece), HellgateManager tracks MANY concurrent gates in a Map. GATE_MACHINE is one shared graph definition;
// applyEvent() is called once per gate per relevant tick/call, passing that gate as the onEnter arg -- there is
// no single "current state" for the manager itself, only per-gate ones.
export const GATE_MACHINE = defineMachine({
    initial: "opening",
    states: {
        opening: { on: { openTimeout: "active", hpZero: "closing", forceClose: "closing" } },
        active:  { on: { hpZero: "closing", forceClose: "closing" } },
        closing: { on: { closeTimeout: "closed" } },
        closed:  { final: true },
    },
});

export class HellgateManager {
    constructor(fx = {}) {
        this.fx = fx;                 // injected side effects (all optional)
        this.gates = new Map();       // id -> gate
        this.spawn = [];              // hellspawn []
        this._civAI = new Map();      // civId -> { panic, siege, cd }
        this.t = 0;
        this.stats = { opened: 0, closed: 0, spawned: 0, hellspawnKilled: 0, civsOverwhelmed: 0, civShots: 0 };

        // v4605 -- GATE_MACHINE's onEnter map, keyed by target state, one call per gate transition. Shared
        // across every concurrent gate; each call is passed the specific gate `g` whose transition just fired
        // (applyEvent's own ...args forwarding), the same way BossPhaseManager's onEnter took a ctx object.
        this._onEnterGate = {
            // entering "active" (opening's age timeout, tick()-driven only): just restarts the countdown that
            // active's own spawn cadence measures against. No fx/stat side effect -- matches the original's
            // bare `g.age = 0`.
            active: (g) => { g.age = 0; },
            // entering "closing" (damageGate()'s hp<=0, or closeAll()'s forceClose -- from EITHER opening or
            // active): same bare age reset, no fx/stat side effect either.
            closing: (g) => { g.age = 0; },
            // entering "closed" (closing's age timeout, tick()-driven only): the one state entry with real
            // side effects, firing exactly once from this one call site -- matches the original inline block.
            closed: (g) => {
                this.fx.gateCloseFx?.(g.x, g.z);
                this.fx.despawnEntity?.(g.entityId);
                this.stats.closed++;
            },
        };
    }

    // ---- gates ----------------------------------------------------------

    open(x, z, opts = {}) {
        const id = "gate_" + (_seq++);
        const y = this.fx.groundY?.(x, z) ?? HS_SPAWN_Y;
        const gate = {
            id, x, z, y,
            state: "opening", age: 0,
            hp: opts.hp ?? GATE_MAX_HP, maxHp: opts.hp ?? GATE_MAX_HP,
            spawnTimer: SPAWN_INTERVAL * 0.5,
            aliveSpawn: 0,
            entityId: null,
        };
        this.gates.set(id, gate);
        this.stats.opened++;
        gate.entityId = this.fx.spawnGate?.(id, x, y, z) ?? null;
        this.fx.gateOpenFx?.(x, z, y);
        this.fx.emit?.({ type: "expand", intensity: 1.0, x, y, z, civId: id });
        return id;
    }

    // Despawn everything immediately (no closing animation). For world
    // reset / manual banish.
    clear() {
        for (const hs of this.spawn) this.fx.despawnEntity?.(hs.entityId);
        for (const g of this.gates.values()) this.fx.despawnEntity?.(g.entityId);
        this.spawn = [];
        this.gates.clear();
        this._civAI.clear();
    }

    damageGate(id, n) {
        const g = this.gates.get(id);
        // The guard blocks the WHOLE method body, not just the transition -- an already-closing/closed gate's
        // hp must not decrement even by an amount that wouldn't matter. Return value tracks "was this a legal
        // hit", NOT "did the state change" -- true for any hit that passes the guard even if hp stays above 0.
        if (!g || g.state === "closing" || g.state === "closed") return false;
        g.hp -= n;
        if (g.hp <= 0) {
            g.hp = 0;
            // legal from BOTH "opening" and "active" -- a gate can be forced closed while still opening.
            g.state = applyEvent(GATE_MACHINE, g.state, "hpZero", this._onEnterGate, g);
        }
        return true;
    }

    closeAll() {
        for (const g of this.gates.values()) {
            if (g.state !== "closed") {
                g.state = applyEvent(GATE_MACHINE, g.state, "forceClose", this._onEnterGate, g);
                // GATE_MACHINE's own header explains why this stays a bare assignment outside applyEvent: a
                // gate already "closing" gets no onEnter re-fire (same-state transitions never fire one), but
                // the original unconditionally reset the timer anyway -- so closeAll() called again on an
                // already-closing gate really does restart its close countdown.
                g.age = 0;
            }
        }
    }

    _spawnHellspawn(gate) {
        if (this.spawn.length >= TOTAL_SPAWN_CAP) return;
        if (gate.aliveSpawn >= MAX_ALIVE_PER_GATE) return;
        const id = "hs_" + (_seq++);
        const a = Math.random() * Math.PI * 2;
        const x = gate.x + Math.cos(a) * 2;
        const z = gate.z + Math.sin(a) * 2;
        const y = this.fx.groundY?.(x, z) ?? HS_SPAWN_Y;
        const hs = { id, x, z, y, hp: HS_HP, gateId: gate.id, targetCivId: null, entityId: null, _gyT: 0 };
        hs.entityId = this.fx.spawnHellspawn?.(id, x, y, z) ?? null;
        this.spawn.push(hs);
        gate.aliveSpawn++;
        this.stats.spawned++;
        this.fx.gatePulseFx?.(gate.x, gate.z, 1.0);
    }

    _killHellspawn(hs, idx) {
        const g = this.gates.get(hs.gateId);
        if (g) g.aliveSpawn = Math.max(0, g.aliveSpawn - 1);
        this.fx.despawnEntity?.(hs.entityId);
        this.fx.deathFx?.(hs.x, hs.z);
        this.spawn.splice(idx, 1);
        this.stats.hellspawnKilled++;
    }

    // ---- per-civ AI bookkeeping ----------------------------------------

    _ai(civId) {
        let a = this._civAI.get(civId);
        if (!a) { a = { panic: 0, siege: 0, cd: 0 }; this._civAI.set(civId, a); }
        return a;
    }

    static _dist(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

    _nearestCiv(x, z, civs) {
        let best = null, bestD = Infinity;
        for (const c of civs) {
            if (c.alive === false) continue;
            const cx = c.center?.x ?? c.x, cz = c.center?.z ?? c.z;
            if (cx == null) continue;
            const d = HellgateManager._dist(x, z, cx, cz);
            if (d < bestD) { bestD = d; best = c; }
        }
        return best;
    }

    _nearestHellspawn(x, z, maxRange) {
        let best = null, bi = -1, bestD = maxRange ?? Infinity;
        for (let i = 0; i < this.spawn.length; i++) {
            const h = this.spawn[i];
            const d = HellgateManager._dist(x, z, h.x, h.z);
            if (d < bestD) { bestD = d; best = h; bi = i; }
        }
        return { hs: best, idx: bi, d: bestD };
    }

    // ---- main step ------------------------------------------------------

    get activeGateCount() {
        let n = 0; for (const g of this.gates.values()) if (g.state === "opening" || g.state === "active") n++;
        return n;
    }

    tick(dt, civs = []) {
        if (this.gates.size === 0 && this.spawn.length === 0) return; // zero cost when idle
        if (dt > 0.1) dt = 0.1;
        this.t += dt;

        // --- gates ---
        // Which branch runs is chosen by g.state AT THE START of this gate's iteration -- an opening->active
        // crossing this tick does NOT fall through into the active branch's own spawn-cadence/pulse logic this
        // same tick (the if/else-if chain only evaluates once per gate per tick()); that gate is processed as
        // "active" starting next tick, matching the original exactly.
        for (const g of this.gates.values()) {
            g.age += dt;
            if (g.state === "opening") {
                if (g.age >= OPEN_TIME) g.state = applyEvent(GATE_MACHINE, g.state, "openTimeout", this._onEnterGate, g);
            } else if (g.state === "active") {
                g.spawnTimer -= dt;
                if (g.spawnTimer <= 0) { g.spawnTimer = SPAWN_INTERVAL; this._spawnHellspawn(g); }
                if ((Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2))) this.fx.gatePulseFx?.(g.x, g.z, 0.4);
            } else if (g.state === "closing") {
                if (g.age >= CLOSE_TIME) g.state = applyEvent(GATE_MACHINE, g.state, "closeTimeout", this._onEnterGate, g);
            }
        }
        // reap closed gates
        for (const [id, g] of [...this.gates]) if (g.state === "closed") this.gates.delete(id);

        // --- hellspawn ---
        for (let i = this.spawn.length - 1; i >= 0; i--) {
            const hs = this.spawn[i];
            if (hs.hp <= 0) { this._killHellspawn(hs, i); continue; }
            // (re)acquire a target if missing or dead
            let target = null;
            if (hs.targetCivId != null) target = civs.find((c) => c.id === hs.targetCivId && c.alive !== false) || null;
            if (!target) { target = this._nearestCiv(hs.x, hs.z, civs); hs.targetCivId = target?.id ?? null; }
            if (!target) continue;
            const tx = target.center?.x ?? target.x, tz = target.center?.z ?? target.z;
            const d = HellgateManager._dist(hs.x, hs.z, tx, tz);
            if (d > HS_CONTACT) {
                // march toward the civ
                const inv = 1 / (d || 1);
                hs.x += (tx - hs.x) * inv * HS_SPEED * dt;
                hs.z += (tz - hs.z) * inv * HS_SPEED * dt;
                // resample ground height occasionally (cheap — not every frame)
                hs._gyT -= dt;
                if (hs._gyT <= 0) { hs.y = this.fx.groundY?.(hs.x, hs.z) ?? hs.y; hs._gyT = 0.4; }
                const yaw = Math.atan2(tx - hs.x, tz - hs.z);
                this.fx.moveEntity?.(hs.entityId, hs.x, hs.y, hs.z, yaw);
            } else {
                // besiege: raise the civ's siege level
                const ai = this._ai(target.id);
                ai.siege = Math.min(1, ai.siege + SIEGE_RATE * dt);
                if (Math.random() < dt * 0.6) this.fx.siegeFx?.(tx, tz);
                if (ai.siege >= 1) {
                    // civ overwhelmed — emit death, retarget the swarm here
                    this.fx.emit?.({ type: "death", intensity: 1.0, x: tx, y: 0, z: tz, civId: target.id });
                    this.stats.civsOverwhelmed++;
                    ai.siege = 0;
                    if (target.alive !== undefined) target.alive = false; // local mark; civManager untouched
                    for (const h of this.spawn) if (h.targetCivId === target.id) h.targetCivId = null;
                }
            }
        }

        // --- civ war AI: panic + retaliation ---
        for (const c of civs) {
            if (c.alive === false) continue;
            const cx = c.center?.x ?? c.x, cz = c.center?.z ?? c.z;
            if (cx == null) continue;
            const ai = this._ai(c.id);

            // threat = closeness of the nearest gate or hellspawn
            let threat = 0;
            for (const g of this.gates.values()) {
                if (g.state === "closed") continue;
                const d = HellgateManager._dist(cx, cz, g.x, g.z);
                if (d < THREAT_RADIUS) threat = Math.max(threat, 1 - d / THREAT_RADIUS);
            }
            const near = this._nearestHellspawn(cx, cz, THREAT_RADIUS);
            if (near.hs) threat = Math.max(threat, 1 - near.d / THREAT_RADIUS);

            if (threat > 0) ai.panic = Math.min(1, ai.panic + PANIC_RISE * threat * dt);
            else ai.panic = Math.max(0, ai.panic - PANIC_DECAY * dt);
            ai.siege = Math.max(0, ai.siege - SIEGE_DECAY * dt);

            // retaliate when panicked: fire at the nearest hellspawn
            ai.cd -= dt;
            const fightThreshold = 0.25;
            if (ai.panic > fightThreshold && ai.cd <= 0) {
                const tgt = this._nearestHellspawn(cx, cz, RETALIATE_RANGE);
                if (tgt.hs) {
                    // panic + siege make the civ fire faster + more accurately
                    ai.cd = RETALIATE_CD * (1.2 - 0.5 * ai.panic);
                    this.stats.civShots++;
                    this.fx.civMissile?.({ x: cx, y: HS_SPAWN_Y, z: cz }, { x: tgt.hs.x, y: HS_SPAWN_Y, z: tgt.hs.z });
                    this.fx.emit?.({ type: "expand", intensity: ai.panic, x: cx, y: 0, z: cz, civId: c.id });
                    // hit chance scales with panic (desperation = better aim, narratively)
                    const dmg = 8 + 10 * ai.panic;
                    tgt.hs.hp -= dmg;
                }
            }
        }
    }

    // snapshot for HUD/console
    snapshot() {
        return {
            gates: this.gates.size,
            activeGates: this.activeGateCount,
            hellspawn: this.spawn.length,
            ...this.stats,
            maxPanic: Math.max(0, ...[...this._civAI.values()].map((a) => a.panic)),
        };
    }
}
