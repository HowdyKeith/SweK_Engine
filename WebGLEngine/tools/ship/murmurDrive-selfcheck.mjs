// WebGLEngine/tools/ship/murmurDrive-selfcheck.mjs -- v4653
//
// *** THE RESPONDING LEAN: THE WANDER ACQUIRES A HEADING. ***
//
// st.drive is the last of mh_state's four outputs to be wired, and the only one whose subject is a
// DIRECTION. It ramps in over half a second in RESPONDING alone "so entering the state is a lean and not a
// jolt", and six of murmur's eighteen species spend it pointing something that is otherwise hashed, random
// or slowly tumbling at one fixed axis. still.ts: "Under drive the lines converge on one axis, so an
// occasional wander becomes a traverse." abyss.ts: "under drive they all take one heading and the abyss
// becomes a current."
//
// *** THE CLAIM IS ABOUT GEOMETRY, SO THE STRONGEST ROWS HERE ARE NOT PIXEL ROWS, AND THIS GATE SAYS SO IN
// ITS OWN SECTIONS RATHER THAN DRESSING ONE UP AS THE OTHER. *** A frame cannot easily show that twelve
// gestures now share an axis: the glint's position also carries fl.y along the path and a residual lateral
// offset, so two frames at full drive still differ and a "the frames converge" instrument reads 1.34x --
// MEASURED, and rejected here rather than reported as evidence. What DOES converge, exactly, is the set of
// directions, and the kit computes those in f64. So section 1 grades the geometry on the CPU against the
// pair render/murmurKitTsl.mjs is already graded against bit-for-bit, and sections 3 and 4 ask the separate
// and weaker question of whether any of it reaches the picture.
//
// Its sibling tools/ship/murmurDrive2-selfcheck.mjs carries the other half of the lean -- the scatter
// collapsing around the heading -- on the five species that narrow. The split is the usual budget one.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { sp, renderSpecies, ringChange } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurDrive-selfcheck -- RESPONDING: the wander acquires a heading\n");

// RESPONDING is state index 3 and drive is smoothstep(0, 0.55, tau), so tau 0 is drive EXACTLY 0 and any
// tau past 0.55 is drive EXACTLY 1. Both ends are exact, which is what lets the rows below be equalities.
const RESP = 3, IDLE = 0;
const D0 = { stateIndex: RESP, stateTau: 0.0 }, D1 = { stateIndex: RESP, stateTau: 1.0 };

// still's twelve gesture hashes, taken from the kit's own flourish at the species' own slot -- NOT invented
// times. Each is the `rand` at a gesture's peak, which is what sets that gesture's wander angle.
const SLOT = 10.15;   // mix(11.5, 7.0, glintRate 0.3); the drive DIVISOR on it is the rate family, not wired
const GESTURES = (() => {
    const out = [];
    for (let n = 0; n < 12; n++) {
        let best = { env: 0 };
        for (let t = n * SLOT; t < (n + 1) * SLOT; t += 0.01) {
            const f = K.mhFlourish(t, 5.0, SLOT);
            if (f.env > best.env) best = f;
        }
        if (best.env > 0.9) out.push(best.rand);
    }
    return out;
})();

/** Mean and worst pairwise angle, in degrees, over a set of unit directions. */
const spreadDeg = (dirs) => {
    let sum = 0, n = 0, worst = 0;
    for (let i = 0; i < dirs.length; i++) for (let j = i + 1; j < dirs.length; j++) {
        const d = Math.max(-1, Math.min(1, dirs[i][0] * dirs[j][0] + dirs[i][1] * dirs[j][1] + dirs[i][2] * dirs[j][2]));
        const a = Math.acos(d) * 180 / Math.PI;
        sum += a; n++; if (a > worst) worst = a;
    }
    return { mean: sum / n, worst };
};
// The two species' own wander formulas, written out by hand from their sources rather than read back out of
// the shader -- the v4579 distinction, and the reason this section can disagree with the port at all.
const WANDER = {
    still: (ga) => [Math.cos(ga), 0.42 * Math.sin(ga * 1.3), Math.sin(ga)],
    abyss: (ga) => [Math.cos(ga), 0.40 * Math.sin(ga * 1.6), Math.sin(ga * 0.8 + 1.3)],
};
const dirsAt = (name, drive) => {
    const H = K.MH_DRIVE_HEADING[name];
    return GESTURES.map((z) => K.mhDriveHeading(WANDER[name](z * 6.2831853), H.v, drive, H.k, H.pre));
};

