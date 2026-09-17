// WebGLEngine/tools/ship/murmurLive-selfcheck.mjs -- v4641
//
// *** ONE OF A PAIR, AND THE SPLIT IS A MEASUREMENT. *** arc and still live here; chorus and droplet live in
// tools/ship/murmurLive2-selfcheck.mjs. All four in one gate came back ALL GREEN at 2,772 ms against a 3,000
// ms ceiling -- 8% of margin on a box the tree measures running about 10% slower under a contended sweep,
// which is over. A species costs about 280 ms here (one WGSL compile) and a frame about 25, so the compiles
// are the whole bill and dropping frames would not have bought anything. v4626 made exactly this split
// between the kit and the species and recorded the reason: a gate over budget does not run at ship time AT
// ALL, so the round that crosses the line is the round whose red nobody sees.
//
// *** THE GATE FOR mh_live ARRIVING IN THE PICTURE. *** tools/ship/murmurKit-selfcheck.mjs section 11 grades
// the FUNCTION against a real GPU, bit for bit. This gate asks the different and harder question: does
// render/aiPresenceOrbTsl.mjs actually put the conditioned pair where murmur puts it, or does it still hand a
// raw knob to the species and a STYLE knob to the six that want a cadence?
//
// BECAUSE UNTIL v4641 IT DID BOTH. Every one of murmur's eighteen shaders reads `live.voice`; not one reads a
// raw level. This port read the raw uniform at 44 sites, and at 8 more it read `glintRate` -- still.ts's OWN
// dial out of murmur's styles.ts roster, a fixed setting the user chooses -- in the place murmur reads
// `live.pace`, which moves with what the host is doing. At the species gates' own VOICE of 0.3, idle,
// murmur's live.voice is 0.3^0.65 * 0.55 = 0.2504 where this port passed 0.3000, 20% hot; at 1.0 it is 0.5500
// against 1.0000, 45% hot. The error GROWS with the knob, so every species was loudest exactly where it was
// least faithful and no single scale factor could have absorbed it.
//
// *** THE INSTRUMENT IS AN EQUIVALENCE AND NOT A DIFFERENCE, WHICH IS WHY IT CAN BE TIGHT. *** A row saying
// "the state moves the pixels" passes for any wiring at all that reads the state. Instead:
//
//     live.voice(L, LISTENING) = L^0.65 * 1.00        live.voice(L, anything else) = L^0.65 * 0.55
//
// so a level of 0.30 in LISTENING and a level of 0.30 * 0.55^(-1/0.65) = 0.752598 in IDLE are the SAME
// conditioned voice, and the two frames must come back BYTE-IDENTICAL. That single equality pins the exponent
// AND the weight AND the window at once: at an exponent of 0.5 the partner level would be 0.991722 instead,
// which this gate renders as well and requires to DISAGREE. Same construction for pace, whose numbers are
// 0.85 and 0.60 and whose window covers two states rather than one.
//
// WHAT IS NOT CLAIMED HERE: mh_state. It is ported and graded in the kit, and it is not called by the orb --
// murmur's eighteen sources reference st.drive 44 times, st.complete 49, st.settled 19 and st.sweep 16, each
// a transcription with its own constants, and that is its own round. The orb therefore gained `activity` and
// `stateIndex` and deliberately NOT `stateTau`: a uniform nothing reads is a row that cannot fail.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderSpecies, ENG, VOICE, ACTIVITY, VOICE_LIVE, PACE_LIVE } from "./murmurSpeciesFrames.mjs";
import { mhLive } from "../../render/murmurKit.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

// murmur's own four numbers, written out here rather than imported from the subject -- the v4579 scar is a
// gate that re-stated the formula it graded, and v4640 had to re-title two rows for grading a table.
const V_EXP = 0.65, V_REST = 0.55, P_EXP = 0.85, P_REST = 0.60;
const INK = [0x0A / 255, 0x0A / 255, 0x0B / 255];
const BASE = { time: 3.0, speed: 1, glow: 0.15, depth: 1, hueShift: 0, presence: 0.5, clarity: 0.6,
               glintRate: 0.3, voice: 0.30, aspect: 1, activity: 0.40, stateIndex: 0, colors: { ink: INK } };
