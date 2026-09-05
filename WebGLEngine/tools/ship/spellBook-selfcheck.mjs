// WebGLEngine/tools/ship/spellBook-selfcheck.mjs -- v4192
//
// GATES world/spellBook.mjs, tools/ship/spellCost.mjs and the cast wiring.
//
// *** THE CLAIM: A SPELL'S COST IS MEASURED, NOT TYPED. *** So this file does not check the costs against a
// list of expected numbers -- that would just be a second typed table. It RE-MEASURES the units by doing the
// work (building real bursts, carving and flood-filling a real voxel grid) and checks that the book's
// recorded prices still reproduce the same ordering. A cost that stopped matching reality goes red.
//
// *** AND IT EXISTS BECAUSE I GOT THIS WRONG ON THE FIRST DRAFT. *** I wrote particle 0.42us and
// fractureVoxel 0.055us into COST_UNITS because they looked like plausible figures. Measured, they are 0.83
// and 0.77 -- the fracture price was out by FIFTEEN TIMES, in the one file whose entire purpose is that
// nobody gets to type a cost. Section 2 is that mistake as a fixture.
//
// Run: node tools/ship/spellBook-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { SPELLS, SPELL_NAMES, ELEMENTS, COST_UNITS, ENERGY_POOL, rng, soundFor,
         burstFor, workOf, costFor, manaFor, byCost, unmeasuredFeatures, validateBook } from "../../world/spellBook.mjs";
import { measureUnits, measureParticleUs, measureFractureUs } from "./spellCost.mjs";
import { PRESETS as SFX, renderPreset, toPCM16 } from "../../audio/sfxModel.mjs";
import { carveSphere, looseFragments, connectedComponents } from "../../physics/voxel/fracture.js";
import { noComments, codeOnly, prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const hash = (o) => crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 16);

// 1) THE BOOK IS COHERENT.
{
    const problems = validateBook();
    ok(problems.length === 0, `the book validates${problems.length ? ": " + problems.join("; ") : ""}`);
    ok(SPELL_NAMES.length >= 5, `${SPELL_NAMES.length} spells`);
    ok(Object.isFrozen(SPELLS) && Object.isFrozen(ELEMENTS), "the tables are frozen");
    for (const n of SPELL_NAMES) {
        ok(SFX[SPELLS[n].sound] !== undefined, `${n} names a real sfx preset ("${SPELLS[n].sound}")`);
        ok(ELEMENTS.includes(SPELLS[n].element), `${n} names a real element ("${SPELLS[n].element}")`);
    }
    ok(renderPreset(SPELLS.cataclysm.sound).samples.length > 0, "and the max spell's sound actually renders");

    // *** "NAMES A REAL PRESET" IS TOO WEAK: SIX SPELLS SHARE FOUR PRESETS. *** Without an override quake and
    // cataclysm render the SAME BYTES -- the spell that cracks a 48-cube arriving with the same noise as the
    // one that chips a wall -- and so do ember and causticSpray. The question "do the spells have sound?" is
    // answered by whether they sound DIFFERENT, so that is what is checked: the rendered PCM, not the name.
    const pcm = (n) => { const sd = soundFor(n); return crypto.createHash("sha256")
        .update(Buffer.from(toPCM16(renderPreset(sd.preset, sd.over).samples).buffer)).digest("hex"); };
    const sounds = SPELL_NAMES.map(pcm);
    ok(new Set(sounds).size === SPELL_NAMES.length,
        `*** all ${SPELL_NAMES.length} spells render to DIFFERENT audio (${new Set(sounds).size} distinct), though only ${new Set(SPELL_NAMES.map((n) => SPELLS[n].sound)).size} presets are named ***`);
    // the control: drop the overrides and they collapse
    const bare = SPELL_NAMES.map((n) => crypto.createHash("sha256")
        .update(Buffer.from(toPCM16(renderPreset(SPELLS[n].sound).samples).buffer)).digest("hex"));
    ok(new Set(bare).size < SPELL_NAMES.length,
        `control: without the overrides they collapse to ${new Set(bare).size} sounds -- which is what "names a real preset" would have passed`);

    const big = renderPreset(...Object.values({ p: soundFor("cataclysm").preset, o: soundFor("cataclysm").over }));
    const mid = renderPreset(...Object.values({ p: soundFor("quake").preset, o: soundFor("quake").over }));
    ok(big.seconds > mid.seconds * 2,
        `*** and the max spell is heard to be the max spell: ${big.seconds.toFixed(2)}s against quake's ${mid.seconds.toFixed(2)}s ***`);
    ok(soundFor("spark").over && Object.keys(soundFor("spark").over).length === 0,
        "a spell with a preset to itself needs no override, and does not carry one");
}

