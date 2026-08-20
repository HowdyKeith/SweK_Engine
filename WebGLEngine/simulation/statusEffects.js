// FILE: simulation/statusEffects.js
// VERSION: v1 (v769 — honest gap round)
//
// Status effect framework for ranged-attack metadata. v767 added 19
// named attack families with optional behavior hooks (acid DoT, EMP
// disable, sonic slow, tractor pull); v768 fixed the GLBParser; this
// module is the actual mechanism that makes those status hints DO
// something on the target.
//
// Design
// ------
// Each target with effects has a `_statusEffects` array (lazily
// created). Each entry has:
//   { type, expiresAt, ...effect-specific fields }
//
// Effects apply by calling `applyEffect(target, def)` from the attack
// hit path. CentipedeManager._fireProjectile + KaijuManager's beam/
// AoE execution call into apply() when the attack registry entry has
// a `statusEffect` block.
//
// Active effects tick via `tickAll(targets, dtMs)`. The host (main.js
// or per-demo loop) calls this once per frame with the canonical
// target list (e.g. window._extraRangedTargets). The tick:
//   1. Iterates each target's _statusEffects array
//   2. Applies per-effect logic (acid → applyDamage; slow → caches a
//      multiplier the consumer reads; disabled → sets a flag)
//   3. Removes expired effects
//
// Currently implemented effect types:
//   acid     — periodic damage. fields: damagePerTick, ticksPerSec
//   slow     — multiplier on cooldown/movement. fields: slowMul (0..1)
//   disabled — boolean disable. consumer checks isDisabled(target).
//
// Effects stack additively (multiple acid stacks all tick independently);
// slow multipliers compound multiplicatively. This is a deliberate
// gameplay choice — DoTs feel scarier when they stack, slows feel
// chunkier when one source can't fully neutralize another.

let _nowMs = () => (typeof performance !== "undefined") ? performance.now() : Date.now();

// Apply a status effect from an attack registry entry to a target.
// Idempotent in shape — same target can receive the same effect twice
// and both will tick independently. Caller has already done the
// hit-confirmation; this just adds the effect.
//
// v772 — resistance support. If target._resistances[def.type] is set:
//   resistance >= 1.0  → effect skipped entirely (immune)
//   0 < resistance < 1 → duration AND damagePerTick scale by (1 - r)
//   resistance <= 0    → no effect (treated as no resistance)
// Resistances are per-target, per-type. Set them on civ creation,
// unit spawn, etc.: tank._resistances = { acid: 0.5, emp: 1.0 };
export function applyEffect(target, def) {
    if (!target || !def || !def.type) return;
    // v772 — resistance check
    const r = target._resistances?.[def.type] ?? 0;
    if (r >= 1.0) return;                          // immune
    const scale = r > 0 ? Math.max(0, 1 - r) : 1;  // partial = weakened
    if (!Array.isArray(target._statusEffects)) target._statusEffects = [];
    const now = _nowMs();
    const duration = (def.duration ?? 3) * 1000 * scale;
    if (duration < 16) return;                     // sub-frame after scaling → skip
    const entry = {
        type: def.type,
        appliedAt: now,
        expiresAt: now + duration,
        lastTickAt: now,
    };
    // Type-specific fields
    if (def.type === "acid") {
        // v772 — resistance scales damage-per-tick too (in addition to duration)
        entry.damagePerTick = (def.damagePerTick ?? 0.05) * scale;
        entry.tickIntervalMs = 1000 / Math.max(0.1, def.ticksPerSec ?? 2);
    } else if (def.type === "slow") {
        entry.slowMul = Math.max(0, Math.min(1, def.slowMul ?? 0.5));
    } else if (def.type === "disabled") {
        // No extra fields; presence is the effect
    } else if (def.type === "pulled") {
        // v770 — tractor beam drag. Anchor + pullPerSec captured at
        // attack time by the caster (KaijuManager / CentipedeManager
        // pass these in def.anchorX/Y/Z). Tick moves target toward
        // anchor by pullPerSec * dtSec per frame. Requires target to
        // expose moveBy(dx, dz) — silently no-ops if missing so
        // civs/kaiju without movable refs are unaffected (correct:
        // tractor beam works on tanks/planes, not buildings).
        entry.anchorX     = def.anchorX ?? 0;
        entry.anchorY     = def.anchorY ?? 0;
        entry.anchorZ     = def.anchorZ ?? 0;
        entry.pullPerSec  = Math.max(0, def.pullPerSec ?? 3);
    } else {
        // Unknown type — store unmodified for future consumers
        Object.assign(entry, def);
    }
    target._statusEffects.push(entry);

    // v773 — apply-time FX hook. Lets subscribers (audio, particles,
    // damage numbers) react to the moment a status lands. Two paths:
    //   1. window._statusEffectFx(target, def, entry) if user-defined
    //   2. window.particles.spawn(...) for a small visual burst at the
    //      target's position (best-effort; silently no-op if particles
    //      module isn't loaded).
    if (typeof window !== "undefined") {
        try {
            window._statusEffectFx?.(target, def, entry);
        } catch {}
        try {
            const ps = window.particles;
            if (ps?.spawn) {
                // Read polymorphic position (direct or via .center for civs)
                const tx = (typeof target.x === "number") ? target.x : (target.center?.x ?? 0);
                const ty = (typeof target.y === "number") ? target.y : (target.center?.y ?? 0);
                const tz = (typeof target.z === "number") ? target.z : (target.center?.z ?? 0);
                // Type-flavored color burst (3 particles, brief)
                const colorByType = {
                    acid:     { r: 0.50, g: 1.00, b: 0.13 },
                    slow:     { r: 1.00, g: 0.94, b: 0.50 },
                    disabled: { r: 0.25, g: 0.88, b: 1.00 },
                    pulled:   { r: 0.31, g: 0.50, b: 1.00 },
                };
                const c = colorByType[def.type] || { r: 0.85, g: 0.85, b: 0.85 };
                for (let i = 0; i < 4; i++) {
                    const a = (i / 4) * Math.PI * 2;
                    ps.spawn({
                        x: tx + Math.cos(a) * 0.5,
                        y: ty + 1.2,
                        z: tz + Math.sin(a) * 0.5,
                        vx: Math.cos(a) * 1.2,
                        vy: 1.5,
                        vz: Math.sin(a) * 1.2,
                        r: c.r, g: c.g, b: c.b, a: 0.9,
                        size: 0.4, lifeMs: 500,
                    });
                }
            }
        } catch {}
    }
}

