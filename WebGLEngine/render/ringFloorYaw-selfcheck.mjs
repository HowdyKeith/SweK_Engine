/**
 * THE ARC HAS ONE CAMERA MOTION, AND IT IS THE ONE THAT PROTECTS THE FLOOR.
 *
 * Every fixture from v4553 to v4566 TRANSLATES the camera -- along X for thirteen rounds, along Y since
 * v4566. v4558 measured a roll, orthographically. Nothing has ever YAWED one under perspective, and yaw is
 * what a camera actually spends its time doing.
 *
 * *** IT IS A DIFFERENT KIND OF MOTION, NOT A FASTER ONE. *** Translation moves a pixel by PARALLAX, which
 * scales with 1/depth: measured here, the mean displacement varies 9.3x across the frame's depth bands, and
 * the far field barely moves. Yaw moves every pixel by an amount that depends on where it sits in the frame
 * and NOT on how far away it is: measured, 1.0x across the same bands. So the far field -- which carries the
 * highest spatial frequency in the picture, because a ground plane is foreshortened with distance -- loses
 * the protection parallax was giving it.
 *
 * The consequence is that the floor is worse under yaw at the same near-field speed, and the gap WIDENS with
 * depth. Section 3 measures it.
 */
import { makeLumaState, pushLuma, lumaMean } from "./temporalLock.mjs";
import { ringFloorCPU } from "./ringFloor.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 48, H = 48, NEAR = 0.5, FAR = 40, FOVY = 60 * Math.PI / 180, EYE_Y = 1.6;
const P = jitterPhaseCount(1), ARC_MARGIN = 0.05;
function persp(a) { const f = 1 / Math.tan(FOVY / 2), o = new Float32Array(16);
    o[0] = f / a; o[5] = f; o[10] = FAR / (NEAR - FAR); o[11] = -1; o[14] = FAR * NEAR / (NEAR - FAR); return o; }
/** view = rotateY(-yaw) * translate(-eye). The rotation is the whole point of the file, so it is written out. */
function view(cx, yaw) {
    const c = Math.cos(-yaw), s = Math.sin(-yaw);
    const r = new Float32Array(16); r[0] = c; r[2] = -s; r[5] = 1; r[8] = s; r[10] = c; r[15] = 1;
    const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; t[13] = -EYE_Y;
    return mat4Multiply(r, t);
}
const VP = (cx, yaw) => mat4Multiply(persp(W / H), view(cx, yaw));
const xf = (m, x, y, z) => { const o = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) o[r] = m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]; return o; };
function tracer(cx, yaw) {
    const m = VP(cx, yaw), inv = mat4Invert(m), vw = view(cx, yaw);
    return (x, y, j) => {
        const u = (x + 0.5 + j[0]) / W, v = (y + 0.5 + j[1]) / H;
        const a = xf(inv, 2 * u - 1, 1 - 2 * v, 0), b = xf(inv, 2 * u - 1, 1 - 2 * v, 0.5);
        const A = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], B = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
        const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        if (Math.abs(d[1]) < 1e-12) return null;
        const t = -A[1] / d[1]; if (t <= 0) return null;               // above the horizon: no surface
        const Pw = [A[0] + t * d[0], 0, A[2] + t * d[2]];
        const c = xf(m, Pw[0], Pw[1], Pw[2]); if (c[3] <= 0) return null;
        return { P: Pw, clipZ: c[2] / c[3], depth: -(xf(vw, Pw[0], 0, Pw[2]))[2] };
    };
}
const content = (wx, wz) => 0.5 + 0.45 * Math.sin(wx * 1.1) * Math.cos(wz * 0.9);

