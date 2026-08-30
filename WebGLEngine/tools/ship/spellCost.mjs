// FILE: tools/ship/spellCost.mjs -- v4192
//
// MEASURES what the units in world/spellBook.mjs's COST_UNITS are actually worth, by doing the work and
// timing it. Node-only (it needs a clock), which is why it is here rather than beside the pure book.
//
// *** THIS IS THE HALF THAT MAKES THE SPELL BOOK HONEST. *** A cost table nobody re-derives is a cost table
// that has already drifted: someone makes the fracture twice as fast, and the spell that fractures keeps
// charging the old price forever. The gate calls this and checks the recorded units still reproduce the
// book's ordering.
//
// *** AND IT MEASURES REAL WORK, NOT A MODEL OF IT. *** The particle price times burstFor() building actual
// bursts; the fracture price times physics/voxel/fracture.js carving an actual grid and flood-filling it.
// Neither is a stand-in.
"use strict";

import { burstFor, SPELLS } from "../../world/spellBook.mjs";
import { carveSphere, looseFragments } from "../../physics/voxel/fracture.js";

/** Median of repeated timings: one run is noise, and a mean is dragged around by a single GC pause. */
function medianUs(fn, runs = 7) {
    const t = [];
    for (let i = 0; i < runs; i++) {
        const t0 = process.hrtime.bigint();
        fn();
        t.push(Number(process.hrtime.bigint() - t0) / 1000);
    }
    t.sort((a, b) => a - b);
    return t[t.length >> 1];
}

/** Microseconds to build one particle, measured on the book's own largest burst. */
export function measureParticleUs(runs = 7) {
    const count = Math.max(...Object.keys(SPELLS).map((n) => SPELLS[n].burst.count));
    const name = Object.keys(SPELLS).find((n) => SPELLS[n].burst.count === count);
    const us = medianUs(() => burstFor(name, 12345), runs);
    return { us: us / count, total: us, count, on: name };
}

/**
 * Microseconds per voxel of a carve-plus-flood-fill, measured on a real grid.
 *
 * A solid block is carved with a sphere and then flood-filled for what came loose -- which is exactly what a
 * spell with a `fracture` does, and exactly the work physics/voxel/fracture.js was written for.
 */
export function measureFractureUs(grid = 32, runs = 5) {
    const n = grid * grid * grid;
    const build = () => {
        const g = new Uint8Array(n).fill(1);
        return g;
    };
    const r = Math.floor(grid / 3);
    const us = medianUs(() => {
        const g = build();
        carveSphere(g, grid, grid, grid, grid / 2, grid / 2, grid / 2, r);
        looseFragments(g, grid, grid, grid);
    }, runs);
    return { us: us / n, total: us, voxels: n, grid };
}

/** Both measurable units. The ray-march is not here on purpose -- node has no GPU to time. */
export function measureUnits(opts = {}) {
    const p = measureParticleUs(opts.runs);
    const f = measureFractureUs(opts.grid || 32, opts.runs);
    return {
        particle: { us: p.us, measuredBy: "node", of: "one particle built by burstFor", detail: p },
        fractureVoxel: { us: f.us, measuredBy: "node", of: "one voxel of a carve + connected-component pass", detail: f },
    };
}

if (process.argv[1] && process.argv[1].endsWith("spellCost.mjs")) {
    const { COST_UNITS, SPELL_NAMES, costFor, manaFor, workOf, byCost, unmeasuredFeatures } =
        await import("../../world/spellBook.mjs");
    const m = measureUnits();
    console.log("measured on this machine:");
    console.log(`  particle       ${m.particle.us.toFixed(4)} us   (recorded ${COST_UNITS.particle.us})   -- ${m.particle.detail.count} particles in ${m.particle.detail.total.toFixed(0)} us`);
    console.log(`  fractureVoxel  ${m.fractureVoxel.us.toFixed(4)} us   (recorded ${COST_UNITS.fractureVoxel.us})   -- ${m.fractureVoxel.detail.voxels} voxels in ${m.fractureVoxel.detail.total.toFixed(0)} us`);
    console.log(`  raymarchFrame  ${COST_UNITS.raymarchFrame.us} us    NOT MEASURED HERE -- ${COST_UNITS.raymarchFrame.of}`);
    console.log("\nthe book, cheapest first:");
    console.log("  " + "spell".padEnd(14) + "particles".padStart(10) + "fracture".padStart(11) + "march".padStart(7) + "cost us".padStart(12) + "mana".padStart(6) + "  unmeasured");
    for (const n of byCost()) {
        const w = workOf(n);
        console.log("  " + n.padEnd(14) + String(w.particles).padStart(10) + String(w.fractureVoxels).padStart(11) +
            String(w.raymarchFrames).padStart(7) + costFor(n).toFixed(0).padStart(12) + String(manaFor(n)).padStart(6) +
            "  " + (unmeasuredFeatures(n).join(",") || "-"));
    }
}
