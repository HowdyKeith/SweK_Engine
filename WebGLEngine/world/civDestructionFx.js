// =============================================================================
// FILE: /world/civDestructionFx.js
// ROUND: 409
// =============================================================================
//
// Civilization destruction FX. Subscribes to the "death" event the
// CivilizationManager publishes when a civ's energy hits zero (and,
// optionally, "collapse" for the near-death wobble). Layers a somber
// destruction sequence on top:
//
//   1. PRIMARY BURST — an immediate radial spray of dust + embers from
//      the civ center at ground level. Mostly outward + low, like a
//      structure crumbling outward rather than exploding upward.
//   2. SECONDARY BURSTS — a few smaller bursts fired on staggered
//      delays at random offsets around the center, reading as
//      individual buildings collapsing in sequence after the main
//      event.
//   3. MOURNFUL CUE — a low, slow audio tone. Not triumphant — this
//      is a requiem, not a fanfare.
//
// Decoupled subscriber, same pattern as kaijuAttackFx (v402) and
// megastructureFx (v408). No changes to CivilizationManager.
//
// EVENT SHAPE (from CivilizationManager._emit):
//   {
//     type:     "death",
//     x, y, z:  civ center
//     civName:  "..." (optional)
//     civStyle: "..." (optional)
//     intensity: 0..1
//   }

function _gpu() {
    return (typeof window !== "undefined" && window.gpuParticles?.isSupported?.())
        ? window.gpuParticles
        : null;
}


const PRIMARY_PARTICLES   = 110;
const SECONDARY_COUNT     = 4;       // number of follow-up collapse bursts
const SECONDARY_PARTICLES = 30;
const SECONDARY_SPREAD    = 8;        // how far around center secondaries land
const SECONDARY_DELAY_MS  = 350;       // base delay between secondaries

/**
 * Install the FX subscriber. Returns a best-effort uninstall.
 *
 *   installCivDestructionFx({ events: civEvents });
 */
export function installCivDestructionFx({ events }) {
    if (!events?.subscribe) {
        console.warn("[CivDestructionFx] no events bus — FX disabled");
        return () => {};
    }
    const subscriber = (event) => {
        if (subscriber._inert) return;
        if (event?.type !== "death") return;
        try {
            playDestructionFx(event);
        } catch (e) {
            console.warn("[CivDestructionFx] dispatch failed:", e);
        }
    };
    events.subscribe(subscriber);
    return () => { subscriber._inert = true; };
}

/**
 * Fire the destruction FX for one event. Exported for direct testing.
 */
export function playDestructionFx(event) {
    const cx = event.x ?? 0;
    const cy = event.y ?? 0;
    const cz = event.z ?? 0;

    const gp = _gpu();
    if (gp) {
        _primaryBurst(gp, cx, cy, cz);
        _scheduleSecondaries(cx, cy, cz);
    }
    // Audio is owned by the semantic router (gameAudio, v410) — it
    // maps the "death" event → a mournful voice. Visuals only here.
    return true;
}

/**
 * Primary radial burst. Two layers: a low outward dust ring that hugs
 * the ground and skids outward, plus a slower rising column of darker
 * embers/smoke in the center.
 */
function _primaryBurst(gp, cx, cy, cz) {
    // Low outward dust ring
    const ringN = Math.round(PRIMARY_PARTICLES * 0.6);
    for (let i = 0; i < ringN; i++) {
        const a = (i / ringN) * Math.PI * 2 + Math.random() * 0.2;
        const speed = 8 + Math.random() * 4;
        gp.spawn({
            x: cx, y: cy + 0.4, z: cz,
            vx: Math.cos(a) * speed,
            vy: 0.5 + Math.random() * 1.5,     // low — hugs ground
            vz: Math.sin(a) * speed,
            life: 1.6 + Math.random() * 0.8,
            size: 0.5,
            r: 0.45, g: 0.42, b: 0.38,         // grey rubble dust
        });
    }
    // Central rising smoke/ember plume — slower, taller
    gp.spawnBurst({
        x: cx, y: cy + 0.5, z: cz,
        count:       Math.round(PRIMARY_PARTICLES * 0.4),
        speed:       4,
        direction:   [0, 1, 0],
        spreadAngle: 0.7,
        life:        2.4,
        size:        0.55,
        color:       [0.25, 0.22, 0.20],      // dark smoke plume
        shape:       4,                        // smoke
    });
}

/**
 * Schedule secondary collapse bursts at staggered delays + random
 * offsets around the center. Each reads as a single building going
 * down after the main event.
 */
function _scheduleSecondaries(cx, cy, cz) {
    if (typeof setTimeout !== "function") return;
    for (let i = 0; i < SECONDARY_COUNT; i++) {
        const delay = SECONDARY_DELAY_MS * (i + 1) + Math.random() * 250;
        setTimeout(() => {
            const gp = _gpu();
            if (!gp) return;
            const ang = Math.random() * Math.PI * 2;
            const dist = Math.random() * SECONDARY_SPREAD;
            const sx = cx + Math.cos(ang) * dist;
            const sz = cz + Math.sin(ang) * dist;
            gp.spawnBurst({
                x: sx, y: cy + 0.4, z: sz,
                count:       SECONDARY_PARTICLES,
                speed:       6,
                direction:   [0, 1, 0],
                spreadAngle: 1.1,
                life:        1.6,
                size:        0.45,
                color:       [0.40, 0.34, 0.28],   // collapse dust
                shape:       4,                     // smoke
            });
        }, delay);
    }
}

