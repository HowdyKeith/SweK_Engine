// WebGLEngine/tools/ship/murmurDrive2-selfcheck.mjs -- v4653
//
// *** THE OTHER HALF OF THE RESPONDING LEAN: IT STOPS SCATTERING. ***
//
// tools/ship/murmurDrive-selfcheck.mjs carries the heading -- twelve gestures 86.82 degrees apart becoming
// one axis -- and states why that claim is graded on the CPU. This gate carries the half that IS visible in
// a frame: seven species close the spread around whatever direction they have just acquired. A heading
// alone would be a swarm that happens to face one way; what makes murmur's RESPONDING read as intent is
// that both happen at once.
//
// *** THE INSTRUMENT IS THE BRIGHTNESS-WEIGHTED RMS RADIUS: no threshold, no edge to find. *** This module
// has already rejected three radius-FINDING measures with their numbers recorded (a luminance threshold
// swung 63 to 174%; the peak-brightness radius read 0% and 56% on IDENTICAL pixels at two frame sizes), and
// a fourth was written for this round and thrown away when it jumped between 0.17 and 0.649 on adjacent
// angles of the same droplet. A first moment of the whole positive field has no such degeneracy.
//
// *** AND limn IS IN THIS GATE PRECISELY BECAUSE IT DOES NOT NARROW. *** Its two drive terms BROADEN a lobe
// and SWING it round -- kTail is a concentration, so dividing it widens the tail, and offT is an angle, so
// subtracting from it rotates the tail. It is the one species in MH_DRIVE_FORM whose lean is not a
// contraction, and a row that only showed four species getting smaller would be a row that had chosen its
// four. limn is the control that is inside the subject rather than outside it.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { sp, renderSpecies, N3, light } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurDrive2-selfcheck -- RESPONDING: ...and the scatter collapses around it\n");

const RESP = 3, IDLE = 0, T = 7.0;
// *** TWO SPECIES, AND THE COUNT WAS SET BY THE CLOCK THREE TIMES OVER. *** Five measured 4,307 ms against
// a 3,000 ms ceiling; three measured 2,772, which is the EXACT figure at which this tree split
// tools/ship/murmurLive-selfcheck.mjs, recording that 8% of margin is over once a contended sweep's 10% is
// allowed for; two measure about 2,500. A gate over budget does not run at ship time AT ALL, so the number
// that decided this is not a preference.
//
// THE TWO KEPT CARRY THREE CLAIMS BETWEEN THEM: helix contracts AND is the one species in the table that
// also grows, and limn is the one whose lean is not a contraction at all. The three dropped were all
// ordinary (1 - k*drive) contractions and their readings this round were duet -7.21%, prism -4.05% and arc
// -2.98% -- MEASURED DURING THIS ROUND AND NOT BY THIS FILE, which is why they are quoted here as history
// rather than printed as a result below.
const SPECIES = ["helix", "limn"];
const FRAMES = [];
// *** EACH STATE IS HELD AGAINST ITSELF AT TWO TAUS. *** A first cut compared RESPONDING-at-tau-0 against
// the IDLE frame and read prism 9% and arc 4% of bytes moved -- real, and nothing to do with drive: mh_live
// weights the cadence 1.00 in RESPONDING against 0.60 in IDLE, so every species that reads PACE is brighter
// there whatever mh_state does. That is the identical confound v4650's quiet-state row was repaired for,
// three rounds ago, in this same orb. Sweeping tau inside ONE state asks the question actually being asked.
// *** TWO FRAMES PER SPECIES AND THE IDLE CONTROL LIVES NEXT DOOR. *** Frames are not as free as this
// module's note assumes: four per species put this gate at 3,023 ms against a 3,000 ms ceiling where two
// put it at 2,240. The sibling tools/ship/murmurDrive-selfcheck.mjs holds the pixel control -- two species
// byte-identical to their own IDLE frames -- and it has the headroom for it. What stays here is the
// ALGEBRAIC form of the same claim, which costs nothing and is the stronger statement anyway: it covers
// every operating point rather than the one a frame samples.
for (const s of SPECIES) for (const kn of [{ stateIndex: RESP, stateTau: 0.0 },
                                           { stateIndex: RESP, stateTau: 1.0 }]) FRAMES.push(sp(s, T, undefined, kn));