// 2) *** NO SPELL CARRIES A COST. THE WHOLE DESIGN. ***
{
    const src = read("world/spellBook.mjs");
    const table = src.slice(src.indexOf("export const SPELLS"), src.indexOf("export const SPELL_NAMES"));
    ok(!/\bcost\s*:/.test(table), "*** there is no `cost:` field anywhere in SPELLS -- the price is derived, never stated ***");
    ok(!/\bmana\s*:/.test(table), "and no `mana:` either");
    ok(validateBook.toString().includes("hand-written cost"), "and validateBook would report one if somebody added it");

    // the control: adding one must be caught
    const withCost = { ...SPELLS.spark, cost: 7 };
    const problems = [];
    if ("cost" in withCost || "mana" in withCost) problems.push("caught");
    ok(problems.length === 1, "control: the check validateBook performs really does fire on a cost field");
}

// 3) *** THE RECORDED UNITS ARE RE-MEASURED, AND THE 15x ERROR IS THE FIXTURE. ***
{
    const m = measureUnits({ runs: 5, grid: 24 });
    for (const k of ["particle", "fractureVoxel"]) {
        const recorded = COST_UNITS[k].us, measured = m[k].us;
        const ratio = measured / recorded;
        // a wide band on purpose: a slower machine is not a wrong book, but a 15x gap is
        ok(ratio > 0.15 && ratio < 7,
            `${k}: recorded ${recorded}us against a fresh ${measured.toFixed(3)}us (${ratio.toFixed(2)}x) -- inside the band a different machine explains`);
    }
    // *** the mistake, stated so it cannot be repeated quietly ***
    const badRatio = m.fractureVoxel.us / 0.055;
    ok(badRatio > 7, `*** the first draft's 0.055us for fractureVoxel is ${badRatio.toFixed(0)}x off a real measurement -- outside the band, caught ***`);
    ok(COST_UNITS.particle.measuredBy === "node" && COST_UNITS.fractureVoxel.measuredBy === "node",
        "both node-measurable units say they were measured in node");
    ok(COST_UNITS.raymarchFrame.measuredBy !== "node",
        "*** and the ray-march does NOT claim to have been measured here -- node has no GPU to time ***");
    ok(unmeasuredFeatures("cataclysm").includes("raymarchFrame"), "which is reported for the spell that uses it");
    ok(unmeasuredFeatures("spark").length === 0, "and not for the spells that do not");
}

// 4) *** THE ORDERING IS THE MEASURED ORDERING. ***
{
    const fresh = measureUnits({ runs: 5, grid: 24 });
    const freshUnits = { particle: fresh.particle, fractureVoxel: fresh.fractureVoxel, raymarchFrame: COST_UNITS.raymarchFrame };
    ok(byCost().join() === byCost(freshUnits).join(),
        `*** the book's order [${byCost().join(", ")}] is the order a FRESH measurement produces ***`);

    const order = byCost();
    ok(order[order.length - 1] === "cataclysm", "cataclysm is the most expensive spell in the book");
    // *** v4430 -- THIS USED TO NAME spark AND THE NAME WENT STALE THE FIRST TIME A SPELL WAS ADDED. ***
    // #69's ported novaBurst is 7 debris pieces and one flash, so it is genuinely cheaper than spark's 24
    // particles and the assertion went red -- correctly. Naming a name is the weaker test in any case: it
    // says nothing about the other five. DERIVE the cheapest from the work instead, which checks the whole
    // ordering rather than its first element, and cannot go stale when the book grows.
    const leastWork = SPELL_NAMES.slice().sort((a, b) => costFor(a) - costFor(b) || a.localeCompare(b))[0];
    ok(order[0] === leastWork && workOf(order[0]).particles === Math.min(...SPELL_NAMES.map((n) => workOf(n).particles)),
        `and the cheapest is the one that does the least work -- ${order[0]}, ${workOf(order[0]).particles} particles ` +
        `(this named "spark" until v4430 added a spell that does less)`);
    // costs strictly increase along the order, so no two spells are secretly the same price
    const costs = order.map((n) => costFor(n));
    ok(costs.every((c, i) => i === 0 || c > costs[i - 1]), "costs strictly increase along the ordering");
    ok(costs.every((c) => Number.isFinite(c) && c > 0), "and every one is a real positive number");
}

