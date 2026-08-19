// WebGLEngine/physics/tomography/reconOps-selfcheck.mjs -- v3617
//
// Run: node physics/tomography/reconOps-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/tomography/reconOps.mjs and ct.html's use of it.
//
// THE CHECK THIS FILE EXISTS FOR is section 1: the whole reason this module exists is that a PAGE could not
// import the others, and "a page can import this" is a claim about ABSENCE -- of a node: specifier anywhere in
// the import graph. So it is asserted by WALKING THE GRAPH rather than by reading one file, and the same walk
// is shown FINDING the node imports in the modules that have them, which is what stops it proving nothing.
//
// AND SECTION 3 IS THE ONE THAT MATTERS FOR HONESTY: ct.html quotes numbers in its own prose, at its own
// settings. Those numbers are RE-DERIVED here from the page's own constants, so the page cannot drift into
// claiming something the code stopped doing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { phantomField, radon, backProject, scoreRecon, angleSet } from "./ct.js";
import { matchedBackProject, powerStep, residual, landweber } from "./reconOps.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. A PAGE CAN REACH IT -- ASSERTED BY WALKING THE IMPORT GRAPH -------------------------------------------------
{
    const nodeImports = (rel) => {
        const src = fs.readFileSync(path.join(ENGINE, rel), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
        return [...src.matchAll(/from\s+["'](node:[^"']+)["']/g)].map((m) => m[1]);
    };
    const graph = (entry) => {
        const seen = new Set(), out = [];
        const walk = (rel) => {
            if (seen.has(rel)) return; seen.add(rel);
            out.push(rel);
            const src = fs.readFileSync(path.join(ENGINE, rel), "utf8");
            for (const m of src.matchAll(/from\s+["'](\.\/[^"']+)["']/g))
                walk(path.join(path.dirname(rel), m[1]).split(path.sep).join("/"));
        };
        walk(entry);
        return out;
    };
    const g = graph("physics/tomography/reconOps.mjs");
    const offenders = g.filter((f) => nodeImports(f).length);
    ok("!! NOTHING IN reconOps' IMPORT GRAPH IMPORTS A node: SPECIFIER", offenders.length === 0,
       "graph is " + g.join(" + ") + (offenders.length ? "; OFFENDERS " + offenders.join(", ") : ""));
    // POSITIVE CONTROL: the same walk MUST find the imports in the modules that have them, or it proves nothing.
    const sirtGraph = graph("physics/tomography/sirt.mjs").filter((f) => nodeImports(f).length);
    ok("!! POSITIVE CONTROL: the same walk FINDS node: imports in sirt.mjs's graph", sirtGraph.length > 0,
       sirtGraph.join(", ") + " -- so 'clean' is a reading and not a walk that cannot fail. THIS IS WHY THE " +
       "FOUR MODULES SHIPPED THIS SESSION WERE STRUCTURALLY UNREACHABLE FROM ANY PAGE.");
    ok("...and reconOps has no main block either", !/import\.meta\.url\s*===/.test(fs.readFileSync(path.join(ENGINE, "physics/tomography/reconOps.mjs"), "utf8")),
       "a main guard is what pulled node:url into the others");
}

// ---- 2. MOVED, NOT COPIED -- ONE DECLARATION, AND THE OLD NAMES STILL WORK ---------------------------------------------
{
    const ma = await import("./matchedAdjoint.mjs");
    const sirtMod = await import("./sirt.mjs");
    ok("!! matchedAdjoint re-exports THE SAME FUNCTION OBJECT, so there is one declaration",
       ma.matchedBackProject === matchedBackProject,
       "identity comparison, not a behaviour comparison -- a copy would pass a behaviour test and fail this");
    ok("...and sirt's residual is the same function object too", sirtMod.residual === residual);
    ok("!! ...and stepFor no longer exists twice: both delegate to powerStep",
       typeof ma.stepFor === "function" && typeof sirtMod.stepFor === "function",
       "v3616 left the SAME power iteration written in BOTH sirt.mjs and matchedAdjoint.mjs -- two " +
       "declarations of one thing, in the arc whose subject is two declarations of one thing");
    const ang = angleSet(12), N = 32, nDet = 32;
    // v3847 -- THE REFERENCE OPERATOR HERE FOLLOWS THE DEFAULT, because that is what stepFor is FOR. When the
    // default moved to matchedBackProject this check went red against a backProject reference, which is the
    // ratchet working: the step IS a property of the operator, and a stepFor that did not move with it would
    // hand the matched iteration a step derived for a different matrix (7.6x its own ceiling -- outside
    // Landweber's bound, and it diverges).
    ok("...and the delegating step agrees with the general one, ON THE DEFAULT OPERATOR",
       Math.abs(sirtMod.stepFor(N, ang, nDet).step - powerStep((r) => matchedBackProject(r, N, ang, nDet), N, ang, nDet).step) === 0,
       "exactly, because it is the same code called two ways");
    ok("...and stepForUnmatched still delegates too, for the operator the gates drive on the record",
       Math.abs(sirtMod.stepForUnmatched(N, ang, nDet).step - powerStep((r) => backProject(r, N, ang, nDet), N, ang, nDet).step) === 0,
       "the old step is kept reachable by name rather than by a literal");
    ok("!! and the two steps are genuinely different numbers, so 'follows the operator' has content",
       sirtMod.stepFor(N, ang, nDet).step !== sirtMod.stepForUnmatched(N, ang, nDet).step,
       `matched ${sirtMod.stepFor(N, ang, nDet).step.toExponential(4)} against unmatched ` +
       `${sirtMod.stepForUnmatched(N, ang, nDet).step.toExponential(4)} -- a check that could not tell these ` +
       "apart would pass whichever operator stepFor was wired to");
}

// ---- 3. THE PAGE'S OWN NUMBERS, RE-DERIVED FROM THE PAGE'S OWN CONSTANTS ----------------------------------------------
//
// ct.html quotes a turn-round in its prose. If the code stops doing that, the page becomes a confident lie --
// so the SHAPE is re-derived here at the page's settings, and the assertion is about the shape, never a value.
{
    const html = fs.readFileSync(path.join(ENGINE, "ct.html"), "utf8");
    ok("ct.html imports the browser-safe module", /from "\.\/physics\/tomography\/reconOps\.mjs"/.test(html),
       "and imports NO module that carries a node: specifier");
    const badImport = [...html.matchAll(/from "\.\/physics\/tomography\/([^"]+)"/g)].map((m) => m[1])
        .filter((f) => f !== "ct.js" && f !== "reconOps.mjs");
    ok("!! ...and it imports NOTHING ELSE from physics/tomography", badImport.length === 0,
       badImport.length ? "IT IMPORTS " + badImport.join(", ") + " -- which a browser cannot resolve" : "ct.js + reconOps.mjs only");

    const N = 96, nDet = 130, nAngles = 30;
    const phantom = [{ cx: 0, cy: 0, a: 0.72, b: 0.9, rho: 1 }, { cx: -0.26, cy: 0.12, a: 0.22, b: 0.3, rho: -0.55 },
        { cx: 0.32, cy: -0.22, a: 0.16, b: 0.16, rho: 0.7 }, { cx: 0.08, cy: 0.46, a: 0.1, b: 0.1, rho: 0.9 },
        { cx: -0.1, cy: -0.4, a: 0.13, b: 0.08, rho: 0.5 }];
    const truth = phantomField(N, phantom), ang = angleSet(nAngles), sino = radon(truth, N, ang, nDet);
    const walk = (adj, iters) => {
        const step = powerStep(adj, N, ang, nDet).step, x = new Float64Array(N * N), rows = [];
        for (let k = 0; k <= iters; k++) {
            if (k % 300 === 0) rows.push({ k, res: residual(x, sino, N, ang, nDet), corr: scoreRecon(x, truth).corr });
            const ax = radon(x, N, ang, nDet);
            const r = ax.map((p, a) => { const q = new Float64Array(nDet); for (let d = 0; d < nDet; d++) q[d] = sino[a][d] - p[d]; return q; });
            const g = adj(r);
            for (let j = 0; j < x.length; j++) x[j] += step * g[j];
        }
        return rows;
    };
    const un = walk((y) => backProject(y, N, ang, nDet), 1200).slice(1);
    const ma = walk((y) => matchedBackProject(y, N, ang, nDet), 1200).slice(1);
    const bestUn = Math.min(...un.map((r) => r.res));
    ok("!! AT THE PAGE'S OWN SETTINGS the unmatched residual TURNS ROUND", un[un.length - 1].res > bestUn,
       "30 angles: " + un.map((r) => r.res.toFixed(2)).join(" -> ") + ", best " + bestUn.toFixed(2) +
       " -- so the page's prose describes what the code does");
    ok("!! ...and the matched one falls monotonically", ma.every((r, i) => i === 0 || r.res < ma[i - 1].res),
       ma.map((r) => r.res.toFixed(2)).join(" -> "));
    ok("...and the unmatched correlation falls with its residual", un[un.length - 1].corr < un[0].corr,
       un.map((r) => r.corr.toFixed(4)).join(" -> "));
    // *** THIS CHECK CAUGHT ME OVERCLAIMING, AND THE FIX IS THE FINDING. My first version asserted the matched
    // operator wins on correlation HERE too, and at 30 angles IT DOES NOT: 0.9835 against 0.9850. I had
    // misread my own table -- matched wins the RESIDUAL at 30 and loses the CORRELATION, which is v3616's
    // wrinkle HOLDING. What is actually true is better than either overclaim: THE CORRELATION COMPARISON
    // FLIPS WITH ANGLE COUNT while the residual comparison does not. That is asserted as the flip. ***
    ok("!! AT 30 ANGLES v3616's WRINKLE HOLDS: matched wins the RESIDUAL and LOSES the correlation",
       ma[ma.length - 1].res < un[un.length - 1].res && ma[ma.length - 1].corr < un[un.length - 1].corr,
       "residual " + ma[ma.length - 1].res.toFixed(2) + " < " + un[un.length - 1].res.toFixed(2) +
       " but correlation " + ma[ma.length - 1].corr.toFixed(4) + " < " + un[un.length - 1].corr.toFixed(4));
    const ang90 = angleSet(90), sino90 = radon(truth, N, ang90, nDet);
    const walk90 = (adj) => {
        const step = powerStep(adj, N, ang90, nDet).step, x = new Float64Array(N * N);
        for (let k = 0; k < 600; k++) {
            const ax = radon(x, N, ang90, nDet);
            const r = ax.map((p, a) => { const q = new Float64Array(nDet); for (let d = 0; d < nDet; d++) q[d] = sino90[a][d] - p[d]; return q; });
            const g = adj(r);
            for (let j = 0; j < x.length; j++) x[j] += step * g[j];
        }
        return { res: residual(x, sino90, N, ang90, nDet), corr: scoreRecon(x, truth).corr };
    };
    const u90 = walk90((y) => backProject(y, N, ang90, nDet)), m90 = walk90((y) => matchedBackProject(y, N, ang90, nDet));
    ok("!! AND AT 90 ANGLES IT REVERSES -- matched wins BOTH", m90.res < u90.res && m90.corr > u90.corr,
       "matched " + m90.res.toFixed(2) + " / " + m90.corr.toFixed(4) + " against " + u90.res.toFixed(2) + " / " +
       u90.corr.toFixed(4) + " -- SO THE CORRELATION COMPARISON FLIPS WITH ANGLE COUNT AND THE RESIDUAL ONE " +
       "DOES NOT. v3616's wrinkle is an effect of SPARSE ANGLES, measured at 16 and holding at 30, gone by 90.");
}

// ---- 4. THE PAGE IS REACHABLE, AND THE ANTIDOTE --------------------------------------------------------------------
//
// ANTIDOTE: if a future round gives reconOps a main block, section 1 goes RED -- PUT THE MAIN BLOCK IN A
// SEPARATE FILE rather than deleting the check, because the whole value of this module is that a browser can
// resolve every specifier in its graph. And if the page's quoted numbers stop matching, REWRITE THE PROSE to
// what section 3 measures; do not loosen section 3.
{
    const server = fs.readFileSync(path.join(ENGINE, "server.html"), "utf8");
    ok("ct.html is reachable from server.html", server.includes("ct.html"),
       "so this comparison has a door -- the page existed since v2814 and the modules built on it never did");
    // *** v3847 -- THE DEFAULT MOVED TO matchedBackProject, AND THIS CHECK NOW ACTUALLY TESTS WHICH OPERATOR
    // IT IS. *** The old form asserted `l.history.length === 2 && l.step > 0`, which is true of ANY operator --
    // it pinned that landweber RAN, not that it ran the one the sentence named. A check whose text names a
    // specific default while its condition cannot distinguish two defaults is a MENTION TEST, and it would
    // have stayed green through exactly the change this round makes.
    const N0 = 48, ang0 = angleSet(12);
    const sino0 = radon(phantomField(N0, [{ cx: 0, cy: 0, a: 0.6, b: 0.6, rho: 1 }]), N0, ang0, N0);
    const run = (adjoint) => landweber(sino0, N0, ang0, N0, { iters: 20, every: 10, adjoint });
    const dflt = run(null);
    const asMatched = run((r) => matchedBackProject(r, N0, ang0, N0));
    const asShipped = run((r) => backProject(r, N0, ang0, N0));
    const same = (a, b) => a.step === b.step && a.x.every((v, i) => v === b.x[i]);
    ok("!! landweber DEFAULTS TO matchedBackProject (v3847), asserted by IDENTITY of the result",
       same(dflt, asMatched) && !same(dflt, asShipped),
       `default step ${dflt.step.toExponential(3)} is bit-identical to the explicitly-matched run and ` +
       `DIFFERENT from the explicitly-unmatched one (${asShipped.step.toExponential(3)}). The old check here ` +
       "could not tell those apart -- it asserted only that the loop ran");
    ok("...and the old operator is still reachable by name, so the turn-round stays drivable",
       asShipped.step > 0 && asShipped.step !== asMatched.step,
       "pass `adjoint: backProject` -- v3616's finding is held on the record by sirt-selfcheck, not by prose");
}

console.log(fails ? "\nreconOps-selfcheck: " + fails + " FAILED" : "\nreconOps-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