// =============================================================================================================
sec("1. *** TWELVE GESTURES THAT POINT ANYWHERE BECOME ONE AXIS -- exactly, and not in a straight line ***");
{
    // *** THE EPSILON IS MEASURED IN-GATE, NOT WRITTEN DOWN. *** acos has infinite slope at 1, so two
    // BIT-IDENTICAL unit vectors do not measure zero degrees apart -- they measure whatever f64's 2e-16 on
    // the dot product becomes after the amplification. Two earlier cuts guessed 1e-9 and 1e-6 and both went
    // red on their own subject. Deriving it from a pair the gate constructs means a later hand widening the
    // bound has to edit this derivation rather than a constant, which is what v4650's ceiling row cost.
    // A first attempt derived it by measuring two COPIES of one vector, which run the identical float ops
    // and come back exactly 0 -- a floor of zero, useless. The real floor is what acos does to a dot
    // product assembled by a DIFFERENT route: near 1 its slope is infinite and an error e in the dot
    // becomes sqrt(2e) in the angle, so f64's ulp is amplified to its square root. Eight ulps is a generous
    // count for three multiplies and two adds, and ten times the result leaves the bound five orders under
    // abyss's own 12-degree residual.
    const ACOS_FLOOR = (180 / Math.PI) * Math.sqrt(2 * 8 * Number.EPSILON);   // ~3.4e-6 degrees
    const EPS = 10 * ACOS_FLOOR;
    const st = [0, 0.25, 0.5, 0.75, 1].map((d) => ({ d, ...spreadDeg(dirsAt("still", d)) }));
    say(`still's ${GESTURES.length} gesture directions, mean pairwise angle by drive:`);
    for (const r of st) say(`   drive ${r.d.toFixed(2)}:  ${r.mean.toFixed(2)} deg   (worst pair ${r.worst.toFixed(2)} deg)`);

    ok("!! *** still's WANDER BECOMES A TRAVERSE: 86.82 degrees of scatter goes to EXACTLY zero ***",
        Math.abs(st[0].mean - 86.82) < 0.01 && st[4].mean < EPS && st[4].worst < EPS && st[0].worst > 170 && EPS < 1e-3,
        `at rest the twelve directions sit ${st[0].mean.toFixed(2)} degrees apart on average with a worst pair ` +
        `of ${st[0].worst.toFixed(1)} -- very nearly opposite, which is what "an occasional wander" means -- and ` +
        `at full drive the mean is ${st[4].mean.toExponential(1)} and the worst pair ${st[4].worst.toExponential(1)} ` +
        `degrees. THE BOUND IS ${EPS.toExponential(1)} DEGREES AND NOT ZERO, AND IT IS DERIVED IN-GATE ` +
        `RATHER THAN WRITTEN DOWN -- a hundred times what two bit-identical copies of one vector measure ` +
        `apart through this same spreadDeg. That is arithmetic rather than slack: at a = 1 ` +
        `every gesture returns the identical vector, but a unit vector's dot with itself comes back as ` +
        `0.9999999999999998 and acos has infinite slope at 1, so two bit-identical directions measure ` +
        `1.71e-6 degrees apart, against the ${ACOS_FLOOR.toExponential(1)} this derivation predicts from ` +
        `Number.EPSILON alone. TWO EARLIER CUTS WROTE THE BOUND BY HAND, at 1e-9 and 1e-6, and both ` +
        `went red on their own subject because the derivative of acos near 1 amplifies a 2e-16 error by ` +
        `eight orders. A third would have passed while a sabotage widened it to 5 degrees, which is why it ` +
        `is derived now. It sits five orders below the 12 degrees abyss's own residual occupies.`);

    // *** THE SHAPE OF THE RAMP IS THE ROW A WRONG IMPLEMENTATION FAILS, AND THE RIGHT ONE LOOKS ODD. ***
    const linear = [0.75, 0.5, 0.25].map((f) => st[0].mean * f);
    ok("!! *** ...and it does NOT converge in a straight line: at the quarter point it has not moved at all ***",
        st[1].mean > st[0].mean && st[1].mean > linear[0] * 1.25 && st[3].mean < st[0].mean * 0.3,
        `quarter ${st[1].mean.toFixed(2)}, half ${st[2].mean.toFixed(2)}, three-quarter ${st[3].mean.toFixed(2)} ` +
        `-- against ${linear.map((v) => v.toFixed(2)).join(" / ")} for a blend of the ANGLES. The real thing ` +
        `holds its scatter through the first quarter (it goes UP, ${st[0].mean.toFixed(2)} to ` +
        `${st[1].mean.toFixed(2)}) and then collapses late, because normalize(mix(a, b, t)) is not a rotation: ` +
        `mixing two nearly-opposite vectors a quarter of the way toward a common target can leave them ` +
        `FURTHER apart in angle than they started. A port that slerped, or that lerped the angle, would read ` +
        `the straight line and pass every other row in this file.`);

    const ab = [0, 1].map((d) => ({ d, ...spreadDeg(dirsAt("abyss", d)) }));
    say(`abyss, the same, at k = ${K.MH_DRIVE_HEADING.abyss.k}: drive 0 ${ab[0].mean.toFixed(2)} deg -> drive 1 ${ab[1].mean.toFixed(2)} deg`);
    ok("!! *** abyss LEANS BUT NEVER LINES UP -- it is a current, not a single ray, and k = 0.80 is why ***",
        ab[1].mean > 8 && ab[1].mean < 20 && ab[0].mean > 80,
        `abyss ends at ${ab[1].mean.toFixed(2)} degrees of residual spread where still ends at ` +
        `${st[4].mean.toFixed(0)}, from the same starting scatter (${ab[0].mean.toFixed(2)} against ` +
        `${st[0].mean.toFixed(2)}). The difference is the whole of k: still mixes all the way to the heading ` +
        `and abyss only four fifths of it. abyss.ts asks for "one heading" and gets a CURRENT -- three lanes ` +
        `that agree on a direction without becoming one line -- and a table that shared one k could not.`);
}

