#!/usr/bin/env node
// WebGLEngine/render/fireColour-selfcheck.mjs -- v4412
//
// The gate on render/fireColour.mjs: the census of everything in this tree that turns heat into a colour,
// and the one physical condition it is fair to hold the blackbody claimants to.
//
// *** THE PREMISE IS COMPUTED, NOT ASSERTED. *** Every row below rests on Planck's law being monotonically
// increasing in T at fixed wavelength. That is checked first, from H_PLANCK, K_BOLTZ and C_LIGHT out of
// physics/thermal/blackbody.mjs -- because a check resting on an unverified premise is a check resting on
// nothing, and this tree has caught itself doing that before.
//
// *** AND MONOTONICITY IS NECESSARY, NOT SUFFICIENT. *** Passing does not make a ramp the right colour;
// failing makes it not-a-blackbody. No row here claims more than that, because claiming more would need CIE
// colour matching this tree does not have, and inventing the matching functions to fill the gap is exactly
// the "reference value I made up" blackbody.mjs's own header refuses.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { census, channelDrops, planckMonotone, planckRadiance, widestDisagreement, SOURCES,
         doomSample, meshSample, rampSample, infernoSample, INFERNO_STOPS,
         MEASURED_AT_V4412, RGB_WAVELENGTHS } from "./fireColour.mjs";
import { PALETTE } from "./doomFire.mjs";
import { gateReport } from "../tools/ship/gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = gateReport("render/fireColour-selfcheck.mjs");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/* ---------------------------------------------------------------------------------------------------------
 * 1. THE PREMISE.
 * ------------------------------------------------------------------------------------------------------ */
{
    const m = planckMonotone();
    ok("!! *** PLANCK'S LAW IS MONOTONE IN T AT EVERY WAVELENGTH, computed from the tree's own constants ***",
       m.r === true && m.g === true && m.b === true,
       `700nm ${m.r}, 550nm ${m.g}, 450nm ${m.b} over 800..6000 K. HEAT A BODY AND IT RADIATES MORE AT EVERY ` +
       "WAVELENGTH AT ONCE, so a ramp claiming to be a blackbody cannot have a channel that falls. Every row " +
       "below is this fact applied; if it were false none of them would mean anything");

    // ...and the computation is a real one, not a constant returning true: a body radiates more at 550nm
    // than at 700nm only once it is hot enough, which is Wien's peak crossing the visible band.
    const cool = planckRadiance(RGB_WAVELENGTHS.g, 1000) / planckRadiance(RGB_WAVELENGTHS.r, 1000);
    const hot = planckRadiance(RGB_WAVELENGTHS.g, 6000) / planckRadiance(RGB_WAVELENGTHS.r, 6000);
    ok("...and the same function shows the green/red ratio RISING with temperature, which is why fire yellows",
       cool < 0.2 && hot > 1 && hot > cool * 5,
       `green:red radiance ratio ${cool.toExponential(2)} at 1000 K, ${hot.toFixed(2)} at 6000 K. A COOL FIRE ` +
       "IS RED BECAUSE THERE IS ALMOST NO GREEN IN IT, and that is the whole reason a heat ramp climbs from " +
       "red to yellow to white rather than from red to purple");
}

/* ---------------------------------------------------------------------------------------------------------
 * 2. THE CENSUS, PINNED AS VALUES -- because "the DOOM palette is not monotone" would stay green however
 *    much worse it got, and this tree has been caught by that shape before.
 * ------------------------------------------------------------------------------------------------------ */