// glow is 0.15 for the same reason every species gate runs there: at the default the frame peaks near 646 of
// 765 and a row reads the display curve instead of the physics. That is the v4634 scar and it is shared.

// The partner level in a NON-lifted state that produces the identical conditioned signal.
const partnerV = (L, exp) => L * Math.pow(V_REST, -1 / exp);
const partnerP = (A, exp) => A * Math.pow(P_REST, -1 / exp);
const L_LISTEN = 0.30, A_WORK = 0.40;
const L_PARTNER = partnerV(L_LISTEN, V_EXP);        // 0.752598
const L_SQRT = partnerV(L_LISTEN, 0.5);             // 0.991722 -- what a square-root port would need
const A_PARTNER = partnerP(A_WORK, P_EXP);          // 0.729556
const A_SQRT = partnerP(A_WORK, 0.5);               // ...the same near-miss on the cadence curve

const f = (species, extra) => ({ factoryArgs: { species }, knobs: { ...BASE, ...extra } });
// STATES: 0 idle, 1 listening, 2 thinking, 3 responding, 4 success.
const FRAMES = [
    // arc -- the species with the largest cadence response in the family, and it reads both signals.
    /*  0 */ f("arc", { stateIndex: 1, voice: L_LISTEN }),
    /*  1 */ f("arc", { stateIndex: 0, voice: L_PARTNER }),
    /*  2 */ f("arc", { stateIndex: 0, voice: L_SQRT }),
    /*  3 */ f("arc", { stateIndex: 3, activity: A_WORK }),
    /*  4 */ f("arc", { stateIndex: 0, activity: A_PARTNER }),
    /*  5 */ f("arc", { stateIndex: 2, activity: A_WORK }),
    /*  6 */ f("arc", { stateIndex: 0, activity: A_SQRT }),
    /*  7 */ f("arc", { stateIndex: 0, activity: 0.0 }),
    /*  8 */ f("arc", { stateIndex: 0, activity: 1.0 }),
    // still -- the one species here with NO cadence site at all. Its glintRate is its own style dial.
    /*  9 */ f("still", { stateIndex: 0, activity: 0.0 }),
    /* 10 */ f("still", { stateIndex: 0, activity: 1.0 }),
    /* 11 */ f("still", { stateIndex: 1, voice: L_LISTEN }),
    /* 12 */ f("still", { stateIndex: 0, voice: L_PARTNER }),
];

const t0 = Date.now();
const run = await renderSpecies(FRAMES);
say(`rendered ${FRAMES.length} frames over 2 species in ${Date.now() - t0} ms (one launch, two shader compiles)`);

// |a - b| summed over every byte, plus how many bytes differ at all and the worst single one.
const cmp = (a, b) => { let sum = 0, n = 0, mx = 0;
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); sum += d; if (d) n++; if (d > mx) mx = d; }
    return { sum, n, mx }; };
// The lit footprint: pixels whose green exceeds the frame's own p90, which is a set the PICTURE decides.
const foot = (px) => { const g = []; for (let i = 1; i < px.length; i += 4) g.push(px[i]);
    const s = [...g].sort((x, y) => x - y), t = s[Math.floor(s.length * 0.90)];
    return g.reduce((c, v) => c + (v > t ? 1 : 0), 0); };

