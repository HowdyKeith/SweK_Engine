// WebGLEngine/tools/ship/murmurLive2-selfcheck.mjs -- v4641
//
// *** THE SECOND HALF OF THE mh_live PIXEL EVIDENCE. *** tools/ship/murmurLive-selfcheck.mjs carries arc and
// still, the file's whole rationale, and the source census; this gate carries the two species that ask the
// question differently, and nothing here repeats a row from there.
//
// THE SPLIT IS A MEASUREMENT AND NOT A TIDINESS: all four species in one gate came back ALL GREEN at 2,772 ms
// against a 3,000 ms ceiling, which is 8% of margin on a box the tree measures running about 10% slower under
// a contended sweep. A species costs about 280 ms (one WGSL compile) and a frame about 25, so the compiles
// are the whole bill. A gate over budget does not run at ship time AT ALL.
//
// WHY THESE TWO AND NOT ANY OTHER TWO:
//
//   chorus -- its cadence site is a PERIOD (CH.perB minus pace times CH.perPace), where arc's is a shimmer
//             amplitude. A wiring error that happened to be harmless on a brightness is not harmless on a
//             clock, and the two are not the same test even though they read the same signal.
//   droplet -- its VOICE drives mh_shape's swell, which scales the whole body. On this one species of the
//             eighteen the 20%-hot error this round fixes was a 20%-hot SILHOUETTE rather than an exposure,
//             which is the one form of it no tone-curve headroom could have absorbed.
"use strict";

import { renderSpecies } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

// murmur's own four numbers, written out by hand rather than imported from the subject -- the v4579 scar is a
// gate that re-stated the formula it was grading. The sibling gate spells them out the same way, deliberately:
// two independent transcriptions of kit.ts is the point, and a shared constants module would undo it.
const V_EXP = 0.65, V_REST = 0.55, P_EXP = 0.85, P_REST = 0.60;
const INK = [0x0A / 255, 0x0A / 255, 0x0B / 255];
const BASE = { time: 3.0, speed: 1, glow: 0.15, depth: 1, hueShift: 0, presence: 0.5, clarity: 0.6,
               glintRate: 0.3, voice: 0.30, aspect: 1, activity: 0.40, stateIndex: 0, colors: { ink: INK } };
// glow 0.15 for the reason every species gate runs there: at the default the frame peaks near 646 of 765 and
// a row reads the display curve instead of the physics. The v4634 scar, shared.

const L_LISTEN = 0.30, A_WORK = 0.40;
const L_PARTNER = L_LISTEN * Math.pow(V_REST, -1 / V_EXP);   // 0.752598 -- same conditioned voice, other state
const A_PARTNER = A_WORK * Math.pow(P_REST, -1 / P_EXP);     // 0.729556 -- same conditioned cadence
const A_SQRT = A_WORK * Math.pow(P_REST, -1 / 0.5);          // the near-miss a square-root cadence would need

const f = (species, extra) => ({ factoryArgs: { species }, knobs: { ...BASE, ...extra } });
// STATES: 0 idle, 1 listening, 2 thinking, 3 responding, 4 success.
const FRAMES = [
    /* 0 */ f("chorus", { stateIndex: 3, activity: A_WORK }),
    /* 1 */ f("chorus", { stateIndex: 0, activity: A_PARTNER }),
    /* 2 */ f("chorus", { stateIndex: 0, activity: A_SQRT }),
    /* 3 */ f("chorus", { stateIndex: 0, activity: 0.0 }),
    /* 4 */ f("chorus", { stateIndex: 0, activity: 1.0 }),
    /* 5 */ f("droplet", { stateIndex: 1, voice: L_LISTEN }),
    /* 6 */ f("droplet", { stateIndex: 0, voice: L_PARTNER }),
    /* 7 */ f("droplet", { stateIndex: 0, voice: L_LISTEN }),
];

const t0 = Date.now();
const run = await renderSpecies(FRAMES);
say(`rendered ${FRAMES.length} frames over 2 species in ${Date.now() - t0} ms (one launch, two shader compiles)`);

const cmp = (a, b) => { let sum = 0, n = 0, mx = 0;
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); sum += d; if (d) n++; if (d > mx) mx = d; }
    return { sum, n, mx }; };