// =============================================================================================================
sec("2. *** THE SIX HEADINGS ARE NOT ONE VECTOR, NONE OF THEM IS A UNIT VECTOR, AND TWO ARE NOT WIRED ***");
{
    const H = K.MH_DRIVE_HEADING, names = Object.keys(H);
    const lens = names.map((n) => ({ n, L: Math.hypot(...H[n].v) }));
    for (const r of lens) say(`${r.n.padEnd(8)} |v| = ${r.L.toFixed(6)}  (off unit by ${((r.L - 1) * 100).toFixed(3)}%)  k ${H[r.n].k.toFixed(2)}  pre ${H[r.n].pre}  wired ${H[r.n].wired}`);

    // *** THE BOUND CARRIES ITS OWN NEGATIVE CONTROL, because loosening a bound on a correct subject is
    // invisible otherwise. *** A sabotage put this back to 1e-6 and walked through: murmur's real vectors
    // deviate by 1.5e-4 at least, so they clear either bound. What 1e-5 is FOR is catching the plausible
    // cleanup -- a vector renormalized and written to five decimals -- so the row constructs exactly that
    // and requires it to FAIL the same test the real ones pass. A widened bound then fails here instead.
    const UNIT_BOUND = 1e-5;
    const tidied = (() => {
        const v = K.MH_DRIVE_HEADING.still.v, n = Math.hypot(...v);
        return v.map((c) => Number((c / n).toFixed(5)));
    })();
    const tidiedDev = Math.abs(Math.hypot(...tidied) - 1);
    say(`a "tidied" still -- renormalized and written to five decimals -- would deviate ${tidiedDev.toExponential(3)}, against the bound ${UNIT_BOUND.toExponential(0)}`);
    ok("!! *** NOT ONE OF murmur's SIX HEADING VECTORS IS A UNIT VECTOR, which is why `pre` is not cosmetic ***",
        lens.every((r) => Math.abs(r.L - 1) > UNIT_BOUND) && lens.some((r) => Math.abs(r.L - 1) > 0.002) &&
        tidiedDev < UNIT_BOUND,
        `all six are off unit, the worst by ${(100 * Math.max(...lens.map((r) => Math.abs(r.L - 1)))).toFixed(3)}% ` +
        `(sol, ${lens.find((r) => r.n === "sol").L.toFixed(6)}). murmur normalizes them INCONSISTENTLY: still ` +
        `and abyss mix toward the raw vector, sol and droplet toward its normalized version. Mixing toward a ` +
        `0.997-long vector is a different direction from mixing toward its unit version at every point of the ` +
        `ramp strictly between the ends, so `+"`pre`"+` is transcribed per species rather than tidied away. ` +
        `THE BOUND IS ${UNIT_BOUND.toExponential(0)} AND THE ROW PROVES IT IS IN THE RIGHT PLACE RATHER ` +
        `THAN ASSERTING IT: the smallest real deviation is nebula's 1.500e-4, and the tidied vector this row ` +
        `builds for itself lands at ${tidiedDev.toExponential(3)} -- BELOW the bound, which the row requires. ` +
        `A first cut asked for 1e-6 and let the tidying through; a later sabotage put it back to 1e-6 and ` +
        `walked through again, because loosening a bound on a subject that is correct is invisible unless ` +
        `the bound is made to demonstrate what it excludes.`);

    const solH = K.MH_DRIVE_HEADING.sol, w = [0.3, 0.1, 0.95];
    const raw = K.mhDriveHeading(w, solH.v, 0.5, solH.k, false), pre = K.mhDriveHeading(w, solH.v, 0.5, solH.k, true);
    const gap = Math.hypot(raw[0] - pre[0], raw[1] - pre[1], raw[2] - pre[2]);
    // *** AND THE TABLE'S FLAGS ARE PINNED, because the row below shows the two spellings differ without
    // saying which species gets which. A sabotage flipped sol's `pre` to false and nothing moved: sol is
    // not rendered in this gate (budget), and a row that computes both answers itself never consults the
    // table it is supposedly grading. The four wired flags are murmur's, read off its four call sites.
    const H2 = K.MH_DRIVE_HEADING;
    ok("!! ...and the four wired `pre` flags are murmur's own per-species spelling, not one convention",
        H2.still.pre === false && H2.abyss.pre === false && H2.sol.pre === true && H2.droplet.pre === true &&
        /HEAD\.pre \?/.test(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8")),
        `still false, abyss false, sol true, droplet true -- and the shader builder reads HEAD.pre rather ` +
        `than picking one. murmur writes normalize(mix(w, V, a)) for the first two and ` +
        `normalize(mix(d, normalize(V), a)) for sol, and droplet assigns normalize(V) straight into its ` +
        `flow direction. TWO conventions across four call sites, and a port that unified them would be ` +
        `wrong at every point of the ramp except its two ends.`);

    ok("...and the two spellings genuinely disagree mid-ramp, so the flag has a measurable consequence",
        gap > 1e-5 && gap < 1e-2,
        `at half drive sol's two spellings differ by ${gap.toExponential(3)} in direction -- small, real, and ` +
        `zero at both ends of the ramp, which is exactly the signature of a difference that lives in the ` +
        `blend rather than in the endpoints. A row checking only drive 0 and drive 1 could not see it.`);

    // The z sign is the finding, and it is the reason the two unwired entries are carried here at all.
    const fwd = names.filter((n) => H[n].v[2] > 0), back = names.filter((n) => H[n].v[2] < 0);
    ok("!! *** THE FOUR WIRED HEADINGS POINT ONE WAY IN DEPTH AND THE TWO CLOUDS STREAM THE OTHER ***",
        fwd.join(",") === "still,abyss,sol,droplet" && back.join(",") === "nebula,tempest" &&
        fwd.every((n) => H[n].wired) && back.every((n) => !H[n].wired),
        `+z: ${fwd.join(", ")}; -z: ${back.join(", ")}. The split is exactly the wired/unwired split and that ` +
        `is a coincidence of subject, not of scheduling: the two that stream AWAY are murmur's two volumetric ` +
        `heroes, and their headings are spelled as an ADVECTION -- adv = V * (drive * k * t) -- a displacement ` +
        `proportional to elapsed time. A drive ramping while t is large advects the domain by t * k * dDrive ` +
        `in one frame, which is the shape v4650 repaired on this orb's host clock (2.902 s in one frame after ` +
        `a minute; 86.191 s after half an hour). This round wires only terms that are a DIRECTION or a SIZE.`);
}

// =============================================================================================================
sec("3. *** IT REACHES PIXELS, AND drive = 0 INSIDE RESPONDING IS BYTE-IDENTICAL TO IDLE ***");
{
    // *** TWO SPECIES, AND THE COUNT WAS SET BY THE CLOCK RATHER THAN BY THE ARGUMENT. *** With all four it
    // measured 4,065 ms against a 3,000 ms ceiling and with three 2,943 -- inside the number but not inside
    // it on a box the tree measures running about 10% slower under a contended sweep, which is over, and a
    // gate over budget does not run at ship time AT ALL. A species is one WGSL compile here; the frames
    // after it are nearly free.
    //
    // sol and abyss are the two dropped and neither loses a claim: sol's heading is the same
    // mhDriveHeading call on a tumbling root instead of a hashed one, and abyss's k = 0.80 residual is a
    // GEOMETRY fact that section 1 grades exactly in f64. The two kept are the two that cannot be measured
    // any other way -- still is the lean that stays inside the glass, droplet is the lean that moves the
    // outline, and the single ring below has to tell them apart.
    const SPECIES = ["still", "droplet"];
    const T = 3.85;   // a gesture PEAK for still's slot, and a time abyss has a creature passing
    const FRAMES = [];
    for (const s of SPECIES) for (const kn of [{ stateIndex: IDLE, stateTau: 0.0 }, D0, D1]) FRAMES.push(sp(s, T, undefined, kn));
    const run = await renderSpecies(FRAMES);
    if (!run.ok || !run.frames || run.frames.length !== FRAMES.length) {
        ok("!! the lean renders at all", false,
            `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}. A gate ` +
            `that cannot run its own subject is a FAIL row and not a silent skip.`);
    } else {
        say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FRAMES.length} frames`);
        const diff = (a, b) => { let n = 0, sum = 0, mx = 0;
            for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; sum += d; if (d > mx) mx = d; }
            return { pct: 100 * n / a.length, mean: sum / a.length, mx }; };
        const rows = SPECIES.map((s, i) => ({ s,
            quiet: diff(run.frames[i * 3], run.frames[i * 3 + 1]),
            lean: diff(run.frames[i * 3 + 1], run.frames[i * 3 + 2]) }));
        for (const r of rows) say(`${r.s.padEnd(8)} drive 0 vs IDLE: ${r.quiet.pct.toFixed(1)}% of bytes   |   drive 0 -> 1: ${r.lean.pct.toFixed(1)}%, mean ${r.lean.mean.toFixed(3)}, worst ${r.lean.mx}`);

        ok("!! *** THE LEAN REACHES THE PICTURE IN BOTH, and RESPONDING AT drive 0 MOVES NOT ONE BYTE ***",
            rows.every((r) => r.quiet.pct === 0) && rows.every((r) => r.lean.pct > 5 && r.lean.mx > 50),
            `both are byte-identical to their own IDLE frame while drive is 0 -- 0 of 9,216 bytes, twice ` +
            `over -- and both move at least ${Math.min(...rows.map((r) => r.lean.pct)).toFixed(1)}% ` +
            `of its bytes as drive goes to 1, worst channel ${rows.map((r) => r.lean.mx).join("/")} of 255. ` +
            `BOTH HALVES ARE THE CLAIM AND THE FIRST IS THE ONE THAT PROTECTS EVERYTHING ELSE: eighteen ` +
            `species' byte baselines are captured outside RESPONDING, and drive is exactly 0 there.`);

        // *** TWO KINDS OF LEAN, AND ONE INSTRUMENT TELLS THEM APART. *** ringChange reads the light on a
        // fixed circle: a body whose OUTLINE moves sweeps its own rim past it, and a body whose interior
        // changes does not. droplet's heading goes into the silhouette (the kit's flow deformation); still's
        // goes into a path inside the glass. The row asks for both answers from the same measurement.
        const dropRing = ringChange(run.frames[1 * 3 + 1], run.frames[1 * 3 + 2], 0.62);
        const stillRing = ringChange(run.frames[0 * 3 + 1], run.frames[0 * 3 + 2], 0.62);
        say(`on the 0.62 ring: droplet max ${(100 * dropRing.max).toFixed(1)}% of mean, still max ${(100 * stillRing.max).toFixed(1)}%`);
        ok("!! *** droplet's LEAN IS IN THE SILHOUETTE AND still's IS NOT -- the same ring says both ***",
            dropRing.max > 2.0 && stillRing.max < 0.05 && dropRing.max > 50 * stillRing.max,
            `droplet's rim sweeps past the fixed circle hard enough to move the light on it by ` +
            `${(100 * dropRing.max).toFixed(1)}% of its own mean, while still's moves ` +
            `${(100 * stillRing.max).toFixed(1)}% -- ${(dropRing.max / Math.max(stillRing.max, 1e-9)).toFixed(0)} ` +
            `times less. STILL's IS NOT ZERO AND THE ROW DOES NOT ASK FOR ZERO: this frame is a gesture PEAK, ` +
            `so its glint is lit and reaches far enough out to brighten the ring slightly without moving the ` +
            `outline at all. A first cut demanded exactly 0 and went red on that. What separates the two is ` +
            `the RATIO, and two orders of magnitude is not a bound anything accidental meets. It is ` +
            `why droplet sits in MH_DRIVE_HEADING without being a caller of mhDriveHeading: its direction goes ` +
            `into the body's flow deformation, a term both halves of this kit have carried since the port and ` +
            `NO CALL SITE HAS EVER SET -- every one passed (0,0,1), 0, 0 until this round.`);
    }
}

