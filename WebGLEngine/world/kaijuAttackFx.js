// =============================================================================
// FILE: /world/kaijuAttackFx.js
// ROUND: 402
// =============================================================================
//
// Visual + audio effects for kaiju ranged attacks. Subscribes to the
// "kaiju_ranged_attack" event published by KaijuManager._tickRangedAttack
// (round 30) and dispatches a GPU particle burst (v401) matched to the
// attack's family (beam / projectile / aoe) and color.
//
// Why a subscriber rather than direct calls from KaijuManager:
//   • Decouples content (visuals) from logic (damage, targeting).
//   • Lets the engine ship without GPU particles support (WebGL1
//     fallback) without changing KaijuManager.
//   • Same event bus already drives narrative + documentary recap;
//     adding visual effects fits the existing pattern.
//
// EVENT SHAPE (from KaijuManager):
//   {
//     type:        "kaiju_ranged_attack",
//     attackName:  "lightning" | "fireball" | "plasma" | "ice_ray" |
//                   "rad_pulse" | "rock_spike" | ...
//     verb:        "calls down lightning on" | "hurls a fireball at" | ...
//     fromX, fromY, fromZ:   kaiju position
//     toX, toY, toZ:         target position
//     kaijuId, kaijuKind, targetName, ...
//   }
//
// PARTICLE PROFILE PER ATTACK FAMILY:
//   beam       — straight stream of N particles from kaiju to target,
//                tight spread, color from attack registry
//   projectile — burst at firing point (launch puff) + smaller trail
//                follow handled by the projectile renderer separately
//   aoe        — ring of particles expanding outward from kaiju
//                position at ground level
//
// AUDIO PAIRING:
//   Each attack name maps to an audio bus voice. Voices fire spatially
//   so the listener position (kept current by v381's updateListener)
//   gives directional pan/distance attenuation for free.

import { KAIJU_ATTACKS } from "./kaijuAttacks.js";

// Audio voice routing per attack family. The audio bus's synth voices
// are coarse but they're enough to differentiate firing sounds. Real
// production would swap in proper SFX files via audio.register(...).
const ATTACK_VOICE = {
    lightning:  "zap",
    ice_ray:    "chime",
    plasma:     "deep",
    fireball:   "boom",
    rad_pulse:  "hum",
    rock_spike: "tap",
    // Default fallback
    _default:   "ping",
};

// Particle count knobs per family. Tuned to read clearly without
// flooding the screen.
const FAMILY_PARTICLE_COUNT = {
    beam:        24,
    projectile:  20,    // launch puff only; in-flight trail is the projectile renderer's job
    aoe:         60,
};

/**
 * Install the FX subscriber on the kaiju event bus. Idempotent: a
 * second call is a no-op.
 *
 *   installKaijuAttackFx({
 *     events:        kaijuManager.events,   // CivilizationEventBus
 *     gpuParticles:  window.gpuParticles,    // v401 GPU particle system
 *     audio:         window.audio?.bus,       // v368 audio bus
 *   });
 *
 * Returns an `uninstall` function to detach the subscriber.
 */
export function installKaijuAttackFx({ events, gpuParticles, audio, screenFx }) {
    if (!events?.subscribe) {
        console.warn("[KaijuAttackFx] no events bus — FX disabled");
        return () => {};
    }

    const subscriber = (event) => {
        if (event?.type !== "kaiju_ranged_attack") return;
        try {
            dispatchAttackFx(event, { gpuParticles, audio, screenFx });
        } catch (e) {
            console.warn("[KaijuAttackFx] dispatch failed:", e);
        }
    };

    events.subscribe(subscriber);
    return () => {
        // CivilizationEventBus doesn't have an unsubscribe method in v1.
        // We mark this subscriber inert by wrapping the original. If the
        // bus gains a real unsubscribe later, swap this for it.
        subscriber._inert = true;
    };
}

