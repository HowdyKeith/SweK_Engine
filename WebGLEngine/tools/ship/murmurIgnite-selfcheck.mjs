// WebGLEngine/tools/ship/murmurIgnite-selfcheck.mjs -- v4644
//
// *** THE GATE FOR THE SUCCESS FLASH ARRIVING IN THE PICTURE. *** tools/ship/murmurKit-selfcheck.mjs section
// 13 grades mh_ignite the FUNCTION against a real GPU, bit for bit, on a probe that draws nothing but the
// shell. This gate asks the different and harder question: when the orb is told it has SUCCEEDED, does a ring
// of light actually leave the heart of a rendered species and travel to its surface -- and do the eleven
// species that have no shell still get their settle?
//
// *** THE CONTROL WAS geode AND v4660 TOOK IT AWAY. *** This gate is built around a PAIR: one species whose
// SUCCESS is a travelling shell and one whose SUCCESS is a settle and nothing else, so the two frame sets
// differ in exactly the thing under test. geode was the second of those from v4644 to v4659 -- and v4660
// gave geode its own ignition, a flat lift on its facets, which is the figure the gate's own closing
// paragraph said the eleven shell-less species were each waiting for. From that commit geode's SUCCESS rose
// AND FELL like a flash, three rows here went red, and the reason they went red was that the control had
// stopped being a control. A settle row measured on a species that flashes is measuring the flash.
//
// THE CONTROL IS comet NOW, AND comet IS THE LAST ONE THERE IS: after v4660 it is the only species in the
// roster with no `complete` term anywhere -- not in its builder, not in MH_IGNITE, not in the interior
// factor, not in the saturation. Section 4 MEASURES that rather than asserting it, so the day comet gets a
// complete this gate goes red on a row that names the reason instead of on three rows that do not.
//
// comet is a better control than geode ever was, for a reason geode could not offer: between tau 0.95 and
// tau 1.40 its sweep is SATURATED (mh_state's sweep reaches 1 at 0.95 s) and it has no complete, so the only
// thing that differs between those two frames is `settled`, 0.7258 -> 0.9873. That is an ISOLATED settle in
// pixels, which nothing in this tree had before.
//
// still has the shared shell; comet has no MH_IGNITE entry at all; and both have a settle. So the two frames sets differ in exactly the thing under test. Every brightness
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
for (const s of ["still", "comet"]) {
    FRAMES.push(sp(s, 0, undefined, { stateIndex: IDLE, stateTau: 0 }));
    for (const t of TAUS) FRAMES.push(sp(s, 0, undefined, { stateIndex: SUCCESS, stateTau: t }));
}
// *** AND ONE MORE COMET FRAME, AT THE TAU WHERE ITS SWEEP HAS ALREADY FINISHED. *** mh_state's sweep is
// smoothstep over tau/0.95, so it is exactly 1 at 0.95 and at 1.40 alike; comet reads no complete at all.
// The pair (0.95, 1.40) therefore differs in `settled` AND IN NOTHING ELSE -- the one place in eighteen
// species where the settle can be weighed on its own rather than inferred from a tau past the flash.
const SETTLE_PAIR_TAU = 0.95;
FRAMES.push(sp("comet", 0, undefined, { stateIndex: SUCCESS, stateTau: SETTLE_PAIR_TAU }));
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
const [ST, CO] = M;
const pct = (m, s) => 100 * m.sum / s.self.sum;