const rows = census();
{
    ok("*** five sources measured, and each carries what it CLAIMS beside what it MEASURES ***",
       rows.length === MEASURED_AT_V4412.sources && rows.every((r) => typeof r.claims === "string" && r.claims.length > 20),
       `${rows.length} sources: ${rows.map((r) => r.key).join(", ")}. A census that recorded only the numbers ` +
       "would make the DOOM palette look like a failure, when a palette that never claimed to be physics is " +
       "not failing by not being physics");

    for (const r of rows) {
        const want = MEASURED_AT_V4412.drops[r.key];
        ok(`  ${r.key.padEnd(8)} ${r.file}`,
           JSON.stringify(r.drops) === JSON.stringify(want),
           `channel drops R${r.drops[0]} G${r.drops[1]} B${r.drops[2]}, pinned ${JSON.stringify(want)} -- ` +
           (r.blackbodyCandidate ? "HELD TO MONOTONICITY: it claims to be temperature" : "NOT held to it: " + r.claims));
    }

    const claimants = rows.filter((r) => r.blackbodyCandidate);
    ok("!! *** EVERY SOURCE THAT CLAIMS TO BE TEMPERATURE IS MONOTONE IN ALL THREE CHANNELS ***",
       claimants.length === 2 && claimants.every((r) => r.drops.every((d) => d === 0)),
       `${claimants.length} claimants (${claimants.map((r) => r.symbol).join(", ")}), all with zero drops. ` +
       "fx/voxelize/fireRamp.js CALLS ITS FUNCTION blackbodyRamp AND THE NAME IS EARNED ON THIS AXIS, which " +
       "is worth saying because the round began by suspecting it was not");

    const doom = rows.find((r) => r.key === "doom");
    ok("!! ...and the DOOM palette is NOT monotone, which is correct for what it is",
       doom.drops[0] === 5 && doom.drops[1] === 0 && doom.drops[2] === 0,
       `5 RED DROPS across 37 stops, none in green or blue. The 1993 palette climbs from red to yellow by ` +
       "LOWERING RED while raising green -- a hue rotation, which is an artistic choice and a good one, and " +
       "not a blackbody. NOTHING IN THE TREE SAID SO BEFORE THIS FILE");
}

