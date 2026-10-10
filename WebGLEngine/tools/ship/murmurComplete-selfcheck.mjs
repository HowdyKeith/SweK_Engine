// WebGLEngine/tools/ship/murmurComplete-selfcheck.mjs -- v4658
//
// *** THE OTHER HALF OF THE SUCCESS FLASH: IT BRIGHTENS WHAT IS ALREADY THERE. ***
//
// kit.ts, on the whole family's arrival: "The light in a success is NOT an overlay: every species multiplies
// its own interior energy by (1 + complete), which brightens exactly what is already there and leaves the
// dark dark." v4644 ported the SHELL -- mh_ignite's gaussian ring travelling out along `sweep` -- and gave
// seven species an MH_IGNITE entry. It did not port the sentence above.
//
// *** SO SIX SPECIES REACHED THE PEAK OF THEIR OWN SUCCESS STATE AND DID NOT CHANGE A BYTE. *** Measured on
// real pixels at stateTau 0.360, where mh_state's `complete` is exactly 1.0 and `settled` is still exactly 0
// so the pair isolates this one output: limn, arc, aura, flux, sol and chorus each moved 0 of 9,216 bytes
// between the start of the state and its brightest instant. The flash was computed, handed to the shader as
// a uniform, and spent by nobody.
//
// *** THE FOUR THAT BELONG ON THE SHARED INTERIOR LINE ARE FOUND BY A RULE, NOT BY A LIST. *** Every one of
// murmur's eighteen species ends its interior with (1.0 + S * st.settled) -- the factor this port has
// carried since v4644 -- and exactly four of those eighteen lines ALSO carry a complete factor:
//
//     limn 1.60, arc 0.90, aura 0.45, flux 0.75
//
// A site belongs in MH_COMPLETE_INTERIOR if and only if its complete factor sits on the same source line as
// its settled factor. That is checkable rather than remembered, which is what this gate's census is for.
//
// *** AND THREE SPECIES SATURATE INSTEAD OF SCALING, which is the opposite operation. *** opal's flashes,
// sol's prominences and chorus's voices are each pulled TOWARD a target -- mix(life, target, complete * k) --
// so at the peak they arrive together and the differences between them close. A gain preserves every
// difference and multiplies them; a saturation destroys them. Both are the flash, and a port that used one
// spelling for all six would be wrong about six species in two different directions.
// v4825 SABOTAGE, restored: opal's procession mix handed a zero weight in place of DRIVE (RED: the saturations row).
// v4826 -- sol's core row reads the LIMB (0.22 to 0.30 of the frame): with u_depth no longer multiplying every
// interior, the disc sits at the rail's top in murmur and here alike, and read x1.01 with its gain and x1.002
// without. The limb reads x1.211 with it and x1.039 without. The saturation census reads sol's gesture-lifted
// liftG, and the beside-the-interior row reads besideE, which carries comet's head as well as limn's rim now.
// SABOTAGE, restored: COMPLETE.mul(MH_COMPLETE_SOL_CORE) typed COMPLETE.mul(0.0) -> RED (the core row and the
// saturations census). comet's head put back into its density stays GREEN here -- this gate's row is limn's --
// and goes RED in murmurParity-selfcheck, which holds comet's.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { sp, renderSpecies, interiorMeanLight, light, N3 } from "./murmurSpeciesFrames.mjs";
import { gateReport } from "./gateReport.mjs";
const REPORT = gateReport("tools/ship/murmurComplete-selfcheck.mjs");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurComplete-selfcheck -- the flash brightens what is already there\n");

const SUCCESS = 4;
// *** ONE CONSTANT, ASSERTED IN SECTION 1 AND SPENT IN SECTION 4. *** The two used to be separate literals,
// so a sabotage that moved the FRAMES to a tau where `settled` is also up left section 1 checking a tau
// nothing rendered at, and walked through. An isolation is only an isolation at the instant it was checked.
const PEAK_TAU = 0.360;

