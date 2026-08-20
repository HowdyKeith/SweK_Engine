// WebGLEngine/tools/ship/depthProject-selfcheck.mjs -- v3063
//
// Run: node tools/ship/depthProject-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES render/depthProject.js -- the ANSWER KEY for compositing, built before the compositing.
//
// v3045 said the ray marcher does not composite with the raster pass and called that "its own round with its own
// answer key". This is the answer key. The round that wires gl_FragDepth can then be checked against a number
// instead of against whether voxels LOOK correctly buried in terrain, which is not a check -- the classic bug
// here renders, and looks almost right.
//
// THE CLASSIC BUG: a marcher knows t, the distance ALONG THE RAY. A depth buffer stores a function of VIEW-SPACE
// Z, the distance along the camera axis. Equal only at screen centre. Section 2 MEASURES the divergence rather
// than asserting it exists, and the number is worse than I guessed when I proposed this round: I said about 15%
// at the corners of a 60-degree field of view. 15.5% is the EDGE. The corner is 29.1%.

import { readFileSync } from "node:fs";
import {
    viewToNdcDepth, ndcDepthToView, ndcToWindow, windowToNdc, hitDepth, hitDepthWrong, hitDepth32, depthResolution,
} from "../../render/depthProject.js";
import { codeOnly } from "./sourceScan.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-30);

const NEAR = 0.1, FAR = 200, FWD = [0, 0, 1];
const unit = (v) => { const L = Math.hypot(v[0], v[1], v[2]); return [v[0] / L, v[1] / L, v[2] / L]; };

// --- 1. the projection is its own inverse, and monotone ------------------------------------------------------
{
    let worst = 0;
    for (const z of [0.1, 0.5, 1, 5, 37.5, 100, 199.9, 200]) worst = Math.max(worst, rel(ndcDepthToView(viewToNdcDepth(z, NEAR, FAR), NEAR, FAR), z));
    ok("!! view -> ndc -> view round-trips exactly", worst < 1e-12, "worst relative error " + worst.toExponential(1));
    ok("the near plane maps to -1 and the far plane to +1",
        Math.abs(viewToNdcDepth(NEAR, NEAR, FAR) + 1) < 1e-12 && Math.abs(viewToNdcDepth(FAR, NEAR, FAR) - 1) < 1e-12);
    ok("window mapping round-trips too", Math.abs(windowToNdc(ndcToWindow(0.37)) - 0.37) < 1e-15);
    ok("!! depth is MONOTONE in distance -- without this the depth test cannot order anything", (() => {
        let prev = -Infinity;
        for (let i = 0; i <= 2000; i++) {
            const z = NEAR + (FAR - NEAR) * (i / 2000);
            const d = ndcToWindow(viewToNdcDepth(z, NEAR, FAR));
            if (d < prev) return false;
            prev = d;
        }
        return true;
    })());
}

// --- 2. THE CLASSIC BUG, measured across the field of view ---------------------------------------------------
{
    const tan = Math.tan(30 * Math.PI / 180);       // 60-degree total field of view
    const rows = [["centre", [0, 0, 1]], ["edge x", [tan, 0, 1]], ["corner", [tan, tan, 1]]];
    const errs = [];
    for (const [label, raw] of rows) {
        const d = unit(raw);
        const good = hitDepth(50, d, FWD, NEAR, FAR), bad = hitDepthWrong(50, d, FWD, NEAR, FAR);
        const viewErr = 100 * (bad.zView - good.zView) / good.zView;
        errs.push(viewErr);
        say(label.padEnd(7) + " cos=" + good.cos.toFixed(4) + "  zView=" + good.zView.toFixed(3) +
            "  writing t instead gives " + bad.zView.toFixed(3) + "  (" + viewErr.toFixed(1) + "% too far)" +
            "  depth delta " + Math.abs(good.depth - bad.depth).toExponential(2));
    }
    ok("!! on the centre pixel the two agree exactly -- which is why this bug survives casual testing",
        Math.abs(errs[0]) < 1e-12);
    ok("!! and the error GROWS with angle from centre", errs[1] > 10 && errs[2] > errs[1],
        "edge " + errs[1].toFixed(1) + "%, corner " + errs[2].toFixed(1) + "%");
    ok("...which is 1/cos, not a fudge factor", (() => {
        const d = unit([tan, tan, 1]);
        const cos = hitDepth(50, d, FWD, NEAR, FAR).cos;
        return Math.abs((1 / cos - 1) * 100 - errs[2]) < 1e-9;
    })(), "the correction is one dot product; the bug is omitting it");
    ok("the wrong depth is BIGGER, so voxels would sink INTO terrain rather than float above it", (() => {
        const d = unit([tan, tan, 1]);
        return hitDepthWrong(50, d, FWD, NEAR, FAR).depth > hitDepth(50, d, FWD, NEAR, FAR).depth;
    })(), "the visible symptom is geometry disappearing at screen edges, which reads as a culling bug");
}