function sweep(mode, rate) {
    const st = makeJitterState(1), lu = makeLumaState(W, H, P), hist = [];
    const NF = 2 * P + 10;
    let L2 = null, m2 = null, on2 = null, dep2 = null, cxN = 0, yawN = 0;
    for (let f = 0; f < NF; f++) {
        const j = advanceJitter(st);
        const cx = mode === "translate" ? f * rate : 0, yaw = mode === "yaw" ? f * rate : 0;
        const tr = tracer(cx, yaw);
        const c = new Float32Array(W * H * 4), d = new Float32Array(W * H), L = new Float32Array(W * H);
        const on = new Uint8Array(W * H), dep = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, o = i * 4, t = tr(x, y, j);
            const v = t ? content(t.P[0], t.P[2]) : 0.5;
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1;
            d[i] = t ? t.clipZ : 1; L[i] = v; on[i] = t ? 1 : 0; if (t) dep[i] = t.depth;
        }
        const pcx = mode === "translate" ? cx - rate : 0, pyaw = mode === "yaw" ? yaw - rate : 0;
        m2 = motionVectorsCPU(d, W, H, mat4Invert(VP(cx, yaw)), VP(pcx, pyaw)).data;
        pushLuma(lu, { current: c, motion: m2, w: W, h: H });
        hist.push(j); L2 = L; on2 = on; dep2 = dep; cxN = cx; yawN = yaw;
    }
    const truth = new Float32Array(W * H), trN = tracer(cxN, yawN);
    for (const jj of hist.slice(-P)) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const t = trN(x, y, jj); truth[y * W + x] += (t ? content(t.P[0], t.P[2]) : 0.5) / P; }
    const mean = lumaMean(lu), e = ringFloorCPU(L2, m2, W, H, P, undefined, "window", lu);
    return { lu, mean, truth, on: on2, dep: dep2, motion: m2, per: e.per, regime: e.regime };
}
/** Errors over the pixels with a full ring and a surface, optionally capped by depth. */
function errs(r, cap = Infinity) {
    const v = [];
    for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
        const i = y * W + x;
        if (!r.on[i] || r.lu.filled[i] < r.lu.frames || r.dep[i] > cap) continue;
        v.push(Math.abs(r.mean[i] - r.truth[i]));
    }
    v.sort((a, b) => a - b);
    return v;
}
const q = (v, p) => v[Math.floor(v.length * p)];

console.log("ringFloorYaw-selfcheck -- the motion this arc has never had, and the one that protected it\n");
console.log("1. THE FIXTURE VERIFIES ITSELF BEFORE ANYTHING IS MEASURED ON IT");
{
    const yaw = 0.05, m = VP(0, yaw), inv = mat4Invert(m), p = [1.3, 0, -6.5];
    const c = xf(m, p[0], p[1], p[2]), nd = [c[0] / c[3], c[1] / c[3], c[2] / c[3]];
    const b = xf(inv, nd[0], nd[1], nd[2]), back = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
    const err = Math.max(...p.map((v, i) => Math.abs(v - back[i])));
    ok("a yawed projection unprojects back to the point it came from -- the rotation is in both directions and they agree",
        err < 1e-4, `round-trip error ${err.toExponential(2)} at yaw ${yaw}`);
    const tr = tracer(0, yaw), near = tr(W >> 1, H - 1, [0, 0]), far = tr(W >> 1, Math.floor(H * 0.6), [0, 0]);
    ok("and the yawed view still sees a ground plane spanning depth, rather than the horizon or nothing",
        near && far && far.depth > 3 * near.depth, `near ${near && near.depth.toFixed(2)}, upper ${far && far.depth.toFixed(2)}`);
}

console.log("\n2. *** YAW IS A DIFFERENT KIND OF MOTION, NOT A FASTER ONE ***");
const STRUCT = {};
{
    const tr = tracer(0, 0);
    const depth = new Float32Array(W * H), on = new Uint8Array(W * H), dep = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, t = tr(x, y, [0, 0]);
        if (t) { depth[i] = t.clipZ; on[i] = 1; dep[i] = t.depth; } else depth[i] = 1;
    }
    report("band        translate 0.05          yaw 0.01 rad");
    for (const [name, prev] of [["translate", VP(-0.05, 0)], ["yaw", VP(0, -0.01)]]) {
        const mv = motionVectorsCPU(depth, W, H, mat4Invert(VP(0, 0)), prev).data;
        const means = [];
        for (const [lo, hi] of [[0, 5], [5, 10], [10, 20], [20, 1e9]]) {
            let n = 0, s = 0;
            for (let i = 0; i < W * H; i++) {
                if (!on[i] || mv[i * 4 + 2] === 0 || dep[i] < lo || dep[i] >= hi) continue;
                n++; s += Math.hypot(mv[i * 4] * W, mv[i * 4 + 1] * H);
            }
            if (n > 20) means.push(s / n);
        }
        STRUCT[name] = { means, spread: Math.max(...means) / Math.min(...means) };
        report(`${name.padEnd(11)} ${means.map((m) => m.toFixed(3)).join("  ")}   -> varies ${STRUCT[name].spread.toFixed(1)}x across depth`);
    }
    ok(`*** translation's displacement is PARALLAX and varies ${STRUCT.translate.spread.toFixed(1)}x across the frame's depth bands -- the far field barely moves, which is the protection every floor this arc has measured was getting ***`,
        STRUCT.translate.spread > 4, `${STRUCT.translate.means.map((m) => m.toFixed(3)).join(", ")} px/frame`);
    ok(`*** and yaw's varies ${STRUCT.yaw.spread.toFixed(1)}x -- it is DEPTH-INDEPENDENT, so the far field moves exactly as fast as the near one ***`,
        STRUCT.yaw.spread < 1.2, `${STRUCT.yaw.means.map((m) => m.toFixed(3)).join(", ")} px/frame`);
}