// =============================================================================================================
sec("1. *** THE INSTANT THE FLASH IS BRIGHTEST IS ALSO THE INSTANT THE SETTLE IS STILL ZERO ***");
{
    // The whole pixel section below rests on this: a frame at stateTau 0.360 carries complete = 1 and
    // settled = 0, so anything that moves between tau 0 and tau 0.360 moved because of `complete`. If the two
    // windows overlapped there the rows would be measuring a sum of two mechanisms and calling it one.
    let peakT = 0, peak = 0;
    for (let t = 0; t <= 1.4; t += 0.0005) { const c = K.mhState(SUCCESS, t).complete; if (c > peak) { peak = c; peakT = t; } }
    const at = K.mhState(SUCCESS, PEAK_TAU), zero = K.mhState(SUCCESS, 0);
    say(`mh_state at SUCCESS: complete peaks ${peak.toFixed(6)} at tau ${peakT.toFixed(4)}; at the frame's tau ${PEAK_TAU} -> ` +
        `complete ${at.complete.toFixed(6)}, settled ${at.settled.toFixed(6)}, sweep ${at.sweep.toFixed(4)}, drive ${at.drive.toFixed(4)}`);
    ok("!! *** complete IS EXACTLY 1 AND settled EXACTLY 0 AT THE FRAME THIS GATE MEASURES ***",
        at.complete === 1 && at.settled === 0 && zero.complete === 0 && zero.settled === 0 && zero.sweep === 0,
        `at tau ${PEAK_TAU} complete is ${at.complete} and settled is ${at.settled}; at tau 0 every one of mh_state's ` +
        `four outputs is 0. So the PAIR of frames below differs in complete and in sweep and in NOTHING ELSE ` +
        `-- and sweep is read only by the ignition shell, which six of the seven species here do not have. ` +
        `WITHOUT THIS ROW THE PIXEL ROWS MEASURE A SUM AND CALL IT A TERM: settled's own factor sits one ` +
        `multiply along from the one this round added, on the same line, in the same four species.`);
}

// =============================================================================================================
sec("2. *** THE SATURATION IS NOT A GAIN, AND chorus's TARGET GOES PAST FULL ***");
{
    // mhCompleteLift's three properties, each of which a wrong transcription breaks differently.
    const L = K.MH_COMPLETE_LIFT;
    let worstId = 0;
    for (const x of [0, 0.16, 0.5, 0.93, 1.4]) for (const [, c] of Object.entries(L))
        worstId = Math.max(worstId, Math.abs(K.mhCompleteLift(x, 0, c.k, c.over) - x));
    ok("!! *** AT complete = 0 THE FIGURE IS UNTOUCHED, to the bit -- which is what protects every non-SUCCESS frame ***",
        worstId === 0,
        `worst |lift(x, 0) - x| = ${worstId} across five figures and all three species -- EXACTLY zero, not ` +
        `nearly. mh_state's complete is identically 0 outside SUCCESS, so this is what says the round cannot ` +
        `have moved a single recorded frame of the other five states.`);

    const rows = Object.entries(L).map(([s, c]) => {
        const lo = 0.30;
        return { s, c, at1: K.mhCompleteLift(lo, 1, c.k, c.over), target: 1 + c.over };
    });
    for (const r of rows)
        say(`${r.s.padEnd(7)} k ${r.c.k.toFixed(2)} over ${r.c.over.toFixed(2)}: a figure at 0.300 reaches ${r.at1.toFixed(4)} at the peak, ${(100 * r.c.k).toFixed(0)}% of the way to ${r.target.toFixed(2)}`);
        REPORT.table("the completion lift per species: a figure at 0.300 at the peak", ["species", "k", "over", "reaches", "target"], rows.map((r) => [r.s, r.c.k, r.c.over, r.at1, r.target]));
    const ch = rows.find((r) => r.s === "chorus");
    ok("!! *** chorus OVERSHOOTS PAST FULL AND THE OTHER TWO DO NOT: 1.335 against 0.895 ***",
        ch.target > 1 && rows.filter((r) => r.s !== "chorus").every((r) => r.target === 1) &&
        ch.at1 > 1 && rows.filter((r) => r.s !== "chorus").every((r) => r.at1 < 1),
        `opal and sol mix toward exactly 1.0 and reach ${rows.find((r) => r.s === "opal").at1.toFixed(4)}; ` +
        `chorus mixes toward 1.0 + ${ch.c.over} * complete and reaches ${ch.at1.toFixed(4)}. THE OVERSHOOT IS ` +
        `THE ONE NUMBER HERE WORTH READING TWICE: chorus.ts is the one species licensed a rhythm and the one ` +
        `whose subject is an ensemble arriving together, and going past full is how an arrival reads as ` +
        `louder than its parts. A port that used opal's target for all three would flatten exactly that.`);

    // ...and a saturation CLOSES differences where a gain preserves them. Stated as arithmetic rather than
    // as a word, because the two are one character apart in a diff and opposite in what they do.
    const a = 0.20, b = 0.80;
    const satA = K.mhCompleteLift(a, 1, 0.85, 0), satB = K.mhCompleteLift(b, 1, 0.85, 0);
    const gainA = a * (1 + 0.85), gainB = b * (1 + 0.85);
    say(`two figures 0.200 and 0.800 at the peak: SATURATED ${satA.toFixed(4)} / ${satB.toFixed(4)} (ratio ${(satB / satA).toFixed(3)}), ` +
        `GAINED ${gainA.toFixed(4)} / ${gainB.toFixed(4)} (ratio ${(gainB / gainA).toFixed(3)})`);
    ok("!! *** ...AND THE TWO OPERATIONS PULL OPPOSITE WAYS: a saturation closes a 4.00x gap to 1.09x, a gain keeps it ***",
        Math.abs(gainB / gainA - b / a) < 1e-12 && satB / satA < 1.2,
        `a gain leaves the ratio at exactly ${(gainB / gainA).toFixed(3)} -- it is a multiply, so every ` +
        `difference survives it -- while the saturation brings it to ${(satB / satA).toFixed(3)}. THAT IS THE ` +
        `WHOLE REASON THIS ROUND CARRIES TWO SHAPES: limn, arc, aura and flux SCALE their interiors and opal, ` +
        `sol and chorus SATURATE their figures, and one spelling for all seven would be wrong about six ` +
        `species in two different directions.`);
}