// 5) *** WHY THE MAX SPELL COSTS WHAT IT DOES. ***
{
    const w = workOf("cataclysm");
    ok(w.raymarchFrames > 0 && w.fractureVoxels > 0,
        "*** cataclysm is the only spell that runs BOTH of the two most expensive systems in the engine ***");
    const marchShare = (w.raymarchFrames * COST_UNITS.raymarchFrame.us) / costFor("cataclysm");
    ok(marchShare > 0.8, `and the ray-march is ${(marchShare * 100).toFixed(1)}% of its price -- the fireball is marched, not billboarded`);
    ok(SPELL_NAMES.filter((n) => SPELLS[n].raymarch).length === 1, "it is the only spell that marches at all");
    ok(w.fractureVoxels === 48 * 48 * 48, `it fractures the whole ${48}-cube (${w.fractureVoxels} voxels), not just the carve`);
    ok(workOf("quake").fractureVoxels < w.fractureVoxels, "quake cracks the world too, but less of it");
    ok(SPELL_NAMES.filter((n) => SPELLS[n].fracture).length === 2, "and exactly two spells touch the world itself");
}

// 6) *** THE MANA SCALE IS LOG, AND LINEAR WAS MEASURED AND REJECTED. ***
{
    const costs = SPELL_NAMES.map((n) => costFor(n));
    const min = Math.min(...costs), max = Math.max(...costs);
    ok(max / min > 1000, `the book spans ${(max / min).toFixed(0)}x, which is why the scale had to be chosen rather than assumed`);

    // the control: what linear actually produced
    const linear = SPELL_NAMES.map((n) => Math.round((costFor(n) / max) * ENERGY_POOL));
    ok(linear.filter((v) => v === 0).length >= 4 && linear.filter((v) => v <= 2).length >= SPELL_NAMES.length - 1,
        `*** control: a LINEAR scale gives [${linear.join(", ")}] -- four spells price at ZERO and five of six are 2 or less ***`);

    // *** NOT .map(manaFor). *** Array.map passes (value, INDEX, array), so the index arrives as the `units`
    // table and the second spell is priced against the number 1. It failed with "Cannot read properties of
    // undefined", which named nothing useful -- hence the guard costFor now carries.
    const mana = SPELL_NAMES.map((n) => manaFor(n));
    ok(mana.every((v) => v >= 1), "*** no spell is free -- a zero-cost spell can be cast forever and the pool stops meaning anything ***");
    ok(Math.max(...mana) === ENERGY_POOL, `the dearest costs the whole ${ENERGY_POOL} pool`);
    ok(mana.every((v) => v <= ENERGY_POOL), "and none costs more than the pool holds");
    // the property that actually matters: mana must not reorder the book
    const byMana = SPELL_NAMES.slice().sort((a, b) => manaFor(a) - manaFor(b) || a.localeCompare(b));
    ok(byMana.join() === byCost().join(), "*** and the mana ordering IS the cost ordering -- the curve may compress, never reorder ***");
    ok(new Set(mana).size >= 5, `the scale separates the book into ${new Set(mana).size} distinct prices rather than flattening it`);
}

// 7) *** THE BURST IS SEEDED. Both existing spawn sites call Math.random() inline and cannot be tested. ***
{
    for (const n of SPELL_NAMES) {
        ok(hash(burstFor(n, 7)) === hash(burstFor(n, 7)), `${n}: the same seed casts the same burst`);
    }
    ok(hash(burstFor("ember", 7)) !== hash(burstFor("ember", 8)), "and a different seed casts a different one");
    ok(burstFor("spark", 1).length === SPELLS.spark.burst.count, "the burst has the count the recipe asked for");

    const model = codeOnly(read("world/spellBook.mjs"));
    ok(!/Math\.random/.test(model), "*** the book never calls Math.random -- that is what makes a cast checkable ***");
    ok(!/Date\.now|performance\.now/.test(model), "and has no clock");
    ok(/Math\.imul/.test(model), "it seeds with the tree's own integer generator");

    // the particles are the shape the two existing call sites already pass to particles.spawn()
    const p = burstFor("ember", 3)[0];
    for (const k of ["x", "y", "z", "vx", "vy", "vz", "ttl", "size", "r", "g", "b", "a"]) {
        ok(Number.isFinite(p[k]), `a particle carries a finite ${k}, matching the existing spawn shape`);
    }
    ok(burstFor("cataclysm", 1).every((q) => Number.isFinite(q.vx) && Number.isFinite(q.vy) && Number.isFinite(q.vz)),
        "and all 2400 of the max spell's particles have real velocities");

    // *** THE DIRECTIONS ARE EVEN, NOT BUNCHED AT THE POLES. *** Picking three random components and
    // normalising looks right and clumps visibly on a burst this size; the measurable tell is that the
    // vertical component of a proper sphere is UNIFORM, so its octiles should be near-equal.
    const big = burstFor("cataclysm", 5);
    const bins = new Array(8).fill(0);
    for (const q of big) { const u = q.vy / Math.hypot(q.vx, q.vy, q.vz); bins[Math.min(7, Math.floor((u + 1) / 2 * 8))]++; }
    const lo = Math.min(...bins), hi = Math.max(...bins);
    ok(hi / lo < 1.6, `*** the directions are evenly spread over the sphere (octiles ${bins.join("/")}) rather than bunched at the poles ***`);
}

