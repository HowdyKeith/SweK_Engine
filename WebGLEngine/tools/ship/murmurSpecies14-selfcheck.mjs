// WebGLEngine/tools/ship/murmurSpecies14-selfcheck.mjs -- v4640
//
// GATE FOURTEEN OVER THE SPECIES: PRISM, the seventeenth of murmur's eighteen. "Light entering the glass and
// softly splitting inside it."
//
// *** THE ENTRY POINT IS THE SPECIES' ONE NON-NEGOTIABLE. *** prism.ts: "The shafts begin where the specular
// highlight is, because that is where the picture already says the light is coming from, and a prism whose
// beams enter somewhere else is a prism nobody believes for a second. mh_key is a shared function for exactly
// this reason: the highlight and the entry point read the same direction, including its slow drift."
//
// Its sibling helix is graded in tools/ship/murmurSpecies15-selfcheck.mjs. They are the last two, and they
// are the two MARCHED heroes left after four rounds of solved interiors.
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { N3, sp, renderSpecies, light, interiorPeak } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies14-selfcheck -- prism's three shafts, and the plane its fan opens in\n");

const DIM = 0.15;
const BASE = { glint: 0, density: 0.5, fold: 0.5, spread: 0, glow: DIM, glintRate: 0,
               layers: 0.5, parallax: 0.5, murk: 0.4, facet: 0.5, glim: 0.5, stone: 0.5,
               bow: 0.5, sway: 0.5, pin: 0.5, corona: 0.5, prom: 0.5, simmer: 0.5,
               ribbon: 0.5, swirl: 0.5, depth3d: 0.5, stream: 0.5, bend: 0.5, height: 0.5,
               sep: 0.5, orbit: 0.5, ratio: 0.5, voices: 0.5, sync: 0.5, breath: 0.5,
               beams: 0.5, split: 0.5, swing: 0.5, turns: 0.5, rise: 0.5, strand: 0.5 };
const PZ = (t, extra = {}) => sp("prism", t, 0.0, { ...BASE, ...extra });
const T = 5.0;

const FRAMES = [PZ(T, { split: 0.0 }), PZ(T, { split: 1.0 }),
                PZ(T, { beams: 0.0 }), PZ(T, { beams: 1.0 })];
const F = { sLo: 0, sHi: 1, bLo: 2, bHi: 3 };
const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames"}`);
const fr = (i) => run.frames[i];
const totalLight = (px) => { let s = 0; for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) s += light(px, x, y); return s; };

