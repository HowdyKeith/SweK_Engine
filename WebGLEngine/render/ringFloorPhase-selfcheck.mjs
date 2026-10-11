/**
 * A HALF TEXEL IS THE ONE PHASE WHERE THIS ARC'S EXPRESSIONS CANNOT BE TOLD APART.
 *
 * v4570's audit found two 0-REDs and closed by noticing they shared a constant. The window phase was
 * invisible because f(1-f) IS 0.25 at a half texel; v4562 found max(f, 1-f) and min(f, 1-f) indistinguishable
 * at a half texel; v4559 found round and floor coincide at a tie. Three blind spots, one fixture constant,
 * and the whole arc drives it.
 *
 * *** IT IS NOT THREE COINCIDENCES. *** f = 1/2 is the unique fixed point of sigma: f -> 1 - f, and every
 * phase expression this arc has built is either sigma-symmetric or has its mirror somewhere else in the
 * arc. A pair {g, g . sigma} agrees exactly on Fix(sigma); a sigma-symmetric g is stationary there, so it
 * meets its own maximum. Measured below: SIX of eight expression pairs the arc uses agree at f = 1/2 and
 * NOWHERE ELSE in (0, 1).
 *
 * *** AND THE COST IS AN ENTIRE ARC OF GATES THAT CANNOT SEE THE PHASE LAW. *** Substituting
 * 0.5 * min(f, 1-f) for f(1-f) -- an impostor that agrees with truth at f = 0 and f = 1/2, reads 0.667x of
 * it at a quarter texel, and is therefore UNSAFE in the direction a margin cares about -- into BOTH the
 * mirror and the kernel went 0-RED across all eleven gates of this arc. 21 of 475 reported lines moved.
 * Zero rows failed. The census and the four separate reasons are in section 4.
 *
 * *** THE REPAIR IS A SHAPE ROW, NOT A TIGHTER TOLERANCE. *** Every row that missed this was checking the
 * bound's SAFETY or its DIRECTION; the phase factor is a multiplicative law and it can be read off directly.
 * Feeding a synthetic motion buffer that puts every pixel at one chosen sub-texel phase, the frame form's
 * per-pixel floor scales as f(1-f) to 1.3e-7 relative across three decades of f -- and each of the five
 * impostors deviates by at least 12%. That row is in section 5, and it runs on the device too, against the
 * LAW rather than against the mirror, because v4570 established that a parity row is immune by construction
 * to a mutation applied to both sides.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin } from "../tools/ship/webgpuHarness.mjs";
import { ringFloorCPU, resampleDepth, ARITHMETIC_ULPS, EPS_F32, RESOLUTION_TAU } from "./ringFloor.mjs";
import { RING_FLOOR_WGSL } from "./ringFloorWgsl.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { jitterPhaseCount } from "./jitter.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 32, H = 32, P = jitterPhaseCount(1), NEAR = 1, FAR = 10, HALF = 4, Z = 8;
const TRUTH = (f) => f * (1 - f);

console.log("ringFloorPhase-selfcheck -- the one phase where this arc's expressions cannot be told apart\n");

// ---------------------------------------------------------------------------------------------------------
console.log("1. *** SIX OF EIGHT EXPRESSION PAIRS IN THIS ARC AGREE AT A HALF TEXEL AND NOWHERE ELSE ***");
const PAIRS = [
    ["frame phase f(1-f)", "window phase 0.25",       (f) => TRUTH(f),               () => 0.25,                   "v4564 / v4570"],
    ["step max(f,1-f)",    "the repair min(f,1-f)",   (f) => Math.max(f, 1 - f),     (f) => Math.min(f, 1 - f),    "v4562"],
    ["step max(f,1-f)",    "the constant 1/2",        (f) => Math.max(f, 1 - f),     () => 0.5,                    "-"],
    ["near weight 1-f",    "far weight f",            (f) => 1 - f,                  (f) => f,                     "-"],
    ["f(1-f)",             "min(f,1-f)/2",            (f) => TRUTH(f),               (f) => Math.min(f, 1 - f) / 2,"this round"],
    ["f(1-f)",             "f/2",                     (f) => TRUTH(f),               (f) => f / 2,                 "-"],
    ["round(n+f)",         "floor(n+f)",              (f) => Math.round(7 + f),      (f) => Math.floor(7 + f),     "v4559"],
    ["round(n+f)",         "floor(n+f)+1",            (f) => Math.round(7 + f),      (f) => Math.floor(7 + f) + 1, "v4559"],
];
{
    // A fine sweep, not a handful of picked points: an expression pair that happened to meet somewhere else
    // would be missed by a coarse one, and "agrees only at 1/2" is the whole claim.
    // The grid must CONTAIN 1/2, or "agrees only at 1/2" reads as "agrees never": the first version of this
    // row used (i+1)/4001, which never lands on it, and went red saying 0 of 8 pairs agree anywhere.
    const N = 4000, FS = [...Array(N - 1)].map((_, i) => (i + 1) / N);
    const EQ = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
    const meets = PAIRS.map(([, , g, h]) => FS.filter((f) => EQ(g(f), h(f))));
    const onlyHalf = meets.filter((m) => m.length === 1 && Math.abs(m[0] - 0.5) < 1e-12);
    for (let i = 0; i < PAIRS.length; i++) {
        const [a, b, , , seen] = PAIRS[i], m = meets[i];
        const where = m.length === 0 ? "never" : m.length > 40 ? `on ${m.length} of ${FS.length} phases` :
            m.map((f) => f.toFixed(3)).join(" ");
        report(`${(a + "  vs  " + b).padEnd(44)} agree ${where.padEnd(26)} found ${seen}`);
    }
    ok(`*** ${onlyHalf.length} of the ${PAIRS.length} pairs agree at exactly one phase in (0,1) and that phase is 1/2 ***`,
        onlyHalf.length === 6, `${onlyHalf.length} pairs, over a sweep of ${FS.length} phases`);
    // The round/floor pair is the exception and it is the same constant seen differently: 1/2 is not a
    // meeting point there, it is the BOUNDARY between the half-interval each agrees on.
    const rFloor = meets[6], rCeil = meets[7];
    ok("  and the two that do not are round-vs-floor, where 1/2 is not a meeting point but the BOUNDARY between the half-intervals each agrees on -- the same constant, arrived at differently",
        rFloor.length > 40 && rCeil.length > 40 && Math.max(...rFloor) < 0.5 && Math.min(...rCeil) === 0.5,
        `floor agrees below ${Math.max(...rFloor).toFixed(4)}, floor+1 from ${Math.min(...rCeil).toFixed(4)} up`);
    // AND THE TIE ITSELF BELONGS TO A DIFFERENT SIDE IN EACH LANGUAGE, which is v4559's finding stated as
    // a property rather than as a fixture: JS rounds a half AWAY FROM ZERO, WGSL rounds it TO EVEN. They
    // coincide at 7.5 -- 8 is even -- and diverge at 22.5, where WGSL answers 22 and floor answers 22 too,
    // so a device row placed on that tie reads a PASS off two different rules agreeing by accident.
    ok("  and the tie is the one place the two languages disagree about which side it falls on: JS rounds a half away from zero, WGSL rounds it to even, so they coincide at 7.5 and part at 22.5 -- where WGSL's answer is floor's",
        (() => { const toEven = (v) => { const r = Math.round(v); return Math.abs(v % 1) === 0.5 && (r & 1) ? r - 1 : r; };
                 return toEven(7.5) === Math.round(7.5) && toEven(22.5) !== Math.round(22.5) && toEven(22.5) === Math.floor(22.5); })(),
        "round-to-even and round-away agree at 7.5 and part at 22.5, where to-even gives floor's answer -- measured on the device at v4559");
}

// ---------------------------------------------------------------------------------------------------------
console.log("\n2. WHY IT IS ONE CAUSE AND NOT THREE: THE FIXED POINT, AND THE EXTREMUM ABOVE IT");
{
    // MECHANISM ONE. sigma: f -> 1-f is an involution on [0,1] with exactly one fixed point. Any pair
    // {g, g . sigma} -- the two bilinear weights, and max/min of the same two arguments -- must agree there
    // and, if g is injective, only there.
    const sigma = (f) => 1 - f;
    const fixed = [...Array(4001)].map((_, i) => i / 4000).filter((f) => Math.abs(sigma(f) - f) < 1e-12);
    ok("MECHANISM ONE -- sigma: f -> 1-f has exactly one fixed point on [0,1], so any expression and its sigma-mirror agree there and, being injective off it, nowhere else",
        fixed.length === 1 && Math.abs(fixed[0] - 0.5) < 1e-12, `Fix(sigma) = {${fixed.map((f) => f.toFixed(4)).join(",")}}`);
    // max(a,b) = min(a,b) iff a = b, and the two arguments here are f and sigma(f) -- so the step bound and
    // "the repair" meeting is the fixed point again, wearing a different expression.
    ok("  and max(f,1-f) = min(f,1-f) exactly when the two ARGUMENTS coincide, which is the same fixed point -- v4562's finding is mechanism one, not a separate fact",
        Math.abs(Math.max(0.5, 0.5) - Math.min(0.5, 0.5)) === 0 &&
        [0.1, 0.3, 0.7, 0.9].every((f) => Math.max(f, 1 - f) !== Math.min(f, 1 - f)), "checked at four off-centre phases");
    // MECHANISM TWO. A sigma-symmetric differentiable g satisfies g'(f) = -g'(1-f), so g'(1/2) = 0: the
    // fixed point is a stationary point, which is why a symmetric factor MEETS ITS OWN MAXIMUM there and a
    // "take the maximum instead" repair is invisible at that phase.
    const d = 1e-6, deriv = (g, f) => (g(f + d) - g(f - d)) / (2 * d);
    const SYM = [["f(1-f)", TRUTH], ["min(f,1-f)/2", (f) => Math.min(f, 1 - f) / 2], ["sin(pi f)/4", (f) => Math.sin(Math.PI * f) / 4]];
    for (const [n, g] of SYM) report(`${n.padEnd(14)} g(1/2) = ${g(0.5).toFixed(6)}   g'(1/2) = ${deriv(g, 0.5).toExponential(2)}   g(0.30)/g(1/2) = ${(g(0.3) / g(0.5)).toFixed(3)}`);
    ok("MECHANISM TWO -- every sigma-symmetric factor is STATIONARY at the fixed point, so it meets its own maximum there: that is why swapping a phase factor for its own upper bound is invisible at a half texel",
        SYM.every(([, g]) => Math.abs(deriv(g, 0.5)) < 1e-8 && g(0.3) < g(0.5)), `three symmetric factors, all |g'(1/2)| < 1e-8`);
    ok("  which makes the v4564 window form and the v4570 0-RED the SAME statement: the window form is max f(1-f), and a function meets its max at its stationary point",
        Math.abs(TRUTH(0.5) - 0.25) < 1e-15, `f(1-f) at 1/2 is ${TRUTH(0.5)}, the window constant is 0.25`);
}

// ---------------------------------------------------------------------------------------------------------
console.log("\n3. AND THE ARC'S OWN FIXTURE CONSTANT LANDS EXACTLY THERE, BY CONSTRUCTION");
const vp = (cx) => { const o = new Float32Array(16);
    o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
    const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; return mat4Multiply(o, t); };
{
    // HALF_TEXEL, as ringFloor-selfcheck defines it, is 0.5 * (2*HALF/W): half of one texel's world width
    // under this arc's orthographic fixture. Run it through the real motion-vector path and read the phase
    // ringFloorCPU would compute, rather than asserting the arithmetic.
    const S = 2 * HALF / W, HALF_TEXEL = 0.5 * S;
    const phaseOf = (speed) => {
        const d = new Float32Array(W * H).fill((Z - NEAR) / (FAR - NEAR));
        const m = motionVectorsCPU(d, W, H, mat4Invert(vp(speed)), vp(0)).data, got = new Set();
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const hu = (x + 0.5) / W + m[(y * W + x) * 4];
            got.add((hu * W - 0.5 - Math.floor(hu * W - 0.5)).toFixed(6));
        }
        return [...got].sort();
    };
    const at5 = phaseOf(HALF_TEXEL), at0 = phaseOf(0), at8 = phaseOf(S / 8);
    report(`camera speed HALF_TEXEL  -> x-phases ${at5.join(" ")}`);
    report(`camera speed 0           -> x-phases ${at0.join(" ")}`);
    report(`camera speed one eighth  -> x-phases ${at8.join(" ")}`);
    ok("*** the arc's HALF_TEXEL camera speed puts EVERY pixel at f = 1/2 exactly -- the fixed point, through the real motion-vector path and not by asserting the arithmetic ***",
        at5.length === 1 && Math.abs(+at5[0] - 0.5) < 1e-6, `one distinct phase, ${at5[0]}`);
    ok("  and a still camera puts every pixel at f = 0, where the Taylor factor VANISHES -- so a fixture driving only these two speeds pins a phase law at its zero and at its maximum, and at no point between",
        at0.length === 1 && Math.abs(+at0[0]) < 1e-6 && Math.abs(TRUTH(0)) < 1e-15, `still -> ${at0[0]}, f(1-f) there ${TRUTH(0)}`);
    ok("  while an eighth-texel speed lands off both, which is what section 4 needs and no gate in this arc had",
        at8.length === 1 && Math.abs(+at8[0] - 0.125) < 1e-6, `one distinct phase, ${at8[0]}`);
}

// ---------------------------------------------------------------------------------------------------------
console.log("\n4. *** TWO POINTS DO NOT PIN A LAW: FIVE IMPOSTORS PASS, AND ONE OF THEM PASSED THE WHOLE ARC ***");
const IMPOSTORS = [
    ["triangle  0.5*min(f,1-f)", (f) => 0.5 * Math.min(f, 1 - f)],
    ["sine      0.25*sin(pi f)", (f) => 0.25 * Math.sin(Math.PI * f)],
    ["quartic   4 f^2(1-f)^2",   (f) => 4 * TRUTH(f) ** 2],
    ["ramp      min(f,0.5)/2",   (f) => Math.min(f, 0.5) / 2],
    ["sqrt      0.25*sqrt(2f)",  (f) => 0.25 * Math.sqrt(Math.min(2 * f, 2 - 2 * f))],
];
{
    const thru = IMPOSTORS.filter(([, g]) => Math.abs(g(0)) < 1e-15 && Math.abs(g(0.5) - 0.25) < 1e-15);
    report("             ratio to truth at each phase, and the worst absolute deviation over (0,1)");
    report("                f=1/8    f=1/4    f=3/8    f=1/2      worst |dev|");
    for (const [n, g] of IMPOSTORS) {
        let bd = 0; for (let i = 1; i < 1000; i++) { const f = i / 1000; bd = Math.max(bd, Math.abs(g(f) - TRUTH(f))); }
        report(`${n.padEnd(26)}${[0.125, 0.25, 0.375, 0.5].map((f) => (g(f) / TRUTH(f)).toFixed(3).padStart(7) + "x").join(" ")}    ${bd.toExponential(2)}`);
    }
    ok(`*** all ${thru.length} impostors agree with f(1-f) at BOTH f = 0 and f = 1/2, so the two speeds the arc drives cannot separate any of them from truth ***`,
        thru.length === IMPOSTORS.length, `${thru.length}/${IMPOSTORS.length} through both points`);
    const sep = IMPOSTORS.map(([, g]) => Math.abs(g(0.125) / TRUTH(0.125) - 1));
    ok(`  a THIRD point at an eighth texel separates every one of them, the closest by ${(100 * Math.min(...sep)).toFixed(1)}% -- which is why section 3's eighth-texel speed is the repair a census can act on`,
        Math.min(...sep) > 0.1, `ratios ${IMPOSTORS.map(([, g]) => (g(0.125) / TRUTH(0.125)).toFixed(3)).join(" ")}`);
    ok("  and the triangle is UNSAFE, not merely different: it reads BELOW truth everywhere off the two shared points, which for a margin is the dangerous direction",
        [0.05, 0.125, 0.25, 0.375, 0.45].every((f) => IMPOSTORS[0][1](f) < TRUTH(f)), "five phases, all below");
}
{
    // THE MEASURED CONSEQUENCE. Recorded, not re-run: substituting the triangle into ringFloor.mjs AND
    // ringFloorWgsl.mjs and running the eleven gates of this arc.
    const CENSUS = Object.freeze({ gates: 11, lines: 475, moved: 21, failed: 0, at: "v4571" });
    // *** THE PHASE CENSUS THE FOUR REASONS ARE READ OFF. *** Measured by instrumenting ringFloorCPU to
    // record every (fx, fy) it computed and importing each gate under it. The counts are DISTINCT phases
    // reached, and the split is not gradual -- it is two families with nothing between them.
    //
    //     ringFloor              2 distinct     {0, 1/2}          half of all readings at 1/2
    //     ringFloorCost          2 distinct     {0, 1/2}          half
    //     ringFloorDevice        2 distinct     {0, 1/2}          43.8%
    //     ringFloorLight         3 distinct                       22.9%
    //     kernelAudit            4 distinct                       16.7%
    //     ringFloorStep          5 distinct                       16.5%
    //     ringFloorPerspective  28 distinct     traced fixture     4.5%
    //     ringFloorStat         38 distinct     traced fixture     0.0%
    //     ringFloorMargin      174 distinct     traced fixture     0.0%
    //     ringFloorControl     174 distinct     traced fixture     0.0%
    //     ringFloorYaw        1986 distinct     traced fixture     0.0%
    //
    // AND THE FIRST RUN OF THAT PROBE REPORTED "NO FLOOR CALL" FOR ALL ELEVEN GATES, which would have been
    // a spectacular finding and was a relative import resolving against the probe's own directory instead of
    // the tree. An absence read as a measurement is this arc's oldest fault -- v4402's -- and it is recorded
    // here because the probe produced it in the round that exists to catch exactly this class of thing.
    //
    // The census alone does NOT explain the 0-RED, which is the point of listing it: ringFloorYaw reaches
    // 1986 distinct phases and still reported not one moved number, because it calls only the window form.
    // Breadth of fixture is not the same as reaching the quantity.
    //
    // *** AND THE POPULATION IS COUNTED RATHER THAN GESTURED AT. *** v4570's closing said "roughly twenty
    // gates hard-code it", which was an impression. Measured on disk at v4571: 18 gates under render/ carry a
    // half-texel fixture construct, and 11 gates tree-wide NAME a half texel -- five in this arc and six
    // outside it (strengthField, badTvDevicePass, xrStereo, slugFill, deviceTexture, water2d), none of which
    // this round looked at. The eleven-gate sweep above is this ARC; the wider population is not swept here.
    report(`the triangle installed in BOTH the mirror and the kernel, across all ${CENSUS.gates} gates of this arc:`);
    report(`  ${CENSUS.lines} reported lines, ${CENSUS.moved} moved, ${CENSUS.failed} rows failed`);
    report("  FOUR separate reasons, and only the last is a tolerance:");
    report("    STRUCTURAL   ringFloorLight/Margin/Yaw and most of Step call only the WINDOW form, whose factor");
    report("                 is the constant 0.25 -- the impostor's value at 1/2, permanently. No phase is read.");
    report("    NUMERICAL    ringFloor and ringFloorDevice call the frame form only at f in {0, 1/2}, where the");
    report("                 impostor EQUALS truth. Nothing to be loose about: the numbers are identical.");
    report("    DEGENERATE   ringFloorStat's frame-form calls are on an all-zero and a flat field, where any");
    report("                 phase factor multiplies zero.");
    report("    UNASSERTED   ringFloorCost/Perspective/Control/kernelAudit DID move -- 21 lines -- and every one");
    report("                 was printed, read past, and asserted around. ringFloorControl's headline row went");
    report("                 from 21.5% to 32.7% of pixels below their own error and still PASSED, because the");
    report("                 row asserts the defect EXISTS and reports its size rather than pinning it.");
    ok("*** none of the four is a tolerance that wants tightening: three are fixtures that never reach the quantity and the fourth is rows that print a number without holding it ***",
        CENSUS.failed === 0 && CENSUS.moved > 0 && CENSUS.moved < CENSUS.lines,
        `${CENSUS.moved}/${CENSUS.lines} moved, ${CENSUS.failed} red`);
}

// ---------------------------------------------------------------------------------------------------------
console.log("\n5. *** THE REPAIR: READ THE LAW OFF DIRECTLY INSTEAD OF CHECKING THE BOUND IT SITS INSIDE ***");
const LUMA = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) LUMA[y * W + x] = 0.5 + 0.45 * Math.sin(x * 0.35) * Math.cos(y * 0.28);
/** A motion buffer that puts every pixel at one chosen sub-texel phase on x and at zero on y. */
const atPhase = (phi) => { const m = new Float32Array(W * H * 4); for (let i = 0; i < W * H; i++) m[i * 4] = phi / W; return m; };
const PHASES = [0.0625, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
{
    // Holding luma, ring and content fixed and moving ONLY the phase turns the factor into the sole degree
    // of freedom. On smooth content both axes resolve, so ey is zero (fy = 0) and there is no ring term: the
    // whole per-pixel floor is depth * 0.5 * f(1-f) * (d2 + d3), linear in the factor and nothing else.
    const ref = ringFloorCPU(LUMA, atPhase(0.5), W, H, P).per;
    let worstDev = 0, worstAt = 0, n = 0;
    report("   phi      worst |per(phi)/per(1/2) - f(1-f)/0.25| over all 1024 pixels");
    for (const phi of PHASES) {
        const per = ringFloorCPU(LUMA, atPhase(phi), W, H, P).per, s = TRUTH(phi) / 0.25;
        let d = 0;
        for (let i = 0; i < W * H; i++) { if (ref[i] <= 0) continue; n++; d = Math.max(d, Math.abs(per[i] - ref[i] * s) / (ref[i] * s)); }
        if (d > worstDev) { worstDev = d; worstAt = phi; }
        report(`  ${phi.toFixed(4)}                       ${d.toExponential(2)}`);
    }
    ok(`*** the frame form's per-pixel floor scales as f(1-f) across ${PHASES.length} phases and ${n} pixel readings, worst relative deviation ${worstDev.toExponential(2)} at phi = ${worstAt} ***`,
        worstDev < 1e-5, `bar 1e-5, observed ${worstDev.toExponential(2)}`);
    // AND THE ROW CAN FAIL: each impostor is substituted into the SCALING, which is arithmetically the same
    // thing as substituting it into the module, and the row's own bar is applied to it.
    const rej = IMPOSTORS.map(([nm, g]) => {
        let d = 0;
        for (const phi of PHASES) d = Math.max(d, Math.abs(g(phi) - TRUTH(phi)) / TRUTH(phi));
        return { nm, d };
    });
    for (const r of rej) report(`${r.nm.padEnd(26)} would deviate by ${(100 * r.d).toFixed(1)}% against the row's 0.001% bar`);
    ok(`  and the row is not decoration: every one of the ${rej.length} impostors exceeds its bar, the closest by ${(100 * Math.min(...rej.map((r) => r.d))).toFixed(1)}% -- ${(Math.min(...rej.map((r) => r.d)) / Math.max(worstDev, 1e-12)).toExponential(1)}x the margin the true law leaves`,
        rej.every((r) => r.d > 1e-5 * 100), `worst-to-closest ${rej.map((r) => (100 * r.d).toFixed(0) + "%").join(" ")}`);
}

// ---------------------------------------------------------------------------------------------------------
console.log("\n6. THE LAW'S OWN LIMIT, AND IT IS PREDICTED RATHER THAN OBSERVED");
{
    // Below some phase the Taylor term falls under ARITHMETIC_ULPS * EPS_F32 * |magnitude| and the module
    // returns the arithmetic floor instead. That is not a defect in the law, it is the law leaving the
    // regime -- and which pixel leaves when is predictable: the floor at phi -> 0 IS the arithmetic floor,
    // so a pixel clamps exactly when its Taylor term drops below that reading.
    const arith = ringFloorCPU(LUMA, atPhase(1e-30), W, H, P).per;    // the Taylor term is nil: pure clamp
    const ref = ringFloorCPU(LUMA, atPhase(0.5), W, H, P).per;
    report("   phi        predicted clamped   observed clamped");
    let agree = 0, rows = 0, sawBoth = 0;
    for (const phi of [1e-2, 1e-3, 3e-4, 1e-4, 5e-5, 3e-5, 1e-5]) {
        const per = ringFloorCPU(LUMA, atPhase(phi), W, H, P).per, s = TRUTH(phi) / 0.25;
        let pred = 0, obs = 0;
        for (let i = 0; i < W * H; i++) {
            const taylor = ref[i] * s;
            if (taylor < arith[i] * (1 - 1e-9)) pred++;
            if (per[i] > taylor * (1 + 1e-5)) obs++;
        }
        rows++; if (pred === obs) agree++; if (obs > 0) sawBoth++;
        report(`  ${phi.toExponential(1)}        ${String(pred).padStart(9)}         ${String(obs).padStart(9)}`);
    }
    ok(`*** which pixel leaves the phase law, and at which phase, is predicted exactly from the arithmetic floor alone -- ${agree} of ${rows} phases agree pixel-for-pixel ***`,
        agree === rows && sawBoth >= 3, `${agree}/${rows} exact, ${sawBoth} phases with a non-empty clamp`);
    ok(`  and the clamp is the module's own ${ARITHMETIC_ULPS} * EPS_F32 constant, not a threshold this gate chose: it is never reached above phi = 1e-3 on this fixture, which is four times below anything the arc drives`,
        (() => { const per = ringFloorCPU(LUMA, atPhase(1e-3), W, H, P).per, s = TRUTH(1e-3) / 0.25;
                 return per.every((v, i) => !(v > ref[i] * s * (1 + 1e-5))); })(),
        `${(ARITHMETIC_ULPS * EPS_F32).toExponential(3)} * |magnitude|`);
}

// ---------------------------------------------------------------------------------------------------------
console.log("\n7. THE SAME LAW ON THE DEVICE, HELD TO THE LAW AND NOT TO THE MIRROR");
{
    // v4570 established that a parity row is immune BY CONSTRUCTION to a mutation applied to both sides --
    // which is exactly what a phase-factor edit is, since the mirror and the kernel carry the same
    // expression. So this row does not compare the kernel to ringFloorCPU. It compares the kernel's own
    // output at one phase to its own output at another, against a ratio the identity fixes.
    const DEV_PHASES = [0.125, 0.25, 0.375, 0.5];
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, P, tau: RESOLUTION_TAU,
        luma: Array.from(LUMA), ring: Array.from(new Float32Array(W * H * 2 * P)),
        motions: DEV_PHASES.map((p) => Array.from(atPhase(p))) }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { RING_FLOOR_WGSL } = await import("/render/ringFloorWgsl.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const out = [];
        for (const mo of a.motions) {
            const p = dev.compute({ wgsl: RING_FLOOR_WGSL });
            const dst = dev.buffer({ data: new Float32Array(a.W * a.H), usage: ["storage"] });
            const ub = new ArrayBuffer(32);
            new Uint32Array(ub, 0, 4).set([a.W, a.H, a.P, 0]);
            new Float32Array(ub, 16, 4).set([a.tau, 0, 0, 0]);
            p.bind("luma", dev.buffer({ data: new Float32Array(a.luma), usage: ["storage"] }))
             .bind("motion", dev.buffer({ data: new Float32Array(mo), usage: ["storage"] }))
             .bind("ring", dev.buffer({ data: new Float32Array(a.ring), usage: ["storage"] }))
             .bind("dst", dst).bind("u", dev.buffer({ data: new Uint32Array(ub), usage: "uniform" }));
            dev.frame(({ pass }) => { pass.dispatch(p, [Math.ceil(a.W / 8), Math.ceil(a.H / 8)]); pass.clear([0,0,0,1]); }, { offscreen: true });
            out.push(Array.from(new Float32Array(await dev.read(dst))));
        }
        return { out, errs, backend: dev.backend };
    }` });
    ok(`the harness ran the floor kernel at all ${DEV_PHASES.length} phases`,
        r.ok && r.result && r.result.errs.length === 0 && r.result.out.length === DEV_PHASES.length,
        r.ok ? `${r.result && r.result.backend}${r.software ? " on a SOFTWARE adapter, per v4561 -- parity and shape, not timing" : ""}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        const base = r.result.out[DEV_PHASES.indexOf(0.5)];
        let worst = 0, n = 0;
        for (let k = 0; k < DEV_PHASES.length; k++) {
            const s = TRUTH(DEV_PHASES[k]) / 0.25, got = r.result.out[k];
            let d = 0;
            for (let i = 0; i < W * H; i++) { if (!(base[i] > 1e-6)) continue; n++; d = Math.max(d, Math.abs(got[i] - base[i] * s) / (base[i] * s)); }
            report(`  phi ${DEV_PHASES[k].toFixed(4)}   worst |dev(phi)/dev(1/2) - f(1-f)/0.25| = ${d.toExponential(2)}`);
            worst = Math.max(worst, d);
        }
        // f32 in the kernel against f64 in the law: the bar is a handful of ulps of the ratio, not 1e-5.
        ok(`*** the KERNEL's own output obeys f(1-f) across ${DEV_PHASES.length} phases and ${n} readings, worst ${worst.toExponential(2)} -- a row no both-sides phase edit can satisfy, because it never looks at the mirror ***`,
            worst < 4e-6, `bar 4e-6 (about ${(4e-6 / EPS_F32).toFixed(0)} f32 ulps), observed ${worst.toExponential(2)}`);
        ok(`  and the closest impostor would miss that bar by ${(Math.min(...IMPOSTORS.map(([, g]) => Math.abs(g(0.125) / TRUTH(0.125) - 1))) / 4e-6).toExponential(1)}x`,
            Math.min(...IMPOSTORS.map(([, g]) => Math.abs(g(0.125) / TRUTH(0.125) - 1))) > 4e-6 * 1000, "at an eighth texel");
    }
}

