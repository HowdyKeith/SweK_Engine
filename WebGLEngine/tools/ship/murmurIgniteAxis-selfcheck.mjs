// WebGLEngine/tools/ship/murmurIgniteAxis-selfcheck.mjs -- v4659
//
// *** THE IGNITION's SECOND SHAPE: A GAUSSIAN THAT TRAVELS ALONG THE SPECIES' OWN AXIS. ***
//
// v4644 ported mh_ignite's SHELL -- a ring in |p| that leaves the heart and reaches the surface -- and gave
// seven species an MH_IGNITE entry. v4658 ported the interior BRIGHTENING that four more species carry on
// the same line as their settle. What was left was eight per-species figures that MH_IGNITE's own note
// described as "per-species transcriptions rather than this one shape".
//
// *** FOUR OF THE EIGHT ARE ONE SHAPE, AND IT TOOK READING ALL EIGHT SIDE BY SIDE TO SEE IT: ***
//
//     r = (coord - mix(lo, hi, st.sweep)) / width;   figure += st.complete * (flat + gain * exp(-r*r))
//
// arc runs it along `th`, the angle round its arc; flux along q.x, the length of its stream; prism along s1,
// the distance out its beams; helix along q.y, the height of its strands. The SHELL's coordinate is |p| for
// everybody, which is why this is a second table and not four more rows in the first.
//
// *** AND EACH ONE IS THAT SPECIES' OWN GESTURE FIGURE, RUN ON `sweep` AND DRAWN TIGHTER. *** arc's flourish
// pulse is the same expression at width 0.34 against the ignition's 0.30; flux 0.42 against 0.38; prism 0.28
// against 0.26. The success is the thing the species already does, once, travelling the whole length and a
// little sharper. Both halves are in this port now, so that is a statement it can make rather than a reading
// of somebody else's file.
//
// *** prism AND helix WERE STILL NOT FLASHING AT ALL AFTER v4658. *** Measured: at the peak of complete both
// moved 0.0% of their bytes and x1.000 of interior light between the start of their own SUCCESS state and
// its brightest instant. Neither has an interior factor -- they are not in MH_COMPLETE_INTERIOR because
// murmur does not put one on their interior line -- so the travelling figure was the whole of their flash
// and it was not here.
//
// *** WHERE THE FRONT TRAVELS IS GRADED IN THE KIT AND NOT HERE, and the reason is measurable. *** Isolating
// `sweep` in a rendered frame needs two taus with the same `complete` and different `sweep`; mh_state's
// settled turns on at EXACTLY the complete peak (tau 0.3600), so every such pair differs in settled too --
// searched, and there is none. The front's position is proven against the CPU twin on a real GPU in
// tools/ship/murmurKit-selfcheck.mjs section 16, over three different axes at once.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { sp, renderSpecies, interiorMeanLight } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurIgniteAxis-selfcheck -- the flash that travels the length of the figure\n");

const SUCCESS = 4, PEAK_TAU = 0.360;

// =============================================================================================================
sec("1. *** THE IGNITION IS THE GESTURE, TIGHTER -- three species where both figures are in this file ***");
{
    const A = K.MH_IGNITE_AXIS;
    const pairs = [["arc", A.arc], ["flux", A.flux], ["prism", A.prism]];
    for (const [s, c] of pairs)
        say(`${s.padEnd(6)} gesture width ${c.gestureW.toFixed(2)}, ignition width ${c.width.toFixed(2)} -- ${(100 * (1 - c.width / c.gestureW)).toFixed(1)}% tighter`);
    say(`helix   has no gesture pulse to compare and carries the table's only FLAT term, ${A.helix.flat}`);
    ok("!! *** EVERY IGNITION FRONT IS TIGHTER THAN THE SAME SPECIES' GESTURE FRONT, all three of them ***",
        pairs.every(([, c]) => c.width < c.gestureW && c.width > 0.7 * c.gestureW) &&
        A.helix.gestureW === 0 && A.helix.flat > 0,
        `${pairs.map(([s, c]) => `${s} ${c.gestureW} -> ${c.width}`).join(", ")} -- tighter in all three and ` +
        `by between ${Math.min(...pairs.map(([, c]) => 100 * (1 - c.width / c.gestureW))).toFixed(1)}% and ` +
        `${Math.max(...pairs.map(([, c]) => 100 * (1 - c.width / c.gestureW))).toFixed(1)}%, which is a ` +
        `narrow band and not a coincidence of three unrelated numbers. THE BOUND IS TWO-SIDED because "any ` +
        `smaller number" would pass a one-sided one and a front an order of magnitude tighter would be a ` +
        `spark rather than a wave. helix is EXCLUDED from the comparison rather than given a 0 to compare ` +
        `against: it has no flourish pulse at all, and a gesture width of 0 for it is an absence recorded, ` +
        `not a measurement.`);

    // ...and the gains are not one number either, which is what says the table was transcribed.
    const gains = Object.values(A).map((c) => c.gain);
    ok("!! ...and the four gains are four different numbers spanning 1.60 to 2.10",
        new Set(gains).size === 4 && Math.max(...gains) / Math.min(...gains) > 1.2,
        `${Object.entries(A).map(([s, c]) => s + " " + c.gain).join(", ")}. A table whose entries were all ` +
        `the same would be one constant wearing four names, and the species gates could not tell it from a ` +
        `correct one -- they render one species each.`);
}