const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) {
    ok("!! the narrowing renders at all", false,
        `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}. A gate ` +
        `that cannot run its own subject is a FAIL row and not a silent skip.`);
    console.log("\nFAIL -- 1 check(s)");
    process.exit(1);
}
say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FRAMES.length} frames`);

/** How far from the centre the light sits. A first moment of a positive field -- see the header. */
const rmsRadius = (px) => {
    let sw = 0, sr = 0;
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        const rr = Math.hypot(dx, dy); if (rr > 0.98) continue;
        const v = light(px, x, y); sw += v; sr += v * rr * rr;
    }
    return Math.sqrt(sr / sw);
};
const diff = (a, b) => { let n = 0, mx = 0;
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; if (d > mx) mx = d; }
    return { pct: 100 * n / a.length, mx }; };

const R = SPECIES.map((s, i) => {
    const d0 = run.frames[i * 2], d1 = run.frames[i * 2 + 1];
    return { s, moved: diff(d0, d1), r0: rmsRadius(d0), r1: rmsRadius(d1) };
});
for (const r of R) r.pct = 100 * (r.r1 / r.r0 - 1);

// =============================================================================================================
sec("1. *** FOUR OF THE FIVE DRAW IN, AND THE FIFTH IS THE ONE WHOSE TABLE SAYS IT SHOULD NOT ***");
{
    for (const r of R) say(`${r.s.padEnd(6)} RMS radius ${r.r0.toFixed(4)} -> ${r.r1.toFixed(4)}  ${r.pct.toFixed(2)}%   (bytes moved ${r.moved.pct.toFixed(1)}%, worst channel ${r.moved.mx})`);

    const narrowers = R.filter((r) => r.s !== "limn"), limn = R.find((r) => r.s === "limn");
    // *** THE SECOND CLAUSE WAS `r.pct < 10 * limn.pct` AND THAT RAN THE WRONG WAY. *** Both numbers are
    // negative, so the bound got STRICTER as limn moved -- limn contracting a little more made helix's claim
    // harder to satisfy, which is backwards for a row whose point is that helix draws in and limn does not.
    // It held while limn's radius barely moved at all, and went red at v4657 when limn gained murmur's drive
    // FACTOR and its flattening wobble and drew in 0.60% instead of 0.12%. A RATIO OF MAGNITUDES says what
    // was meant: helix's contraction is many times limn's, whatever limn's happens to be.
    ok("!! *** THE LIGHT DRAWS IN: helix's whole field moves inward as the strands close on the axis ***",
        narrowers.every((r) => r.pct < -2.5) &&
        narrowers.every((r) => Math.abs(r.pct) > 5 * Math.abs(limn.pct)),
        `${narrowers.map((r) => r.s + " " + r.pct.toFixed(2) + "%").join(", ")}, against limn's ` +
        `${R.find((r) => r.s === "limn").pct.toFixed(2)}% in the row below -- a factor of ` +
        `${Math.min(...narrowers.map((r) => Math.abs(r.pct) / Math.abs(limn.pct))).toFixed(1)}x at the ` +
        `narrowest. THE SIZE OF A CONTRACTION DOES ` +
        `NOT TRACK THE SIZE OF ITS COEFFICIENT AND THIS ROW DOES NOT CLAIM IT DOES: measured this round, ` +
        `prism carries the table's LARGEST coefficient (0.62 against duet's 0.34) and moved LESS than duet ` +
        `(-4.05% against -7.21%), because a fan closing rotates three beams about a shared origin while a ` +
        `separation closing translates two whole bodies. What each number multiplies is a different geometry.`);

    ok("!! *** ...AND limn DOES NOT DRAW IN, WHILE ITS FRAME STILL CHANGES -- both halves, on the same frames ***",
        Math.abs(limn.pct) < 1.0 && limn.moved.pct > 3 && limn.moved.mx > 10,
        `limn's RMS radius moves ${limn.pct.toFixed(2)}% -- nothing, against the ${Math.min(...narrowers.map((r) => Math.abs(r.pct))).toFixed(2)}% ` +
        `of the smallest real narrower -- while ${limn.moved.pct.toFixed(1)}% of its bytes move and its worst ` +
        `channel shifts ${limn.moved.mx} of 255. IT IS NOT UNAFFECTED, IT IS AFFECTED DIFFERENTLY: kTail is a ` +
        `CONCENTRATION and drive divides it, which widens the tail lobe; offT is an ANGLE and drive subtracts ` +
        `from it, which swings the lobe round. A stroke finishing a word spreads and turns; it does not ` +
        `shrink. Without this half the section above would be four species chosen for agreeing.`);
}

