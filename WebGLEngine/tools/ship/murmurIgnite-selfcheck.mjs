// WebGLEngine/tools/ship/murmurIgnite-selfcheck.mjs -- v4644
//
// *** THE GATE FOR THE SUCCESS FLASH ARRIVING IN THE PICTURE. *** tools/ship/murmurKit-selfcheck.mjs section
// 13 grades mh_ignite the FUNCTION against a real GPU, bit for bit, on a probe that draws nothing but the
// shell. This gate asks the different and harder question: when the orb is told it has SUCCEEDED, does a ring
// of light actually leave the heart of a rendered species and travel to its surface -- and do the eleven
// species that have no shell still get their settle?
//
// *** AND v4661 GAVE IT BACK, FOR A DIFFERENT REASON AND WITH A MEASUREMENT UNDER IT THIS TIME. *** v4661
// took the last nine st.complete sites, comet's head among them, and the census v4660 put in section 4 said
// so in one row on the first run: "species with no complete anywhere: none (of 18)". EVERY species flashes
// now, so there is no species whose SUCCESS is a settle and nothing else and there cannot be one again.
//
// THE CONTROL IS geode AGAIN, ON A PROPERTY IT ACTUALLY HAS: it reads `complete` and does NOT read
// `sweep` -- its flash is a flat lift on a facet term with no path to travel
// along. That is what lets section 4 do something no arrangement of comet's frames could: mh_state's
// `complete` RISES AND FALLS, so it takes almost every value TWICE, and a pair of taus either side of its
// peak can be solved for equal complete. At tau 0.0488 and tau 1.0959 geode's complete is the same number to
// sixteen digits while `settled` goes 0 -> 0.9124 -- and geode ignores the sweep that moved between them. A
// settle isolated in pixels with 0.912 of range, against the 0.261 the v4660 pair could reach.
//
// *** THE CONTROL WAS geode BEFORE THAT AND v4660 TOOK IT AWAY. *** This gate is built around a PAIR: one species whose
// SUCCESS is a travelling shell and one whose SUCCESS is a settle and nothing else, so the two frame sets
// differ in exactly the thing under test. geode was the second of those from v4644 to v4659 -- and v4660
// gave geode its own ignition, a flat lift on its facets, which is the figure the gate's own closing
// paragraph said the eleven shell-less species were each waiting for. From that commit geode's SUCCESS rose
// AND FELL like a flash, three rows here went red, and the reason they went red was that the control had
// stopped being a control. A settle row measured on a species that flashes is measuring the flash.
//
// The control was comet for exactly one round, on the property that it had no `complete` at all -- true at
// v4660 and false at v4661, which is the SECOND time in two rounds that this gate's control was defined by
// an absence the port was busy filling. A control defined by what a species LACKS has a shelf life; this
// one is defined by what geode IS -- a facet term on a normal, with no path for a front to run down -- and
// geode.ts says so in its own words rather than in a count of what has not been ported yet.
//
// still has the shared shell; geode has no MH_IGNITE entry at all; and both have a settle. So the two frames sets differ in exactly the thing under test. Every brightness
// row here has a travel row beside it and the travel rows are the claim: a port that multiplied the whole
// interior by (1 + k * complete) and drew no ring would pass every brightness bound in this file and fail
// the three rows that ask WHERE the added light is.
//
// *** THE INSTRUMENT IS THE AREA-WEIGHTED RADIAL CENTROID OF THE ADDED LIGHT, and it is chosen over the
// peak-brightness radius for a measured reason. *** A marched shell at |p| = r0 adds light to every ray that
// crosses the sphere of radius r0, so its brightest PIXEL sits well inside r0 and jitters between lattice
// cells -- a first cut read peak radii of 0.043, 0.173, 0.173, 0.345, 0.173 over five increasing sweeps and
// called the travel non-monotone. The centroid of the whole added field has no such degeneracy: it is a
// first moment of a positive field, it is insensitive to the flash's amplitude (which rises and falls with
// `complete` over the same window), and it moved 0.1947 -> 0.3981 monotonically over the identical frames.
//
// Its sibling tools/ship/murmurIgnite2-selfcheck.mjs carries abyss and tempest: the deepest shell in the
// roster and the pre-multiply that makes a cloud ignite whole. The split is the usual one -- a species costs
// about 195 ms here and a gate over budget does not run at ship time at all.
"use strict";