// =============================================================================================================
sec("1. *** THE FLASH REACHES PIXELS AT ALL -- and the species with no shell says what that is worth ***");
{
    say(`still: idle light ${ST.self.sum.toFixed(1)}; added by SUCCESS at ` +
        TAUS.map((t, i) => `tau ${t} ${pct(ST.taus[i], ST).toFixed(1)}%`).join(", "));
    say(`comet: idle light ${CO.self.sum.toFixed(1)}; added by SUCCESS at ` +
        TAUS.map((t, i) => `tau ${t} ${pct(CO.taus[i], CO).toFixed(1)}%`).join(", "));

    const peak = Math.max(...ST.taus.map((m) => pct(m, ST)));
    ok("!! *** SUCCESS PUTS LIGHT ON THE SCREEN: still's flash more than TRIPLES the light in its own frame ***",
        peak > 250 && pct(CO.taus[0], CO) < 5,
        `at its brightest still adds ${peak.toFixed(1)}% of its whole idle frame's linear light, while comet -- ` +
        `which has no MH_IGNITE entry and no complete term anywhere -- adds ${pct(CO.taus[0], CO).toFixed(2)}% ` +
        `at the same early tau. BOTH HALVES: the first alone would be passed by a port that brightened every ` +
        `species and the second alone by one that drew nothing anywhere. THE SECOND BOUND IS 5% AND NOT THE ` +
        `0.5% geode HELD TO: comet's early reading is not zero and must not be asserted to be, because its ` +
        `sweep has already begun to fill the orbit behind the head at tau 0.20 -- that is comet's own figure ` +
        `doing what section 3 of tools/ship/murmurIgniteFour-selfcheck.mjs says it does, and a bound tight ` +
        `enough to exclude it would be a bound that denies the species.`);

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
    const stC = ST.taus.map((m) => m.centroid), coC = CO.taus.map((m) => m.centroid);
    say(`still's flash centroid by tau: ${TAUS.map((t, i) => `${t} -> ${stC[i].toFixed(4)}`).join(", ")}`);
    say(`comet's settle centroid by tau: ${TAUS.map((t, i) => `${t} -> ${coC[i].toFixed(4)}`).join(", ")}`);

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

    // *** AND THIS IS THE HALF THAT MAKES THE ROW ABOVE MEAN SOMETHING. *** comet's SUCCESS adds no light of
    // its own -- its figure lengthens a trail -- so what grows over these taus is the settle and the orbit
    // filling in behind the head, and NEITHER of them travels outward. A port whose "flash" was a gain on the
    // interior would produce comet's signature for every species, including still's, and would pass section 1
    // outright. The ratio bound is 3x rather than geode's old 4x because it is comet's number and not
    // geode's: 65.3% over 20.6%, measured, and a bound set above a measurement is a bound that has to be
    // walked back the first time somebody runs it.
    const coMove = Math.max(...coC.slice(2)) - Math.min(...coC.slice(2));
    const coGrow = pct(CO.taus[4], CO) / pct(CO.taus[2], CO);
    ok("!! *** ...AND comet's SETTLE DOES NOT MOVE AT ALL WHILE IT MORE THAN TRIPLES -- a brightening is not a travel ***",
        coMove < 0.01 && coGrow > 3 && travel[3] - travel[0] > 15 * coMove,
        `over the last three taus comet's added light grows ${coGrow.toFixed(1)}x and its centroid moves ` +
        `${coMove.toFixed(4)} -- against still's ${(travel[3] - travel[0]).toFixed(4)}, which is ` +
        `${((travel[3] - travel[0]) / Math.max(coMove, 1e-6)).toFixed(0)} times as far. comet's fixed value of ` +
        `${coC[3].toFixed(4)} is its INTERIOR's own centroid, which is what "(1 + k * st.settled) on the ` +
        `interior" means when it is drawn: the same picture, scaled.`);

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
    const stP = TAUS.map((t, i) => pct(ST.taus[i], ST)), coP = TAUS.map((t, i) => pct(CO.taus[i], CO));
    say(`still, % of its own idle light added: ${stP.map((v) => v.toFixed(1)).join(", ")}`);
    say(`comet, the same: ${coP.map((v) => v.toFixed(1)).join(", ")}`);

    const rose = Math.max(...stP.slice(0, 3)) / Math.max(stP[0], 1e-6), fell = Math.max(...stP) / Math.max(stP[4], 1e-6);
    ok("!! *** THE FLASH IS AN EVENT: still's rises fourteenfold and then falls to almost nothing by tau 1.40 ***",
        stP[2] > stP[0] * 4 && stP[4] < stP[2] / 50,
        `${stP[0].toFixed(1)}% at tau 0.20, ${stP[2].toFixed(1)}% at 0.60, ${stP[4].toFixed(1)}% at 1.40 -- a ` +
        `rise of ${rose.toFixed(1)}x and then a fall of ${fell.toFixed(0)}x. murmur's `+
        `complete is smoothstep(0, 0.30, a) * (1 - smoothstep(0.36, 1.0, a)) on a = tau/1.20, a window that ` +
        `opens and closes; kit.ts: "a flash that starts at full speed and stops dead is a wipe, and a wipe is ` +
        `a UI transition rather than an arrival travelling through a material."`);

    let coMono = true; for (let i = 1; i < 5; i++) if (!(coP[i] >= coP[i - 1])) coMono = false;
    ok("!! *** THE SETTLE IS A STATE: comet's rises monotonically across all five taus and is HIGHEST at the end ***",
        coMono && coP[4] > coP[2] * 3 && coP[0] < 5,
        `${coP.map((v) => v.toFixed(1)).join("% -> ")}% -- never once falling, and its largest value is its ` +
        `LAST. settled is smoothstep(0.30, 1.05, a) with no closing half, so at tau 1.40 the breath is over ` +
        `and the body is simply left brighter than it was. The two windows are graded on the SAME five frames ` +
        `of the same two species, which is what stops one of them being read off a curve rather than a render.`);

    ok("!! ...and the eleven species with no shell are not left out of SUCCESS -- they get the settle too",
        coP[4] > 10 && CO.taus[4].centroid > 0.15 && Math.abs(CO.taus[4].centroid - CO.taus[2].centroid) < 0.01,
        `comet ends ${coP[4].toFixed(1)}% brighter than its idle frame with its added light at a centroid of ` +
        `${CO.taus[4].centroid.toFixed(4)}, unmoved from ${CO.taus[2].centroid.toFixed(4)} two taus earlier. ` +
        `MH_IGNITE has ${Object.keys(K.MH_IGNITE).length} entries and MH_SETTLED has ` +
        `${Object.keys(K.MH_SETTLED).length}: seven species run the shared shell and all eighteen settle. The ` +
        `other eleven spend their own `+"`complete`"+` on their own figures -- arc on its filament, limn on its ` +
        `rim, aura on its ribbons -- and those are per-species transcriptions rather than this one shape, ` +
        `which is why they are not in the table and why this row asks only for the settle.`);
}