console.log("\n3. *** WHAT THAT COSTS, AT THE SAME NEAR-FIELD SPEED ***");
const F = {};
{
    // matched on near-field displacement, so the comparison is between two KINDS of motion and not between a
    // fast camera and a slow one: translate 0.0125 and yaw 0.003 both move the near ground 0.16 px/frame
    F.t = sweep("translate", 0.0125); F.y = sweep("yaw", 0.003);
    const nearOf = (r) => { let m = 0;
        for (let i = 0; i < W * H; i++) if (r.on[i] && r.dep[i] < 5) m = Math.max(m, Math.hypot(r.motion[i * 4] * W, r.motion[i * 4 + 1] * H));
        return m; };
    ok("the two runs are matched on near-field speed, which is what makes this a comparison of kinds",
        Math.abs(nearOf(F.t) - nearOf(F.y)) < 0.03, `translate ${nearOf(F.t).toFixed(3)}, yaw ${nearOf(F.y).toFixed(3)} px/frame in the near field`);
    report("depth cap    translate           yaw              yaw / translate");
    const CAPS = [8, 15, 30];
    const ratios = [];
    for (const cap of CAPS) {
        const a = errs(F.t, cap), b = errs(F.y, cap);
        ratios.push(q(b, 0.99) / q(a, 0.99));
        report(`<= ${String(cap).padStart(2)}  n=${String(a.length).padStart(3)}   p99 ${q(a, 0.99).toExponential(2)}  med ${q(a, 0.5).toExponential(2)}   p99 ${q(b, 0.99).toExponential(2)}  med ${q(b, 0.5).toExponential(2)}   ${(q(b, 0.99) / q(a, 0.99)).toFixed(1)}x at p99`);
    }
    ok(`*** at the same near-field speed the floor is worse under yaw, and the gap WIDENS with depth: ${ratios.map((r) => r.toFixed(1) + "x").join(" -> ")} at p99 as the depth cap goes ${CAPS.join(" -> ")} ***`,
        ratios[ratios.length - 1] > ratios[0] * 1.5 && ratios[0] > 1.5,
        `p99 ratios ${ratios.map((r) => r.toFixed(2)).join(", ")}`);
    ok(`  which is the depth-independence showing up as a cost: the far field is where a ground plane's spatial frequency is highest, and yaw is the motion that does not spare it`,
        q(errs(F.y, 30), 0.99) > q(errs(F.y, 8), 0.99) * 2,
        `yaw p99 ${q(errs(F.y, 8), 0.99).toExponential(2)} within depth 8, ${q(errs(F.y, 30), 0.99).toExponential(2)} within 30`);
}

console.log("\n4. *** THE FRAME-WIDE MAX IS A HORIZON PIXEL, AND IT IS THE STATISTIC THIS ARC REPORTS ***");
{
    // v4560 through v4566 all report the floor as a frame-wide MAX. On a ground plane that max sits at the
    // horizon, where depth runs to infinity and a handful of pixels carry content far above Nyquist. It is a
    // real number and it is the least representative pixel in the frame, in BOTH kinds of motion.
    const tc = errs(F.t, 30), tu = errs(F.t), yc = errs(F.y, 30), yu = errs(F.y);
    report(`translate: max ${tu[tu.length - 1].toExponential(2)} uncapped against ${tc[tc.length - 1].toExponential(2)} within depth 30`);
    report(`yaw:       max ${yu[yu.length - 1].toExponential(2)} uncapped against ${yc[yc.length - 1].toExponential(2)} within depth 30`);
    ok(`*** the uncapped max is ${(yu[yu.length - 1] / yc[yc.length - 1]).toFixed(1)}x the within-depth-30 max under yaw and ${(tu[tu.length - 1] / tc[tc.length - 1]).toFixed(1)}x under translation -- so every frame-wide floor this arc has reported since v4560 is a horizon reading ***`,
        yu[yu.length - 1] > yc[yc.length - 1] * 1.5 && tu[tu.length - 1] > tc[tc.length - 1] * 1.5,
        `yaw ${(yu[yu.length - 1] / yc[yc.length - 1]).toFixed(2)}x, translate ${(tu[tu.length - 1] / tc[tc.length - 1]).toFixed(2)}x`);
    ok(`  and it is not wrong, it is unrepresentative: the median is ${(q(yu, 0.5) / q(yc, 0.5)).toFixed(2)}x between the same two sets, so the horizon moves the MAX and almost nothing else`,
        Math.abs(q(yu, 0.5) / q(yc, 0.5) - 1) < 0.5, `median ${q(yc, 0.5).toExponential(2)} within 30, ${q(yu, 0.5).toExponential(2)} uncapped`);
}