// Clear all effects on a target. Used on death/despawn so leftover
// effects don't leak onto a recycled object slot.
export function clearEffects(target) {
    if (target && Array.isArray(target._statusEffects)) {
        target._statusEffects.length = 0;
    }
}

// Returns true if the target has at least one "disabled" effect.
// Consumers (e.g. tank AI) check this before deciding to fire.
export function isDisabled(target) {
    if (!target || !Array.isArray(target._statusEffects)) return false;
    for (const e of target._statusEffects) {
        if (e.type === "disabled") return true;
    }
    return false;
}

// Returns the composite slow multiplier for the target. 1.0 = no slow.
// Multiple slow effects compound multiplicatively (two 0.5-slows = 0.25).
export function slowMultiplier(target) {
    if (!target || !Array.isArray(target._statusEffects)) return 1.0;
    let m = 1.0;
    for (const e of target._statusEffects) {
        if (e.type === "slow") m *= e.slowMul;
    }
    return m;
}

// Tick every target's effect list. Pass the array of target objects
// (e.g. window._extraRangedTargets). Returns count of expired effects
// removed this tick — useful for HUD/debug.
export function tickAll(targets, dtMs) {
    if (!Array.isArray(targets)) return 0;
    const now = _nowMs();
    const dtSec = Math.max(0, (dtMs ?? 16) / 1000);
    let removed = 0;
    for (const target of targets) {
        if (!target || !Array.isArray(target._statusEffects) || target._statusEffects.length === 0) continue;
        const effects = target._statusEffects;
        // v773 — pre-pass: collect all "pulled" effects' anchors into a
        // centroid + max pull speed. We apply ONE composite pull per
        // tick instead of one-per-effect (which would last-anchor-wins-
        // visibly-flicker when multiple tractor sources targeted the
        // same unit). Mathematically equivalent to averaging force
        // vectors; gameplay-wise feels coherent.
        let pulledN = 0;
        let pulledSx = 0, pulledSz = 0;
        let pulledMaxSpeed = 0;
        for (const e of effects) {
            if (e.type === "pulled" && now < e.expiresAt) {
                pulledN++;
                pulledSx += e.anchorX;
                pulledSz += e.anchorZ;
                if (e.pullPerSec > pulledMaxSpeed) pulledMaxSpeed = e.pullPerSec;
            }
        }
        if (pulledN > 0 && typeof target.moveBy === "function") {
            const cx = pulledSx / pulledN;
            const cz = pulledSz / pulledN;
            const dx = cx - target.x;
            const dz = cz - target.z;
            const d2 = dx*dx + dz*dz;
            if (d2 > 0.04) {
                const dist = Math.sqrt(d2);
                const step = Math.min(dist, pulledMaxSpeed * dtSec);
                try { target.moveBy((dx / dist) * step, (dz / dist) * step); } catch {}
            }
        }

        for (let i = effects.length - 1; i >= 0; i--) {
            const e = effects[i];
            // Expired? Remove + skip.
            if (now >= e.expiresAt) {
                effects.splice(i, 1);
                removed++;
                continue;
            }
            // Apply periodic effect logic
            if (e.type === "acid" && e.tickIntervalMs > 0) {
                while (now - e.lastTickAt >= e.tickIntervalMs) {
                    e.lastTickAt += e.tickIntervalMs;
                    try {
                        if (typeof target.applyDamage === "function") {
                            target.applyDamage(e.damagePerTick);
                        }
                    } catch {}
                }
            }
            // pulled is now handled in the pre-pass above (one composite
            // move per frame). slow + disabled are passive (consumers
            // read them via slowMultiplier/isDisabled helpers).
        }
    }
    return removed;
}

// Snapshot of effects on a target — for HUD/debug only. Returns a
// shallow array of { type, msRemaining }.
export function describeEffects(target) {
    if (!target || !Array.isArray(target._statusEffects)) return [];
    const now = _nowMs();
    return target._statusEffects.map(e => ({
        type: e.type,
        msRemaining: Math.max(0, e.expiresAt - now),
    }));
}

// Set up window.statusEffects for console exploration during dev.
// Idempotent — safe to call from multiple boot paths.
export function installGlobal() {
    if (typeof window === "undefined") return;
    window.statusEffects = {
        apply: applyEffect,
        clear: clearEffects,
        isDisabled,
        slowMul: slowMultiplier,
        describe: describeEffects,
        tickAll,
    };
}
