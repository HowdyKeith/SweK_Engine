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
// WHAT IS NOT CLAIMED HERE, AND THIS NOTE HAS BEEN HALF-DISCHARGED: mh_state was ported and graded in the kit
// and NOT called by the orb, so v4641 added `activity` and `stateIndex` and deliberately not `stateTau`.
// v4644 wired three of its four outputs -- `settled` on all eighteen interiors, and the pair (complete,
// sweep) the SUCCESS shell travels on, in the seven marched heroes -- so `stateTau` is a uniform now and the
// row that said it was absent has inverted into one that says what reads it. v4653 wired the FOURTH, and
// only partly: st.drive has 45 references across murmur's eighteen sources doing THREE different things,
// and that round took the two that are a DIRECTION or a SIZE and left the sixteen that multiply a local
// clock. So the row inverts a second time and the deferral is checked next door rather than promised here.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderSpecies, ENG, VOICE, ACTIVITY, VOICE_LIVE, PACE_LIVE } from "./murmurSpeciesFrames.mjs";
import { mhLive, MH_SETTLED, MH_SETTLED_INTERIOR, MH_IGNITE } from "../../render/murmurKit.mjs";
import { codeOnly } from "./sourceScan.mjs";

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
    // still -- which had NO cadence site at all until v4656 gave its gesture slot murmur's divisor.
    // Its glintRate is its own style dial and stays one; what it did not have was the signal beside it.
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

    sec("3. *** THE CADENCE REACHES still NOW, AND UNTIL v4656 THIS ROW ASSERTED THAT IT COULD NOT ***");
    {
        const sSpan = cmp(F[9], F[10]);
        const aSpan = cmp(F[7], F[8]);
        say(`activity 0 -> 1: still moves ${sSpan.sum} bytes over ${sSpan.n}, arc ${aSpan.sum} over ${aSpan.n} (worst ${aSpan.mx})`);
        // *** THIS ROW SAID "still DOES NOT MOVE AT ALL ACROSS THE WHOLE CADENCE RANGE" AND GAVE murmur's OWN
        // DESIGN AS THE REASON: "still is not one of the six species murmur gives a cadence to". *** It is the
        // same falsehood the census below carried for thirteen rounds and v4654 inverted, in a different
        // room: counted in murmur's own sources live.pace appears in ALL EIGHTEEN, and still.ts in particular
        // divides its gesture slot by (1 + 0.30*live.pace + 1.70*st.drive). The zero this row required was a
        // GAP IN THIS PORT wearing the clothes of a design decision -- and because it was written as a
        // requirement, it would have gone red the day anybody closed the gap. Which is what happened: v4656
        // gave still its slot divisor and this row went red reading 613 bytes over 270.
        //
        // A ROW THAT GOES RED WHEN A PORT GETS MORE FAITHFUL IS POINTING THE WRONG WAY. So it inverts, and
        // the half it used to carry -- that the cadence does not reach everywhere -- moves to where it can be
        // stated truthfully: the source census in section 4, which names the six builders that do not read it
        // and calls them a gap, and tools/ship/murmurGesture-selfcheck.mjs, whose DEAF rows show in pixels
        // that still's slot ignores the VOICE integral and tempest's bolts ignore cadence and drive. That is
        // the real "not everywhere" claim -- a signal absent where murmur omits it, rather than absent where
        // this port has not arrived.
        ok("!! *** still MOVES ON THE CADENCE NOW, AND arc STILL DOES: 613 bytes and 5,227 across the same span ***",
            sSpan.n > 0 && sSpan.sum > 200 && aSpan.sum > 2000 && aSpan.sum > sSpan.sum,
            `still moves ${sSpan.sum} bytes over ${sSpan.n} across activity 0 to 1, where it moved EXACTLY ` +
            `ZERO before v4656 -- still.ts divides its gesture slot by (1 + 0.30*live.pace + 1.70*st.drive) ` +
            `and this port carried no divisor at all, so the one event in still's frame arrived at the same ` +
            `rate whether or not anybody was talking to it. arc moves ${aSpan.sum} over the same span, and it ` +
            `MOVES MORE, which is the shape of the two species: arc reads the cadence in a continuous rate ` +
            `and still reads it in a gesture that is either on screen or not. THE ORDERING IS PART OF THE ` +
            `ROW -- a port that sprayed the cadence over everything at one strength would not produce it.`);
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

    const rawV = count(/uniforms\.voice\b/g), rawA = count(/uniforms\.activity\b/g),
          rawS = count(/uniforms\.stateIndex\b/g), rawT = count(/uniforms\.stateTau\b/g);
    const callLine = (src.split("\n").find((l) => l.includes("KIT.mhLive(")) || "").trim();
    const stLine = (src.split("\n").find((l) => l.includes("KIT.mhState(")) || "").trim();
    // *** stateIndex IS READ TWICE NOW AND THAT IS THE CLAIM, NOT A RELAXATION. *** v4644 wired mh_state, and
    // murmur hands the same state to both conditioners: mh_live weights the microphone by it and mh_state
    // turns it plus the elapsed tau into four windows. The row names BOTH call sites in full rather than
    // loosening the count to "at most a few", which is how a census stops being one.
    ok("!! *** THE FOUR RAW LIVE UNIFORMS REACH NO SPECIES: TWO CONDITIONING CALLS ARE THEIR ONLY READERS ***",
        rawV === 1 && rawA === 1 && rawS === 2 && rawT === 1 &&
        /KIT\.mhLive\(uniforms\.voice,\s*uniforms\.activity,\s*uniforms\.stateIndex\)/.test(src) &&
        /KIT\.mhState\(uniforms\.stateIndex,\s*uniforms\.stateTau\)/.test(src),
        `uniforms.voice ${rawV}, uniforms.activity ${rawA}, uniforms.stateIndex ${rawS}, uniforms.stateTau ` +
        `${rawT}; the readers are ${callLine} and ${stLine} -- so there is no second path by which a raw level ` +
        `could reach a species. Before v4641 the voice count was 44 and there was no activity knob at all; ` +
        `before v4644 there was no stateTau and stateIndex was read once.`);

    // *** THIS CENSUS COUNTED ITS OWN PROSE UNTIL v4644, AND ITS RECORDED NUMBER WAS ONE TOO HIGH BECAUSE OF
    // IT. *** The counts ran over the raw file, so a COMMENT naming VOICE scored as a reader -- and one did,
    // in the declaration's own note. Recorded 44, true 43. It went unnoticed for three rounds because a
    // census that counts a mention of itself is only wrong when the prose changes, and then it is wrong in
    // the direction that looks like a real edit. Same defect as windowsImport's, which at v4642 found three
    // of its four offenders were the finding quoted back in a string. The fix is the same one: read through
    // sourceScan's codeOnly, which is one walker and not a second regex that drifts from the first.
    const code = codeOnly(src);
    const cc = (re) => (code.match(re) || []).length;
    const decl = cc(/const VOICE = /g) + cc(/const PACE = /g);
    const readV = cc(/\bVOICE\b/g) - 1, readP = cc(/\bPACE\b/g) - 1;
    ok("!! the conditioned pair is declared once each and read 42 and 15 times, counting CODE and not comments",
        decl === 2 && readV === 42 && readP === 15,
        `${readV} readers of the conditioned voice and ${readP} of the conditioned cadence, with comments and ` +
        `strings stripped. The cadence count has moved in each of the last three rounds -- 11, then 14, then 15 ` +
        `-- and every step was an ABSENCE being filled rather than a number being invented: helix's climb ` +
        `took murmur's 0.75*live.pace at v4655, still's and abyss's gesture slots took 0.30 and 0.35 of it ` +
        `at v4656, and duet's orbital rate took 0.55 at v4657. The 43 before all that was a REPAIR of a ` +
        `recorded 44, not a regression: v4641 moved 44 raw-knob sites and 8 glintRate sites, and one of the ` +
        `44 collapsed into a shared expression while the census kept scoring the comment that named it. The ` +
        `pixel rows above are what say the move was real; this row says nothing was left behind.`);

    // mh_state's other three outputs, on the same terms. `drive` arrived at v4653 and has its own row below.
    const declS = cc(/const SETTLED = /g) + cc(/const COMPLETE = /g) + cc(/const SWEEP = /g);
    const readSe = cc(/\bSETTLED\b/g) - 1, readC = cc(/\bCOMPLETE\b/g) - 1, readSw = cc(/\bSWEEP\b/g) - 1;
    const igAt = cc(/\bigniteAt\b/g) - 1, igMist = cc(/\bigniteMist\b/g) - 1;
    ok("!! *** mh_state's THREE WIRED OUTPUTS ARE DECLARED ONCE EACH AND LAND ON EXACTLY THE SITES murmur HAS ***",
        declS === 3 && readSe === 3 && readC === 11 && readSw === 5 && igAt === 6 && igMist === 2,
        `settled ${readSe} readers -- the shared interior factor, comet's headBright and droplet's coreBright, ` +
        `which is murmur's nineteen sites collapsed onto the three shapes they take; complete ${readC} at ` +
        `v4658 and 2 before it -- the shell, the mist pair's pre-multiply, and the five v4658 added: the ` +
        `shared interior BRIGHTENING beside the settle, opal's and sol's and chorus's saturations, and sol's ` +
        `core gain, and the four v4659 added on top -- arc's, flux's, prism's and helix's TRAVELLING fronts, ` +
        `which is why sweep went from 1 reader to ${readSw} in the same round. SIX SPECIES MOVED ZERO BYTES ` +
        `AT THE PEAK OF THEIR OWN SUCCESS STATE until v4658, because kit.ts's "every species multiplies its ` +
        `own interior energy by (1 + complete)" had no reader here at all, and prism and helix STILL moved ` +
        `nothing until v4659 gave them the figure that is their whole flash; sweep ${readSw} -- the shell ` +
        `and the four axis fronts. The shell itself is ` +
        `spelled ONCE, as igniteAt, called from ${igAt} sites covering seven species because nebula and ` +
        `tempest share igniteMist, which is called ${igMist} times. murmur writes those four lines out seven ` +
        `times with four numbers changed; this file writes them once and reads the numbers from MH_IGNITE.`);

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
    // *** THIS ROW ASSERTED SOMETHING FALSE ABOUT murmur FOR THIRTEEN ROUNDS, AND v4654 MEASURED IT. ***
    // It read "THE SIX SPECIES WITH A CADENCE ARE murmur's SIX ... A port that routed the cadence to every
    // species would draw a shimmer on eleven bodies murmur leaves still." Counted in murmur's own eighteen
    // sources, live.pace appears in ALL EIGHTEEN -- still 1, limn 1, comet 2, droplet 1, opal 1, abyss 1,
    // nebula 2, tempest 1, fathom 1, geode 1, arc 1, sol 2, aura 2, flux 2, duet 2, chorus 1, prism 1,
    // helix 1. There is no species murmur leaves still.
    //
    // The six were never murmur's six. They were the six this PORT happened to reach when v4641 moved eight
    // borrowed glintRate sites onto the cadence, and the row wrote that subset down as if it were the
    // design. A record that over-claims sends the next reader to build what is already there; this one did
    // the opposite and told them there was nothing left to build.
    //
    // So the row inverts: it names how many of the eighteen this port has reached and REQUIRES THE NUMBER TO
    // BE SHORT, with the missing ones listed, until it is not.
    const MURMUR_PACED = 18;   // counted in murmur's sources; see the note above
    const ALL = marks.slice(0, -1).map((m) => m[1]);
    const unpaced = ALL.filter((n) => !paced.includes(n));
    say(`builders reading the conditioned cadence: ${paced.join(", ")}; reading the conditioned voice: ${voiced.length} of ${marks.length - 1}`);
    say(`builders with NO cadence, which murmur gives one to: ${unpaced.join(", ")}`);
    ok("!! *** murmur GIVES A CADENCE TO ALL EIGHTEEN AND THIS PORT REACHES TWELVE -- the five builders still without one are named ***",
        paced.length === 12 &&
        ["arc", "sol", "aura", "flux", "chorus", "prism", "comet", "limn", "helix", "still", "abyss", "duet"].every((x) => paced.includes(x)) &&
        unpaced.length === (marks.length - 1) - 12,
        `${paced.length} of murmur's ${MURMUR_PACED}: ${paced.join(", ")}. STILL WITHOUT ONE: ` +
        `${unpaced.join(", ")} -- five builders covering six species, since mist draws both nebula and ` +
        `tempest. duet arrives at v4657: its orbital rate reads 0.55*live.pace beside the gesture term this ` +
        `port already had, so the pair sped up for its own flourish and ignored the exchange. still and ` +
        `abyss arrived at v4656 through their GESTURE SLOTS, which murmur divides by the ` +
        `signal sum: still's carried no divisor at all and abyss's carried the voice term alone. helix ` +
        `arrived at v4655: helix.ts scales its climb by 0.75*live.pace and 0.85*st.drive and ` +
        `this port carried the bare drift, so its strands rose at one speed whatever the exchange was doing. ` +
        `comet and limn arrived at v4654 -- comet's orbital rate was reading VOICE where murmur reads ` +
        `live.pace and its closure never touched the cadence at all, and limn had the smaller of murmur's two ` +
        `terms and not the larger. THE ROW USED TO SAY SIX WAS THE WHOLE DESIGN. It is a count of what this ` +
        `port has reached and it goes red when that count moves, in either direction.`);

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

    // *** THE ROW THIS REPLACES SAID stateTau WAS DELIBERATELY ABSENT, AND IT WAS RIGHT FOR THREE ROUNDS. ***
    // A knob nothing reads is a row that cannot fail, so v4641 did not add one. v4644 wires the flash, so the
    // knob arrives with the pixels it moves and the row inverts: it now has to say the uniform is READ, and
    // by what, or a future edit could delete the wiring and leave a dead knob behind the same green.
    // *** AND AT v4653 THE LAST OF THE FOUR ARRIVES, so this row inverts a second time. *** It said at
    // v4641 that mh_state was absent, at v4644 that three of its four outputs were wired and `drive` was
    // not, and now that all four are read. Each inversion is the same discipline: the row states what is
    // MISSING as a checked fact, so the missing half cannot quietly become a half-finished one.
    const drive = (code.match(/\bDRIVE\b/g) || []).length;
    const driveDecl = (code.match(/const DRIVE = /g) || []).length;
    ok("!! *** ALL FOUR OF mh_state's OUTPUTS ARE READ NOW -- drive was the last, and it is declared once ***",
        rawT === 1 && /KIT\.mhState\(uniforms\.stateIndex,\s*uniforms\.stateTau\)/.test(src) &&
        readSe === 3 && readC === 11 && readSw === 5 && driveDecl === 1 && drive - 1 >= 10,
        `stateTau is read ${rawT} time, by mh_state, and mh_state's four outputs now reach ` +
        `${readSe + readC + readSw + (drive - 1)} sites between them: settled ${readSe}, complete ${readC}, ` +
        `sweep ${readSw}, and drive ${drive - 1} from one declaration. THE FOURTH WAS THE LARGEST AND ONLY ` +
        `PART OF IT IS HERE: murmur spends st.drive at 45 sites doing three different things, and v4653 ` +
        `wired the two that are a DIRECTION or a SIZE and left the sixteen that multiply a local clock. ` +
        `That deferral is not stated here and hoped for -- tools/ship/murmurDrive-selfcheck.mjs checks that ` +
        `no line in the shader reads both DRIVE and uniforms.time.`);

    // The per-species tables have to be READ and not merely imported, or MH_IGNITE is a table the shader
    // agrees with by coincidence. Seven entries, eleven species without one, and the eleven build no nodes.
    const speciesWithShell = Object.keys(MH_IGNITE).length, settledEntries = Object.keys(MH_SETTLED).length;
    ok("!! ...and the two tables are read by the shader builder rather than sitting beside it",
        settledEntries === 18 && speciesWithShell === 7 &&
        /MH_SETTLED_INTERIOR\[species\]/.test(code) && /MH_IGNITE\[species\]/.test(code) &&
        /MH_SETTLED\.droplet/.test(code) && /MH_SETTLED_COMET_HEAD/.test(code),
        `MH_SETTLED has ${settledEntries} entries and MH_IGNITE ${speciesWithShell}, and the builder indexes ` +
        `both by the species it is compiling -- MH_SETTLED_INTERIOR for the seventeen whose settle is an ` +
        `interior gain, MH_IGNITE for the seven with a shell. The two named exceptions are spelled out ` +
        `rather than indexed: ` +
        `MH_SETTLED.droplet is an ADDITIVE term on coreBright and not an interior gain -- the only entry in ` +
        `that table that is not -- and MH_SETTLED_COMET_HEAD is comet's SECOND settle, 0.25 on the point of ` +
        `light against 0.20 on the body around it.`);

    // *** THESE TWO ROWS ARE HERE BECAUSE TWO SABOTAGES WALKED THROUGH THE PIXEL GATES AND NOTHING ELSE
    // COULD SEE THEM. *** Both are table-versus-wiring drift, which no render can catch: a dead MH_IGNITE
    // entry draws nothing, and droplet's doubled settle needs droplet rendered in SUCCESS, which no gate
    // does. A source census is the WEAKER instrument and it is the right one for a question about which
    // names exist, so long as it says which question it is answering.
    const interiorKeys = Object.keys(MH_SETTLED_INTERIOR), settledKeys = Object.keys(MH_SETTLED);
    const missing = settledKeys.filter((k) => !interiorKeys.includes(k));
    ok("!! *** droplet's EXCLUSION FROM THE SHARED INTERIOR SETTLE IS A MISSING KEY, NOT A CONDITIONAL ***",
        interiorKeys.length === 17 && missing.length === 1 && missing[0] === "droplet" &&
        /MH_SETTLED_INTERIOR\[species\]/.test(code) && !/species === "droplet" \? 0\.0/.test(code),
        `MH_SETTLED_INTERIOR has ${interiorKeys.length} of MH_SETTLED's ${settledKeys.length} keys and the one ` +
        `it is missing is ${missing.join(", ")}. THE SHAPE IS THE POINT: the exclusion first shipped as ` +
        `species === "droplet" ? 0.0 : MH_SETTLED[species], a sabotage deleted the ternary, droplet took its ` +
        `settle TWICE -- once on coreBright and once on the interior -- and every gate in the round stayed ` +
        `green, because no instrument renders droplet in SUCCESS. A key that is not there cannot be deleted ` +
        `by a tidying pass, and this row can name which one is missing.`);

    // Which species' build closures actually call the shell. The set has to EQUAL MH_IGNITE's keys: an entry
    // nothing calls is a constant pretending to be wiring, which is the whole defect class this file exists
    // for one level up (a knob nothing reads is a row that cannot fail).
    const codeLines = code.split("\n");
    const bmarks = [];
    codeLines.forEach((l, i) => { const m = /^\s*const build([A-Z]\w*) = \(\) => \{/.exec(l); if (m) bmarks.push([i, m[1].toLowerCase()]); });
    bmarks.push([codeLines.length, "(end)"]);
    const shelled = [];
    for (let k = 0; k < bmarks.length - 1; k++) {
        const blk = codeLines.slice(bmarks[k][0], bmarks[k + 1][0]).join("\n");
        if (/\bigniteAt\(|\bigniteMist\(/.test(blk)) shelled.push(bmarks[k][1]);
    }
    // buildMist compiles as nebula OR tempest, so its one closure stands for two of MH_IGNITE's keys.
    const reached = shelled.flatMap((n) => (n === "mist" ? ["nebula", "tempest"] : [n])).sort();
    const want = Object.keys(MH_IGNITE).sort();
    ok("!! *** EVERY MH_IGNITE ENTRY IS CALLED BY A SPECIES, AND NO SPECIES OUTSIDE THE TABLE CALLS ONE ***",
        reached.join(",") === want.join(","),
        `the closures that call the shell are ${reached.join(", ")}; MH_IGNITE's keys are ${want.join(", ")}. ` +
        `EQUALITY IN BOTH DIRECTIONS, and each direction has a failure behind it: adding a table entry for a ` +
        `species whose closure never calls igniteAt draws nothing at all and was the sabotage this row was ` +
        `written for, while a closure calling one for a species with no entry would read lo and hi off null. ` +
        `buildMist counts as two, because it is the one closure that compiles as either of murmur's two ` +
        `volumetric heroes.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: mh_live is the one function every species in murmur's family reads and this port " +
    "did not have. The kit's own gate proves the FUNCTION is right on a real GPU; this one proves the ORB " +
    "CALLS IT, which is the half a correct-and-unwired port would pass in silence." +
    "\nWHAT IS NOT CLAIMED: st.drive's RATE family was sixteen of its 45 sites, deferred at v4653 because " +
    "each multiplies a local clock and mh_drift's phase is rate * t, so a drive ramping at large t " +
    "teleports it. IT IS NO LONGER DEFERRED: v4654 made the secular phase an integral and v4655 took the " +
    "sites whose whole output is multiplied, helix's climb among them, which is why this file's cadence " +
    "count moved from eight species to nine. What st.drive still does NOT have is limn's drive factor, " +
    "whose rate is a product rather than a sum. All four of mh_state's outputs are otherwise wired " +
    "and the source census below counts where they land; whether they reach PIXELS is graded next door, in " +
    "tools/ship/murmurIgnite-selfcheck.mjs and tools/ship/murmurDrive-selfcheck.mjs, on renders rather than " +
    "on a reader count. The pixel rows here cover TWO of the eighteen species, arc and still, chosen as the largest " +
    "cadence response in the family and the one that has none at all; chorus and droplet are the other two " +
    "and they are in tools/ship/murmurLive2-selfcheck.mjs. The remaining fourteen are covered by the source " +
    "census at section 5 -- which grades the FILE and not the picture, and says so in its own title -- and by " +
    "their own species gates, every one of which now renders through the conditioner. Rendering all eighteen " +
    "in one gate costs 6,439 ms against a 3,000 ms budget, measured.");
process.exit(fails ? 1 : 0);