import fs from "node:fs";
import path from "node:path";
import * as K from "../../render/murmurKit.mjs";
import { ORB_SPECIES } from "../../render/aiPresenceOrbTsl.mjs";
import { sp, renderSpecies, N3, light, ENG as ENG2 } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurIgnite-selfcheck -- the SUCCESS flash, in pixels: a ring that travels and a settle that does not\n");

// murmur's SUCCESS windows are 1.20 s for the breath and 0.95 s for the travel, so these five taus are one
// early, three across the middle of the journey, and one PAST the end of both -- the last is what makes "the
// flash leaves" a measurement rather than an assumption.
const TAUS = [0.20, 0.40, 0.60, 0.80, 1.40];
const SUCCESS = 4, IDLE = 0, THINKING = 2;

const FRAMES = [];
for (const s of ["still", "geode"]) {
    FRAMES.push(sp(s, 0, undefined, { stateIndex: IDLE, stateTau: 0 }));
    for (const t of TAUS) FRAMES.push(sp(s, 0, undefined, { stateIndex: SUCCESS, stateTau: t }));
}
// *** AND TWO MORE geode FRAMES, AT A PAIR OF TAUS SOLVED FOR EQUAL `complete`. ***
//
// mh_state's complete is smoothstep(0, 0.30, a) * (1 - smoothstep(0.36, 1.0, a)): it RISES AND FALLS, so it
// takes almost every value twice, once either side of its peak. `settled` is monotone over the same window.
// So a tau on the rising side and a tau on the falling side can be solved for the SAME complete with a
// large gap in settled -- and geode reads no sweep, which is the third output and the one that also moved.
//
// THE PAIR IS SOLVED HERE RATHER THAN WRITTEN DOWN, by bisection on complete's falling branch, so a change
// to mh_state moves the pair with it instead of leaving two stale constants that no longer mean what their
// names say. The low tau is chosen below 0.36 s, where `settled` is exactly 0 -- the widest gap available.
const SETTLE_T1 = 0.0488;
const SETTLE_C = K.mhState(SUCCESS, SETTLE_T1).complete;
const SETTLE_T2 = (() => {
    let lo = 0.36 * 1.20, hi = 1.20;                       // complete is strictly decreasing on this interval
    for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (K.mhState(SUCCESS, m).complete > SETTLE_C) lo = m; else hi = m; }
    return (lo + hi) / 2;
})();
// *** THE INDICES ARE CAPTURED AT THE PUSH AND NOT COUNTED BACK FROM THE END. *** The first cut read these
// two as FRAMES.length - 2 and - 1, which are the last two QUIET frames -- two THINKING frames that are
// byte-identical by design -- and the row reported "added light x1.000, centroid moves 0.0000" as though
// the settle did nothing. A frame index counted backwards past a list that grows is a reading of whatever
// happens to be there.
const PAIR_LO = FRAMES.push(sp("geode", 0, undefined, { stateIndex: SUCCESS, stateTau: SETTLE_T1 })) - 1;
const PAIR_HI = FRAMES.push(sp("geode", 0, undefined, { stateIndex: SUCCESS, stateTau: SETTLE_T2 })) - 1;
// The quiet-state frames: a stateTau well inside SUCCESS's window, in two states that have no SUCCESS --
// and EACH STATE IS HELD AGAINST ITSELF at tau 0, which is not a nicety. Holding a quiet state against the
// IDLE frame instead confounds mh_state with mh_live: the sibling gate's first cut did exactly that and read
// 1,934 moved bytes in LISTENING, where the microphone's weight goes 0.55 -> 1.00 whatever mh_state does.
FRAMES.push(sp("still", 0, undefined, { stateIndex: IDLE, stateTau: 0.60 }));
FRAMES.push(sp("still", 0, undefined, { stateIndex: THINKING, stateTau: 0.0 }));
FRAMES.push(sp("still", 0, undefined, { stateIndex: THINKING, stateTau: 0.60 }));

