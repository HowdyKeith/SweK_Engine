// WebGLEngine/tools/ship/solidTexture-selfcheck.mjs -- v4243
//
// Run: node tools/ship/solidTexture-selfcheck.mjs
//
// *** THE CLAIM UNDER TEST: A CUT FACE CAN BE TEXTURED WITHOUT UVs, AND ONE OF THE TWO WAYS OF DOING IT IS
// WRONG AT EXACTLY THE PLACE THAT MATTERS. ***
//
// v4235 gave the tree mesh booleans that return positions only -- physics/mesh/meshCSG.mjs has no `uv`
// anywhere in it -- so the blast hole it cuts is watertight, gap-free and untexturable. Two techniques take
// no UVs: TRIPLANAR mapping, which projects a 2D image down three axes and blends by the normal, and SOLID
// texturing, which evaluates a function of the 3D point.
//
// They are not equivalent, and the difference shows on the rim of the hole. An original face and a cut face
// meet along an edge; being an edge is exactly the property that their NORMALS DIFFER. Triplanar's weights
// are a function of the normal, so its answer jumps across that rim while the position stands still. A solid
// texture consults only the position, so it cannot jump.
//
// That is measured here on a REAL cut -- a wall subtracted by a jagged blast blob, at the 41 points where a
// tagged skin polygon and a tagged cut polygon share a vertex -- not on a synthetic edge chosen to flatter
// the answer.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import * as csg from "../../physics/mesh/meshCSG.mjs";
import * as st from "../../render/solidTexture.mjs";
import { snoise3 } from "../../shaders/ashimaNoise.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const lv = (x) => (x * 255).toFixed(0);

console.log("solidTexture-selfcheck -- texturing a face that did not exist when the mesh was unwrapped\n");

// The wall and the blast, built once and shared, so every section below is talking about the same cut.
const WALL = csg.boxPolys([-4, -2, -0.5], [4, 2, 0.5]);
const BLOB = csg.jaggedBlob([0, 0, 0], 1.2, 7, { seed: 5 });
const CUTP = csg.subtract(WALL, BLOB);
// A deterministic 2D pattern standing in for a photograph. Reproducible, and high-contrast so a washed-out
// blend is visible as a number rather than as an impression.
const PAT = (u, v) => { const t = 0.5 + 0.5 * Math.sin(u * 6) * Math.cos(v * 6); return [t, t * 0.9, t * 0.8]; };
const TRI = (k) => (x, y, z, nx, ny, nz) => st.triplanarAt(PAT, x, y, z, nx, ny, nz, k, 1);
const SOL = (x, y, z) => st.concreteAt(x, y, z);

// =============================================================================================================
console.log("1. the boolean now says WHICH faces it created, which it always knew and always discarded");
{
    const counts = {};
    for (const p of CUTP) counts[p.src] = (counts[p.src] || 0) + 1;
    ok("!! *** every output polygon is tagged either SKIN or CUT ***",
        counts[csg.SKIN] > 0 && counts[csg.CUT] > 0 && counts[csg.SKIN] + counts[csg.CUT] === CUTP.length,
        counts[csg.SKIN] + " skin + " + counts[csg.CUT] + " cut = " + CUTP.length + " polygons. The tag rides " +
        "through clonePolys and both halves of every splitPolygon, so a fragment of A's surface is still A's " +
        "surface however many times the BSP cut it.");

    // *** CHECKED BY CONSTRUCTION, NOT BY COUNTING: a CUT face is a piece of B's surface, so it must lie on
    // one of B's planes. This is the property that makes the tag mean something rather than merely exist.
    const onB = (pl) => BLOB.some((q) =>
        Math.abs(Math.abs(q.pl.n[0] * pl.n[0] + q.pl.n[1] * pl.n[1] + q.pl.n[2] * pl.n[2]) - 1) < 1e-9 &&
        Math.abs(Math.abs(q.pl.w) - Math.abs(pl.w)) < 1e-9);
    const strayCut = CUTP.filter((p) => p.src === csg.CUT && !onB(p.pl)).length;
    ok("!! *** and EVERY cut face lies on one of B's planes -- the tag is verified, not asserted ***",
        strayCut === 0, strayCut + " of " + counts[csg.CUT] + " cut faces are off B's plane set");
    // The converse is NOT claimed, and the reason is worth keeping: a skin face may coincidentally be
    // coplanar with one of B's planes, and on this wall some are. A check demanding otherwise would be
    // demanding that a random blob never lines up with a flat wall, which is a fact about the seed.
    const skinOnB = CUTP.filter((p) => p.src === csg.SKIN && onB(p.pl)).length;
    report("skin faces that happen to be coplanar with a B plane: " + skinOnB + " -- NOT asserted to be zero, " +
           "because coincidence is allowed and this seed produces some");
}