// ---------------------------------------------------------------------------------------------------------
console.log("\n8. CONTROLS");
{
    // *** THE FIRST VERSION OF THIS SECTION CHECKED A DIRECTION AND NOT A VALUE, AND ITS SABOTAGE SAID SO. ***
    // It asserted only that the window form is phase-INDEPENDENT, which moving its constant from 0.25 to 0.24
    // leaves perfectly true: a 0-RED, in the round whose whole subject is rows that check the shape of a
    // claim instead of its size. The repair names the constant the way the module earns it -- the window form
    // IS the frame form evaluated at the fixed point -- so it is derived from ringFloorCPU rather than
    // restated here, and 0.25 appears nowhere in the row.
    {
        const bothAxes = (phi) => { const m = new Float32Array(W * H * 4);
            for (let i = 0; i < W * H; i++) { m[i * 4] = phi / W; m[i * 4 + 1] = phi / H; } return m; };
        const RING = { w: W, h: H, frames: 2 * P, period: P, ring: new Float32Array(W * H * 2 * P) };
        const atFixedPoint = ringFloorCPU(LUMA, bothAxes(0.5), W, H, P).per;
        let worst = 0, n = 0;
        for (const phi of [0.125, 0.25, 0.5, 0.875]) {
            const win = ringFloorCPU(LUMA, bothAxes(phi), W, H, P, undefined, "window", RING).per;
            for (let i = 0; i < W * H; i++) { if (!(atFixedPoint[i] > 0)) continue; n++;
                worst = Math.max(worst, Math.abs(win[i] - atFixedPoint[i]) / atFixedPoint[i]); }
        }
        ok(`*** the WINDOW form at any phase IS the frame form at the fixed point, bit for bit -- ${n} readings across four phases, worst ${worst.toExponential(2)}: that is what "the window constant is max f(1-f)" means, and it is read out of the module rather than declared here ***`,
            worst === 0 && n > 2000, `worst relative difference ${worst.toExponential(2)} over ${n} pixel readings`);
    }
    ok("  and phase-INDEPENDENCE on its own, which is all this row checks and is strictly weaker than the one above -- kept because it is the structural immunity section 4 names, and labelled so nobody reads it as pinning the constant, which is the mistake its first version made",
        (() => { const a = ringFloorCPU(LUMA, atPhase(0.125), W, H, P, undefined, "window", { w: W, h: H, frames: 2 * P, period: P, ring: new Float32Array(W * H * 2 * P) }).per;
                 const b = ringFloorCPU(LUMA, atPhase(0.5), W, H, P, undefined, "window", { w: W, h: H, frames: 2 * P, period: P, ring: new Float32Array(W * H * 2 * P) }).per;
                 return a.every((v, i) => Math.abs(v - b[i]) <= 1e-12 * Math.max(1, Math.abs(b[i]))) && a.some((v) => v > 0); })(),
        "two phases an eighth apart, identical per-pixel");
    ok("  and the frame form DOES, on the same two phases and the same content -- so the control above is a distinction and not a tautology about this fixture",
        (() => { const a = ringFloorCPU(LUMA, atPhase(0.125), W, H, P).per, b = ringFloorCPU(LUMA, atPhase(0.5), W, H, P).per;
                 return a.some((v, i) => b[i] > 0 && Math.abs(v - b[i]) / b[i] > 0.1); })(),
        `f(1-f) at 1/8 is ${(TRUTH(0.125) / 0.25).toFixed(3)} of its value at 1/2`);
    ok("the synthetic motion buffer really does drive the phase and is not being ignored: a zero buffer and an eighth-texel buffer give different floors",
        (() => { const a = ringFloorCPU(LUMA, new Float32Array(W * H * 4), W, H, P).per, b = ringFloorCPU(LUMA, atPhase(0.125), W, H, P).per;
                 return b.some((v, i) => v > 0 && (a[i] === 0 || Math.abs(v - a[i]) / v > 0.5)); })(),
        "zero motion is f = 0, where the factor vanishes");
    ok("and the identity's zero is exact, not merely small: at an integer displacement the Taylor term is nil and what remains is the arithmetic floor alone",
        (() => { const z = ringFloorCPU(LUMA, new Float32Array(W * H * 4), W, H, P).per;
                 const a = ringFloorCPU(LUMA, atPhase(1e-30), W, H, P).per;
                 return z.every((v, i) => v === a[i]) && z.some((v) => v > 0); })(),
        `every pixel equals its ${ARITHMETIC_ULPS}-ulp clamp`);
    ok(`resampleDepth is read from the module rather than restated here, so a change to it moves this gate's fixture with the rest of the arc`,
        resampleDepth(P) === (P - 1) / 2, `depth ${resampleDepth(P)} at P = ${P}`);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("ALSO FOUND BY WIDENING THIS ROUND'S VERIFY SWEEP, and neither is this gate's subject: eight gates " +
    "that pin a TREE-WIDE census are red at HEAD and predate this round -- frameDirtyCensus, gateSelection, " +
    "referenceKind, definitionGates, staleness, crossBackend, statedRuntime, recordReach -- because rounds " +
    "have been sweeping the arc they worked in rather than the tree. They are NOT re-taken here: re-taking a " +
    "record without understanding what moved it is the fault this arc warns about, and eight of them is a " +
    "round of its own. One IS this arc's own debt and was answered: crossBackend named RING_FLOOR_WGSL as " +
    "neither in the WGSL corpus nor excluded with a reason, standing since v4560 -- and the census could see " +
    "only that one of the arc's THIRTEEN kernels, because its detector reads `export const X` and the whole " +
    "temporal arc re-exports at the foot of the file as `export { A, B }`. Measured: 95 producers seen, TWELVE " +
    "invisible, 11% of the tree's WGSL outside a census that exists to notice absences. The detector is " +
    "widened in wgslCorpus.mjs so the red names all thirteen; ANSWERING them -- a corpus entry or a reasoned " +
    "exclusion each -- is not done here.\n");
console.log("unchecked here: MOVING the arc's fixtures off a half texel, which is what the census in section 4 " +
    "argues for and which would move every number twenty gates record -- this round measured the cost and " +
    "built the row that makes the move unnecessary for the PHASE LAW specifically, but max(f,1-f) on the step " +
    "branch and round-vs-floor in nearestTexel are still pinned only at the fixed point; the 21 lines that " +
    "moved under the impostor and were asserted around, each of which is a row in another gate that prints a " +
    "phase-dependent number without holding it; and whether the other three arcs in this tree drive a " +
    "symmetric constant of their own -- nothing here looked outside render/.");
process.exit(fails ? 1 : 0);