if (!run.ok) {
    ok("!! the orb renders so mh_live's arrival can be measured at all", false,
        `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "unknown")}. A gate that ` +
        `cannot drive its own subject is a FAIL row here rather than a silent skip.`);
} else {
    const F = run.frames;

    sec("1. *** THE VOICE EQUIVALENCE: A LEVEL IN LISTENING AND ITS PARTNER IN IDLE ARE THE SAME PICTURE ***");
    for (const [name, a, b, c] of [["arc", 0, 1, 2], ["still", 11, 12, null]]) {
        const eq = cmp(F[a], F[b]);
        const near = c === null ? null : cmp(F[a], F[c]);
        say(`${name}: listening at ${L_LISTEN} vs idle at ${L_PARTNER.toFixed(6)} -- ${eq.n} of ${F[a].length} ` +
            `bytes differ, worst ${eq.mx}` + (near ? `; against the 0.5-exponent partner ${L_SQRT.toFixed(6)}, ` +
            `${near.n} bytes differ, worst ${near.mx}, total ${near.sum}` : ""));
        ok(`!! *** ${name}: THE EXPONENT IS 0.65 AND THE RESTING WEIGHT IS 0.55, TO THE BYTE ***`,
            eq.n === 0 && (near === null || near.sum > 2000),
            `${eq.n} differing bytes between the two frames -- a level of ${L_LISTEN} conditioned in LISTENING ` +
            `and ${L_PARTNER.toFixed(6)} conditioned in IDLE are the same number, so they are the same picture. ` +
            (near ? `The near-miss a square-root port would need, ${L_SQRT.toFixed(6)}, disagrees by ${near.sum} ` +
                    `across ${near.n} bytes: the row is not passing because both frames are dark. ` : "") +
            `This cannot be passed by a shader that reads the raw knob, because such a shader would see two ` +
            `DIFFERENT levels and could not care what state it was in.`);
    }

    sec("2. *** THE CADENCE EQUIVALENCE, AND ITS WINDOW IS TWO STATES WIDE WHERE VOICE'S IS ONE ***");
    for (const [name, a, b] of [["arc", 3, 4]]) {
        const eq = cmp(F[a], F[b]);
        say(`${name}: responding at ${A_WORK} vs idle at ${A_PARTNER.toFixed(6)} -- ${eq.n} bytes differ, worst ${eq.mx}`);
        ok(`!! *** ${name}: THE CADENCE EXPONENT IS 0.85 AND THE RESTING WEIGHT IS 0.60, TO THE BYTE ***`,
            eq.n === 0,
            `${eq.n} differing bytes. RESPONDING and IDLE weight the VOICE identically (only LISTENING lifts ` +
            `it), so this pair isolates the cadence and nothing else -- which is why the frames can be required ` +
            `to match exactly rather than approximately.`);
    }
    {
        const nearP = cmp(F[3], F[6]);
        ok("!! ...and the 0.5-exponent near-miss on the cadence curve does NOT match",
            nearP.sum > 500,
            `the partner a square-root cadence would need, ${A_SQRT.toFixed(6)}, disagrees with the responding ` +
            `frame by ${nearP.sum} across ${nearP.n} bytes, worst ${nearP.mx}. Without this line the row above ` +
            `would be satisfied by any curve at all that happened to be flat over this interval.`);
        const win = cmp(F[3], F[5]);
        const vWin = cmp(F[0], F[5]);
        say(`arc: responding vs thinking at the same knobs -- ${win.n} bytes differ; listening vs thinking -- ${vWin.n} bytes differ, total ${vWin.sum}`);
        ok("!! *** THINKING AND RESPONDING ARE ONE CADENCE WINDOW, AND LISTENING IS OUTSIDE IT ***",
            win.n === 0 && vWin.sum > 2000,
            `states 2 and 3 at identical knobs give ${win.n} differing bytes -- the window is the open interval ` +
            `(1.5, 3.5) and covers both -- while state 1 differs from state 2 by ${vWin.sum} across ${vWin.n} ` +
            `bytes, because the VOICE window is (0.5, 1.5) and covers neither. kit.ts puts cadence "at full ` +
            `strength in THINKING and RESPONDING, where a token stream is the thing actually happening". A port ` +
            `with one shared window would fail exactly one of these two halves and pass the other.`);
    }

    sec("3. *** THE CADENCE IS WHERE murmur PUTS IT AND NOT EVERYWHERE: still IS EXACTLY INVARIANT TO IT ***");
    {
        const sSpan = cmp(F[9], F[10]);
        const aSpan = cmp(F[7], F[8]);
        say(`activity 0 -> 1: still moves ${sSpan.sum} bytes over ${sSpan.n}, arc ${aSpan.sum} over ${aSpan.n} (worst ${aSpan.mx})`);
        ok("!! *** still DOES NOT MOVE AT ALL ACROSS THE WHOLE CADENCE RANGE, AND arc DOES ***",
            sSpan.n === 0 && aSpan.sum > 2000,
            `still: ${sSpan.n} differing bytes across activity 0 to 1 -- EXACTLY zero, because still is not one ` +
            `of the six species murmur gives a cadence to, and its glintRate is its own style dial out of ` +
            `styles.ts. arc moves ${aSpan.sum} over the same span. The zero alone would be passed by a shader ` +
            `that ignored the activity knob entirely, and the nonzero alone by a port that sprayed it over all ` +
            `eighteen; the pair together is the claim, and murmurLive2-selfcheck.mjs adds chorus to each half.`);
    }
}