const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) {
    ok("!! the SUCCESS flash renders at all", false,
        `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}. A gate ` +
        `that cannot run its own subject is a FAIL row here and not a silent skip.`);
    console.log("\nFAIL -- 1 check(s)");
    process.exit(1);
}
say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FRAMES.length} frames at ${N3}x${N3}`);

/**
 * The added light's first moment in radius, and its total. `base` is the same species in IDLE, so what is
 * measured is the FLASH and not the species. Only positive differences are counted: the settle and the shell
 * both only add, and a signed sum would let a darkening somewhere else pay for a ring that is not there.
 */
const flash = (px, base) => {
    let num = 0, den = 0;
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        const rho = Math.hypot(dx, dy);
        if (rho > 0.98) continue;                       // the quad's corners are outside the disc entirely
        const d = base ? light(px, x, y) - light(base, x, y) : light(px, x, y);
        if (d <= 0) continue;
        num += d * rho; den += d;
    }
    return { centroid: den ? num / den : 0, sum: den };
};

const PER = 1 + TAUS.length;
const at = (si, ti) => run.frames[si * PER + 1 + ti];
const idleOf = (si) => run.frames[si * PER];
const M = [0, 1].map((si) => {
    const base = idleOf(si);
    return { base, self: flash(base, null), taus: TAUS.map((t, ti) => flash(at(si, ti), base)) };
});
const [ST, GE] = M;
const pct = (m, s) => 100 * m.sum / s.self.sum;

// =============================================================================================================
sec("1. *** THE FLASH REACHES PIXELS AT ALL -- and the species with no shell says what that is worth ***");
{
    say(`still: idle light ${ST.self.sum.toFixed(1)}; added by SUCCESS at ` +
        TAUS.map((t, i) => `tau ${t} ${pct(ST.taus[i], ST).toFixed(1)}%`).join(", "));
    say(`geode: idle light ${GE.self.sum.toFixed(1)}; added by SUCCESS at ` +
        TAUS.map((t, i) => `tau ${t} ${pct(GE.taus[i], GE).toFixed(1)}%`).join(", "));

    const peak = Math.max(...ST.taus.map((m) => pct(m, ST)));
    ok("!! *** SUCCESS PUTS LIGHT ON THE SCREEN: still's flash more than TRIPLES the light in its own frame ***",
        peak > 250 && Math.max(...GE.taus.map((m) => pct(m, GE))) > 250,
        `at its brightest still adds ${peak.toFixed(1)}% of its whole idle frame's linear light, and geode -- ` +
        `which has no MH_IGNITE entry and whose flash is a flat lift on a facet term -- adds ` +
        `${Math.max(...GE.taus.map((m) => pct(m, GE))).toFixed(1)}%. ` +
        `*** THIS ROW USED TO ASK FOR A SMALL SECOND NUMBER AND IT CANNOT ANY MORE. *** Its second half was ` +
        `"geode adds under 0.5% at the same early tau", which distinguished a port that drew the ring from ` +
        `one that brightened everything -- and after v4658, v4659, v4660 and v4661 EVERY SPECIES IN THE ` +
        `ROSTER IS BRIGHTENED, because that is what murmur does. Brightness alone now separates nothing, so ` +
        `the claim lives entirely in section 2, where it always actually was: this gate's header says "every ` +
        `brightness row here has a travel row beside it and the travel rows are the claim". Keeping a bound ` +
        `that only passes because a port is incomplete is the same defect as budgeting a red down to green, ` +
        `in slower motion.`);

    // *** THE ROW THAT STOPS THIS GATE PASSING ON A SHADER THAT IGNORES THE STATE ENTIRELY. *** mh_state
    // returns four zeros in three of murmur's five states, so a swept stateTau outside SUCCESS must change
    // nothing whatsoever -- and "nothing" here is a BYTE count and not a bound, because the flash is added
    // to `e` inside the march and exactly-zero is what lets eighteen shaders add it without a branch.
    const quietI = run.frames[FRAMES.length - 3], think0 = run.frames[FRAMES.length - 2],
          thinkT = run.frames[FRAMES.length - 1];
    let dI = 0, dT = 0;
    for (let i = 0; i < quietI.length; i++) { if (quietI[i] !== ST.base[i]) dI++; if (thinkT[i] !== think0[i]) dT++; }
    ok("!! *** AND IDLE AND THINKING ARE BYTE-IDENTICAL UNDER A stateTau OF 0.60 -- the flash cannot leak ***",
        dI === 0 && dT === 0,
        `${dI} bytes differ in IDLE and ${dT} in THINKING between tau 0 and tau 0.60, out of ` +
        `${ST.base.length}. That 0.60 s is INSIDE both of SUCCESS's windows, so a shader that read stateTau ` +
        `without the state -- or a mh_state that leaked a window across states -- would show here and nowhere ` +
        `else in this file. It is also what protects every other gate's byte baseline: eighteen species' ` +
        `recorded frames are all taken in IDLE.`);
}