// =============================================================================================================
sec("4. *** THE SETTLE ON ITS OWN, AND THE CENSUS THAT KEEPS THIS GATE'S CONTROL A CONTROL -- v4660 ***");
{
    // *** TWO FRAMES THAT DIFFER IN `settled` AND IN NOTHING ELSE. *** mh_state's sweep is
    // smoothstep(0, 1, min(1, tau / 0.95)), so it is exactly 1 at BOTH tau 0.95 and tau 1.40; complete is
    // 0.2489 at the first and 0 at the second, and comet reads no complete anywhere, so that difference
    // cannot reach a pixel. What is left is settled, 0.7258 -> 0.9873 -- a 36% rise in the one signal.
    const early = flash(run.frames[FRAMES.length - 4], CO.base), late = CO.taus[4];
    const st0 = K.mhState(SUCCESS, SETTLE_PAIR_TAU), st1 = K.mhState(SUCCESS, TAUS[4]);
    const grew = late.sum / Math.max(early.sum, 1e-9), moved = Math.abs(late.centroid - early.centroid);
    say(`comet at tau ${SETTLE_PAIR_TAU} vs ${TAUS[4]}: sweep ${st0.sweep.toFixed(4)} -> ${st1.sweep.toFixed(4)}, ` +
        `settled ${st0.settled.toFixed(4)} -> ${st1.settled.toFixed(4)}; added light x${grew.toFixed(3)}, centroid moves ${moved.toFixed(4)}`);
    ok("!! *** THE SETTLE WEIGHED ALONE: the only signal that differs between these two frames is `settled` ***",
        st0.sweep === 1 && st1.sweep === 1 && st1.settled > st0.settled && grew > 1.10 && moved < 0.01,
        `the sweep is ${st0.sweep} in both frames -- it reached its end at 0.95 s -- and comet has no ` +
        `complete term for the 0.2489 -> 0 in that output to act on, so settled's ${st0.settled.toFixed(4)} ` +
        `-> ${st1.settled.toFixed(4)} is the WHOLE difference. The added light grows x${grew.toFixed(3)} and ` +
        `its centroid moves ${moved.toFixed(4)}: it brightens and it does not travel. EVERY OTHER SETTLE ROW ` +
        `IN THIS TREE IS AN INFERENCE FROM A TAU PAST THE FLASH -- this is the settle by itself, and it is ` +
        `only available because exactly one species has no complete left.`);

    // *** AND THE ROW THAT WOULD HAVE CAUGHT v4660 BREAKING THIS GATE, INSTEAD OF v4660 BREAKING IT. ***
    // geode was this gate's control for fifteen rounds on the strength of a sentence -- "it is one of the
    // eleven whose complete goes to its own figure" -- which was true when it was written and stopped being
    // true the moment that figure was ported. Nothing checked it. So the control's defining property is
    // measured here, from the source, over the WHOLE roster: a species flashes if its builder reads COMPLETE
    // or if it is a key of MH_IGNITE, MH_COMPLETE_INTERIOR or MH_COMPLETE_LIFT.
    const orb = fs.readFileSync(path.join(ENG2, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const starts = [...orb.matchAll(/const build([A-Z]\w*) = \(\) => \{/g)];
    const bodyOf = (b) => { const i = starts.findIndex((m) => m[1] === b); return i < 0 ? "" :
        orb.slice(starts[i].index, i + 1 < starts.length ? starts[i + 1].index : orb.length); };
    // the builder a species dispatches to, READ FROM THE DISPATCH rather than assumed from the name: two
    // species share buildMist, and a census that matched names would have reported both as builder-less.
    const dispatch = new Map();
    // THE OPTIONAL PARENTHESES ARE NOT COSMETIC: the one line that names two species wraps them, and the
    // first cut of this regex did not allow for it -- it read 16 entries for 18 species and the count
    // assertion below is what said so. A census is allowed to miss things; it is not allowed to miss them
    // quietly, which is why the row asserts the SIZE of what it read and not only what it found.
    for (const m of orb.matchAll(/\(?species === "([a-z]+)"(?: \|\| species === "([a-z]+)")?\)? \? build([A-Z]\w*)\(\)/g)) {
        dispatch.set(m[1], m[3]); if (m[2]) dispatch.set(m[2], m[3]);
    }
    dispatch.set("still", "Still");
    const tabled = new Set([...Object.keys(K.MH_IGNITE), ...Object.keys(K.MH_COMPLETE_INTERIOR),
                            ...Object.keys(K.MH_COMPLETE_LIFT)]);
    const noFlash = ORB_SPECIES.filter((sp2) => !tabled.has(sp2) &&
        !/\bCOMPLETE\b/.test(bodyOf(dispatch.get(sp2) || "")));
    say(`species with no `+"`complete`"+` anywhere: ${noFlash.length ? noFlash.join(", ") : "none"} ` +
        `(of ${ORB_SPECIES.length}; ${dispatch.size} dispatch entries read)`);
    ok("!! *** comet IS THE ONLY SPECIES LEFT WITH NO `complete`, WHICH IS THE ONLY REASON IT CAN BE THE CONTROL ***",
        noFlash.length === 1 && noFlash[0] === "comet" && dispatch.size === ORB_SPECIES.length,
        `${noFlash.join(", ") || "no species"} of ${ORB_SPECIES.length}. THE DAY comet TAKES A COMPLETE TERM ` +
        `THIS ROW GOES RED and the three settle rows above it stay green until somebody notices -- which is ` +
        `the whole point, because the other order is what happened at v4660: geode took one, nothing said ` +
        `so, and three rows went red about a settle when the defect was in the control. The census reads the ` +
        `DISPATCH for each species' builder rather than matching on the name, because nebula and tempest ` +
        `share buildMist and a name match would have called both of them unflashed.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: mh_state's SUCCESS windows reach PIXELS. The kit's own gate proves mh_ignite is " +
    "the right gaussian on a real GPU and that its peak lands on mix(lo, hi, sweep); this one proves a " +
    "rendered species actually draws it, travelling, and that the heroes without a shell still settle. THE " +
    "CONTROL SPECIES IS comet SINCE v4660 AND SECTION 4 MEASURES WHY IT CAN BE: it is the last species in " +
    "the roster with no `complete` term, which is also what lets this gate weigh the settle entirely on its " +
    "own between tau 0.95 and tau 1.40. " +
    "The instrument is deliberately a CENTROID and not a peak radius -- see the header for the five " +
    "non-monotone peak radii that measurement gave on these identical frames." +
    "\nWHAT IS NOT CLAIMED HERE: st.drive, the RESPONDING lean, which is unported and named in " +
    "tools/ship/murmurLive-selfcheck.mjs's own row; the per-species `complete` figures of the other eleven; " +
    "and comet's and droplet's two exceptional settle sites, which are graded as a source census in that same " +
    "gate rather than in pixels. abyss's deeper shell and the mist pair's pre-multiply are next door in " +
    "tools/ship/murmurIgnite2-selfcheck.mjs.");
process.exit(fails ? 1 : 0);