// =============================================================================================================
sec("1. *** THE FAN OPENS ACROSS THE SCREEN AND NOT INTO IT -- by construction, and the algebra says so ***");
{
    // prism.ts: "THE FAN MUST OPEN ACROSS THE SCREEN, NOT INTO IT. Taking u1 as the cross of the axis with
    // the view direction puts it in the screen plane by construction, so the fan is always seen side-on and
    // the split is always visible. u2 is then the depth direction, used only for the small wobbles that keep
    // the beams from being coplanar."
    //
    // *** THAT IS AN ALGEBRAIC CLAIM, SO IT IS CHECKED ALGEBRAICALLY, IN THE CPU TWIN, AT EVERY TIME AND
    // SWING RATHER THAN AT ONE. *** cross(axis, (0,0,1)) is (axis.y, -axis.x, 0): its z component is
    // identically zero whatever the axis does, so u1 lies in the screen plane exactly -- and its dot with the
    // axis's own screen projection is zero for the same reason. A pixel measurement of this would be a
    // measurement of the frame's resolution; the constants are where the claim lives.
    const P = K.MH_PRISM;
    let worst = 0, worstAt = 0, n = 0;
    for (let t = 0; t < 200; t += 0.37) for (const swing of [0, 0.5, 1]) {
        const sw = K.mhDrift(t, P.swRate + swing * P.swRateK, P.swWob, P.swLane);
        const k = K.mhKey(t);
        const j = P.entryJitter + swing * P.entryJitterK;
        const o = [k[0] + j * Math.sin(sw), k[1] + j * Math.cos(sw * 0.83), k[2] + j * Math.sin(sw * 0.61)];
        const on = Math.hypot(...o), O = o.map((v) => v / on * P.entryR);
        const ax = [P.aim[0] - O[0], P.aim[1] - O[1], P.aim[2] - O[2]];
        const an = Math.hypot(...ax), A = ax.map((v) => v / an);
        const u1 = [A[1] + 1e-4, -A[0], 0], u1n = Math.hypot(...u1), U = u1.map((v) => v / u1n);
        const axy = Math.hypot(A[0], A[1]);
        const d = Math.abs((A[0] / axy) * U[0] + (A[1] / axy) * U[1]);
        n++; if (d > worst) { worst = d; worstAt = t; }
    }
    say(`over ${n} (time, swing) samples the worst |dot(axis_on_screen, fan_on_screen)| is ` +
        `${worst.toExponential(3)}, at t=${worstAt.toFixed(2)}`);

    // *** AND THIS ROW GRADES THE CONSTANTS, NOT THE SHADER, WHICH A SABOTAGE HAD TO TELL ME. *** It is
    // computed here in JS from MH_PRISM and mhKey; it never renders anything. So swapping u1 and u2 in
    // render/aiPresenceOrbTsl.mjs -- making the fan open INTO the screen, the exact failure prism.ts names --
    // walks straight through it, and so does replacing the entry point with a fixed direction. Both were
    // tried; both stayed green. That is the v4579 defect in a new costume: a check that re-derives the answer
    // rather than reading the subject.
    //
    // IT IS KEPT, RE-TITLED, because the claim it does make is true and worth holding: the TABLE supports a
    // perpendicular fan, and if somebody edits MH_PRISM.aim into the body's centre this goes red. What it
    // does not do is check that the shader still uses the table that way -- and three pixel instruments were
    // built to close that gap and none of them separated the sabotage from the baseline (the numbers are in
    // the closing note). So the gap is named here rather than papered over.
    ok("!! MH_PRISM's CONSTANTS SUPPORT A PERPENDICULAR FAN at every time and swing -- the TABLE, not the shader",
        worst < 2e-4 && n >= 500,
        `the largest departure from exactly perpendicular across ${n} samples is ${worst.toExponential(3)} -- ` +
        `and it is not error, it is the shader's own guard: u1 is normalize(cross(axis, viewDir) + ` +
        `(1e-4, 0, 0)), and that epsilon exists so the cross product cannot be zero when the axis happens to ` +
        `point straight at the eye. Take the epsilon away and this reads exactly 0. THE CLAIM IS CHECKED ` +
        `WHERE IT LIVES: cross(axis, (0,0,1)) is (axis.y, -axis.x, 0), whose z is identically zero, so the ` +
        `fan lies in the screen plane whatever the key does -- and the key DRIFTS, which is why this runs ` +
        `over two hundred seconds of it rather than over one frame. *** WHAT THIS ROW CANNOT SEE is the ` +
        `shader choosing to use u2 instead of u1: it reads the constants and computes, it does not render. ` +
        `Two sabotages proved that by passing. ***`);
}