// The lit footprint: pixels whose green exceeds the frame's OWN p90, so the threshold is a set the picture
// decides rather than a number this gate chose -- the same instrument v4636's geode row had to be repaired into.
const foot = (px) => { const g = []; for (let i = 1; i < px.length; i += 4) g.push(px[i]);
    const s = [...g].sort((x, y) => x - y), t = s[Math.floor(s.length * 0.90)];
    return g.reduce((c, v) => c + (v > t ? 1 : 0), 0); };

if (!run.ok) {
    ok("!! the orb renders so mh_live's arrival can be measured at all", false,
        `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "unknown")}. A gate that ` +
        `cannot drive its own subject is a FAIL row here rather than a silent skip.`);
} else {
    const F = run.frames;

    sec("1. *** chorus: THE CADENCE DRIVES A CLOCK HERE, NOT A BRIGHTNESS, AND IT IS THE SAME CURVE ***");
    {
        const eq = cmp(F[0], F[1]), near = cmp(F[0], F[2]), span = cmp(F[3], F[4]);
        say(`chorus: responding at ${A_WORK} vs idle at ${A_PARTNER.toFixed(6)} -- ${eq.n} of ${F[0].length} bytes ` +
            `differ; against the 0.5-exponent partner ${A_SQRT.toFixed(6)}, ${near.n} bytes, total ${near.sum}; ` +
            `across activity 0 to 1, ${span.n} bytes, total ${span.sum}, worst ${span.mx}`);
        ok("!! *** chorus: THE CADENCE EXPONENT IS 0.85 AND THE RESTING WEIGHT IS 0.60, TO THE BYTE ***",
            eq.n === 0 && near.sum > 300 && span.sum > 500,
            `${eq.n} differing bytes between a cadence of ${A_WORK} in RESPONDING and ${A_PARTNER.toFixed(6)} in ` +
            `IDLE -- the same conditioned number, so the same picture. RESPONDING and IDLE weight the VOICE ` +
            `identically (only LISTENING lifts it), so this pair isolates the cadence and nothing else. The ` +
            `square-root near-miss disagrees by ${near.sum} and the full cadence span moves ${span.sum}, so the ` +
            `row is not passing because chorus is insensitive or dark. chorus spends its pace on the ensemble's ` +
            `PERIOD rather than on a brightness: a wiring error harmless to an exposure is not harmless to a clock.`);
    }

    sec("2. *** droplet: CONDITIONING THE VOICE MOVES THE SILHOUETTE AND NOT ONLY THE EXPOSURE ***");
    {
        const fLit = foot(F[5]), fPartner = foot(F[6]), fRaw = foot(F[7]);
        const eq = cmp(F[5], F[6]), raw = cmp(F[5], F[7]);
        say(`droplet footprint above its own p90: listening@${L_LISTEN} ${fLit}, idle@${L_PARTNER.toFixed(4)} ` +
            `${fPartner}, idle@${L_LISTEN} ${fRaw}; equal-voice pair differs by ${eq.n} bytes, raw-level pair by ` +
            `${raw.sum} over ${raw.n}`);
        ok("!! *** THE BODY IS THE SAME SIZE FOR THE SAME CONDITIONED VOICE AND A DIFFERENT SIZE FOR A DIFFERENT ONE ***",
            eq.n === 0 && fLit === fPartner && raw.sum > 1000 && fRaw !== fLit,
            `the two frames carrying the identical conditioned voice differ by ${eq.n} bytes and cover ${fLit} ` +
            `and ${fPartner} pixels; the frame carrying the same RAW level in the other state differs by ` +
            `${raw.sum} across ${raw.n} bytes and covers ${fRaw}. droplet's voice drives mh_shape's swell, which ` +
            `scales the WHOLE body -- so the footprint moving is the outline moving, and this is the one species ` +
            `of the eighteen where a 20%-hot voice was a 20%-hot silhouette. BOTH halves are required: the ` +
            `footprints being equal alone would be passed by a shader whose body ignored the voice entirely.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the two species whose use of mh_live is structurally unlike arc's and still's -- " +
    "a cadence spent on a PERIOD, and a voice that moves the body's outline. The rationale, the arc and still " +
    "rows, and the all-eighteen source census are in tools/ship/murmurLive-selfcheck.mjs." +
    "\nWHAT IS NOT CLAIMED: mh_state. Its four outputs are ported and graded against a real GPU in " +
    "tools/ship/murmurKit-selfcheck.mjs section 11 and are read by no species -- an absent feature, not a " +
    "defect, and its own round.");
process.exit(fails ? 1 : 0);
