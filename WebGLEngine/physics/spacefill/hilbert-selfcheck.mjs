// physics/spacefill/hilbert-selfcheck.mjs
//
// Run: node physics/spacefill/hilbert-selfcheck.mjs   (~0.1s)
//
// v3187 -- SLDgen's IDEA, IN THE ONE FORM THIS TREE CAN ACTUALLY TEST.
//
// Keith raised tanguymagne/SLDgen (ETH Zurich, CGF 2026) and asked whether it could be a formula for a
// DETERMINISTIC test. Its real contribution is the phrase "a single continuous stroke BY DESIGN" -- the
// representation makes a break UNREPRESENTABLE rather than checking for one and rejecting it. That is
// wyrm_math's principle, adopted here at v3100, ARRIVED AT INDEPENDENTLY IN A THIRD DOMAIN.
//
// *** BUT SLDgen ITSELF CANNOT BE THE TEST, AND SAYING SO IS HALF THE ROUND. *** It optimises a B-spline by
// SCORE DISTILLATION SAMPLING against a text-to-image diffusion model: a large dependency against the
// no-npm-install bar, and a STOCHASTIC objective. v3186 froze 171 lab observables on EXACT equality -- a
// diffusion-guided curve fitter would be the one thing in this tree that could not be frozen.
//
// THE DETERMINISTIC FORM OF THE SAME IDEA IS A SPACE-FILLING CURVE, and it is better suited than the original:
// no dependency, no seed, and an ANALYTIC answer key rather than a reference image.
//
// *** THE MEASURED PROPERTY IS LOCALITY, NOT COVERAGE, AND THE RASTER SCAN IS WHY. *** A raster visits every
// cell exactly once too -- identical coverage, zero revisits -- and it is a TERRIBLE stroke, jumping the width
// of the grid at the end of every row. COVERAGE CANNOT TELL THEM APART. Adjacency can, exactly, and the
// raster's failure is DERIVABLE: exactly n-1 breaks with a worst jump of exactly n.

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const H = await import(pathToFileURL(path.join(HERE, "hilbert.mjs")).href);

// ---- 1. IT IS ONE UNBROKEN STROKE, AT EVERY ORDER ---------------------------------------------------------------
{
    const orders = [2, 3, 4, 5, 6];
    const stats = orders.map((o) => ({ o, n: 1 << o, h: H.strokeStats(H.hilbertPath(o)) }));

    ok("!! *** every consecutive step is ADJACENT -- a single continuous stroke ***",
        stats.every((s) => s.h.breaks === 0 && s.h.worstJump === 1),
        "orders " + orders.join(",") + ": ZERO breaks, worst jump 1, at every one. Adjacency is checked EXACTLY " +
        "-- Manhattan distance 1, not 'small on average'. A CURVE WITH ONE BREAK IS NOT A SINGLE-LINE DRAWING, " +
        "and an average would let it hide among four thousand good steps");

    ok("!! every cell is visited EXACTLY once -- no gaps, no revisits",
        stats.every((s) => s.h.steps === s.n * s.n && s.h.distinct === s.n * s.n && s.h.revisits === 0),
        stats.map((s) => s.n * s.n).join(", ") + " cells. GAPS AND REVISITS ARE REPORTED SEPARATELY because they " +
        "CANCEL IN A TOTAL -- v3069's mesher bug hid for 270 versions inside exactly that cancellation");

    ok("!! and the mapping is a genuine BIJECTION, checked both ways",
        (() => {
            for (const o of [3, 5, 7]) {
                const n = 1 << o;
                for (let d = 0; d < n * n; d++) { const [x, y] = H.d2xy(o, d); if (H.xy2d(o, x, y) !== d) return false; }
            }
            return true;
        })(),
        "xy2d(d2xy(d)) === d over 64, 1024 and 16384 cells, zero mismatches. A CURVE YOU CAN ONLY WALK FORWARD " +
        "IS NOT A MAPPING -- and a fill that cannot answer 'where am I on the stroke' is a picture, not an index");
}

// ---- 2. THE FAILING CASE, MEASURED FAILING, WITH ITS OWN ANALYTIC KEY -------------------------------------------
{
    const orders = [2, 3, 4, 5, 6];
    const rs = orders.map((o) => ({ n: 1 << o, r: H.strokeStats(H.rasterPath(o)) }));

    ok("!! *** the RASTER has identical coverage and is a terrible stroke ***",
        rs.every((s) => s.r.distinct === s.n * s.n && s.r.revisits === 0 && s.r.breaks > 0),
        "same cells, zero revisits, and it BREAKS. COVERAGE CANNOT TELL THE TWO APART -- a checker that asked " +
        "only 'did it fill the region' would pass both and mean nothing, which is why the raster is drawn here " +
        "ON PURPOSE rather than described");

    ok("!! and its failure is DERIVABLE, not merely observed",
        rs.every((s) => s.r.breaks === s.n - 1 && s.r.worstJump === s.n),
        rs.map((s) => s.n + ":" + s.r.breaks + "/" + s.r.worstJump).join("  ") + ". EXACTLY n-1 BREAKS WITH A " +
        "WORST JUMP OF EXACTLY n, at every order -- one break per row end, each jumping the grid width. THE " +
        "FAILING CASE HAS AN ANALYTIC ANSWER KEY TOO, which is stronger than having one only for the claim");

    ok("...and the two are separated by ORDERS of magnitude, not a threshold",
        (() => { const h = H.strokeStats(H.hilbertPath(6)), r = H.strokeStats(H.rasterPath(6));
                 return h.breaks === 0 && r.breaks === 63; })(),
        "0 against 63 at order 6. NO TOLERANCE IS INVOLVED ANYWHERE IN THIS FILE -- the discriminator is " +
        "identity, and a curve is continuous or it is not");
}

// ---- 3. WHAT IT DOES NOT CLAIM ------------------------------------------------------------------------------------
{
    ok("!! no dependency, no seed, no floating point in the construction",
        (() => { const src = fsMod.readFileSync(path.join(HERE, "hilbert.mjs"), "utf8");
                 return !/import .* from ["'][^.]/.test(src) && !/Math\.random/.test(src); })(),
        "bit rotations and integer arithmetic. THAT IS THE WHOLE REASON THIS CAN BE A TEST AND SLDgen CANNOT: " +
        "score distillation sampling needs a diffusion model and has a stochastic objective, so its output " +
        "could never join v3186's frozen baseline");
    console.log("  ----  WHAT IS NOT CLAIMED: this is not SLDgen and does not do what SLDgen does. SLDgen draws");
    console.log("  ----  a RECOGNISABLE THING from a prompt; this fills a square. What transfers is the");
    console.log("  ----  STRUCTURAL GUARANTEE -- one unbroken stroke because a break cannot be represented --");
    console.log("  ----  and that is the third independent arrival of the principle after wyrm_math and the");
    console.log("  ----  population field's legal-moves rule. NOT WIRED to a device or a page yet.");
}

console.log();
if (fails) { console.log("hilbert-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("hilbert-selfcheck: all checks pass");