/* ---------------------------------------------------------------------------------------------------------
 * 3. *** THE NAMING TRAP. *** v4144's species: two symbols, one name, opposite meanings.
 * ------------------------------------------------------------------------------------------------------ */
{
    const w = widestDisagreement(rampSample, infernoSample);
    const nc = MEASURED_AT_V4412.nameCollision;
    ok("!! *** THE TWO FUNCTIONS ONCE CALLED fireRamp DISAGREE ABOUT WHETHER COOL FIRE IS RED OR PURPLE ***",
       Math.abs(w.gap - nc.widest.gap) < 5e-4 && Math.abs(w.at - nc.widest.at) < 1e-9 && w.channel === nc.widest.channel,
       `widest single-channel gap ${w.gap.toFixed(4)} in ${w.channel} at h=${w.at}; at that same heat the BLUE ` +
       `channels read ${nc.blueAt02.ramp.toFixed(2)} and ${nc.blueAt02.inferno.toFixed(2)}. THE RED GAP IS THE ` +
       "LARGEST AND THE BLUE GAP IS THE ARGUMENT, which are two different questions -- this record's first " +
       "draft typed 0.30 in blue, read off a sample table by eye, where the measurement says 0.3255 in red");

    const blueDrops = channelDrops(infernoSample, 200)[2];
    ok("...and the Inferno ramp's blue channel FALLS, which no blackbody's does",
       blueDrops === 40,
       `${blueDrops} downward steps in blue across 200 samples. It rises to 0.30 at a fifth of full heat -- ` +
       "the purple -- and then falls away as the ramp reddens. A BLACKBODY'S BLUE ONLY EVER RISES");

    // The restatement is a second declaration ON PURPOSE (a shader string is not callable from Node), so it
    // is held to the source rather than trusted.
    const src = fs.readFileSync(path.join(ENG, "demos_code", "fitzhugh_nagumo.js"), "utf8");
    const stops = [...src.matchAll(/vec3\s+c\d\s*=\s*vec3\(([^)]*)\);/g)]
        .map((m) => m[1].split(",").map((v) => Number(v.trim())));
    const same = stops.length === INFERNO_STOPS.length &&
                 stops.every((s, i) => s.every((v, k) => Math.abs(v - INFERNO_STOPS[i][k]) < 1e-9));
    ok("!! *** and the JS restatement of that shader's stops MATCHES THE SHADER, stop for stop ***",
       same,
       `${stops.length} vec3 stops parsed out of the GLSL against ${INFERNO_STOPS.length} restated here, ` +
       `identical: ${same}. A SHADER STRING CANNOT BE CALLED FROM NODE, so measuring it at all means writing ` +
       "it twice -- and a second declaration nobody checks is the defect this whole round is about");

    ok("!! *** THE GLSL FUNCTION IS NAMED FOR WHAT IT IS: infernoRamp, not fireRamp ***",
       /vec3\s+infernoRamp\s*\(/.test(src) && !/vec3\s+fireRamp\s*\(/.test(src) && !/[^o]fireRamp\s*\(/.test(src),
       "demos_code/fitzhugh_nagumo.js defines infernoRamp and calls it; no definition or call of fireRamp " +
       "remains, only prose naming the old name. THE REPAIR IS THE RENAME -- the ramp was never wrong, its " +
       "name was, and a colormap called fireRamp beside a fireRamp.js that means something else is a trap " +
       "laid for whoever reaches for the wrong one");
}

/* ---------------------------------------------------------------------------------------------------------
 * 4. THE SAMPLERS ARE THE SOURCES, not paraphrases of them.
 * ------------------------------------------------------------------------------------------------------ */
{
    const p0 = PALETTE[0], pN = PALETTE[PALETTE.length - 1];
    ok("*** doomSample reads render/doomFire.mjs's own PALETTE, ends included ***",
       doomSample(0).every((v, i) => Math.abs(v - p0[i] / 255) < 1e-9) &&
       doomSample(1).every((v, i) => Math.abs(v - pN[i] / 255) < 1e-9) && PALETTE.length === 37,
       `h=0 gives [${doomSample(0).map((v) => v.toFixed(2))}] against PALETTE[0], h=1 gives ` +
       `[${doomSample(1).map((v) => v.toFixed(2))}] against PALETTE[36]; ${PALETTE.length} stops`);

    const meshSrc = fs.readFileSync(path.join(ENG, "physics", "fire", "fireMesh.js"), "utf8");
    const coeffs = ["3.2", "0.30", "2.3", "0.72", "4.0"].every((c) => meshSrc.includes(c));
    ok("...and meshSample's coefficients are the ones in physics/fire/fireMesh.js",
       coeffs && Math.abs(meshSample(1)[0] - 1) < 1e-9 && meshSample(0.5)[2] === 0,
       `the five constants 3.2 / 0.30 / 2.3 / 0.72 / 4.0 all appear in makeFireTexture: ${coeffs}. THIS IS A ` +
       "SOURCE SCAN AND IT IS THE WEAK SHAPE -- it says the numbers are there, not that the arithmetic " +
       "around them matches, and that limit is named rather than papered over");
}

REPORT.table("what each source says fire looks like", ["h", "doom R", "doom G", "doom B", "ramp R", "ramp G", "ramp B", "inferno R", "inferno G", "inferno B"],
    [0, 0.2, 0.4, 0.6, 0.8, 1].map((h) => {
        const d = doomSample(h), r = rampSample(h), i = infernoSample(h);
        return [h, ...d.map((v) => +v.toFixed(3)), ...r.map((v) => +v.toFixed(3)), ...i.map((v) => +v.toFixed(3))];
    }), "At h=0.2 the two once called fireRamp read dark red and purple.");
REPORT.table("channel drops per source", ["source", "R", "G", "B", "held to monotonicity"],
    rows.map((r) => [r.key, r.drops[0], r.drops[1], r.drops[2], r.blackbodyCandidate ? "yes" : "no"]),
    "Zero drops is the necessary condition Planck imposes. It is not a sufficient one.");
REPORT.write();

console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM. That any ramp here IS the colour of a blackbody at some");
console.log("  ----  temperature: that needs CIE colour matching this tree does not have, and monotonicity is");
console.log("  ----  a NECESSARY condition only. That the DOOM palette or the Inferno colormap should change --");
console.log("  ----  both are good at what they are, and the repair was a NAME. That the six fires were");
console.log("  ----  compared as fires: a cellular automaton, a ray-marched volume and a voxel spread rule");
console.log("  ----  share no axis but this one, and the spread rules are still uncompared. And that");
console.log("  ----  demos_code/ is now scanned -- it is still outside staleness.mjs's SKIP, which is how one");
console.log("  ----  name meant two things for 4,412 versions, and widening that scan is its own round.");
if (fails) { console.log("fireColour-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("fireColour-selfcheck: all checks pass");