// =============================================================================================================
sec("2. *** WHERE THE LIGHT IS, AND WHETHER IT MOVES: the whole difference between an arrival and a lift ***");
{
    const stC = ST.taus.map((m) => m.centroid), geC = GE.taus.map((m) => m.centroid);
    const geP2 = GE.taus.map((m) => pct(m, GE));
    say(`still's flash centroid by tau: ${TAUS.map((t, i) => `${t} -> ${stC[i].toFixed(4)}`).join(", ")}`);
    say(`geode's settle centroid by tau: ${TAUS.map((t, i) => `${t} -> ${geC[i].toFixed(4)}`).join(", ")}`);

    // The travel is read over the four taus where the flash is actually present; the fifth is past the end
    // of the window and its centroid is the settle's, which is the NEXT row's subject rather than this one's.
    const travel = stC.slice(0, 4);
    let mono = true; for (let i = 1; i < 4; i++) if (!(travel[i] > travel[i - 1])) mono = false;
    ok("!! *** THE RING TRAVELS ACROSS THE RENDERED BODY: still's added light moves OUTWARD as the sweep runs ***",
        mono && travel[3] - travel[0] > 0.15,
        `the centroid of the added light climbs ${travel[0].toFixed(4)} -> ${travel[3].toFixed(4)} over tau ` +
        `0.20 to 0.80 -- monotonically, and ${(travel[3] - travel[0]).toFixed(4)} of the quad's half-width, ` +
        `which is about a third of the body's own radius. The AMPLITUDE over those same four frames goes ` +
        `${TAUS.slice(0, 4).map((t, i) => pct(ST.taus[i], ST).toFixed(0) + "%").join(" -> ")}, up and back down ` +
        `again, so the centroid is not tracking how bright the flash is: it is tracking where it is.`);

    // *** AND THIS IS THE HALF THAT MAKES THE ROW ABOVE MEAN SOMETHING. *** geode's flash is a FLAT LIFT on
    // a facet term -- no sweep anywhere in its builder, measured in section 4 -- so its added light rises,
    // falls and never moves. A port whose "flash" was a gain on the interior would produce geode's signature
    // for every species, including still's, and would pass section 1 outright.
    const geMove = Math.max(...geC.slice(2)) - Math.min(...geC.slice(2));
    const geGrow = Math.max(...geP2) / Math.max(geP2[0], 1e-9);
    ok("!! *** ...AND geode's ADDED LIGHT NEVER MOVES WHILE IT GROWS THREEFOLD -- a brightening is not a travel ***",
        geMove < 0.02 && geGrow > 2.5 && travel[3] - travel[0] > 10 * geMove,
        `over the five taus geode's added light peaks at ${geGrow.toFixed(1)}x its first reading and its ` +
        `centroid moves ${geMove.toFixed(4)} across the last three -- against still's ` +
        `${(travel[3] - travel[0]).toFixed(4)}, which is ` +
        `${((travel[3] - travel[0]) / Math.max(geMove, 1e-6)).toFixed(0)} times as far. geode's fixed value ` +
        `of ${geC[3].toFixed(4)} is its INTERIOR's own centroid: the same picture, scaled.`);

    // The white-overlay test, which murmur's own droplet.ts names as the failure it had: "the first cut added
    // a flat lift alongside it and success rendered as a solid white disc, which is precisely the white
    // overlay the family law forbids."
    ok("!! ...and the flash STARTS far inside the frame's own light and climbs out to meet it -- not a white disc",
        stC[0] < ST.self.centroid - 0.15 && stC[3] > ST.self.centroid - 0.05 && stC[3] < ST.self.centroid + 0.05,
        `still's idle frame has its own light centroid at ${ST.self.centroid.toFixed(4)} -- pulled outward by ` +
        `the rim and the specular, which is the hero "whose brightest pixel is always its catchlight". The ` +
        `flash begins at ${stC[0].toFixed(4)}, ${(ST.self.centroid - stC[0]).toFixed(4)} INSIDE that, and ` +
        `arrives at ${stC[3].toFixed(4)}. A flat lift over the silhouette would sit at the frame's own ` +
        `centroid at every tau; a white overlay would sit at the disc's, near 0.65. Neither could start where ` +
        `this does.`);
}