/**
 * Render one attack's visual + audio. Public so tests can drive it
 * directly without round-tripping through the event bus.
 */
// v2240 — water-spell coupling. A pure function (no window, no GL) that turns a water attack + its
// from/to positions into a list of window.waterField calls, so a tidal wave / deluge / typhoon actually
// MOVES the lake or ocean instead of only spawning particles. Tested by world/tools/water-attacks-selfcheck.mjs.
export function waterPlanFor(atk, fromX, fromZ, toX, toZ) {
    const eff = atk && atk.waterEffect;
    if (!eff) return [];
    const dx = toX - fromX, dz = toZ - fromZ;
    if (eff === "tidalWave") {
        // edge = the side the wave enters from so it TRAVELS toward the target (WaterField: 'west'/'north' => +axis).
        let edge;
        if (Math.abs(dx) >= Math.abs(dz)) edge = dx >= 0 ? "west" : "east";
        else edge = dz >= 0 ? "north" : "south";
        return [
            { method: "tidalWave", args: [{ edge, speed: 20, amplitude: 5, thickness: 4 }] },
            { method: "splash", args: [toX, toZ, 2.5, 3] },   // local impact where it's aimed
        ];
    }
    if (eff === "deluge") {
        const plan = [], N = 16, R = 8;
        for (let i = 0; i < N; i++) {
            const a = i * 2.399963229;                        // golden angle -> even, deterministic scatter
            const rr = R * Math.sqrt((i + 0.5) / N);
            plan.push({ method: "splash", args: [toX + Math.cos(a) * rr, toZ + Math.sin(a) * rr, 1.1, 1.5] });
        }
        return plan;
    }
    if (eff === "vortex") {
        const plan = [], M = 12, R = 5;
        for (let i = 0; i < M; i++) {
            const a = (i / M) * Math.PI * 2;
            plan.push({ method: "splash", args: [toX + Math.cos(a) * R, toZ + Math.sin(a) * R, 0.9, 1.5] });
        }
        plan.push({ method: "splash", args: [toX, toZ, 1.4, 2] });   // eye of the storm
        return plan;
    }
    return [];
}

export function dispatchAttackFx(event, { gpuParticles, audio, screenFx }) {
    const attackName = event.attackName;
    const attackSpec = KAIJU_ATTACKS[attackName];
    if (!attackSpec) return false;     // unknown attack name
    const family = attackSpec.family;
    const color  = attackSpec.color ?? [1, 1, 1];

    // Resolve from/to
    const fx = event.fromX ?? 0, fy = event.fromY ?? 0, fz = event.fromZ ?? 0;
    const tx = event.toX   ?? fx, ty = event.toY   ?? fy, tz = event.toZ   ?? fz;

    // v2240 — if this is a water spell, move the real water. window.waterField is set in main.js; guarded
    // so a build without it (or a dry target) just no-ops. This is what folds the spells into lakes/oceans.
    if (attackSpec.waterEffect) {
        try {
            const wf = (typeof window !== "undefined") && window.waterField;
            if (wf) for (const step of waterPlanFor(attackSpec, fx, fz, tx, tz)) {
                if (typeof wf[step.method] === "function") wf[step.method](...step.args);
            }
        } catch (e) { /* water is a flourish; never let it break the FX dispatch */ }
    }

    if (gpuParticles?.isSupported?.()) {
        if (family === "beam") {
            _spawnBeamParticles(gpuParticles, fx, fy, fz, tx, ty, tz, color);
        } else if (family === "projectile") {
            _spawnProjectileLaunchPuff(gpuParticles, fx, fy, fz, tx, ty, tz, color);
        } else if (family === "aoe") {
            _spawnAoeRing(gpuParticles, fx, fy, fz, attackSpec.range ?? 18, color);
        }
    }

    // Audio. Spatial so the listener pan reads the attack's direction.
    if (audio) {
        const voice = ATTACK_VOICE[attackName] ?? ATTACK_VOICE._default;
        if (typeof audio.playSpatial === "function") {
            audio.playSpatial(voice, fx, fy, fz);
        } else if (typeof audio.play === "function") {
            audio.play(voice);
        }
    }

    // --- WOW-PASS (round 30 polish): a style-matched burst when the attack
    // LANDS, plus a bloom flash + camera shake scaled by the hit's damage.
    // Beams/AoE land effectively instantly; projectiles get a travel delay
    // estimated from distance so the flourish reads as arrival, not launch.
    const dist = Math.hypot(tx - fx, ty - fy, tz - fz);
    const delayMs = family === "projectile" ? Math.min(900, Math.max(120, dist * 11)) : (family === "beam" ? 40 : 0);
    const style = _impactStyleFor(attackName, family);
    const dmg = attackSpec.damage ?? 0.1;
    const fire = () => {
        try { if (gpuParticles?.isSupported?.()) _spawnImpactFx(gpuParticles, style, tx, ty, tz, color, dmg); } catch {}
        try { _screenPunch(screenFx, dmg, style); } catch {}
    };
    if (delayMs > 0) setTimeout(fire, delayMs); else fire();
    return true;
}