// =============================================================================================================
console.log("\n2. *** THE RIM: where an original face and a cut face meet, and the two techniques disagree ***");
{
    const key = (v) => v.map((x) => x.toFixed(6)).join(",");
    const skinPts = new Map(), cutPts = new Map();
    for (const p of CUTP) {
        const m = p.src === csg.SKIN ? skinPts : cutPts;
        for (const v of p.vs) if (!m.has(key(v))) m.set(key(v), { v, n: p.pl.n });
    }
    const rim = [];
    for (const [k, a] of skinPts) if (cutPts.has(k)) rim.push([a, cutPts.get(k)]);
    ok("!! the cut has a real rim: points where a skin face and a cut face share a vertex",
        rim.length > 20, rim.length + " shared points around the hole");

    let solidWorst = 0, triWorst = 0, normalsDiffer = 0;
    for (const [a, b] of rim) {
        solidWorst = Math.max(solidWorst, st.seamJump((x, y, z) => SOL(x, y, z), a.v, a.n, b.n));
        triWorst = Math.max(triWorst, st.seamJump(TRI(1), a.v, a.n, b.n));
        const d = Math.abs(a.n[0] * b.n[0] + a.n[1] * b.n[1] + a.n[2] * b.n[2]);
        if (d < 0.999) normalsDiffer++;
    }
    ok("   ...and the two faces really do have different normals there, which is what makes it a rim",
        normalsDiffer === rim.length, normalsDiffer + " of " + rim.length + " rim points have a genuine angle");
    ok("!! *** THE SOLID TEXTURE DOES NOT JUMP: 0 of 255, at every one of the " + rim.length + " rim points ***",
        solidWorst === 0,
        "exactly zero, and it is exact rather than small because concreteAt is a function of (x, y, z) and " +
        "the position at a shared vertex is the SAME position. Equal inputs, equal outputs.");
    ok("!! *** THE TRIPLANAR BLEND JUMPS " + lv(triWorst) + " OF 255 ACROSS THE SAME EDGE ***",
        triWorst > 0.3,
        "worst " + triWorst.toFixed(4) + " (" + lv(triWorst) + " levels) at the same points, same pattern, " +
        "same scale. The position did not move; the NORMAL did, and triplanar's weights are a function of " +
        "the normal. This is the seam that the technique usually recommended for UV-less geometry puts " +
        "exactly along the edge of every blast hole.");
    // *** THE ZERO ABOVE IS NEARLY CIRCULAR ON ITS OWN AND IS NOT COUNTED AS THE FINDING. *** A function
    // that ignores the normal cannot vary with the normal; asserting that alone would be restating the
    // signature. What carries meaning is the PAIR -- both techniques asked the same question at the same
    // points -- and the control below, which shows the solid texture is not simply flat everywhere.
    let spread = 0;
    for (const [a] of rim) {
        for (const [b] of rim) {
            spread = Math.max(spread, Math.abs(SOL(a.v[0], a.v[1], a.v[2])[0] - SOL(b.v[0], b.v[1], b.v[2])[0]));
        }
    }
    ok("!! *** THE CONTROL: the solid texture is not zero everywhere, it VARIES across the same rim ***",
        spread > 0.05,
        "worst channel spread " + spread.toFixed(4) + " (" + lv(spread) + " levels) between rim points. A " +
        "constant colour would also have scored a seam of zero, and would have been worthless.");
}

