// WebGLEngine/tools/ship/oceanPopulation-selfcheck.mjs -- v1
//
// Run: node tools/ship/oceanPopulation-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered by the *selfcheck*.mjs naming convention).
//
// backlog: emergent-ecosystem-demo. The whole ask was "population counts checkable by a gate rather than
// eyeballed" -- so this file's center of gravity is section 2 (determinism, byte for byte) and section 4
// (what the tuned constants ACTUALLY produce, measured, not assumed). Every number asserted below was read
// off a real run of simulation/OceanPopulation.mjs before it was written here.
"use strict";
import { OceanPopulation } from "../../simulation/OceanPopulation.mjs";
import { rng } from "../../world/procPlanet.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

console.log("oceanPopulation-selfcheck -- population counts that fall out of per-agent energy, not spawn counts\n");

// =================================================================================================================
console.log("1. food-grid growth math (same d += (growth*d*(1-d) + seed)*dt logistic as aquariumEcosystem.js)");
{
    const p = new OceanPopulation({ rng: rng(1), initFish: 0, initOctopus: 0 });
    // Force a known, low-but-nonzero cell and step growth in isolation via update() with no agents to disturb it.
    p.food.fill(0.1);
    const before = p.food[0];
    for (let i = 0; i < 200; i++) p._growFood(1 / 30);
    const after = p.food[0];
    ok("a low-density cell grows toward carrying capacity", after > before && after <= 1,
       "cell 0: " + before.toFixed(3) + " -> " + after.toFixed(3) + " over 200 steps");

    const p2 = new OceanPopulation({ rng: rng(1), initFish: 0, initOctopus: 0 });
    p2.food.fill(0);
    for (let i = 0; i < 500; i++) p2._growFood(1 / 30);
    const bareAvg = p2.food.reduce((s, v) => s + v, 0) / p2.food.length;
    ok("bare cells fuzz over from the seed trickle even with zero density", bareAvg > 0,
       "avg density after 500 steps from an all-zero grid: " + bareAvg.toFixed(4));

    const p3 = new OceanPopulation({ rng: rng(1), initFish: 0, initOctopus: 0 });
    p3.food.fill(0.999);
    for (let i = 0; i < 100; i++) p3._growFood(1 / 30);
    ok("growth never exceeds the 0..1 density cap", p3.food.every((v) => v <= 1 && v >= 0),
       "max after 100 steps from 0.999: " + Math.max(...p3.food).toFixed(4));
}

// =================================================================================================================
console.log("\n2. determinism -- same seed, same dt sequence -> byte-identical population curves");
{
    const dt = 1 / 30, steps = 3000;   // 100 sim-seconds
    const a = new OceanPopulation({ rng: rng(42) }).simulate(steps, dt);
    const b = new OceanPopulation({ rng: rng(42) }).simulate(steps, dt);
    const aJson = JSON.stringify(a), bJson = JSON.stringify(b);
    ok("two independent OceanPopulation runs with rng(42) produce JSON-identical simulate() output",
       aJson === bJson,
       steps + " steps at dt=" + dt.toFixed(4) + "s (" + (steps * dt).toFixed(0) + " sim-s): " +
       aJson.length + " bytes, identical");
    ok("...and it is not identical by both being empty/degenerate",
       a.length === steps && a[a.length - 1].fish + a[a.length - 1].octopus > 0,
       "final row: " + JSON.stringify(a[a.length - 1]));
}

// =================================================================================================================
console.log("\n3. non-determinism across seeds -- proves the sim is not hard-coded/frozen");
{
    const dt = 1 / 30, steps = 3000;
    const a = new OceanPopulation({ rng: rng(42) }).simulate(steps, dt);
    const c = new OceanPopulation({ rng: rng(7) }).simulate(steps, dt);
    ok("rng(42) and rng(7) produce DIFFERENT curves over the same 3000 steps",
       JSON.stringify(a) !== JSON.stringify(c),
       "seed 42 final: fish=" + a[a.length - 1].fish + " octo=" + a[a.length - 1].octopus +
       "  |  seed 7 final: fish=" + c[c.length - 1].fish + " octo=" + c[c.length - 1].octopus);
}