console.log("\n5. THE BOUND HOLDS UNDER A MOTION IT HAS NEVER SEEN");
{
    const under = (r) => { let u = 0, n = 0;
        for (let i = 0; i < W * H; i++) {
            if (!r.on[i] || !r.regime[i] || r.lu.filled[i] < r.lu.frames) continue;
            const e = Math.abs(r.mean[i] - r.truth[i]); if (!(e > 0)) continue;
            n++; if (r.per[i] < e) u++; }
        return { u, n }; };
    const rows = [["translate 0.0125", F.t], ["yaw 0.003", F.y], ["yaw 0.0125", sweep("yaw", 0.0125)], ["yaw 0.025", sweep("yaw", 0.025)]];
    let tot = 0, bad = 0;
    for (const [name, r] of rows) { const u = under(r); tot += u.n; bad += u.u;
        report(`${name.padEnd(17)} ${u.u} of ${u.n} step-branch pixels under their own error`); }
    ok(`*** the floor built on fifteen rounds of translating cameras is still a bound under yaw: ${bad} of ${tot} step-branch pixels across four runs ***`,
        bad === 0 && tot > 400, `${bad}/${tot}`);
    ok("  and that is worth stating as a result and not an assumption: nothing in its derivation mentions the kind of camera motion, only the displacement it produces, and this is the first fixture that separates the two",
        tot > 400, `${tot} step-branch pixel readings under yaw and translation`);
}

// SABOTAGE. Six rewrites of the motion-vector reconstruction and the floor, run against seven gates --
// this one, ringFloorLight, ringFloorStep, ringFloorControl, ringFloorPerspective, ringFloor and
// motionVectors -- with v4557's crash rule applied.
//   QA  the previous view-projection's ROTATION ignored                         35 red
//   QB  the motion vector's v component zeroed                                   4 red
//   QC  the reprojected depth replaced by the CURRENT depth                      2 red
//   QD  the ring term's gate reads validity rather than displacement             2 red
//   QE  the step branch's phase taken from u for both axes                       5 red
//   QF  the arithmetic floor dropped                                             6 red
//
// QA scores thirty-five, which is the round in one number: a reconstruction that ignores the previous
// frame's rotation is a perfect no-op on a translating camera, and until this fixture existed there was
// nothing in the arc it could fail against.
//
// *** QC WENT 0-RED, AND WHAT IT FOUND WAS A FIXTURE THAT CANNOT SEPARATE TWO NUMBERS. *** The motion
// buffer's fourth channel is the depth the surface had LAST frame, and replacing it with the depth it has
// NOW passed every gate -- including motionVectors-selfcheck's own device-parity row, which compared the
// two implementations to 3.33e-6 and passed, because BOTH were sabotaged in the same direction by the same
// fixture. Every fixture in this tree moves the camera sideways past a surface at constant distance, and
// under a lateral move a surface's depth does not change: the previous depth and the current one are
// literally the same number. A DOLLY separates them, and motionVectors-selfcheck now carries one, with a
// row asserting the channel against an independent projection and a third row recording that a lateral move
// makes the two agree -- which is why nothing caught it for fourteen rounds.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: PITCH, which tilts the horizon through the frame and is the one rotation that " +
    "changes which depths are visible at all; yaw COMBINED with translation, which is what a camera actually " +
    "does and which this gate runs separately; whether the arc's declared 0.05 should move now that a " +
    "measured floor exceeds it at the horizon under ordinary yaw, still the adoption question open since " +
    "v4560; and the frame-wide MAX as a reporting statistic, which section 4 shows is a horizon reading in " +
    "every floor this arc has published and which nothing has yet replaced.");
process.exit(fails ? 1 : 0);