// =============================================================================================================
console.log("\n3. *** THE SHARPENING EXPONENT, WHICH IS THE STANDARD FIX AND CANNOT FIX THIS ***");
{
    // The usual advice for triplanar's ghosting is to raise the weights to a power. Measured against the
    // failure mode it is prescribed for AND against the seam, the two move in opposite directions.
    const norm = (a) => { const L = Math.hypot(...a); return a.map((x) => x / L); };
    const diag = norm([1, 1, 1]), skew = norm([1, 0.6, 0.2]);
    const w1d = st.blendWeights(...diag, 1), w8d = st.blendWeights(...diag, 8);
    const w1s = st.blendWeights(...skew, 1), w8s = st.blendWeights(...skew, 8);
    ok("!! *** ON A PERFECTLY DIAGONAL FACE THE EXPONENT DOES NOTHING AT ALL ***",
        Math.abs(w1d[0] - w8d[0]) < 1e-12,
        "k=1 gives " + w1d.map((v) => v.toFixed(3)).join("/") + " and k=8 gives " +
        w8d.map((v) => v.toFixed(3)).join("/") + " -- identical. Raising three EQUAL numbers to a power " +
        "leaves them equal, then normalising restores the same thirds. The worst ghosting case is precisely " +
        "the case the standard remedy cannot touch.");
    ok("   ...while on a face where one axis already leads, it concentrates hard",
        w8s[0] > 0.95 && w1s[0] < 0.6,
        "the same exponent takes " + w1s.map((v) => v.toFixed(3)).join("/") + " to " +
        w8s.map((v) => v.toFixed(3)).join("/") + ". So the knob works where it is least needed.");

    const key = (v) => v.map((x) => x.toFixed(6)).join(",");
    const skinPts = new Map(), cutPts = new Map();
    for (const p of CUTP) {
        const m = p.src === csg.SKIN ? skinPts : cutPts;
        for (const v of p.vs) if (!m.has(key(v))) m.set(key(v), { v, n: p.pl.n });
    }
    const rim = [];
    for (const [k, a] of skinPts) if (cutPts.has(k)) rim.push([a, cutPts.get(k)]);
    const seamAt = (k) => { let w = 0; for (const [a, b] of rim) w = Math.max(w, st.seamJump(TRI(k), a.v, a.n, b.n)); return w; };
    const s1 = seamAt(1), s4 = seamAt(4), s8 = seamAt(8);
    ok("!! *** AND ON THE REAL RIM, SHARPENING MAKES THE SEAM WORSE RATHER THAN BETTER ***",
        s4 > s1,
        "worst rim jump " + lv(s1) + " levels at k=1, " + lv(s4) + " at k=4, " + lv(s8) + " at k=8. Sharper " +
        "weights mean a BIGGER swing when the normal flips, so the knob tuned to hide ghosting in the middle " +
        "of a face widens the discontinuity at its edge. Both numbers are the same technique on the same " +
        "geometry; there is no setting that makes triplanar continuous here.");
    report("solid texture at every one of those exponents: 0 levels, because it has no exponent and no normal");
}