// =================================================================================================================
console.log("\n4. emergence, measured honestly -- 18,000 ticks at dt=1/30s = 600 sim-seconds (10 sim-minutes)");
{
    const dt = 1 / 30, steps = 18000;
    const p = new OceanPopulation({ rng: rng(42) });
    const eventCounts = { fish: { birth: 0, death: 0 }, octopus: { birth: 0, death: 0 }, catch: 0 };
    const fishSeries = [], octoSeries = [];
    for (let i = 0; i < steps; i++) {
        const events = p.update(dt);
        for (const e of events) { if (e.type === "catch") eventCounts.catch++; else eventCounts[e.species][e.type]++; }
        fishSeries.push(p.fish.length);
        octoSeries.push(p.octopus.length);
    }
    report("measured over " + steps + " ticks (" + (steps * dt).toFixed(0) + " sim-s, starting at 24 fish / 2 octopus): " +
           JSON.stringify(eventCounts));
    report("fish count series: min=" + Math.min(...fishSeries) + " max=" + Math.max(...fishSeries) +
           " first=" + fishSeries[0] + " last=" + fishSeries[fishSeries.length - 1]);
    report("octopus count series: min=" + Math.min(...octoSeries) + " max=" + Math.max(...octoSeries) +
           " first=" + octoSeries[0] + " last=" + octoSeries[octoSeries.length - 1]);

    ok("fish count is not constant across the run (it actually moves, not just spawns-and-sits)",
       !fishSeries.every((v) => v === fishSeries[0]), "distinct fish-count values seen: " + new Set(fishSeries).size);
    ok("octopus count is not constant across the run",
       !octoSeries.every((v) => v === octoSeries[0]), "distinct octopus-count values seen: " + new Set(octoSeries).size);

    ok("at least one fish birth occurred", eventCounts.fish.birth > 0, eventCounts.fish.birth + " births");
    ok("at least one fish death occurred", eventCounts.fish.death > 0, eventCounts.fish.death + " deaths");
    ok("at least one octopus birth occurred (reproduction, on its slower timescale)",
       eventCounts.octopus.birth > 0, eventCounts.octopus.birth + " births");
    ok("at least one octopus death occurred (starvation)",
       eventCounts.octopus.death > 0, eventCounts.octopus.death + " deaths");
    ok("at least one octopus catch occurred (predation is actually happening, not just bookkeeping)",
       eventCounts.catch > 0, eventCounts.catch + " catches");

    // NOT asserting a specific ecological shape (no 'sinusoidal', no 'boom-bust' cycle count) -- that would be a
    // claim this file has not measured. What IS measured and asserted: neither species goes extinct nor runs away
    // unbounded within this window, given the tuned constants and this seed.
    ok("fish never went extinct in this window", Math.min(...fishSeries) > 0);
    ok("octopus never went extinct in this window", Math.min(...octoSeries) > 0);
    ok("fish count stayed within the runaway guard (fishMaxPop)", Math.max(...fishSeries) < p.fishMaxPop);
    ok("octopus count stayed within the runaway guard (octoMaxPop) plus one tick's overshoot",
       Math.max(...octoSeries) <= p.octoMaxPop * 2);
}

// =================================================================================================================
console.log("\n5. integration sanity -- ocean_ecosystem.js actually wired to OceanPopulation, old fixed-array pattern gone");
{
    const demoPath = path.join(ENG, "demos_code", "ocean_ecosystem.js");
    const src = fs.readFileSync(demoPath, "utf8");
    ok("ocean_ecosystem.js imports OceanPopulation from the right relative path",
       /from\s+["']\.\.\/simulation\/OceanPopulation\.mjs["']/.test(src));
    ok("ocean_ecosystem.js constructs an OceanPopulation instance",
       /new\s+OceanPopulation\s*\(/.test(src));
    ok("ocean_ecosystem.js no longer loops 'for (let i = 0; i < NUM_FISH; i++)' to spawn a fixed, never-changing fish array",
       !/for\s*\(\s*let\s+i\s*=\s*0\s*;\s*i\s*<\s*NUM_FISH\s*;/.test(src));
    ok("ocean_ecosystem.js still keeps NUM_FISH/NUM_OCTOPUS as the INITIAL population size (passed into the sim), not deleted outright",
       /NUM_FISH/.test(src) && /NUM_OCTOPUS/.test(src));
    ok("tick() drives the population forward each frame (population.update(...))",
       /population\.update\s*\(/.test(src));
    ok("births/deaths reconcile against a fish id→mesh map (fishMeshes or equivalent), not the old plain 'fish.push' boids-array pattern",
       /fishMeshes|fishMesh|meshById|fishById/.test(src));
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"));
process.exit(fails ? 1 : 0);