// =============================================================================================================
sec("3. *** TWO DIFFERENT WINDOWS: the flash ARRIVES AND LEAVES, the settle ARRIVES AND STAYS ***");
{
    const stP = TAUS.map((t, i) => pct(ST.taus[i], ST)), geP = TAUS.map((t, i) => pct(GE.taus[i], GE));
    say(`still, % of its own idle light added: ${stP.map((v) => v.toFixed(1)).join(", ")}`);
    say(`geode, the same: ${geP.map((v) => v.toFixed(1)).join(", ")}`);

    const rose = Math.max(...stP.slice(0, 3)) / Math.max(stP[0], 1e-6), fell = Math.max(...stP) / Math.max(stP[4], 1e-6);
    ok("!! *** THE FLASH IS AN EVENT: still's rises fourteenfold and then falls to almost nothing by tau 1.40 ***",
        stP[2] > stP[0] * 4 && stP[4] < stP[2] / 50,
        `${stP[0].toFixed(1)}% at tau 0.20, ${stP[2].toFixed(1)}% at 0.60, ${stP[4].toFixed(1)}% at 1.40 -- a ` +
        `rise of ${rose.toFixed(1)}x and then a fall of ${fell.toFixed(0)}x. murmur's `+
        `complete is smoothstep(0, 0.30, a) * (1 - smoothstep(0.36, 1.0, a)) on a = tau/1.20, a window that ` +
        `opens and closes; kit.ts: "a flash that starts at full speed and stops dead is a wipe, and a wipe is ` +
        `a UI transition rather than an arrival travelling through a material."`);

    // *** THE SETTLE'S HALF OF THIS SECTION IS A RESIDUE NOW AND NOT A MONOTONE RISE. *** The row here read
    // "geode's rises monotonically across all five taus and is HIGHEST at the end" from v4644 to v4659,
    // which was true while geode's only response to SUCCESS was its settle. v4660 gave geode a flash, so its
    // five readings now rise AND fall like still's -- and the honest form of the same claim is the one tau
    // where the two windows can be told apart without a second species: at tau 1.40, mh_state's complete is
    // EXACTLY 0 (a = 1.1667 is past the closing smoothstep's end) while settled is 0.9873 of its full value.
    // Whatever light is still added there is the settle, and there is no complete left to argue about it.
    const cAtEnd = K.mhState(SUCCESS, TAUS[4]).complete, sAtEnd = K.mhState(SUCCESS, TAUS[4]).settled;
    ok("!! *** THE SETTLE IS A STATE: at tau 1.40 complete is EXACTLY 0 and geode is STILL brighter than idle ***",
        cAtEnd === 0 && sAtEnd > 0.9 && geP[4] > 10 && geP[4] < geP[1] / 5,
        `complete is ${cAtEnd} at tau ${TAUS[4]} -- exactly zero, not nearly -- and settled is ` +
        `${sAtEnd.toFixed(4)}. geode reads ${geP[4].toFixed(1)}% over its idle frame there, against ` +
        `${geP[1].toFixed(1)}% at its flash's peak: the event is GONE and the body is simply left brighter ` +
        `than it was. settled is smoothstep(0.30, 1.05, a) with no closing half, which is the whole ` +
        `difference between the two windows, and this row asks for BOTH -- a residue large enough to see and ` +
        `small enough that it is plainly not the flash.`);

    ok("!! ...and the centroid of that residue is the interior's own, so the settle scales a picture rather than adding one",
        geP[4] > 10 && GE.taus[4].centroid > 0.15 && Math.abs(GE.taus[4].centroid - GE.taus[2].centroid) < 0.015,
        `geode's residue sits at a centroid of ${GE.taus[4].centroid.toFixed(4)}, ` +
        `${Math.abs(GE.taus[4].centroid - GE.taus[2].centroid).toFixed(4)} from where its added light sat two ` +
        `taus earlier with the flash still running. MH_SETTLED has ${Object.keys(K.MH_SETTLED).length} ` +
        `entries and all eighteen species carry one: "(1 + S * st.settled)" on an interior is the same ` +
        `picture at a different gain, and a first moment is exactly the statistic that cannot tell those ` +
        `apart -- which is why it is the statistic that proves nothing ARRIVED.`);
}