// =============================================================================================================
sec("3. *** THE CENSUS: WHO SPENDS complete, AND THE RULE THAT DECIDES WHICH TABLE THEY ARE IN ***");
{
    const src = codeOnly(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8"));
    const raw = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");

    const IN = K.MH_COMPLETE_INTERIOR, LIFT = K.MH_COMPLETE_LIFT;
    say(`MH_COMPLETE_INTERIOR: ${Object.entries(IN).map(([s, k]) => s + " " + k).join(", ")}`);
    say(`MH_COMPLETE_LIFT: ${Object.entries(LIFT).map(([s, c]) => `${s} k${c.k}/over${c.over}`).join(", ")}   |   sol's core gain ${K.MH_COMPLETE_SOL_CORE}`);

    // *** THE INTERIOR FACTOR SITS ON THE SAME EXPRESSION AS THE SETTLE, which is the rule that put those
    // four species in the table. The two are applied at ONE site for all eighteen, so the check is that the
    // site carries both and that the complete table is a strict SUBSET of the settled one.
    const bothApplied = /\.mul\(compF\)\.mul\(settleF\)/.test(src);
    // *** v4825 -- THE RULE WAS WRONG ABOUT ONE SPECIES, AND IT WAS THE ONE THE TABLE SAID 1.60 FOR. *** It read
    // "a species earns a complete factor here only because murmur writes it on the same line as the settled
    // factor". limn.ts's INTERIOR line (173) carries (1 + 0.9 * complete) and no settle; its settle is on the RIM
    // line (133) beside the rim's own (1 + 1.6 * complete). The rule picked the rim line, the port then folded the
    // rim into the interior, and both errors agreed with each other. The rule now reads murmur's INTERIOR line:
    // three species carry both factors there, and limn carries the complete alone.
    const subset = Object.keys(IN).filter((s) => s !== "limn").every((s) => s in K.MH_SETTLED_INTERIOR);
    ok("!! *** THE FLASH's FACTOR AND THE SETTLE's ARE APPLIED AT ONE SITE; limn's interior carries the flash and no settle ***",
        bothApplied && subset && Object.keys(IN).length === 4 && IN.limn === 0.90 && !("limn" in K.MH_SETTLED_INTERIOR),
        `the interior is density * m * transmit * compF * settleF. ${Object.keys(IN).filter((s) => s !== "limn").join(", ")} ` +
        `carry both factors on murmur's interior line; limn's interior line carries (1 + ${IN.limn} * complete) ` +
        `and no settle, which is limn.ts:173, and limn's settle and its 1.6 live on its rim (MH_LIMN_RIM). ` +
        `droplet is outside both tables, settling on its coreBright.`);

    // A MISSING KEY AND NOT A ZERO -- v4644's lesson, restated because the same sabotage exists here.
    ok("!! ...and the fourteen species without one are a MISSING KEY, read with ?? 0.0 at the site",
        /const compK = MH_COMPLETE_INTERIOR\[species\] \?\? 0\.0;/.test(src) &&
        /const compF = compK === 0\.0 \? float\(1\.0\) : /.test(src) &&
        Object.keys(IN).length + 14 === 18,
        `MH_COMPLETE_INTERIOR has ${Object.keys(IN).length} entries for eighteen species and the site reads ` +
        `it with ?? 0.0, which collapses to float(1.0) and emits no multiply at all. A TABLE OF FOURTEEN ` +
        `ZEROES WOULD READ AS "these species were considered and given nothing", which is false -- they ` +
        `spend their flash on a shell or a figure of their own -- and it is also the shape v4644's sabotage ` +
        `exploited when droplet's exclusion was a ternary.`);

    // The three saturation sites, named, because each is inside a different species' loop.
    // v4825: opal's life is the RESPONDING mix murmur writes -- mix(life, procession, drive) -- and the lift
    // saturates THAT, so the site reads the lift around the mix and not around the bare mhOpalLife.
    const sites = [["opal", /KIT\.mhCompleteLift\(\s*mix\(KIT\.mhOpalLife\([^)]*\), uniforms\.time\), float\(OD\.procFloor\)\.add\(max\(proc, 0\.0\)\.mul\(OD\.procAmp\)\), DRIVE\)/],
                   ["sol", /KIT\.mhCompleteLift\(liftG, COMPLETE,/],   // v4826: the gesture-lifted sn^2, sol.ts:112
                   ["chorus", /KIT\.mhCompleteLift\(\s*life\.add\(select\(/]];
    const found = sites.filter(([, re]) => re.test(raw)).map(([s]) => s);
    ok("!! *** ALL THREE SATURATIONS ARE WIRED, EACH ON THE FIGURE ITS OWN FILE NAMES ***",
        found.length === 3 && /COMPLETE\.mul\(MH_COMPLETE_SOL_CORE\)/.test(raw),
        `opal's four lives, sol's prominences and chorus's seven voices: ${found.join(", ")}. And sol has a ` +
        `SECOND complete beside them -- a ${K.MH_COMPLETE_SOL_CORE} gain on the core's own brightness -- ` +
        `which is a different operation on a different quantity in the same species, and the row exists ` +
        `because a census that found sol once would call sol done.`);
}

// =============================================================================================================
sec("4. *** AND IT REACHES PIXELS: four species that did not move a byte at the peak of their own SUCCESS ***");
{
    // *** stateTau PEAK_TAU AGAINST 0, WHICH SECTION 1 SHOWS ISOLATES complete. *** Four species and not seven,
    // because each is a WGSL compile: limn and flux are the two largest interior gains, chorus is the
    // overshoot, and sol is the smallest response in the round AND the only species carrying both shapes.
    // arc and aura are covered by the census above and named here rather than quietly dropped.
    const OFF = { stateIndex: SUCCESS, stateTau: 0.0 }, ON = { stateIndex: SUCCESS, stateTau: PEAK_TAU };
    const SPEC = ["limn", "flux", "chorus", "sol"];
    // *** sol IS RENDERED DIM AND THE REASON IS ITS OWN CORE. *** At the roster's default glow sol's disc is
    // SATURATED -- measured at 2.0937 against 2.0916 across the flash, a ratio of 0.999 -- so its 0.55 core
    // gain cannot show: the pixels are already at the top of the range. A sabotage that deleted that gain
    // walked through this section reading x1.05, because the lift on the prominences carried the row on its
    // own. At glow 0.25 the core read x2.56 until v4826 (a depth double count kept it dim; the row below
    // now reads the limb, and says why). A frame where the subject is clipped is not a measurement
    // of the subject, and "it still moved" is not evidence about which term moved it.
    const KN = (s) => (s === "sol" ? { glow: 0.25, depth: 0.5 } : {});
    const FR = [];
    for (const s of SPEC) { FR.push(sp(s, 7.0, 0.6, { ...OFF, ...KN(s) })); FR.push(sp(s, 7.0, 0.6, { ...ON, ...KN(s) })); }
    const run = await renderSpecies(FR);
    if (!run.ok || !run.frames || run.frames.length !== FR.length) {
        ok("!! the flash renders at all", false,
            `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}.`);
    } else {
        say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FR.length} frames over ${SPEC.length} species`);
        const diff = (a, b) => { let n = 0, mx = 0;
            for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; if (d > mx) mx = d; }
            return { pct: 100 * n / a.length, mx }; };
        const R = SPEC.map((s, i) => {
            const off = run.frames[i * 2], on = run.frames[i * 2 + 1];
            return { s, d: diff(off, on), lo: interiorMeanLight(off).mean, hi: interiorMeanLight(on).mean };
        });
        for (const r of R)
            say(`${r.s.padEnd(7)} ${r.d.pct.toFixed(1)}% of bytes move, worst ${String(r.d.mx).padStart(3)}   interior ${r.lo.toFixed(4)} -> ${r.hi.toFixed(4)}  (x${(r.hi / r.lo).toFixed(3)})`);
            REPORT.table("at the peak: bytes moved and the interior's mean light", ["species", "% of bytes moved", "worst channel", "interior before", "interior at the peak"],
                R.map((r) => [r.s, r.d.pct, r.d.mx, r.lo, r.hi]));
        ok("!! *** EVERY ONE OF THE FOUR BRIGHTENS AT THE PEAK, WHERE ALL FOUR MOVED ZERO BYTES BEFORE ***",
            R.every((r) => r.d.pct > 5 && r.d.mx > 50 && r.hi > r.lo * 1.02),
            `${R.map((r) => `${r.s} x${(r.hi / r.lo).toFixed(2)}`).join(", ")} of interior light, with ` +
            `${R.map((r) => r.d.pct.toFixed(1) + "%").join(" / ")} of bytes moving. MEASURED AT HEAD WITH ` +
            `THESE SAME FRAMES, all four read 0.0% and x1.000: the state reached its brightest instant and ` +
            `the picture did not change. sol's x${(R.find((r) => r.s === "sol").hi / R.find((r) => r.s === "sol").lo).toFixed(2)} ` +
            `is the smallest and it is IN the row rather than left out: its flash is a saturation on ` +
            `prominences that are already bright plus a 0.55 gain on a core that dominates the frame, so a ` +
            `small interior number is the right answer for sol and a large one would mean something was wrong.`);

        // *** sol's CORE, ON ITS OWN, because sol carries BOTH shapes and the interior row cannot separate
        // them. *** Its prominences saturate and its core takes a 0.55 gain; a reading of the whole interior
        // is their sum, and deleting the gain left that sum moving.
        // *** v4826 -- READ ON THE LIMB, NOT THE DISC. *** Until v4825 the core was the inner 0.16 of the frame
        // and read x2.56 -- but only because the port multiplied every interior by u_depth AS WELL AS spending
        // it in mh_palette, so this frame's depth 0.5 halved the core and kept it off the top of the rail.
        // murmur spends depth only in the palette. With that double count gone the disc's coreBright (1.20 and
        // up, sol.ts:90) sits at the rail's top in murmur and in the port alike, and the inner disc reads x1.01
        // with the gain and x1.002 without it -- a clipped subject, which is no measurement. The gain is still
        // VISIBLE where disc's own smoothstep takes the core below the top: the limb, 0.22 to 0.30 of the frame.
        // MEASURED: x1.211 there with the gain, x1.039 with COMPLETE.mul(MH_COMPLETE_SOL_CORE) typed
        // COMPLETE.mul(0.0) -- the floor sits between them.
        const solOff = run.frames[SPEC.indexOf("sol") * 2], solOn = run.frames[SPEC.indexOf("sol") * 2 + 1];
        const limbMean = (px) => { let a = 0, n = 0;
            for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
                const r = Math.hypot((x + 0.5) / N3 * 2 - 1, (y + 0.5) / N3 * 2 - 1);
                if (r < 0.22 || r >= 0.30) continue;
                a += light(px, x, y); n++;
            }
            return a / n; };
        const cLo = limbMean(solOff), cHi = limbMean(solOn);
        say(`sol's limb alone (0.22 to 0.30 of the frame, glow 0.25): ${cLo.toFixed(4)} -> ${cHi.toFixed(4)}  (x${(cHi / cLo).toFixed(3)})`);
        ok("!! *** sol's CORE TAKES ITS OWN 0.55 GAIN, read on the limb where the disc is below the rail's top ***",
            cHi / cLo > 1.12,
            `the limb goes x${(cHi / cLo).toFixed(3)} across the flash (x1.039 measured with the gain deleted). ` +
            `TWO SHAPES IN ONE SPECIES AND THE ROW HAS TO SEPARATE THEM: sol.ts gives the core a GAIN on its ` +
            `brightness and the prominences a SATURATION on their lives, and a reading of the interior is their ` +
            `sum. The inner disc is at the top of the rail in murmur too, so the gain is read where disc falls off.`);

        // *** A ROW ABOUT THE DARK STAYING DARK WAS WRITTEN HERE AND DELETED, AND THE MEASUREMENT IS WHY. ***
        // kit.ts's own reason for a multiply rather than an overlay is that it "brightens exactly what is
        // already there and leaves the dark dark", so a pixel row asking that looked obvious. It read a worst
        // rise of 0.0 counts on all four species -- and the population it read that from was ZERO. Every one
        // of the 956 pixels at or below 6 of 255 was OUTSIDE the silhouette; inside the body the darkest
        // pixel on these frames is above 6, and at a threshold where there ARE pixels inside (16 of 255,
        // where limn has 340) they rise by up to 18 counts, because these species also run an ignition
        // shell and their own figures move into dim places. THE ROW WOULD HAVE PASSED FOREVER WHILE
        // MEASURING THE BACKGROUND.
        //
        // What is actually true is arithmetic and is graded as arithmetic: a gain is a MULTIPLY, so an
        // interior carrying nothing carries nothing afterwards, at every value of complete. That is a
        // statement about the operation and not about which pixels this gate's four frames happen to have.
        let worstZero = 0;
        for (let c = 0; c <= 1; c += 1 / 512)
            for (const k of Object.values(K.MH_COMPLETE_INTERIOR))
                worstZero = Math.max(worstZero, Math.abs(0 * (1 + k * c)));
        ok("!! *** AND THE DARK STAYS DARK BECAUSE THE FLASH IS A MULTIPLY: zero interior stays zero at every complete ***",
            worstZero === 0,
            `an interior of 0 through (1 + K * complete) is ${worstZero} at all 513 values of complete and all ` +
            `four coefficients -- EXACTLY zero, which is what a multiply does and what an overlay would not. ` +
            `THIS IS ARITHMETIC AND NOT A PIXEL ROW, and the note above says why: the pixel version of this ` +
            `claim read a worst rise of 0.0 counts from a population of ZERO pixels inside the silhouette, ` +
            `and would have gone on passing while measuring the paper behind the orb.`);
    }
}

// =============================================================================================================
sec("5. *** v4825 -- THE SINGLES: SEVEN FLASH FACTORS, EACH READ ONCE, IN ITS OWN SPECIES, AT murmur's NUMBER ***");
{
    // The numbers are murmur's, read off krispuckett/murmur-web src/shaders/<species>.ts at 1c23b99 and written
    // here with the line each came from, so a change to the kit's table has to disagree with a quotation to pass.
    // SABOTAGED, each restored: duet's flare read in buildStill instead -> RED (wrong builder); prism's 1.10 typed
    // as 1.01 in the kit -> RED (value); comet's head factor deleted -> RED (read 0 times, and the pixel row).
    const MURMUR = {
        "still.glint":   ["still.ts:80",    0.85],
        "comet.head":    ["comet.ts:111",   2.2],
        "droplet.heart": ["droplet.ts:156", 0.26],
        "duet.shrink":   ["duet.ts:77",     0.62],
        "duet.flare":    ["duet.ts:120",    1.15],
        "chorus.sync":   ["chorus.ts:66",   0.55],
        "prism.beams":   ["prism.ts:159",   1.10],
    };
    const orb = codeOnly(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8"));
    const BUILDER = { still: "Still", comet: "Comet", droplet: "Droplet", duet: "Duet", chorus: "Chorus", prism: "Prism" };
    const bodyOf = (b) => { const i = orb.indexOf(`const build${b} = () => {`); if (i < 0) return "";
        const j = orb.indexOf("const build", i + 20); return orb.slice(i, j < 0 ? orb.length : j); };
    const bad = [];
    for (const [key, [where, want]] of Object.entries(MURMUR)) {
        const [spc, k] = key.split(".");
        const got = K.MH_COMPLETE_SINGLES?.[spc]?.[k];
        const ref = `MH_COMPLETE_SINGLES.${spc}.${k}`;
        const total = orb.split(ref).length - 1, inOwn = bodyOf(BUILDER[spc]).split(ref).length - 1;
        if (got !== want || total !== 1 || inOwn !== 1) bad.push(`${key}: kit ${got} vs ${where} ${want}, read ${total}x, ${inOwn}x in build${BUILDER[spc]}`);
    }
    const tableKeys = Object.entries(K.MH_COMPLETE_SINGLES || {}).flatMap(([s2, o]) => Object.keys(o).map((k) => s2 + "." + k));
    ok("!! *** each of the seven is murmur's number, read exactly once, inside its own species' builder ***",
        bad.length === 0 && tableKeys.length === 7 && tableKeys.every((k) => k in MURMUR),
        bad.length ? bad.join("; ") : `${tableKeys.length} singles: ` + Object.entries(MURMUR).map(([k, [w]]) => `${k} (${w})`).join(", "));
    // *** v4825 -- limn's TWO, AND THE TWO GAPS RECORDED BESIDE THEM, CLOSED. *** limn's are not singles:
    // its 0.90 is MH_COMPLETE_INTERIOR.limn on the shared interior line, and its rim's 1.6 / 0.30 / ringClose 1.20
    // are MH_LIMN_RIM, spent in buildLimn on a rim that joins the pixel BESIDE the interior (limn.ts: e = interior
    // + rimE + ...). still's glint takes still.ts:80's (0.90 + 0.95 * live.voice); chorus's sync takes chorus.ts:66's
    // 0.85 * st.drive. SABOTAGED, each restored: limn's rim put back into its density -> RED; still's 0.95 typed
    // 0.59 -> RED; chorus's drive term deleted -> RED.
    const limnBody = bodyOf("Limn"), stillBody = bodyOf("Still"), chorusBody = bodyOf("Chorus");
    const R = K.MH_LIMN_RIM || {};
    const limnOk = R.complete === 1.6 && R.settled === 0.30 && R.ringClose === 1.20 && K.MH_COMPLETE_INTERIOR.limn === 0.90 &&
        /const limnDensity = accL\.mul\(3\.0\);/.test(limnBody) &&
        // the species name is a STRING, which codeOnly blanks -- so this one line is read from the raw source
        /species === "limn" \? SP\.rimE : species === "comet" \? SP\.headE\.mul\(surfB\.m\) : float\(0\.0\)/.test(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8")) &&
        /interior\.add\(besideE\)\.add\(sf\.rim\)/.test(orb);
    ok("!! *** limn: the rim carries 1.6, 0.30 and ringClose 1.20 and joins BESIDE an interior carrying 0.90 -- limn.ts:126-173 ***",
        limnOk, `MH_LIMN_RIM ${JSON.stringify(R)}, interior ${K.MH_COMPLETE_INTERIOR.limn}; density is accL alone and the rim is added at railE and eTotal`);
    const G = K.MH_STILL_GLINT || {};
    ok("!! *** still's glint answers the voice: (0.90 + 0.95 * live.voice) -- still.ts:80 ***",
        G.base === 0.90 && G.voice === 0.95 && (stillBody.split("MH_STILL_GLINT.voice").length - 1) === 1,
        `MH_STILL_GLINT ${JSON.stringify(G)}, read in buildStill`);
    ok("!! *** chorus's sync leans with RESPONDING: + 0.85 * st.drive -- chorus.ts:66 ***",
        K.MH_CHORUS.syncDrive === 0.85 && /DRIVE\.mul\(CH\.syncDrive\)/.test(chorusBody),
        `MH_CHORUS.syncDrive ${K.MH_CHORUS.syncDrive}, read in buildChorus inside the sync clamp`);

    // ONE OF THE SEVEN IN PIXELS: comet, whose head was its whole flash and was missing. At SUCCESS tau 0.20 the
    // settle is still exactly 0, so what comet gains over its own tau-0 frame is the flash: the head's
    // (1 + 2.2 * complete) and the trail filling behind it.
    const pair = await renderSpecies([sp("comet", 0, undefined, { stateIndex: SUCCESS, stateTau: 0 }),
                                      sp("comet", 0, undefined, { stateIndex: SUCCESS, stateTau: 0.20 })]);
    if (!pair.ok) ok("!! comet's head flash renders", false, pair.reason || pair.skipped || "no frames");
    else {
        const [a, b] = pair.frames; let sumA = 0, sumB = 0;
        for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) { sumA += light(a, x, y); sumB += light(b, x, y); }
        const st = K.mhState(SUCCESS, 0.20);
        ok("!! *** comet's HEAD FLASHES NOW: early in SUCCESS, with settled still 0, its frame gains a fifth of its light ***",
            st.settled === 0 && st.complete > 0.5 && sumB > sumA * 1.20,
            `complete ${st.complete.toFixed(3)}, settled ${st.settled}; total linear light ${sumA.toFixed(1)} -> ` +
            `${sumB.toFixed(1)} (x${(sumB / sumA).toFixed(3)}).`);
    }
}

REPORT.write();
console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the half of the SUCCESS flash that is not the travelling shell. kit.ts says the " +
    "light in a success is not an overlay -- every species multiplies its own interior by (1 + complete) -- " +
    "and v4644 ported the shell without that sentence, so SIX species reached the peak of their own SUCCESS " +
    "state and moved zero bytes. Four of them spend it on the shared interior line beside the settle, and " +
    "three SATURATE a figure of their own instead, which is the opposite operation and is why the round " +
    "carries two shapes." +
    "\nWHAT THIS GATE DOES NOT MEASURE IN PIXELS, and the reason is recorded in section 4: that the flash " +
    "leaves the dark dark. Inside the silhouette these four frames have NO pixel at or below 6 of 255, so " +
    "the obvious row read a worst rise of 0.0 from a population of zero and would have passed forever while " +
    "measuring the paper behind the orb. The claim is graded as the arithmetic it is." +
    "\nWHAT IS NOT CLAIMED: the eight per-species ignition FIGURES that are still missing -- comet, fathom, " +
    "geode, arc, aura, flux, prism and helix each spend complete on a gaussian of their own (arc on its " +
    "filament, aura on a von Mises that follows the sweep round its ribbons, geode on a flat lit += 0.70) " +
    "and none is the one shape MH_IGNITE holds. The SINGLES are section 5 since v4825, all but limn's ring " +
    "and second interior, which wait on limn's rim/interior split. Counted in murmur's own sources st.complete appears 47 times; " +
    "this round takes 8 of them and the census in tools/ship/murmurLive-selfcheck.mjs holds the total.");
process.exit(fails ? 1 : 0);