// =============================================================================================================
console.log("\n4. the interior is not the exterior, which is the other half of why a hole reads as broken");
{
    const pts = [[0.31, 0.22, 0], [1.4, -0.7, 0.2], [-2.1, 1.05, -0.3], [0.02, 0.9, 0.44]];
    let worst = 0;
    for (const p of pts) {
        const raw = st.concreteAt(p[0], p[1], p[2]);
        const wea = st.concreteAt(p[0], p[1], p[2], { weathered: true });
        for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(raw[i] - wea[i]));
    }
    ok("!! the weathered surface and the raw interior differ at the same point",
        worst > 0.02, "worst " + lv(worst) + " levels between weathered and raw at identical coordinates");
    // *** AND THIS IS THE ONE PLACE A NORMAL-FREE FUNCTION STILL NEEDS THE CALLER TO DECIDE SOMETHING. ***
    // Staining is a property of having been exposed, which is history rather than geometry, so no function
    // of position can derive it. meshCSG's tag is exactly that history, which is why section 1 exists.
    report("weathering is passed IN, not derived: it is a fact about a face's history, and the SKIN/CUT tag " +
           "from section 1 is the only thing that knows it");
}

// =============================================================================================================
// ---- v4243 SABOTAGES, RESTORED BYTE-IDENTICAL AND md5-VERIFIED -------------------------------------------
//
//   A  splitPolygon stops carrying poly.src into its two halves. -> 4 RED. The tag survives on the polygons
//      that were never split (2 skin + 18 cut of 286) and vanishes from every fragment, which is exactly the
//      shape a tag-carrying bug has. Note which check did NOT move: "every cut face lies on a B plane"
//      stayed green, correctly -- it grades the QUALITY of the tags that exist, not their COVERAGE, and the
//      eighteen survivors are all still genuinely on B's planes. Two checks, two different questions.
//
//   B  concreteAt returns a constant grey. -> 3 RED, and this is the one that settles what section 2 is
//      worth. *** THE SEAM CHECK STAYED GREEN: a constant function also jumps zero across an edge. *** The
//      CONTROL is what caught it. So the zero-seam result is near-circular on its own and is not the
//      finding; the finding is the PAIR of numbers, 0 against 136, plus a control proving the zero is not
//      the zero of a flat picture.
//
//   C  the GLSL's aggregate frequency multiplied by 1.6 -- a constant drifting between the two copies, the
//      exact defect a CPU-model gate exists to catch. *** IT PASSED. *** Mean brightness moved 0.009 against
//      a 0.02 tolerance and the check went green. That is what forced section 5 to be rewritten from "the
//      two agree" into "no agreement check is available here", and the three instruments tried are recorded
//      there with their numbers rather than the one that flattered the result being kept.
//
console.log("\n5. *** ON A REAL GPU -- and the per-pixel comparison this tree always makes is NOT AVAILABLE ***");
const require_ = createRequire(import.meta.url);
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) {
    report("SKIPPED -- " + skip);
    report("*** A SKIP, NOT A PASS. Sections 1-4 are all CPU; nothing above proves the GLSL even compiles.");
} else {
    const srv = http.createServer((rq, rs) => {
        const p = path.join(ENG, decodeURIComponent(rq.url.split("?")[0]));
        if (!fs.existsSync(p) || !fs.statSync(p).isFile()) { rs.writeHead(404); return rs.end("nf"); }
        const ext = path.extname(p);
        rs.writeHead(200, { "content-type": ext === ".html" ? "text/html" : "text/javascript" });
        rs.end(fs.readFileSync(p));
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const port = srv.address().port;
    const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const pg = await b.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 300)));
    await pg.goto("http://127.0.0.1:" + port + "/tools/ship/solidTextureHarness.html", { waitUntil: "load", timeout: 45000 });
    await pg.waitForFunction(() => window.__ready === true, { timeout: 30000 }).catch(() => {});
    const origin = [-1.5, -1.0, 0.25], du = [3.0, 0, 0], dv = [0, 2.0, 0];
    const got = await pg.evaluate(([o, u, v]) => window.__render(o, u, v, false, false), [origin, du, dv]);
    const raw = await pg.evaluate(([o, u, v]) => window.__render(o, u, v, false, true), [origin, du, dv]);
    const fsSrc = await pg.evaluate(() => window.__fs || "");
    await b.close(); srv.close();

    ok("!! the harness compiled the GLSL and rendered without throwing",
        errs.length === 0 && got && got.ok, (got && got.error) || errs.slice(0, 1).join(" | "));

    const N = got && got.n;
    const ptAt = (x, y) => {
        const uu = (x + 0.5) / N, vv = (y + 0.5) / N;
        return [origin[0] + du[0] * uu + dv[0] * vv,
                origin[1] + du[1] * uu + dv[1] * vv,
                origin[2] + du[2] * uu + dv[2] * vv];
    };

    if (got && got.ok) {
        // *** THE PER-PIXEL CPU/GPU COMPARISON THIS TREE ALWAYS DOES IS NOT AVAILABLE HERE, AND THE REASON IS
        // A FINDING RATHER THAN AN EXCUSE. *** Every shader in this tree is graded against a JS model --
        // crtModel against crtPass, swiftShaderModel against swiftShaderPass -- and that convention rests on
        // the two implementations computing the same function. Through Ashima simplex they do not.
        let exact = 0, worstN = 0, sumN = 0;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const p = ptAt(x, y), i = (y * N + x) * 4;
            const gpu = ((raw.px[i] / 255 + raw.px[i + 1] / 65025 + raw.px[i + 2] / 16581375) - 0.5) * 8;
            const cpu = snoise3(p[0], p[1], p[2]);
            const d = Math.abs(gpu - cpu);
            if (d < 1e-3) exact++;
            sumN += d; if (d > worstN) worstN = d;
        }
        const pct = (100 * exact / (N * N));
        ok("!! *** THE JS AND GLSL SIMPLEX AGREE EXACTLY AT SOME POINTS AND NOT AT ALL AT OTHERS ***",
            exact > 0 && worstN > 1,
            exact + " of " + (N * N) + " points (" + pct.toFixed(1) + "%) agree to better than 1e-3, while " +
            "the worst disagreement is " + worstN.toFixed(3) + " on a range of about +/-3.6 (mean " +
            (sumN / (N * N)).toFixed(3) + "). That SHAPE is the diagnosis: a drifting precision error would " +
            "be small everywhere, and a wrong translation would be wrong everywhere. Exact agreement at many " +
            "points with total disagreement at others is a DIFFERENT GRADIENT being chosen.");
        // *** AND THE MECHANISM, WHICH IS INHERENT AND NOT FIXABLE BY WRITING THE JS MORE CAREFULLY. ***
        // Ashima's permute chain ends in mod289(x) = x - floor(x * (1/289)) * 289 with x reaching ~1.1e7.
        // 1/289 is not exact in binary, so in 32-bit float the product lands on the other side of an integer
        // boundary for a small fraction of inputs; floor then differs by one, mod289 differs by 289, and a
        // different gradient vector is selected. The JS runs in float64 and gets the other answer.
        const f = Math.fround;
        const m32 = (x) => f(x - f(f(Math.floor(f(f(x) * f(1 / 289)))) * 289));
        const m64 = (x) => x - Math.floor(x * (1 / 289)) * 289;
        let flips = 0, tried = 0;
        for (let k = 0; k < 60000; k++) {
            const xv = 1 + k * 0.173;
            const v = ((xv * 34) + 1) * xv;
            if (v > 1.2e7) break;
            tried++;
            if (Math.abs(m64(v) - m32(v)) > 1) flips++;
        }
        ok("!! *** AND THE MECHANISM IS float32 mod289 CROSSING A floor BOUNDARY, MEASURED DIRECTLY ***",
            flips > 0,
            flips + " of " + tried + " permute-chain values (" + (100 * flips / tried).toFixed(2) + "%) land " +
            "on a DIFFERENT integer under 32-bit mod289 than under 64-bit. One flip is 289, which is a whole " +
            "different gradient. So this is a property of evaluating Ashima's noise at two precisions, not a " +
            "mistranslation -- and no amount of care in the JS removes it.");
        report("*** WHAT THAT COSTS THIS TREE, STATED RATHER THAN FIXED HERE: the CPU-model-against-GPU-pass " +
               "convention cannot grade any shader whose output passes through simplex noise. That reaches " +
               "further than this round -- render/aquarelleModel.mjs and render/aquarellePass.js are exactly " +
               "such a pair. Filed; NOT investigated here, because it is a bigger question than one texture.");

        // WHAT CAN STILL BE COMPARED: the statistics. A mistranslation, a dropped constant or a swapped
        // falloff moves these; a per-point gradient flip does not, because both sides draw from the same
        // gradient set with the same weights.
        let cl = 255, ch2 = 0, gsum = 0, jsum = 0, jlo = 9, jhi = -9;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const r = got.px[(y * N + x) * 4];
            if (r < cl) cl = r; if (r > ch2) ch2 = r; gsum += r / 255;
            const p = ptAt(x, y), c = st.concreteAt(p[0], p[1], p[2]);
            jsum += c[0]; if (c[0] < jlo) jlo = c[0]; if (c[0] > jhi) jhi = c[0];
        }
        const gmean = gsum / (N * N), jmean = jsum / (N * N);
        // *** THE MEAN ALONE IS NOT ENOUGH, AND A SABOTAGE PROVED IT RATHER THAN A REVIEW. *** Multiplying
        // the GLSL's frequency by 1.6 -- exactly the "a constant drifted between the two copies" defect this
        // section exists to catch -- moved the mean by 0.009 and sailed through a 0.02 tolerance. It had to:
        // simplex noise is STATIONARY, so changing its frequency barely touches its histogram. A distribution
        // test cannot see a frequency error, however tight you make it.
        //
        // What does see it is CORRELATION. The per-point gradient flips above are localised, so a GPU image
        // and a CPU image of the SAME field still track each other; two images of fields at different
        // frequencies do not. That is a claim about spatial structure, which is the thing that actually
        // changed.
        // *** AND IT HAS TO BE CORRELATED ON BLOCK AVERAGES, NOT ON PIXELS, FOR A REASON THE MEASUREMENTS
        // ABOVE ALREADY GAVE. *** concreteAt puts a HARD THRESHOLD on the noise (agg > uAggregate decides
        // stone or cement), so every one of the 76% of samples where the two precisions pick different
        // gradients becomes a FULL-MAGNITUDE pixel flip, not a small error. Pixel-wise correlation on the
        // finished image is 0.20 even when both sides are correct -- too close to the 0.10 a real defect
        // scores to be worth anything. Averaging 8x8 blocks first suppresses isolated flips, which are
        // uncorrelated, and keeps the low-frequency structure, which is what a wrong frequency destroys.
        const BS = 8, BN = Math.floor(N / BS);
        const ga = [], ja = [];
        for (let by = 0; by < BN; by++) for (let bx = 0; bx < BN; bx++) {
            let gsub = 0, jsub = 0;
            for (let y = 0; y < BS; y++) for (let x = 0; x < BS; x++) {
                const px = bx * BS + x, py = by * BS + y, pt = ptAt(px, py);
                gsub += got.px[(py * N + px) * 4] / 255;
                jsub += st.concreteAt(pt[0], pt[1], pt[2])[0];
            }
            ga.push(gsub / (BS * BS)); ja.push(jsub / (BS * BS));
        }
        let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
        for (let i = 0; i < ga.length; i++) {
            sx += ga[i]; sy += ja[i]; sxx += ga[i] * ga[i]; syy += ja[i] * ja[i]; sxy += ga[i] * ja[i];
        }
        const nn = ga.length;
        const cov = sxy / nn - (sx / nn) * (sy / nn);
        const sdA = Math.sqrt(Math.max(0, sxx / nn - (sx / nn) ** 2));
        const sdB = Math.sqrt(Math.max(0, syy / nn - (sy / nn) ** 2));
        const corr = sdA > 0 && sdB > 0 ? cov / (sdA * sdB) : 0;
        // *** THREE INSTRUMENTS WERE TRIED AND NONE OF THEM SEPARATES A CORRECT SHADER FROM A BROKEN ONE.
        // THAT IS THE RESULT, AND IT IS REPORTED RATHER THAN THRESHOLDED UNTIL IT LOOKS LIKE A PASS. ***
        //
        // The reference defect throughout was multiplying the GLSL's frequency by 1.6 -- precisely the
        // "a constant drifted between the two copies" failure this section exists to catch.
        //
        //   MEAN BRIGHTNESS   correct 0.626 vs JS 0.615; DEFECTIVE 0.623. The defect moved it 0.009 and any
        //                     tolerance loose enough to pass the correct build passes the broken one too.
        //                     Simplex noise is STATIONARY, so changing its frequency barely touches its
        //                     histogram -- no distribution test can see a frequency error.
        //   PIXEL CORRELATION correct r = 0.199, DEFECTIVE r = 0.096. Real separation, far too little of it.
        //                     concreteAt thresholds the noise, so each of the 76% of samples where the two
        //                     precisions choose different gradients becomes a FULL-MAGNITUDE pixel flip.
        //   BLOCK CORRELATION correct r = 0.193 over 8x8 means. Averaging was meant to suppress isolated
        //                     flips; it did not move the number, which says the disagreement is pervasive
        //                     rather than sparse.
        //
        // So the honest statement is that THIS TREE CANNOT CURRENTLY GRADE A NOISE-BASED SHADER AGAINST ITS
        // JS MODEL AT ALL, and inventing a threshold around r = 0.15 would be manufacturing a pass out of a
        // gap. What is asserted below is only what was actually established.
        ok("!! *** NO CPU/GPU AGREEMENT CHECK IS AVAILABLE HERE, AND THAT IS THE MEASUREMENT, NOT A GAP ***",
            corr > 0 && corr < 0.5 && Math.abs(gmean - jmean) < 0.05,
            "block correlation r = " + corr.toFixed(4) + " over " + nn + " blocks with BOTH SIDES CORRECT, " +
            "against r = 0.096 for a deliberately broken shader -- a separation too small to gate on. Means " +
            gmean.toFixed(4) + " / " + jmean.toFixed(4) + ". The assertion here is deliberately weak and " +
            "says so: it pins the numbers this round measured so a future change to the noise, the shader " +
            "or the precision moves them visibly, and it claims nothing about correctness.");
        ok("!! *** THE CONTROL: the rendered image is not flat ***",
            ch2 - cl > 20, "red channel spans " + cl + ".." + ch2 + " (" + (ch2 - cl) + " levels). An " +
            "agreement between two constant functions is not evidence of anything, so the range is asked for.");
        ok("!! and the shader consults NO sampler and NO uv -- the property, read off the source it ran",
            !/sampler2D|texture\s*\(/.test(fsSrc) && !/\buv\b/.test(fsSrc.replace(/vUV/g, "")),
            "no sampler2D and no texture() call in the fragment shader that produced those pixels. vUV " +
            "exists only to locate the PIXEL on the test plane; the function is fed a 3D position.");
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: what this costs. concreteAt is four fbm3 calls of two to three octaves each, so a " +
    "pixel is up to eleven simplex evaluations, and NOTHING HERE TIMES IT -- on a real blast hole that is " +
    "the number that decides whether it ships as a shader or as a bake. Also unchecked: whether the " +
    "aggregate READS as concrete, which is a judgement no gate makes; the material is asserted to be " +
    "consistent and continuous, never to be convincing. And the SKIN/CUT tag is produced and verified but " +
    "nothing in the engine consumes it yet -- meshCSG's output still reaches the renderer as positions only.");
process.exit(fails ? 1 : 0);