// =============================================================================================================
// *** THE SOURCE CENSUS SECTION 4 IS BUILT ON, HOISTED SO BOTH ITS ROWS READ ONE WALK. *** A species FLASHES
// if its builder reads COMPLETE or if it is a key of MH_IGNITE, MH_COMPLETE_INTERIOR, MH_COMPLETE_LIFT or
// MH_COMPLETE_SINGLE; it TRAVELS if its builder reads SWEEP or it is one of the seven with the shared shell.
const orb = fs.readFileSync(path.join(ENG2, "render", "aiPresenceOrbTsl.mjs"), "utf8");
const starts = [...orb.matchAll(/const build([A-Z]\w*) = \(\) => \{/g)];
const bodyOf = (b) => { const i = starts.findIndex((m) => m[1] === b); return i < 0 ? "" :
    orb.slice(starts[i].index, i + 1 < starts.length ? starts[i + 1].index : orb.length); };
// the builder a species dispatches to, READ FROM THE DISPATCH rather than assumed from the name: two species
// share buildMist, and a census that matched names would have reported both as builder-less. The optional
// parentheses are not cosmetic -- the one line that names two species wraps them, and the first cut of this
// regex read 16 entries for 18 species. A census is allowed to miss things; it is not allowed to miss them
// quietly, which is why both rows assert the SIZE of what was read.
const dispatch = new Map();
for (const m of orb.matchAll(/\(?species === "([a-z]+)"(?: \|\| species === "([a-z]+)")?\)? \? build([A-Z]\w*)\(\)/g)) {
    dispatch.set(m[1], m[3]); if (m[2]) dispatch.set(m[2], m[3]);
}
dispatch.set("still", "Still");
const tabled = new Set([...Object.keys(K.MH_IGNITE), ...Object.keys(K.MH_COMPLETE_INTERIOR),
                        ...Object.keys(K.MH_COMPLETE_LIFT)]);
// the seven with the shared shell read the sweep through igniteAt rather than by name in their own builder
const swept = new Set(Object.keys(K.MH_IGNITE));
const noFlash = ORB_SPECIES.filter((sp2) => !tabled.has(sp2) &&
    !/\bCOMPLETE\b/.test(bodyOf(dispatch.get(sp2) || "")));

// =============================================================================================================
sec("4. *** THE SETTLE ON ITS OWN, AND THE CENSUS THAT KEEPS THIS GATE'S CONTROL A CONTROL ***");
{
    // *** TWO FRAMES OF geode WHOSE `complete` IS THE SAME NUMBER AND WHOSE `settled` IS NOT. ***
    //
    // mh_state's complete RISES AND FALLS, so it takes almost every value twice -- once climbing, once on
    // the way out -- while settled only ever climbs. The pair above is solved for equal complete across that
    // peak, and the third output, sweep, is the one geode does not read at all. So of mh_state's four
    // outputs these two frames share complete exactly, share drive (0 in SUCCESS), differ in a sweep geode
    // ignores, and differ in SETTLED by 0.9124 -- which is 3.5 times the range the v4660 pair could reach.
    const early = flash(run.frames[PAIR_LO], GE.base), late = flash(run.frames[PAIR_HI], GE.base);
    const s0 = K.mhState(SUCCESS, SETTLE_T1), s1 = K.mhState(SUCCESS, SETTLE_T2);
    const dC = Math.abs(s1.complete - s0.complete), dS = s1.settled - s0.settled;
    const grew = late.sum / Math.max(early.sum, 1e-9), moved = Math.abs(late.centroid - early.centroid);
    say(`geode at tau ${SETTLE_T1.toFixed(4)} vs ${SETTLE_T2.toFixed(4)}: complete ${s0.complete.toFixed(6)} vs ` +
        `${s1.complete.toFixed(6)} (differ by ${dC.toExponential(1)}), settled ${s0.settled.toFixed(4)} -> ` +
        `${s1.settled.toFixed(4)}; added light x${grew.toFixed(3)}, centroid moves ${moved.toFixed(4)}`);
    ok("!! *** THE SETTLE WEIGHED ALONE: two frames whose complete is EQUAL and whose settled spans 0 to 0.91 ***",
        dC < 1e-9 && dS > 0.85 && s0.settled === 0 && grew > 2.0 && moved < 0.02 &&
        !/\bSWEEP\b/.test(bodyOf("Geode")),
        `the two taus are solved rather than written down -- bisection on complete's FALLING branch for the ` +
        `value it already has at tau ${SETTLE_T1} -- and they agree to ${dC.toExponential(1)}, which is ` +
        `float noise and not a tolerance. settled goes ${s0.settled} to ${s1.settled.toFixed(4)}, and geode ` +
        `reads no SWEEP at all, so the one output that also moved cannot reach a geode pixel. The added ` +
        `light grows x${grew.toFixed(3)} and its centroid moves ${moved.toFixed(4)}: it brightens and it ` +
        `does not travel. *** THE PAIR IS ONLY AVAILABLE BECAUSE complete IS NOT MONOTONE. *** A signal that ` +
        `rose and stayed could never be held equal across a settle that moved, which is why the v4660 ` +
        `version of this row had to wait for the sweep to saturate and got 0.261 of settle for it.`);

    // *** AND THE ROW THAT KEEPS THIS GATE'S CONTROL HONEST, REWRITTEN AT v4661 BECAUSE IT CAUGHT ITSELF. ***
    // v4660 put a census here asserting comet was the only species with no complete -- and v4661 took the
    // last nine complete sites, comet's head among them, so on its first run this row said "species with no
    // complete anywhere: none (of 18)". It did its job exactly: one row, naming the reason, instead of three
    // settle rows going red about a settle.
    //
    // THE LESSON IS IN WHAT THE PROPERTY WAS. Twice now this gate's control has been defined by an ABSENCE
    // -- geode "has no figure yet", comet "has no complete yet" -- and both times the port filled it. The
    // property here is a PRESENCE and its negation: geode reads complete and does NOT read sweep, because
    // its flash is a flat lift on a facet normal and there is no path for a front to travel down. That is
    // geode.ts's own description of the species rather than a count of what has not been ported.
    const sweepless = ORB_SPECIES.filter((sp2) => {
        const body = bodyOf(dispatch.get(sp2) || "");
        const hasC = tabled.has(sp2) || /\bCOMPLETE\b/.test(body);
        return hasC && !/\bSWEEP\b/.test(body) && !swept.has(sp2);
    });
    say(`species that flash but never read the sweep: ${sweepless.join(", ") || "none"} ` +
        `(of ${ORB_SPECIES.length}; ${dispatch.size} dispatch entries read; ${noFlash.length} do not flash at all)`);
    ok("!! *** geode FLASHES AND NEVER READS THE SWEEP -- and for the first time this gate's control has SPARES ***",
        sweepless.includes("geode") && sweepless.length >= 1 && noFlash.length === 0 &&
        dispatch.size === ORB_SPECIES.length,
        `${sweepless.join(", ")} -- ${sweepless.length} of ${ORB_SPECIES.length} -- and ${noFlash.length} ` +
        `species have no complete at all, which is ZERO after v4661 and is why the version of this row that ` +
        `shipped at v4660 went red the moment that round landed. *** THE FIRST DRAFT OF THIS ROW CLAIMED ` +
        `geode WAS THE ONLY ONE AND THE CENSUS SAID OTHERWISE ON ITS FIRST RUN: *** limn and chorus flash ` +
        `without a sweep too -- limn on its interior, its ring and its hint, chorus on its voices and its ` +
        `SYNC -- so the instrument in the row above has two spares, and that is worth more than uniqueness. ` +
        `THE DAY geode TAKES A SWEEP THIS ROW GOES RED and names the reason, rather than the pair quietly ` +
        `becoming two frames that differ in two signals. The census reads the DISPATCH for each species' ` +
        `builder rather than matching on the name, because nebula and tempest share buildMist, and it ` +
        `asserts the SIZE of what it read: the first cut of the regex missed the one line that names two ` +
        `species and reported 16 of 18.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: mh_state's SUCCESS windows reach PIXELS. The kit's own gate proves mh_ignite is " +
    "the right gaussian on a real GPU and that its peak lands on mix(lo, hi, sweep); this one proves a " +
    "rendered species actually draws it, travelling, and that the heroes without a shell still settle. THE " +
    "CONTROL SPECIES IS geode AND SECTION 4 MEASURES WHY IT CAN BE: it flashes and never reads the sweep, " +
    "so a pair of taus solved for EQUAL complete either side of that signal's peak differs in `settled` and " +
    "in nothing geode can see -- 0 to 0.9124 of it, the settle weighed alone in pixels. The control was " +
    "geode to v4659, comet for v4660 alone, and geode again from v4661; both handovers happened because the " +
    "property it rested on was an ABSENCE the port was busy filling, which is why the property now is a " +
    "presence and its negation. " +
    "The instrument is deliberately a CENTROID and not a peak radius -- see the header for the five " +
    "non-monotone peak radii that measurement gave on these identical frames." +
    "\nWHAT IS NOT CLAIMED HERE: st.drive's RATE family, which is deferred and named in " +
    "tools/ship/murmurDrive-selfcheck.mjs's own rows; the per-species `complete` FIGURES, which are all " +
    "ported as of v4661 and are graded in murmurComplete, murmurIgniteAxis, murmurIgniteFour and " +
    "murmurSingles; and comet's and droplet's two exceptional settle sites, which are graded as a source census in that same " +
    "gate rather than in pixels. abyss's deeper shell and the mist pair's pre-multiply are next door in " +
    "tools/ship/murmurIgnite2-selfcheck.mjs.");
process.exit(fails ? 1 : 0);