// Damage-scaled bloom flash + camera shake. Low-damage DoT/beam ticks barely
// register; heavy projectiles (meteor, plasma) hit hard. A non-linear curve
// keeps the small stuff subtle so the screen isn't constantly twitching.
function _screenPunch(screenFx, dmg, style) {
    if (!screenFx) return;
    const d = Math.max(0, Math.min(1, dmg));
    const punch = Math.pow(d, 0.7);                       // ease so 0.05 stays tiny
    if (typeof screenFx.bloomPulse === "function") {
        const styleBoost = (style === "electric" || style === "plasma") ? 1.25 : 1.0;
        screenFx.bloomPulse(Math.min(0.85, 0.06 + punch * 0.9 * styleBoost));
    }
    if (typeof screenFx.shake === "function" && d > 0.06) {
        const mag = Math.min(0.9, 0.08 + punch * 1.15);
        const secs = 0.16 + punch * 0.45;
        screenFx.shake(secs, mag);
    }
}

/**
 * Stream of particles from kaiju to target. Tightly-spaced trail
 * with low randomization — reads as a beam, not a cloud.
 */
function _spawnBeamParticles(gp, fx, fy, fz, tx, ty, tz, color) {
    const count = FAMILY_PARTICLE_COUNT.beam;
    const dx = tx - fx, dy = ty - fy, dz = tz - fz;
    const len = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    // Beam-particles spread perpendicular to the beam direction by a
    // small radius. Compute an orthonormal frame around (ux, uy, uz).
    const refA = Math.abs(uy) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    const sx = uy * refA[2] - uz * refA[1];
    const sy = uz * refA[0] - ux * refA[2];
    const sz = ux * refA[1] - uy * refA[0];
    const sl = Math.hypot(sx, sy, sz) || 1;
    const ex = sx / sl, ey = sy / sl, ez = sz / sl;     // side basis 1
    const wx = uy * ez - uz * ey;
    const wy = uz * ex - ux * ez;
    const wz = ux * ey - uy * ex;                         // side basis 2

    for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        // Position along the beam, jittered slightly
        const r = 0.15 * (Math.random() - 0.5);
        const phi = Math.random() * Math.PI * 2;
        const cphi = Math.cos(phi) * r;
        const sphi = Math.sin(phi) * r;
        gp.spawn({
            x: fx + dx * t + ex * cphi + wx * sphi,
            y: fy + dy * t + ey * cphi + wy * sphi,
            z: fz + dz * t + ez * cphi + wz * sphi,
            // Very slow drift outward to make the beam "breathe"
            vx: ex * cphi * 0.5 + wx * sphi * 0.5,
            vy: ey * cphi * 0.5 + wy * sphi * 0.5 + 0.3,
            vz: ez * cphi * 0.5 + wz * sphi * 0.5,
            life: 0.5 + Math.random() * 0.4,
            size: 0.25,
            color, shape: 3,
        });
    }
}