// --- 3. REFUSALS: a hit that cannot have a depth -------------------------------------------------------------
{
    const back = hitDepth(50, [0, 0, -1], FWD, NEAR, FAR);
    ok("a hit behind the camera plane is refused, not given a depth", back.ok === false && /behind the camera plane/.test(back.reason));
    const tooNear = hitDepth(0.05, [0, 0, 1], FWD, NEAR, FAR);
    ok("a hit nearer than the near plane is refused, and says the raster pass would clip it too",
        tooNear.ok === false && /near plane/.test(tooNear.reason),
        "silently clamping would put marched geometry in front of raster geometry that was legitimately clipped");
    ok("a grazing ray perpendicular to the view axis is refused rather than dividing by ~0",
        hitDepth(50, [1, 0, 0], FWD, NEAR, FAR).ok === false);
}

// --- 4. PRECISION: does single precision suffice for a 24-bit depth buffer? -----------------------------------
// This is the question the compositing round would otherwise hit blind, and v3062 established how to answer it.
{
    let worstDelta = 0, worstAt = 0;
    for (let i = 1; i <= 2000; i++) {
        const t = NEAR + (FAR - NEAR) * (i / 2000);
        const d = unit([0.3, 0.2, 0.93]);
        const a = hitDepth(t, d, FWD, NEAR, FAR), b = hitDepth32(t, d, FWD, NEAR, FAR);
        if (a.ok && b.ok) { const dd = Math.abs(a.depth - b.depth); if (dd > worstDelta) { worstDelta = dd; worstAt = t; } }
    }
    const oneCode = 1 / 16777215;
    say("worst f64-vs-f32 depth difference over the range: " + worstDelta.toExponential(2) + " at t=" + worstAt.toFixed(1) +
        "   |   one 24-bit depth code = " + oneCode.toExponential(2));
    ok("!! single precision is sufficient: the f32/f64 gap is smaller than one 24-bit depth code",
        worstDelta < oneCode, "so the shader computing this in highp float cannot land on a different code");

    const res = depthResolution(NEAR, FAR);
    say("the MIDPOINT of the view range maps to window depth " + res.midDepth.toFixed(6));
    ok("!! HONEST LIMIT KEPT: half the view range lives in the last fraction of a percent of the depth range",
        res.midDepth > 0.99,
        "with near=0.1 far=200, everything past z=100 is squeezed into the top 0.05% -- 'the depth test flickers out there' is the projection, not a bug in the marcher, and a compositing round should raise NEAR before blaming anything");
}

// --- 5. it is an answer key, and says so ----------------------------------------------------------------------
{
    const src = readFileSync(new URL("../../render/depthProject.js", import.meta.url), "utf8");
    const code = codeOnly(src);
    ok("the module states the bug it exists to catch, in view-space terms", /distance ALONG THE RAY/.test(src) && /VIEW-SPACE Z/.test(src));
    ok("the wrong version is EXPORTED so the gate can measure it rather than describe it", /export function hitDepthWrong/.test(code));
    ok("no compositing is claimed to be wired -- this is the key, not the lock",
        /answer key/i.test(src) && !/gl_FragDepth\s*=/.test(code),
        "v3045 said compositing needs its own answer key; building the key first is what makes the next round checkable");
    ok("browser-safe, no imports", !/^\s*import/m.test(code) && !/\bdocument\s*[.[]/.test(code));
}

console.log("depthProject-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
