// =============================================================================
// FILE: /world/megastructureFx.js
// ROUND: 408
// =============================================================================
//
// Megastructure completion FX. Subscribes to the "megaproject_complete"
// event (published when a civilization finishes a monument — same event
// EventScriptBinder uses to trigger its three-stage reveal cinematic)
// and layers a celebratory particle + audio moment on top:
//
//   1. COLUMN  — a tall upward column of particles rising from the
//                structure base to its apex. Reads as energy/light
//                surging up the monument.
//   2. APEX    — a bright burst at the top once the column "arrives",
//                fired on a short delay so it lands after the column
//                rather than simultaneously.
//   3. CHORD   — a triumphant audio chord through the engine audio bus.
//
// Decoupled subscriber: no changes to CivilizationManager / the
// megastructure builder. Same pattern as world/kaijuAttackFx.js (v402).
//
// EVENT SHAPE (from the megastructure completion publisher):
//   {
//     type:     "megaproject_complete",
//     megaX, megaY, megaZ:  structure base position (fallback x/y/z)
//     megaName: "the Spire of ..." (optional)
//     civName:  "..." (optional)
//     height:   structure height in voxels (optional; default 24)
//   }

function _gpu() {
    return (typeof window !== "undefined" && window.gpuParticles?.isSupported?.())
        ? window.gpuParticles
        : null;
}


const DEFAULT_HEIGHT = 24;
const COLUMN_PARTICLES = 90;
const APEX_PARTICLES   = 80;
const APEX_DELAY_MS    = 600;     // burst lands after the column rises

/**
 * Install the FX subscriber on the civ event bus. Returns an uninstall
 * function (best-effort; CivilizationEventBus v1 has no real
 * unsubscribe, so uninstall marks the subscriber inert).
 *
 *   installMegastructureFx({ events: civEvents });
 */
export function installMegastructureFx({ events }) {
    if (!events?.subscribe) {
        console.warn("[MegastructureFx] no events bus — FX disabled");
        return () => {};
    }
    const subscriber = (event) => {
        if (subscriber._inert) return;
        if (event?.type !== "megaproject_complete") return;
        try {
            playCompletionFx(event);
        } catch (e) {
            console.warn("[MegastructureFx] dispatch failed:", e);
        }
    };
    events.subscribe(subscriber);
    return () => { subscriber._inert = true; };
}

/**
 * Fire the completion FX for one event. Exported for direct testing.
 */
export function playCompletionFx(event) {
    const bx = event.megaX ?? event.x ?? 0;
    const by = event.megaY ?? event.y ?? 0;
    const bz = event.megaZ ?? event.z ?? 0;
    const height = event.height ?? DEFAULT_HEIGHT;

    const gp = _gpu();
    if (gp) {
        _spawnColumn(gp, bx, by, bz, height);
        // Apex burst on a delay so it reads as the column arriving.
        const fireApex = () => {
            const g = _gpu();
            if (g) _spawnApexBurst(g, bx, by + height, bz);
        };
        if (typeof setTimeout === "function") setTimeout(fireApex, APEX_DELAY_MS);
        else fireApex();
    }

    // Audio is owned by the semantic router (gameAudio, v410) — it
    // maps megaproject_complete → a triumphant voice. We just do the
    // visuals here so the "looks like" and "sounds like" decisions
    // each live in one place.
    return true;
}

/**
 * Upward column. Particles spawn along the structure's vertical axis
 * with a strong upward velocity and slight outward jitter, so the
 * column has a little width and shimmer rather than being a laser line.
 */
function _spawnColumn(gp, bx, by, bz, height) {
    for (let i = 0; i < COLUMN_PARTICLES; i++) {
        const t = i / COLUMN_PARTICLES;            // 0 at base, ~1 at apex
        const y = by + t * height;
        const jitter = 0.6;
        gp.spawn({
            x: bx + (Math.random() - 0.5) * jitter,
            y,
            z: bz + (Math.random() - 0.5) * jitter,
            // Upward surge, faster near the base so they "catch up"
            vx: (Math.random() - 0.5) * 0.8,
            vy: 6 + Math.random() * 4,
            vz: (Math.random() - 0.5) * 0.8,
            life: 1.6 + Math.random() * 0.8,
            size: 0.35,
            r: 0.4, g: 0.85, b: 1.0,        // monument energy — cyan
        });
    }
}

/**
 * Apex burst — a bright dome of particles at the top of the structure,
 * fired slightly upward and outward. The payoff.
 */
function _spawnApexBurst(gp, x, y, z) {
    gp.spawnBurst({
        x, y, z,
        count:       APEX_PARTICLES,
        speed:       11,
        direction:   [0, 1, 0],
        spreadAngle: 1.5,            // wide — near a full dome
        life:        1.8,
        size:        0.45,
        color:       [0.6, 0.95, 1.0],     // bright cyan-white
        shape:       3,                     // flare
    });
    // A tight bright core that pops straight up
    gp.spawnBurst({
        x, y, z,
        count:       24,
        speed:       14,
        direction:   [0, 1, 0],
        spreadAngle: 0.4,
        life:        1.2,
        size:        0.3,
        color:       [1.0, 1.0, 1.0],      // white-hot core
        shape:       3,                     // flare
    });
}