// =============================================================================================================
sec("2. *** TWO KNOBS, AND THEY MOVE THE LIGHT IN OPPOSITE DIRECTIONS ***");
{
    if (!okRun) { ok("!! prism rendered", false, "no frames"); }
    else {
        const s0 = totalLight(fr(F.sLo)), s1 = totalLight(fr(F.sHi));
        const b0 = totalLight(fr(F.bLo)), b1 = totalLight(fr(F.bHi));
        say(`split 0 -> 1: ${s0.toFixed(2)} -> ${s1.toFixed(2)} (${((s1 / s0 - 1) * 100).toFixed(0)}%); ` +
            `beams 0 -> 1: ${b0.toFixed(2)} -> ${b1.toFixed(2)} (+${((b1 / b0 - 1) * 100).toFixed(0)}%); ` +
            `peaks ${interiorPeak(fr(F.sLo))} / ${interiorPeak(fr(F.bHi))} of 765`);

        // `split` is the fan's half-angle and `beams` is the shafts' width. Opening the fan swings the outer
        // two beams toward the wall, so they leave the body sooner and the alpha window closes on them
        // earlier: LESS light. Widening the shafts puts more medium inside each: MORE light. The two knobs
        // are therefore separable by SIGN, which no single-frame brightness bound could show and which a
        // port that had wired one knob to the other's quantity would fail immediately.
        ok("!! *** `split` TAKES LIGHT AWAY AND `beams` ADDS IT -- opposite signs, so neither is the other ***",
            s1 < s0 * 0.92 && b1 > b0 * 1.25,
            `opening the fan from ${K.MH_PRISM.divB} to ` +
            `${(K.MH_PRISM.divB + K.MH_PRISM.divK).toFixed(2)} rad takes the frame's light DOWN ` +
            `${((1 - s1 / s0) * 100).toFixed(0)}%, because the outer shafts swing toward the wall and the ` +
            `alpha window (${K.MH_PRISM.alphaOut[0]} to ${K.MH_PRISM.alphaOut[1]} along the beam) closes on ` +
            `them sooner; widening the shafts from ${K.MH_PRISM.w0B} to ` +
            `${(K.MH_PRISM.w0B + K.MH_PRISM.w0K).toFixed(3)} takes it UP ${((b1 / b0 - 1) * 100).toFixed(0)}%. ` +
            `A ROW ON EITHER ALONE WOULD BE A BRIGHTNESS BOUND; the pair is a statement about which knob is ` +
            `which, and it is the sign rather than the size that carries it.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nPRISM: three shafts entering where the specular highlight is -- the same mh_key the surface reads -- " +
    "aimed away from the centre so they cross the body nearly in the screen plane, fanning in a direction " +
    "that is perpendicular to their own axis on screen by construction rather than by luck." +
    "\n*** TWO SABOTAGES WALKED THROUGH SECTION 1 AND THE ROW WAS RE-TITLED RATHER THAN WEAKENED. *** " +
    "Swapping u1 and u2 in the shader -- the fan opening INTO the screen, the failure prism.ts names -- and " +
    "replacing the mh_key entry with a fixed direction both left it green, because it is computed from the " +
    "constants in this file's own JS and never renders. It now says so in its own title. FOUR PIXEL " +
    "INSTRUMENTS WERE BUILT TO CLOSE THAT GAP AND NONE SEPARATED: the lit spread along the CPU-computed fan " +
    "direction reads 1.071 of the spread along the axis at baseline and 1.218 with the fan turned into the " +
    "screen -- the wrong way and the wrong size -- because turning the fan into the screen mostly DIMS the " +
    "frame (0.1717 to 0.0882 along the axis) rather than narrowing it across. A row on total light would " +
    "catch that particular sabotage while claiming nothing about perpendicularity, which is worse than an " +
    "honest gap. THE GAP IS REAL AND IT IS NAMED: prism's fan geometry is graded in its constants and not in " +
    "its pixels." +
    "\n*** WHAT THIS GATE TRIED TO MEASURE AND COULD NOT, with the numbers, so nobody repeats the attempt. *** " +
    "THE FAN'S WIDTH IN PIXELS. Three instruments were built. The lit region's spread along its own principal " +
    "axis moved the wrong way (elongation 3.96 to 4.80 as the fan opened); its spread in x and y moved the " +
    "wrong way too (sx 2.88 to 2.32), because neither axis is aligned with a fan that runs diagonally; and a " +
    "profile taken across the CPU-computed fan direction came back nearly identical at split 0.0, 0.5 and " +
    "1.0, which is a registration failure in the probe rather than in the shader -- the same two frames " +
    "differ by 18% of total light, so the knob plainly reaches the pixels. Section 2 measures that reach by " +
    "its SIGN instead. A width in pixels wants the frame size …Species15 pays for, and it wants a probe " +
    "registered against the entry point rather than the frame centre." +
    "\nWHAT IS NOT CLAIMED HERE: helix, its sibling from the same round " +
    "(tools/ship/murmurSpecies15-selfcheck.mjs), duet and chorus (…Species12 and …Species13), and everything " +
    "named in those. WITH THESE TWO, ALL EIGHTEEN OF murmur's SPECIES ARE PORTED.");
process.exit(fails ? 1 : 0);