// =============================================================================================================
sec("4. *** THE CENSUS: what the shader reads, and the rule this round set itself ***");
{
    const src = codeOnly(fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8"));
    const H = K.MH_DRIVE_HEADING;
    const wired = Object.keys(H).filter((n) => H[n].wired).sort();

    // Which species' build closures actually read a heading. Set EQUALITY in both directions, the same shape
    // v4644's MH_IGNITE census took after a dead table entry walked through every pixel gate in that round.
    const lines = src.split("\n");
    const marks = [];
    lines.forEach((l, i) => { const m = /^\s*const build([A-Z]\w*) = \(\) => \{/.exec(l); if (m) marks.push([i, m[1].toLowerCase()]); });
    marks.push([lines.length, "(end)"]);
    const callers = [];
    for (let k = 0; k < marks.length - 1; k++) {
        const blk = lines.slice(marks[k][0], marks[k + 1][0]).join("\n");
        if (/KIT\.mhDriveHeading\(/.test(blk)) callers.push(marks[k][1]);
    }
    // droplet's heading is not a mhDriveHeading call -- it is the flow deformation, set at the shared body
    // solve above every closure, so it is looked for where it actually lives.
    // *** READ FROM THE RAW FILE, NOT FROM codeOnly, AND THAT IS NOT A SHORTCUT. *** sourceScan's codeOnly
    // blanks STRING LITERALS as well as comments -- `species === "droplet"` comes back as `species === ""` --
    // which is right for its own job and fatal for a census keyed on a species NAME. A first cut matched the
    // blanked form and reported droplet as unwired while the shader was setting its flow correctly. The two
    // halves are read from the two sources that can answer them: the identifier from the stripped code, the
    // string key from the file as written.
    const rawSrc = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const dropletFlow = /DROPLET_FLOW/.test(src) && /species === "droplet" && HEAD/.test(rawSrc);
    const reached = callers.concat(dropletFlow ? ["droplet"] : []).sort();
    say(`heading callers: ${callers.join(", ")}${dropletFlow ? " (+ droplet, via the body's flow deformation)" : ""}`);
    ok("!! *** EXACTLY THE `wired` ENTRIES REACH THE SHADER, AND THE TWO ADVECTIONS REACH NOTHING ***",
        reached.join(",") === wired.join(",") && !/MH_DRIVE_HEADING\.(nebula|tempest)/.test(src),
        `the builder reads ${reached.join(", ")}; MH_DRIVE_HEADING's wired set is ${wired.join(", ")}. ` +
        `EQUALITY IN BOTH DIRECTIONS, and each direction has a failure behind it: a table entry no closure ` +
        `reads draws nothing at all (v4644's dead MH_IGNITE entry walked through every pixel gate in that ` +
        `round), and a closure reading an entry that is not there would fault on its k. nebula's and ` +
        `tempest's names appear nowhere in the shader, so the day somebody wires them THIS ROW GOES RED and ` +
        `the note explaining why they were left out gets read before the jump ships.`);

    // *** THE RULE THIS ROUND SET ITSELF -- AND WHAT IT BECAME TWO ROUNDS LATER, WHICH IS WHY IT IS REWRITTEN
    // RATHER THAN LEFT PASSING. *** At v4653 this row read "NOTHING THIS ROUND WIRED MULTIPLIES A CLOCK" and
    // tested that no line reads DRIVE and `uniforms.time` together: the rate family was deferred, and a drive
    // ramping at large t would have teleported a phase of rate * t. v4654 and v4655 UNDEFERRED IT -- the
    // secular phase is an integral now, and helix's climb reads st.drive and advances a clock on purpose.
    //
    // The old test still passed, because helix's two reads land on two source lines. A row whose literal
    // condition survives while the sentence above it has stopped being true is the defect this tree keeps
    // finding -- a record that outlived its own repair -- and it is worse than a red one, because it reads
    // like a live guarantee. So the rule is restated as what is actually true at v4655:
    //
    //   INSTANTANEOUS DRIVE NEVER MULTIPLIES A GROWING PHASE. It reaches a clock at exactly one place, as
    //   mh_drift's WOBBLE AMPLITUDE, which is bounded by k*rate/w2 and cannot accumulate. Every SECULAR term
    //   that reads drive reads the running integral instead, through mhRatePhase's last two arguments.
    const bad = lines.filter((l) => /\bDRIVE\b/.test(l) && /uniforms\.time/.test(l));
    // Every DRIVE inside a mhDriftPhase call must be in the SECOND argument (the amplitude), never the first.
    const chainArgs = (txt, at) => {
        let open = txt.indexOf("(", at), j = open, d = 0;
        for (; j < txt.length; j++) { if (txt[j] === "(") d++; else if (txt[j] === ")") { d--; if (!d) break; } }
        const inner = txt.slice(open + 1, j), out = []; let depth = 0, last = 0;
        for (let q = 0; q < inner.length; q++) {
            if (inner[q] === "(") depth++; else if (inner[q] === ")") depth--;
            else if (inner[q] === "," && depth === 0) { out.push(inner.slice(last, q)); last = q + 1; }
        }
        out.push(inner.slice(last));
        return out;
    };
    let secularDrive = 0, amplitudeDrive = 0;
    for (let i = 0; (i = src.indexOf("KIT.mhDriftPhase(", i)) !== -1; i += 8) {
        const a = chainArgs(src, i);
        if (/\bDRIVE\b/.test(a[0] || "")) secularDrive++;
        if (/\bDRIVE\b/.test(a[1] || "")) amplitudeDrive++;
    }
    // ...and the integral itself is only ever handed to mhRatePhase, so it cannot be spent as a plain factor.
    const driveIntReads = (src.match(/uniforms\.driveInt/g) || []).length;
    const driveIntInRate = (src.match(/uniforms\.driveInt\)/g) || []).length;
    ok("!! *** INSTANTANEOUS DRIVE NEVER MULTIPLIES A GROWING PHASE -- it reaches a clock only as a bounded amplitude ***",
        bad.length === 0 && secularDrive === 0 && amplitudeDrive === 1 && driveIntReads === driveIntInRate,
        `no line reads both DRIVE and uniforms.time (${bad.length}); of the mhDriftPhase sites, ` +
        `${secularDrive} pass DRIVE as the SECULAR phase and ${amplitudeDrive} as the wobble AMPLITUDE -- ` +
        `helix's climb, the one site where murmur scales a clock by st.drive and this port reaches it. The ` +
        `amplitude is bounded by k*rate/w2 whatever drive does; the secular half is where the teleport lives ` +
        `and it reads uniforms.driveInt, which appears ${driveIntReads} times and every one of them is the ` +
        `last argument of a mhRatePhase call. THIS ROW USED TO SAY THE RATE FAMILY WAS DEFERRED and tested ` +
        `that no line read DRIVE and uniforms.time together. v4654 and v4655 undeferred it, and the old test ` +
        `KEPT PASSING because helix's two reads sit on two lines -- a condition outliving its own sentence, ` +
        `which is the failure this tree finds most often and the one a green row hides best.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: st.drive's heading family -- the last of mh_state's four outputs to reach a " +
    "pixel, and the only one whose subject is a direction. The strongest rows are CPU rows and the gate says " +
    "so: twelve gestures 86.82 degrees apart becoming one axis is a statement about geometry, and the " +
    "frames cannot show it cleanly because a glint carries its along-path position and a residual lateral " +
    "offset as well (a frame-convergence instrument reads 1.34x -- measured, and rejected rather than " +
    "reported). render/murmurKitTsl.mjs's twin of the same function is what carries it to the GPU." +
    "\nWHAT IS NOT CLAIMED: the RATE family was sixteen sites where drive multiplies a local clock, deferred " +
    "here at v4653 with a checked rule rather than an intention, and it is NOT deferred any more -- v4654 " +
    "made the secular phase an integral and v4655 finished the sites whose whole output is multiplied. The " +
    "rule above was rewritten to say what is true now rather than left passing on a condition its own " +
    "sentence had outgrown; tools/ship/murmurClock-selfcheck.mjs and murmurClock2-selfcheck.mjs are the " +
    "gates for it, and limn's drive FACTOR is the one piece still outstanding because its rate is a " +
    "product. nebula's and tempest's advections remain unwired -- that same " +
    "hazard in the heading family and are carried unwired with a census row that goes red if anyone wires " +
    "them. The scatter collapsing around the heading is the sibling gate, " +
    "tools/ship/murmurDrive2-selfcheck.mjs.");
process.exit(fails ? 1 : 0);