/**
 * Quick puff at the firing point. The projectile itself is rendered
 * by ProjectileManager; this is just the muzzle flash.
 */
function _spawnProjectileLaunchPuff(gp, fx, fy, fz, tx, ty, tz, color) {
    const dx = tx - fx, dy = ty - fy, dz = tz - fz;
    const len = Math.hypot(dx, dy, dz) || 1;
    gp.spawnBurst({
        x: fx, y: fy, z: fz,
        count:       FAMILY_PARTICLE_COUNT.projectile,
        speed:       8,
        direction:   [dx / len, dy / len, dz / len],
        spreadAngle: 0.7,
        life:        0.6,
        size:        0.35,
        color, shape: 1,
    });
}

/**
 * Ring of particles expanding outward from (fx, fy, fz) at ground
 * level. The radius is the AoE attack's range — particles travel
 * just past it during their lifetime.
 */
function _spawnAoeRing(gp, fx, fy, fz, range, color) {
    const count = FAMILY_PARTICLE_COUNT.aoe;
    const speed = range * 1.1;     // reach range in ~life seconds
    const life  = 1.2;
    for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.1;
        const cs = Math.cos(a), sn = Math.sin(a);
        gp.spawn({
            x: fx, y: fy + 0.4, z: fz,
            vx: cs * speed,
            vy: 0.4 + Math.random() * 0.6,
            vz: sn * speed,
            life,
            size: 0.4,
            color, shape: 2,
        });
    }
}

// =============================================================================
// WOW-PASS impact effects (round 30 polish). Each attack family/element gets a
// distinct "it landed" flourish at the target, so a fireball reads completely
// differently from an ice ray or a radiation pulse. Particle `shape` is kept to
// the known-valid sprite atlas indices 1 (soft puff), 2 (ring/shard), 3 (spark).
// =============================================================================
const _IMPACT_STYLE = {
    fireball: "explosion", meteor: "explosion", hell_curse: "explosion", flamethrower: "explosion", geyser: "explosion",
    plasma: "plasma", ion_lance: "plasma", magic_orb: "plasma", tractor_beam: "plasma", shadow_bolt: "plasma",
    lightning: "electric", emp_burst: "electric", swarm_volley: "electric", machinegun_volley: "electric",
    ice_ray: "ice", tidal_wave: "ice", deluge: "ice", typhoon: "ice",
    rad_pulse: "toxic", plague: "toxic", acid_spit: "toxic", soul_drain: "toxic",
    rock_spike: "shock", tremor: "shock", shockwave: "shock", sonic_scream: "shock",
};
function _impactStyleFor(name, family) {
    return _IMPACT_STYLE[name] || (family === "aoe" ? "shock" : family === "beam" ? "electric" : "explosion");
}

// Flat expanding ground ring of particles, used as the "footprint" of several styles.
function _impactRing(gp, x, y, z, radius, color, life) {
    const n = 30, speed = radius / life;
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        gp.spawn({ x, y: y + 0.3, z, vx: Math.cos(a) * speed, vy: 0.25, vz: Math.sin(a) * speed, life, size: 0.3, color, shape: 2 });
    }
}