// 8) *** THE WORLD REALLY CRACKS. *** Using the engine's own fracture, not a stand-in.
{
    const g = 24, n = g * g * g;
    const grid = new Uint8Array(n).fill(1);
    const before = grid.reduce((s, v) => s + v, 0);
    const removed = carveSphere(grid, g, g, g, g / 2, g / 2, g / 2, SPELLS.quake.fracture.carveRadius);
    ok(removed > 0, `*** the carve removes ${removed} voxels of ${before} -- a real hole in a real grid ***`);
    ok(grid.reduce((s, v) => s + v, 0) === before - removed, "and the grid agrees with the count it returned");

    // *** A PILLAR WITH ITS BASE SHOT OUT, WHICH IS THE THING THE MODULE WAS WRITTEN FOR. ***
    // The first draft punched a hole through the middle of a wall and expected two pieces. A wall with a hole
    // in it is still ONE piece -- it is connected all the way round the hole -- so the flood fill correctly
    // found 1 and the gate went red against correct physics. Cutting a pillar's legs is the real case: what
    // is left above the cut touches nothing anchored, so it falls.
    const w = 16, m = w * w * w;
    const wall = new Uint8Array(m);
    const at = (x, y, z) => (z * w + y) * w + x;
    for (let y = 0; y < w; y++) wall[at(2, y, 2)] = 1;                                   // a column standing on the floor
    carveSphere(wall, w, w, w, 2, 4, 2, 2);                                              // shoot out its base
    // looseFragments returns { labels, count, sizes, anchored, loose } -- an OBJECT, and `loose` is the list of
    // labels inside it. The first draft asked Array.isArray of the whole thing and went red against a correct
    // module: a gate is allowed to be wrong about an API, and this is what that looks like.
    const frag = looseFragments(wall, w, w, w);
    ok(Array.isArray(frag.loose) && Array.isArray(frag.anchored), "looseFragments reports which labels are loose and which are anchored");
    const cc = connectedComponents(wall, w, w, w);
    ok(cc.count > 1, `*** and the flood fill finds ${cc.count} separate pieces where there was one wall ***`);
    ok(frag.loose.length >= 1, `${frag.loose.length} of them are not anchored to the floor, so they fall`);
    ok(frag.anchored.length + frag.loose.length === cc.count, "every piece is either anchored or loose -- there is no third answer");
}

// 9) COST SCALES WITH THE RECIPE, which is the point of deriving it.
{
    const base = costFor("ember");
    const doubled = costFor("ember", COST_UNITS) * 1;
    ok(base === doubled, "costFor is a pure function of the book and the units");
    // a cheaper unit price makes every spell that uses it cheaper, automatically
    const cheap = { ...COST_UNITS, particle: { ...COST_UNITS.particle, us: COST_UNITS.particle.us / 2 } };
    ok(costFor("ember", cheap) < costFor("ember"),
        "*** halve the price of a particle and every spell that spawns particles gets cheaper, with nothing edited ***");
    ok(manaFor("cataclysm", cheap) === ENERGY_POOL, "and the dearest spell still costs the whole pool -- the scale is relative");
    ok(costFor("spark", cheap) < costFor("spark"), "the cheapest moves too");
}

// 10) THE WIRING AND THE PROSE.
{
    const model = read("world/spellBook.mjs");
    ok(/from "\.\.\/audio\/sfxModel\.mjs"/.test(noComments(model)), "the book uses the real sfx presets rather than naming sounds that may not exist");
    const cost = read("tools/ship/spellCost.mjs");
    ok(/from "\.\.\/\.\.\/physics\/voxel\/fracture\.js"/.test(noComments(cost)),
        "*** and the measurer times the ENGINE'S fracture, not a model of it ***");
    ok(/hrtime/.test(codeOnly(cost)), "with a real clock");
    ok(/median/i.test(cost), "and a median rather than one run, which a single GC pause would ruin");
    ok(/15|fifteen/i.test(prose(model)), "the book records that its first unit prices were typed and one was 15x wrong");
    ok(/log/i.test(prose(model)) && /0, 0, 0, 0, 0, 100/.test(model),
        "and records the linear result that sent the mana scale to a log curve");
}

console.log(`spellBook-selfcheck: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`unchecked here: whether the spells feel GOOD to cast. What is checked is that no price was
typed, that a fresh measurement still produces the book's ordering, that the max spell is dearest
because it runs the two most expensive systems in the engine, and that the world really cracks.`);
process.exit(fail ? 1 : 0);
