// WebGLEngine/world/rootArchPlace.js — v4077
// ---------------------------------------------------------------------------------------------------------------
// WHERE the one root/arch landmark goes -- world/rootArch.js only knows HOW to grow one, exactly the split
// world/ruinPlacer.js already keeps from simulation/megastructurePatterns.js's shapes (placement logic and
// geometry/pattern data are two different questions in this tree, not one file answering both).
//
// A deterministic spiral search from a given origin -- the same widening-ring idiom ruinPlacer.js's own
// scatter uses, narrowed here from "eight ruins, first fit each" to "the first spot that qualifies, once" --
// finds real, gentle, non-desert ground: world/worleyBiomes.js's real biomeAt() (read with world.biomeSeed,
// the SAME seed the terrain was actually painted with -- render/mossPatches.js's own v4077 reasoning applies
// here unchanged: a placement decision that used a different seed would not agree with the ground the player
// actually sees) rules out desert, and a central-difference height gradient over terrainTopAt() -- the SAME
// slope proxy render/mossPatches.js already computes for moss -- rules out anything too steep for a wide
// arch's two feet to both plant on real ground.
//
// REFUSAL, NOT A FALLBACK GUESS: if no candidate in `tries` steps qualifies (most commonly because the world
// has not streamed real terrain in around the origin yet -- terrainTopAt() reports PROBE_BOTTOM_Y for every
// unstreamed column), this returns null rather than inventing a height or placing on ungenerated ground. The
// caller is expected to retry later, exactly as render/mossPatches.js's own rebuild-on-need already does.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { terrainTopAt } from "../simulation/cameraGroundClamp.js";
import { biomeAt } from "./worleyBiomes.js";

// exposed rock/dune has nothing gentle for an arch to plant its two feet in, and nothing to root into -- the
// same ecological refusal render/mossPatches.js's SPECIES_BY_BIOME.desert already makes for moss.
const NO_ARCH_BIOMES = new Set(["desert"]);

/**
 * Search a deterministic widening spiral of candidate columns around (originX, originZ) for the first spot
 * that is on real streamed ground, not desert, and not too steep. Returns `{ x, y, z, rotY }` (a world position
 * plus a deterministic yaw for the landmark) or `null` if nothing in `tries` steps qualifies.
 */
export function findRootArchSite(world, opts = {}) {
    const originX = opts.originX ?? 0, originZ = opts.originZ ?? 0;
    const tries = opts.tries ?? 64, step = opts.step ?? 6;
    const maxSlope = opts.maxSlope ?? 0.5, seed = opts.seed ?? 4242;
    if (!world) return null;

    const biomeSeed = (world.biomeSeed != null) ? world.biomeSeed : 1337;
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

    for (let i = 0; i < tries; i++) {
        // widening square-ish spiral: ring grows every ~ring^2 steps, angle turns by an irrational-ish amount
        // so successive rings don't all sample the same compass points -- deterministic (same seed, same
        // origin -> same site every call), not random per attempt.
        const ring = Math.floor(Math.sqrt(i));
        const ang = i * 2.4;
        const dist = ring * step;
        const x = originX + Math.round(Math.cos(ang) * dist);
        const z = originZ + Math.round(Math.sin(ang) * dist);

        const biome = biomeAt(x, z, biomeSeed).primary;
        if (NO_ARCH_BIOMES.has(biome)) continue;

        const y = terrainTopAt(world, x, z);
        if (y <= 0) continue;   // no natural streamed ground under this column yet

        const D = 3;
        const dEast  = (terrainTopAt(world, x + D, z) - terrainTopAt(world, x - D, z)) / (2 * D);
        const dNorth = (terrainTopAt(world, x, z + D) - terrainTopAt(world, x, z - D)) / (2 * D);
        if (Math.hypot(dEast, dNorth) > maxSlope) continue;   // too steep for a wide arch's two feet

        return { x, y, z, rotY: rnd() * Math.PI * 2 };
    }
    return null;
}