function _spawnImpactFx(gp, style, x, y, z, color, dmg) {
    const s = Math.min(1, Math.max(0.15, dmg));    // 0.15..1 size/intensity factor
    switch (style) {
        case "explosion": {                          // fire/meteor — orange blast + embers + ring
            gp.spawnBurst?.({ x, y: y + 0.5, z, count: 34 + Math.round(40 * s), speed: 9 + 9 * s, direction: [0, 1, 0], spreadAngle: Math.PI, life: 0.6, size: 0.34 + 0.22 * s, color, shape: 1 });
            for (let i = 0; i < 10; i++) gp.spawn({ x, y: y + 0.5, z, vx: (Math.random() - 0.5) * 4, vy: 4 + Math.random() * 5, vz: (Math.random() - 0.5) * 4, life: 0.8 + Math.random() * 0.5, size: 0.18, color: [1, 0.7, 0.25], shape: 1 });
            _impactRing(gp, x, y, z, 6 + 8 * s, [1, 0.55, 0.2], 0.7);
            break;
        }
        case "plasma": {                             // energy — bright core + shockwave ring + crackle
            for (let i = 0; i < 6; i++) gp.spawn({ x, y: y + 0.6, z, vx: (Math.random() - 0.5), vy: 0.5, vz: (Math.random() - 0.5), life: 0.32, size: 0.9 + 0.6 * s, color: [0.75, 0.92, 1], shape: 1 });
            _impactRing(gp, x, y, z, 8 + 10 * s, color, 0.6);
            gp.spawnBurst?.({ x, y: y + 0.5, z, count: 22 + Math.round(20 * s), speed: 7 + 6 * s, direction: [0, 1, 0], spreadAngle: Math.PI, life: 0.5, size: 0.24, color, shape: 3 });
            break;
        }
        case "electric": {                           // lightning/EMP — white flash + fast jagged sparks
            gp.spawn({ x, y: y + 0.6, z, vx: 0, vy: 0, vz: 0, life: 0.12, size: 1.4 + 0.8 * s, color: [1, 1, 1], shape: 1 });
            gp.spawnBurst?.({ x, y: y + 0.6, z, count: 28 + Math.round(24 * s), speed: 14 + 11 * s, direction: [0, 1, 0], spreadAngle: Math.PI, life: 0.3, size: 0.14, color: [1, 1, 0.75], shape: 3 });
            _impactRing(gp, x, y, z, 5 + 6 * s, [1, 1, 0.6], 0.35);
            break;
        }
        case "ice": {                                // frost — cyan shard burst + falling shards + ring
            gp.spawnBurst?.({ x, y: y + 0.5, z, count: 26 + Math.round(26 * s), speed: 6 + 5 * s, direction: [0, 1, 0], spreadAngle: Math.PI * 0.8, life: 0.9, size: 0.3, color: [0.6, 0.9, 1], shape: 2 });
            for (let i = 0; i < 12; i++) gp.spawn({ x: x + (Math.random() - 0.5) * 3, y: y + 1.6, z: z + (Math.random() - 0.5) * 3, vx: 0, vy: -2 - Math.random() * 2, vz: 0, life: 0.8, size: 0.22, color: [0.82, 0.95, 1], shape: 2 });
            _impactRing(gp, x, y, z, 5 + 7 * s, [0.7, 0.92, 1], 0.9);
            break;
        }
        case "toxic": {                              // radiation/plague — green cloud that rises + lingers
            const n = 22 + Math.round(18 * s);
            for (let i = 0; i < n; i++) gp.spawn({ x: x + (Math.random() - 0.5) * 2, y: y + 0.4, z: z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 1.2, vy: 0.8 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 1.2, life: 1.3 + Math.random() * 0.8, size: 0.5 + 0.3 * s, color: [0.45, 0.95, 0.4], shape: 1 });
            break;
        }
        case "shock":
        default: {                                   // ground slam — dust + small sparks + ring
            gp.spawnBurst?.({ x, y: y + 0.3, z, count: 24 + Math.round(20 * s), speed: 5 + 5 * s, direction: [0, 1, 0], spreadAngle: Math.PI * 0.6, life: 0.7, size: 0.35, color: [0.6, 0.55, 0.5], shape: 1 });
            _impactRing(gp, x, y, z, 6 + 8 * s, color, 0.6);
            break;
        }
    }
}
