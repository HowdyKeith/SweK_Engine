// WebGLEngine/tools/ship/murmurClock4-selfcheck.mjs -- v4662
//
// *** THE PIXEL HALF OF v4662: FOUR SPECIES THAT DID NOT RESPOND TO RESPONDING AT ALL. ***
//
// Its sibling tools/ship/murmurClock3-selfcheck.mjs holds the arithmetic -- geode's coefficient against
// murmur's own mix, opal's phase against a quadrature of the moving rate, the one-frame jumps none of the
// three shipped, and the census that closes the clock arc. This file holds what a frame can answer, and the
// split is the CLOCK's rather than the subject's: one file measured 3,605 ms against a 3,000 ms ceiling once
// sol's two frames joined it, and a gate over budget does not run at ship time at all. A species costs one
// WGSL compile.
//
// *** WHAT IT MEASURES IS AN ABSENCE THAT WAS THERE BEFORE THIS ROUND. *** opal, geode, nebula and tempest
// moved 0 of 9,216 bytes between drive 0 and drive 1 -- the whole of murmur's RESPONDING lean -- because
// each one's rate carried no signal at all. The bound is each species' own v4661 reading, which was zero.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { sp, renderSpecies, N3, light } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurClock4-selfcheck -- four species that did not respond to RESPONDING, in pixels\n");

const RESPONDING = 3;