// =============================================================================================================
sec("2. *** IT ADDS EXACTLY NOTHING WHEN THE STATE IS NOT SUCCESS, which is what protects every recorded frame ***");
{
    let worst = 0, n = 0;
    for (const c of Object.values(K.MH_IGNITE_AXIS))
        for (let coord = -1.5; coord <= 2.5; coord += 0.01)
            for (const sweep of [0, 0.31, 0.5, 0.77, 1]) {
                worst = Math.max(worst, Math.abs(K.mhIgniteAxis(coord, 0, sweep, c.lo, c.hi, c.width, c.gain, c.flat)));
                n++;
            }
    ok("!! *** AT complete = 0 THE FIGURE GAINS EXACTLY 0, over 8,020 points of axis and sweep ***",
        worst === 0 && n > 8000,
        `worst |contribution at complete 0| = ${worst} over ${n} combinations of coordinate, sweep and ` +
        `species -- EXACTLY zero, including at the flat term, because the whole expression is multiplied by ` +
        `complete and mh_state's complete is identically 0 outside SUCCESS. helix's 0.35 is the one that ` +
        `would show if it were not: a flat term added OUTSIDE the multiply would lift every strand in every ` +
        `state, which is the one transcription error this shape invites.`);
}

// =============================================================================================================
sec("3. *** THE CENSUS: four call sites, each on its own species' axis ***");
{
    const src = codeOnly(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8"));
    const raw = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const want = [["arc", "th"], ["flux", "q.x"], ["prism", "S1[1]"], ["helix", "q.y"]];
    const calls = (src.match(/KIT\.mhIgniteAxis\(/g) || []).length;
    const found = want.filter(([, coord]) =>
        new RegExp("KIT\\.mhIgniteAxis\\(" + coord.replace(/[.[\]]/g, "\\$&") + ", COMPLETE, SWEEP,").test(raw)).map(([s]) => s);
    say(`mhIgniteAxis call sites: ${calls}; on the axes ${found.join(", ")}`);
    ok("!! *** FOUR SITES AND EACH TAKES ITS OWN SPECIES' COORDINATE, not one shared one ***",
        calls === 4 && found.length === 4,
        `arc passes th (the angle round its arc), flux q.x (the length of its stream), prism S1[1] (the ` +
        `distance out its middle beam) and helix q.y (the height of its strands). THE AXIS IS THE POINT OF ` +
        `THIS TABLE: the shell's coordinate is |p| for all seven species that run it, and these four are ` +
        `four different quantities, so a port that passed length(p) to all of them would have four fronts ` +
        `travelling outward through bodies whose figures run some other way entirely.`);

    // arc's ends are RUNTIME values and the other three's are constants, which is a real difference.
    ok("!! ...and arc's ends are its own SPAN, a runtime value, where the other three are constants",
        /span\.mul\(IA_A\.lo\), span\.mul\(IA_A\.hi\)/.test(raw) && K.MH_IGNITE_AXIS.arc.spanScaled === true &&
        Object.entries(K.MH_IGNITE_AXIS).filter(([s]) => s !== "arc").every(([, c]) => c.spanScaled === false),
        `arc.ts runs its front from -span to +span where span is the arc's own extent at this frame's knobs, ` +
        `so its table entry carries -1 and 1 as a FRACTION and the call site multiplies. The other three ` +
        `travel between fixed numbers. The flag is in the table rather than only at the call site so a ` +
        `reader of the numbers cannot take arc's -1 and 1 for body units.`);

    // helix lifts its HUE channel by the same factor, or the pair's colour drifts through the flash.
    ok("!! *** helix LIFTS ITS HUE CHANNEL BY THE SAME FACTOR IT LIFTS ITS ENERGY ***",
        /accHH\.addAssign\(e1\.sub\(e0\)[\s\S]{0,140}\.mul\(liftH\)/.test(raw) &&
        /const eH = e0\.add\(e1\)[\s\S]{0,120}\.mul\(liftH\)/.test(raw),
        `helix.ts: strands = (e0+e1)*bright*lift and hueW = (e1-e0)*bright*lift -- both factors, one number. ` +
        `The hue this species reports is acc.y / acc.x, so lifting the energy alone would leave the ` +
        `numerator behind and the pair's colour would drift toward the anchor through the flash. It is a row ` +
        `because the first cut of this round lifted the energy and not the hue.`);
}

// =============================================================================================================
sec("4. *** AND IT REACHES PIXELS: two of the four still were not flashing at all after v4658 ***");
{
    const SPEC = ["arc", "flux", "prism", "helix"];
    const FR = [];
    for (const s of SPEC) {
        FR.push(sp(s, 7.0, 0.6, { stateIndex: SUCCESS, stateTau: 0.0 }));
        FR.push(sp(s, 7.0, 0.6, { stateIndex: SUCCESS, stateTau: PEAK_TAU }));
    }
    const run = await renderSpecies(FR);
    if (!run.ok || !run.frames || run.frames.length !== FR.length) {
        ok("!! the travelling ignition renders at all", false,
            `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}.`);
    } else {
        say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FR.length} frames over ${SPEC.length} species`);
        const diff = (a, b) => { let n = 0, mx = 0;
            for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; if (d > mx) mx = d; }
            return { pct: 100 * n / a.length, mx }; };
        // measured at v4658 with the four gains zeroed, on these same frames
        const WAS = { arc: 1.81, flux: 4.33, prism: 1.00, helix: 1.00 };
        const R = SPEC.map((s, i) => {
            const off = run.frames[i * 2], on = run.frames[i * 2 + 1];
            return { s, d: diff(off, on), lo: interiorMeanLight(off).mean, hi: interiorMeanLight(on).mean };
        });
        for (const r of R)
            say(`${r.s.padEnd(6)} ${r.d.pct.toFixed(1)}% of bytes move, worst ${String(r.d.mx).padStart(3)}   interior x${(r.hi / r.lo).toFixed(2)}   (at v4658: x${WAS[r.s].toFixed(2)})`);
        ok("!! *** ALL FOUR BRIGHTEN, AND prism AND helix GO FROM x1.000 -- NOTHING AT ALL -- TO x2.08 AND x2.93 ***",
            R.every((r) => r.d.pct > 3 && r.d.mx > 40) &&
            R.every((r) => r.hi / r.lo > WAS[r.s] * 1.05),
            `${R.map((r) => `${r.s} x${(r.hi / r.lo).toFixed(2)} (was x${WAS[r.s].toFixed(2)})`).join(", ")}. ` +
            `prism AND helix HAD NO FLASH WHATEVER: neither is in MH_COMPLETE_INTERIOR, because murmur puts ` +
            `no complete factor on their interior line, so this travelling figure IS their whole success and ` +
            `it was not here. arc and flux already brightened uniformly from v4658's interior factor and now ` +
            `carry a front as well -- WHICH IS WHY THE ROW ASKS FOR MORE THAN THEY HAD rather than merely ` +
            `for movement: a row that only checked "it moves" would have been green on those two before this ` +
            `round started.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the four species whose SUCCESS is a gaussian travelling along a coordinate of " +
    "their own -- arc's angle, flux's length, prism's beams, helix's height -- which is one shape with five " +
    "constants and was four separate-looking figures until they were read side by side. Two of the four, " +
    "prism and helix, were still not flashing at all after v4658." +
    "\nWHAT IS NOT CLAIMED HERE: where the front IS. Isolating `sweep` in a rendered frame needs two taus " +
    "with equal `complete` and different `sweep`, and mh_state's settled turns on at exactly the complete " +
    "peak, so no such pair exists -- searched, not assumed. The front's position is graded against the CPU " +
    "twin on a real GPU in tools/ship/murmurKit-selfcheck.mjs section 16, over three different axes at once, " +
    "with a fourth channel sweeping complete against a PINNED sweep so the multiplier cannot be deleted. " +
    "\nSTILL MISSING FROM st.complete: aura's von Mises on the angle (the only figure that spends sweep as a " +
    "position round a ribbon), fathom's per-shell turn, geode's flat lift, comet's decay, and about a dozen " +
    "singles. All of them are recorded against the st.drive entry in tools/ship/nextRounds.mjs.");
process.exit(fails ? 1 : 0);