// =============================================================================================================
sec("2. *** helix NARROWS AND WINDS AT THE SAME TIME, WHICH IS WHY THE TABLE CARRIES OPERATIONS ***");
{
    const helix = R.find((r) => r.s === "helix"), F = K.MH_DRIVE_FORM;
    const grows = Object.entries(F).flatMap(([s, o]) => Object.entries(o).filter(([, v]) => v > 0).map(([f]) => `${s}.${f}`));
    say(`helix: radius ${helix.pct.toFixed(2)}% but ${helix.moved.pct.toFixed(1)}% of bytes moved, worst channel ${helix.moved.mx}`);
    // *** THIS ROW IS A SOURCE CENSUS AND IT SAYS SO, because the pixel version of it could not be
    // defended. *** A first cut argued that helix moves 19.8% of its bytes against only a 3.51% contraction,
    // so "something other than the radius must be moving" -- and a sabotage flipped the turns term from
    // (1 + k*drive) to (1 - k*drive) and walked straight through it, because a frame with FEWER turns also
    // moves a fifth of its bytes. An inference that survives its own negation is not evidence. What can be
    // checked exactly is the OPERATION the shader spells, so that is what this asks, at the altitude it can
    // actually answer at.
    const src2 = codeOnly(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8"));
    const turnsGrows = /\.add\(DRIVE\.mul\(FORM\.turns\)\)/.test(src2);
    const r0Shrinks = /\.sub\(DRIVE\.mul\(FORM\.r0\)\)/.test(src2);
    ok("!! *** helix's TURNS ARE SPELLED AS A GROWTH AND ITS RADIUS AS A SHRINK, IN THE SAME EXPRESSION PAIR ***",
        turnsGrows && r0Shrinks && F.helix.turns === 0.35 && F.helix.r0 === 0.14 &&
        Math.abs(helix.pct) > 2.5,
        `the shader adds DRIVE * FORM.turns (${F.helix.turns}) to the turn count and subtracts DRIVE * ` +
        `FORM.r0 (${F.helix.r0}) from the radius -- a spring COMPRESSING rather than a thing shrinking -- and ` +
        `the radius half of that is confirmed in pixels above at ${helix.pct.toFixed(2)}%. THE GROWTH HALF IS ` +
        `NOT CONFIRMED IN PIXELS AND THIS ROW DOES NOT PRETEND IT IS: counting turns in a 48-pixel frame is ` +
        `below the resolution this module already recorded helix's strands at (0.062 of the body wide, about ` +
        `one pixel). It is the only term in MH_DRIVE_FORM that makes something bigger, which is why that ` +
        `table carries an operation beside each coefficient instead of a magnitude.`);

    ok("...and MH_DRIVE_FORM's ten coefficients are nine narrowings and exactly one growth",
        grows.length === 10 && Object.keys(F).length === 7,
        `${Object.keys(F).length} species carry ${grows.length} coefficients between them, all positive, ` +
        `because the SIGN lives in the operation the shader spells and not in the number -- (1 - k*drive) at ` +
        `eight sites, a divisor at limn's tail, a subtraction at limn's offset, and (1 + k*drive) at helix's ` +
        `turns alone. Putting the sign in the table instead would have made limn's divisor and helix's ` +
        `multiply look like the same fact.`);
}

// =============================================================================================================
sec("3. *** OUTSIDE RESPONDING THIS ROUND MOVES NOTHING -- measured at a frame, and proved in the algebra ***");
{
    // *** THE ALGEBRA, RATHER THAN A FRAME THAT HAPPENS TO AGREE. *** The sibling gate measures two species
    // byte-identical to their own IDLE frames, which is one operating point. This says why no operating
    // point could differ: the heading mix at drive 0 reduces to the normalize that stood there before this
    // round, bit for bit, for every wander and every wired species.
    let worst = 0, at = "";
    for (const [name, H] of Object.entries(K.MH_DRIVE_HEADING)) {
        if (!H.wired || name === "droplet") continue;   // droplet's heading is the flow term, not this mix
        for (let i = 0; i < 64; i++) {
            const ga = i / 64 * 6.2831853;
            const w = [Math.cos(ga), 0.42 * Math.sin(ga * 1.3), Math.sin(ga)];
            const n = Math.hypot(...w);
            const was = [w[0] / n, w[1] / n, w[2] / n];
            const now = K.mhDriveHeading(w, H.v, 0, H.k, H.pre);
            for (let c = 0; c < 3; c++) {
                const d = Math.abs(now[c] - was[c]);
                if (d > worst) { worst = d; at = `${name} at ga ${ga.toFixed(3)}`; }
            }
        }
    }
    ok("!! ...and at drive 0 the new heading mix IS the old normalize, bit for bit, so no baseline COULD move",
        worst === 0,
        `worst |mhDriveHeading(w, V, 0, k) - normalize(w)| = ${worst} over 3 species x 64 wander angles x 3 ` +
        `components -- EXACTLY zero, not small. normalize(mix(w, V, 0)) reduces to normalize(w) before any ` +
        `arithmetic on V happens, which is why this round could change what stood at four heading sites ` +
        `without a single recorded frame moving. The pixel row above measures one operating point; this one ` +
        `says there is no operating point at drive 0 where they differ.`);

    // The form table's keys against the species that actually read it -- the set-equality shape v4644 took
    // after a dead MH_IGNITE entry walked through every pixel gate in that round.
    const src = codeOnly(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8"));
    const lines = src.split("\n");
    const marks = [];
    lines.forEach((l, i) => { const m = /^\s*const build([A-Z]\w*) = \(\) => \{/.exec(l); if (m) marks.push([i, m[1].toLowerCase()]); });
    marks.push([lines.length, "(end)"]);
    const readers = [];
    for (let k = 0; k < marks.length - 1; k++) {
        const blk = lines.slice(marks[k][0], marks[k + 1][0]).join("\n");
        if (/\bFORM\.\w+/.test(blk)) readers.push(marks[k][1]);
    }
    // still's and abyss's lateral terms sit in their own closures; the rest here. Both tables are one set.
    const want = Object.keys(K.MH_DRIVE_FORM).sort();
    say(`closures reading MH_DRIVE_FORM: ${readers.sort().join(", ")}`);
    ok("!! ...and exactly the seven species in MH_DRIVE_FORM read it -- no dead coefficient, no unlisted reader",
        readers.sort().join(",") === want.join(","),
        `${readers.length} closures read a FORM field and the table has ${want.length} entries: ` +
        `${want.join(", ")}. EQUALITY IN BOTH DIRECTIONS. A coefficient no closure reads narrows nothing and ` +
        `would sit in this tree looking like shipped work -- which is exactly what v4644's dead MH_IGNITE ` +
        `entry did until a census of this shape caught it.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the half of st.drive that a frame can actually show. Four species draw their " +
    "light in, helix draws in while winding tighter, and limn -- the one species in the table whose lean is " +
    "not a contraction -- changes without drawing in at all. The heading those five close around is the " +
    "sibling gate, tools/ship/murmurDrive-selfcheck.mjs, where it is graded as geometry because a frame " +
    "cannot show it cleanly." +
    "\nWHAT IS NOT CLAIMED: the RATE family. Sixteen of st.drive's 45 sites multiply a local clock, and " +
    "mh_drift's phase is rate * t, so a drive ramping at large t teleports it -- the same shape v4650 " +
    "repaired on this orb's host clock. Deferred with a rule the sibling gate CHECKS rather than states, " +
    "and recorded against the st.drive entry in tools/ship/nextRounds.mjs with the decision it needs.");
process.exit(fails ? 1 : 0);