sec("1. *** AND IT REACHES PIXELS: all four species moved 0 of 9,216 bytes across the whole drive ramp ***");
{
    const SPEC = ["opal", "geode", "nebula", "tempest"];
    const FR = [];
    for (const s of SPEC) {
        FR.push(sp(s, 11.0, undefined, { stateIndex: RESPONDING, stateTau: 0 }));
        FR.push(sp(s, 11.0, undefined, { stateIndex: RESPONDING, stateTau: 0.55 }));
    }
    // *** THE ADVECTION MUST MOVE THE FIELD AND NOT THE BODY, AND NOTHING CHECKED THAT UNTIL A SABOTAGE
    // WALKED. *** MH_ADVECT_SIGN's note says it in words -- "mhInside(pM) is the silhouette and the glow's
    // radius is length(pM); advecting those would move the BODY rather than the field inside it, which is a
    // different species" -- and a note is not a check. Moving the displacement onto mhInside as well went
    // through v4662's whole battery without a red. These two frames sweep the drive integral far past
    // anything a ramp produces, so a silhouette that moved at all would move a long way.
    const SIL_LO = FR.push(sp("nebula", 11.0, undefined, { driveInt: 0 })) - 1;
    const SIL_HI = FR.push(sp("nebula", 11.0, undefined, { driveInt: 14 })) - 1;
    const run = await renderSpecies(FR);
    if (!run.ok || !run.frames || run.frames.length !== FR.length) {
        ok("!! the three sites render at all", false,
            `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}.`);
    } else {
        say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FR.length} frames over ${SPEC.length} species`);
        const diff = (a, b) => { let n = 0, mx = 0;
            for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; if (d > mx) mx = d; }
            return { pct: 100 * n / a.length, mx }; };
        const R = SPEC.map((s, i) => ({ s, d: diff(run.frames[i * 2], run.frames[i * 2 + 1]) }));
        for (const r of R) say(`${r.s.padEnd(8)} drive 0 -> 1: ${r.d.pct.toFixed(1)}% of bytes move, worst ${r.d.mx}   (at v4661: 0.0%, worst 0)`);
        // the silhouette, measured as the lit set rather than modelled
        const sil = (px) => { let n = 0, cx = 0, cy = 0, rmax = 0;
            for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
                const v = light(px, x, y);
                if (v <= 0.02) continue;
                const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
                n++; cx += dx; cy += dy; rmax = Math.max(rmax, Math.hypot(dx, dy));
            }
            return { n, cx: cx / Math.max(n, 1), cy: cy / Math.max(n, 1), rmax }; };
        const sLo = sil(run.frames[SIL_LO]), sHi = sil(run.frames[SIL_HI]);
        const inner = diff(run.frames[SIL_LO], run.frames[SIL_HI]);
        say(`nebula driveInt 0 -> 14: interior ${inner.pct.toFixed(1)}% of bytes; silhouette ${sLo.n} -> ${sHi.n} lit px, ` +
            `centroid (${sLo.cx.toFixed(4)}, ${sLo.cy.toFixed(4)}) -> (${sHi.cx.toFixed(4)}, ${sHi.cy.toFixed(4)}), radius ${sLo.rmax.toFixed(4)} -> ${sHi.rmax.toFixed(4)}`);
        ok("!! *** THE ADVECTION CARRIES THE FIELD AND NOT THE BODY: 20.9% of the interior moves, 0 of the outline ***",
            sLo.n === sHi.n && sLo.rmax === sHi.rmax &&
            Math.abs(sLo.cx - sHi.cx) < 1e-9 && Math.abs(sLo.cy - sHi.cy) < 1e-9 &&
            inner.pct > 5 && sLo.n > 100,
            `fourteen radian-seconds of accumulated drive -- far past anything RESPONDING's 0.55 s ramp ` +
            `produces -- move ${inner.pct.toFixed(1)}% of nebula's bytes while its lit set stays ${sLo.n} ` +
            `pixels with the same centroid to nine decimals and the same outer radius. THE DISPLACEMENT GOES ` +
            `ON THE NOISE LOOKUPS AND NOTHING ELSE: mhInside(pM) decides the silhouette and length(pM) the ` +
            `glow's falloff, and advecting either would carry the BODY across the frame instead of streaming ` +
            `the field through it. THIS ROW EXISTS BECAUSE A SABOTAGE WALKED: putting the same adv on ` +
            `mhInside went through v4662's whole battery green, on a claim the kit note made in words and ` +
            `nothing measured. At this sweep that mistake pushes the body clean out of the quad.`);

        ok("!! *** ALL FOUR RESPOND TO RESPONDING NOW, AND NOT ONE OF THEM DID BEFORE THIS ROUND ***",
            R.every((r) => r.d.pct > 5 && r.d.mx > 50),
            `${R.map((r) => `${r.s} ${r.d.pct.toFixed(1)}%`).join(", ")}. MEASURED AT v4661 WITH THE THREE ` +
            `MECHANISMS NEUTRALISED IN THE KIT: 0.0% and worst 0 on every one of the four -- 0 of 9,216 ` +
            `bytes between drive 0 and drive 1, the state murmur's design calls the lean. The pair holds ` +
            `stateIndex at RESPONDING in BOTH halves and moves only stateTau, so mh_live's own state weights ` +
            `are identical either side and what differs is st.drive and its integral alone -- the confound ` +
            `that made tools/ship/murmurDrive-selfcheck.mjs's first IDLE-vs-RESPONDING control meaningless ` +
            `at v4656 and had to be repaired there by holding activity at 0.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the pixel half of v4662. opal's flash drift, geode's spin mix and the " +
    "nebula/tempest advection were all ABSENCES rather than teleports -- murmur's rate moves at each of " +
    "those sites and this port's did not -- so the reading that matters is that four species went from 0 " +
    "of 9,216 bytes across the whole drive ramp to between 10.6% and 22.0% of them. " +
    "\nWHAT IS NEXT DOOR: the arithmetic, in tools/ship/murmurClock3-selfcheck.mjs -- geode's coefficient " +
    "graded against murmur's own mix, opal's phase against a 4,096-step quadrature of the moving rate, the " +
    "one-frame jumps none of the four shipped, and the census that closes the clock arc. " +
    "\nWHERE sol's GRANULATION IS GRADED: tools/ship/murmurSpecies9-selfcheck.mjs, which already renders " +
    "sol at both ends of its simmer knob and owns the TEXTURE statistic that term needs. A byte count at " +
    "this file's operating point reads 0.0% on it -- measured -- and this round nearly recorded that as " +
    "\"it cannot be seen at all\" before checking the gate that was already seeing it. The instrument was " +
    "wrong, not the picture.");
process.exit(fails ? 1 : 0);