// =============================================================================================================
sec("4. *** THE SOURCE CENSUS: WHICH SPECIES READ WHICH SIGNAL. NOT A RENDER, AND TITLED SO. ***");
{
    // *** THIS SECTION GRADES THE FILE AND NOT THE PICTURE, AND SAYS SO IN ITS OWN TITLE. *** v4640 shipped two
    // rows that computed an answer out of a constant table, called it a measurement of the shader, and let
    // three sabotages walk through. The rows above are the pixel evidence and cover four of the eighteen
    // species; this one covers all eighteen and is a WEAKER kind of evidence, which is the trade it is making
    // rather than one it is hiding. Rendering all eighteen costs 6,439 ms against a 3,000 ms gate budget --
    // measured, not estimated -- and a gate over budget does not run at ship time at all.
    const src = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const count = (re) => (src.match(re) || []).length;

    const rawV = count(/uniforms\.voice\b/g), rawA = count(/uniforms\.activity\b/g), rawS = count(/uniforms\.stateIndex\b/g);
    const callLine = (src.split("\n").find((l) => l.includes("KIT.mhLive(")) || "").trim();
    ok("!! *** EACH RAW LIVE UNIFORM IS READ EXACTLY ONCE IN THE WHOLE FILE, AND ALL THREE BY THE SAME CALL ***",
        rawV === 1 && rawA === 1 && rawS === 1 &&
        /KIT\.mhLive\(uniforms\.voice,\s*uniforms\.activity,\s*uniforms\.stateIndex\)/.test(src),
        `uniforms.voice ${rawV}, uniforms.activity ${rawA}, uniforms.stateIndex ${rawS}, and the one reader of ` +
        `all three is: ${callLine} -- so there is no second path by which a raw level could reach a species. ` +
        `Before v4641 that first count was 44.`);

    const decl = count(/const VOICE = /g) + count(/const PACE = /g);
    const readV = count(/\bVOICE\b/g) - 1, readP = count(/\bPACE\b/g) - 1;
    ok("!! the conditioned pair is declared once each and read 44 and 8 times",
        decl === 2 && readV === 44 && readP === 8,
        `${readV} readers of the conditioned voice and ${readP} of the conditioned cadence. Those are the same ` +
        `two counts the defect had: 44 sites took the raw knob and 8 took glintRate, and every one of the 52 ` +
        `was moved rather than a subset.`);

    // Per-species, so the census names WHICH six carry a cadence instead of only how many sites there are.
    const lines = src.split("\n");
    const marks = [];
    lines.forEach((l, i) => { const m = /^\s*const build([A-Z]\w*) = \(\) => \{/.exec(l); if (m) marks.push([i, m[1].toLowerCase()]); });
    marks.push([lines.length, "(end)"]);
    const paced = [], voiced = [];
    for (let k = 0; k < marks.length - 1; k++) {
        const blk = lines.slice(marks[k][0], marks[k + 1][0]).join("\n");
        if ((blk.match(/\bPACE\b/g) || []).length) paced.push(marks[k][1]);
        if ((blk.match(/\bVOICE\b/g) || []).length) voiced.push(marks[k][1]);
    }
    // `mist` is the shared builder nebula and tempest are both drawn by, which is why 17 builders cover 18 species.
    const WANT_PACED = ["arc", "sol", "aura", "flux", "chorus", "prism"];
    say(`builders reading the conditioned cadence: ${paced.join(", ")}; reading the conditioned voice: ${voiced.length} of ${marks.length - 1}`);
    ok("!! *** THE SIX SPECIES WITH A CADENCE ARE murmur's SIX, NAMED, AND THE OTHER ELEVEN BUILDERS HAVE NONE ***",
        paced.length === WANT_PACED.length && WANT_PACED.every((s) => paced.includes(s)),
        `exactly ${paced.join(", ")} -- and no other builder reads it. These are the eight glintRate sites the ` +
        `defect had, gathered by species: sol and flux carry two each, the other four one. A port that routed ` +
        `the cadence to every species would draw a shimmer on eleven bodies murmur leaves still.`);

    const stillGlint = count(/uniforms\.glintRate\b/g);
    const stillBlk = (() => { const k = marks.findIndex((m) => m[1] === "still");
        return lines.slice(marks[k][0], marks[k + 1][0]).join("\n"); })();
    ok("!! still's OWN glintRate dial survived the round -- both its readers are inside buildStill",
        stillGlint === 2 && (stillBlk.match(/uniforms\.glintRate\b/g) || []).length === 2,
        `${stillGlint} readers in the file and both are in buildStill. glintRate IS a real knob on still -- ` +
        `murmur's styles.ts gives it one -- and the defect was the OTHER eight species borrowing it as a stand-` +
        `in for a signal they do not have. Deleting it would have been the opposite error to the one being fixed.`);

    // *** THE FIFTEEN SPECIES GATES' OPERATING POINT ROUND-TRIPS, AND NOTHING CHECKED IT UNTIL A SABOTAGE. ***
    // murmurSpeciesFrames.mjs states where those gates stand as a CONDITIONED pair and derives the raw knobs by
    // inverting mh_live. Three of them (abyss's rim, droplet's swell, tempest's lanes) then predict what the
    // shader will do FROM the conditioned value, so if the two halves ever drift apart every one of those
    // predictions is quietly for a signal the shader never receives. Setting VOICE to VOICE_LIVE -- exactly the
    // first-cut mistake, a raw knob used as though it were conditioned -- left droplet's and tempest's gates
    // GREEN, because their claims are about kind and ratio and they tolerate a 17% shift. This row does not.
    {
        const got = mhLive(VOICE, ACTIVITY, 0);
        const dV = Math.abs(got.voice - VOICE_LIVE), dP = Math.abs(got.pace - PACE_LIVE);
        say(`the species gates stand at raw voice ${VOICE.toFixed(7)} and activity ${ACTIVITY.toFixed(7)}, ` +
            `which condition to ${got.voice.toFixed(10)} and ${got.pace.toFixed(10)}`);
        ok("!! *** THE SPECIES GATES' RAW KNOBS INVERT BACK TO THE CONDITIONED PAIR THEY CLAIM, TO f64 ***",
            dV < 1e-12 && dP < 1e-12 && VOICE !== VOICE_LIVE && ACTIVITY !== PACE_LIVE,
            `|conditioned - claimed| is ${dV.toExponential(2)} on the voice and ${dP.toExponential(2)} on the ` +
            `cadence. The last two clauses are there because the failure this row exists for is a raw knob set ` +
            `EQUAL to the conditioned target -- which is an inversion that forgot to invert, and it passes any ` +
            `test of the form "these two agree" that does not also require them to differ.`);
    }

    // *** WHERE mh_present's KNEE IS CALLED, WHICH IS A STRUCTURAL FACT NO PIXEL ROW IN THIS TREE CATCHES. ***
    // The catchlight and the contact shadow read `paper` and must run in the species shader on both paths;
    // the KNEE must run on the direct path and NOT on the HDR one, where render/aiPresenceOrbPresent.mjs
    // already applies knee(x, 0.90) quoting present.wgsl's "the tone curve ... is written ONCE".
    //
    // THE DOUBLE-KNEE DIRECTION IS CAUGHT IN PIXELS, by aiPresenceOrbPresent-selfcheck's peak-agreement row,
    // which is what found it. THE MISSING-KNEE DIRECTION IS NOT, and that was measured rather than assumed:
    // deleting the knee from the direct path too moves 20 bytes of 9,216 on arc and 4 on sol -- the only two
    // species whose linear light passes 0.90 at all (0.9647 and 0.9387) -- and every species gate stayed
    // GREEN through it. So this row grades the FILE, and says so, because the alternative is a term that
    // could quietly leave and take 24 bytes with it.
    const kneeCalls = (src.match(/KIT\.mhPresentKnee\(/g) || []).length;
    const paperCalls = (src.match(/KIT\.mhPresentPaper\(/g) || []).length;
    const kneeLine = (src.split("\n").find((l) => l.includes("KIT.mhPresentKnee(")) || "").trim();
    ok("!! *** THE KNEE SITS IN THE SAME `linear ?` BRACKET AS THE sRGB ENCODE, AND THE PAPER TERMS DO NOT ***",
        kneeCalls === 1 && paperCalls === 1 && /linear \?[^\n]*KIT\.mhPresentKnee\(/.test(src) &&
        !/linear \?[^\n]*KIT\.mhPresentPaper\(/.test(src),
        `one call to each: the knee is ${kneeLine} -- inside the bracket, beside linearToSrgb -- and the two ` +
        `ground-dependent terms are outside it, unconditional. On the HDR path the present pass owns the tone ` +
        `curve; nothing downstream of this shader knows what ground it is on, so it owns the other two.`);

    ok("!! stateTau is deliberately absent: mh_state is ported, graded in the kit, and not yet called here",
        !/uniforms\.stateTau/.test(src) && !/\bST\.(complete|sweep|settled|drive)\b/.test(src),
        `no stateTau uniform and no reader of mh_state's four outputs. murmur's eighteen sources reference ` +
        `st.drive 44 times, st.complete 49, st.settled 19 and st.sweep 16, each a transcription with its own ` +
        `constants -- an ABSENT FEATURE, where live was a CORRECTNESS fix to what already ships. A uniform ` +
        `nothing reads is a row that cannot fail, so this round did not add one.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: mh_live is the one function every species in murmur's family reads and this port " +
    "did not have. The kit's own gate proves the FUNCTION is right on a real GPU; this one proves the ORB " +
    "CALLS IT, which is the half a correct-and-unwired port would pass in silence." +
    "\nWHAT IS NOT CLAIMED: mh_state's four outputs reach no pixel -- ported and graded in the kit, not wired, " +
    "by design. The pixel rows here cover TWO of the eighteen species, arc and still, chosen as the largest " +
    "cadence response in the family and the one that has none at all; chorus and droplet are the other two " +
    "and they are in tools/ship/murmurLive2-selfcheck.mjs. The remaining fourteen are covered by the source " +
    "census at section 5 -- which grades the FILE and not the picture, and says so in its own title -- and by " +
    "their own species gates, every one of which now renders through the conditioner. Rendering all eighteen " +
    "in one gate costs 6,439 ms against a 3,000 ms budget, measured.");
process.exit(fails ? 1 : 0);
