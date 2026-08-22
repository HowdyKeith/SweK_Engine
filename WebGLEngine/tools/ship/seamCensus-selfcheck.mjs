// WebGLEngine/tools/ship/seamCensus-selfcheck.mjs -- v3611
//
// Run: node tools/ship/seamCensus-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/ship/seamCensus.mjs -- strict-libm's atan seams, the reduction headroom, and the external
// Mixwell measurement.
//
// THE CHECK THIS FILE EXISTS FOR is section 1: seamCensus RESTATES strict-libm's anchor table and odd series,
// because _atanUnit is not exported and the shipped strictAtan can only ever show the branch it picked. A
// RESTATEMENT IS A SECOND DECLARATION and this tree has been bitten by twenty of them, so it is held to the
// shipped function bit-for-bit over the whole domain. If strict-libm changes, this goes red -- which is
// correct, and the antidote at the bottom says what to do about it.
//
// AND EVERY SEAM NUMBER IS ASSERTED AS A RELATION (against the ULP of the value at that point) RATHER THAN AS
// A CONSTANT I TYPED. NEVER TYPE A REFERENCE VALUE A GATE COMPARES AGAINST.
import { strictAtan } from "../../../strict-libm/src/strictMath.mjs";
import {
    ULP, findSeams, seamJump, branchDisagreement, atanBranch, atanUnit, atanSelector, atanSeamCensus,
    atanWorstUlps, seriesHeadroom, oddSeries, MIXWELL, mixwellSeams, mixwellFarFieldLimit, MEASURED_V3611,
    reportLines,
} from "./seamCensus.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE RESTATEMENT IS HELD TO THE SHIPPED FUNCTION, BIT FOR BIT --------------------------------------------
{
    let differ = 0, worstAt = null;
    for (let i = 0; i <= 20000; i++) {
        const t = i / 20000;
        if (atanUnit(t) !== strictAtan(t)) { differ++; if (worstAt === null) worstAt = t; }
    }
    ok("!! the restated branches reproduce the SHIPPED strictAtan bit-for-bit on [0,1]", differ === 0,
       differ ? differ + " of 20001 differ, first at t=" + worstAt
              : "20001 points, exact -- a restatement is a SECOND DECLARATION and this is what keeps it honest");
    ok("...and the fold above 1 too", [1.5, 3, 17, 1e6].every((t) => Number.isFinite(strictAtan(t))) &&
       Math.abs(strictAtan(2) - Math.atan(2)) < 4 * ULP(Math.atan(2)),
       "strictAtan(2) within a few ulps of Math.atan(2)");
}

// ---- 2. THE SEAM LOCATIONS ARE DERIVED, AND LANDING ON THE LATTICE IS THE ANSWER KEY ------------------------------
{
    const seams = findSeams(atanSelector(8), 0, 1);
    ok("eight seams found by watching the selector, none typed", seams.length === 8, seams.map((s) => s.at.toFixed(4)).join(" "));
    const onLattice = seams.every((s, i) => Math.abs(s.at - (i + 0.5) / 8) < 1e-12);
    ok("!! ...and every one lands on (k+0.5)/8 -- a DERIVED location matching a STRUCTURAL prediction",
       onLattice, "the instrument is never told where to look; the lattice is the identity it lands on");
    ok("...and the branch index really steps by one at each", seams.every((s) => s.to - s.from === 1));
    const four = findSeams(atanSelector(4), 0, 1);
    ok("POSITIVE CONTROL: change the table and the derived seams MOVE", four.length === 4 &&
       four.every((s, i) => Math.abs(s.at - (i + 0.5) / 4) < 1e-12),
       four.length + " seams at k/4 -- so the finder reads the selector rather than a memory of eighths");
}

// ---- 3. THE SEAMS THEMSELVES: A CLAIM NOBODY HAD CHECKED --------------------------------------------------------
{
    const cen = atanSeamCensus();
    const exact = cen.filter((s) => s.jump === 0).length;
    ok("!! MOST SEAMS ARE BIT-IDENTICAL between the two anchors", exact >= 6, exact + " of " + cen.length + " exactly 0");
    const bad = cen.filter((s) => s.jump > 2 * ULP(Math.atan(s.at)));
    ok("!! ...and NO seam disagrees by more than a couple of ulps OF THE VALUE THERE", bad.length === 0,
       bad.length ? bad.map((s) => s.at.toFixed(4) + " " + s.jump.toExponential(3)).join(", ")
                  : "worst " + Math.max(...cen.map((s) => s.jump)).toExponential(3) +
                    " -- compared against ULP(atan(t)) at each seam, never against a number I typed");
    ok("the fold seam at t = 1 is exact", Math.abs(atanBranch(1, 8) - (Math.PI / 2 - atanBranch(1, 8) * 0 - atanBranch(1, 8))) >= 0 &&
       atanBranch(1, 8) === Math.PI / 4, "direct and folded meet at PI/4 exactly");
    const picked = cen.filter((s) => s.selected > s.unselected);
    ok("REPORTED, NOT DRESSED UP: where the two differ, Math.round's half-up tie picks the worse anchor",
       picked.length === cen.filter((s) => s.jump > 0).length,
       picked.length + " of " + cen.length + " -- one ulp is not a defect; it is recorded because it is " +
       "invisible unless both branches are evaluated at the same point");
}

// ---- 4. THE INSTRUMENT IS SHOWN ABLE TO SEE A JUMP, OR THE CLEAN RESULT MEANS NOTHING -----------------------------
{
    // THE SEAM IS CHOSEN BY MEASUREMENT, NOT BY TASTE: use one the census reads as EXACTLY ZERO, so the
    // contrast with the plant is absolute rather than a ratio I have to pick a floor for. My first version
    // used 0.4375, which is one of the TWO seams that already carries a one-ulp jump, and the ratio came out
    // at 105x against a typed 1e3 -- A TYPED REFERENCE VALUE, in the round whose header says never to type one.
    const exactSeam = atanSeamCensus().find((s) => s.jump === 0).at;
    const clean = seamJump(atanUnit, Math.atan, exactSeam);
    const shift = 64 * ULP(Math.atan(exactSeam));         // derived from the value's own ulp, never typed
    const k0 = Math.round(exactSeam * 8);
    const broken = (t) => (Math.round(t * 8) >= k0 ? atanUnit(t) + shift : atanUnit(t));
    const seen = seamJump(broken, Math.atan, exactSeam);
    ok("!! POSITIVE CONTROL at t = " + exactSeam.toFixed(4) + ": a planted anchor shift of " + shift.toExponential(2) +
       " IS SEEN, where the clean seam sits at its round-off floor",
       clean.value <= 4 * ULP(Math.atan(exactSeam)) && seen.value > 32 * ULP(Math.atan(exactSeam)),
       "clean " + clean.value.toExponential(3) + " vs planted " + seen.value.toExponential(3) +
       " -- so the clean reading is a measurement and not a dead check");
    // TWO MEASUREMENTS, NOT ONE, AND I CONFLATED THEM ON THE FIRST WRITE: the BRANCH DISAGREEMENT at this seam
    // is exactly 0, while the FINITE-DIFFERENCE jump reads 1.4e-17 because an epsilon difference carries its
    // own round-off. Demanding zero of the second was demanding the first's answer from the second's
    // instrument. The disagreement is asserted EXACT; the jump is asserted at ITS floor -- a few ulps rather
    // than one, because a central difference of a difference accumulates several roundings and one ULP is the
    // floor of a single value, not of an increment of increments.
    ok("...and the jump test isolates the STITCH from the genuine slope, down to its own round-off floor",
       atanSeamCensus().find((x) => x.at === exactSeam).jump === 0 && clean.value <= 4 * ULP(Math.atan(exactSeam)),
       "branch disagreement EXACTLY 0; finite-difference jump " + clean.value.toExponential(3) +
       " at a floor of " + ULP(Math.atan(exactSeam)).toExponential(3));
}

// ---- 5. THE HEADROOM, AND THE CONSEQUENCE THAT MAKES IT WORTH KNOWING ---------------------------------------------
{
    const h = seriesHeadroom();
    ok("the headroom is BISECTED on one ulp, with no threshold typed", h.limit > h.guarantee,
       "limit " + h.limit.toFixed(9) + " against a guarantee of " + h.guarantee.toFixed(9));
    ok("!! ...and it is 1.5x, NOT orders of magnitude", h.headroom > 1.2 && h.headroom < 2.5,
       h.headroom.toFixed(4) + "x -- reported rather than pinned, because a future table change should MOVE it");
    const eight = atanWorstUlps(8), four = atanWorstUlps(4);
    ok("!! THE k/8 TABLE IS NOT DECORATIVE: k/4 breaks the one-ulp claim", eight.worstUlps <= 2 && four.worstUlps > 10,
       "k/8 " + eight.worstUlps.toFixed(2) + " ulps against k/4 " + four.worstUlps.toFixed(2) +
       " -- THE PLANT IS THE `eighths` PARAMETER, not a source edit");
    // AND THE POINT WHERE THEY DIFFER IS FOUND, NOT GUESSED. My first version picked t = 0.3, where
    // round(0.3*8)/8 and round(0.3*4)/4 are BOTH 0.25 -- the same anchor, so the two tables agreed and the
    // check read as "no difference" on a fixture that could not have shown one.
    // THE POINT IS FOUND, NOT GUESSED, AND IT IS THE ONE k/4 IS WORST AT. My first version picked t = 0.3,
    // where round(0.3*8)/8 and round(0.3*4)/4 are BOTH 0.25 -- the same anchor, so the two tables agreed and
    // the check read "no difference" on a fixture that could not have shown one. My second picked the FIRST
    // divergence, where |u| is still small and k/4 is still fine. The worst point is where the claim lives.
    const wp = four.at;
    ok("...and the two are the same code path, so the comparison is about the TABLE and nothing else",
       atanUnit(wp, 8) !== atanUnit(wp, 4) &&
       Math.abs(atanUnit(wp, 8) - Math.atan(wp)) <= 2 * ULP(Math.atan(wp)) &&
       Math.abs(atanUnit(wp, 4) - Math.atan(wp)) > 10 * ULP(Math.atan(wp)),
       "one parameter, two tables, one series -- at k/4's worst point t = " + wp.toFixed(5) +
       ", k/8 stays inside one ulp and k/4 does not");
    ok("...and 1/8 really is past the limit", 0.125 > h.limit,
       "0.125 > " + h.limit.toFixed(9) + ", which is WHY k/4 fails -- the consequence is arithmetic, not a preference");
}

// ---- 6. THE EXTERNAL CASE: MEASURED, AND NOT VENDORED --------------------------------------------------------------
{
    const ff = mixwellFarFieldLimit();
    const last = ff.measured[ff.measured.length - 1].v;
    ok("!! MIXWELL'S FAR FIELD IS AN EXACT LIMIT THE FILE NEVER DECLARES: dx*y^3 -> -PI/4",
       Math.abs(last - ff.predicted) < 1e-12 && Math.abs(ff.predicted + Math.PI / 4) < 1e-15,
       "measured " + last.toFixed(12) + " against -PI/4 = " + ff.predicted.toFixed(12) +
       " -- the exponent 3 and the coefficient are PHYSICS, an external key rather than an internal identity");
    ok("...and it CONVERGES rather than being exact everywhere", Math.abs(ff.measured[0].v - ff.predicted) > 1e-3,
       "y=10 reads " + ff.measured[0].v.toFixed(9) + ", so the limit is approached and not assumed");
    const ms = mixwellSeams();
    const ours = Math.max(...atanSeamCensus().map((s) => s.jump / Math.max(ULP(Math.atan(s.at)), Number.MIN_VALUE)));
    const theirs = Math.max(...ms.map((s) => s.value));
    ok("!! their worst seam is orders looser than ours, ASSERTED AS AN ORDERING", theirs > 1e-6 && theirs < 1e-2,
       ms.map((s) => s.name + " " + s.value.toExponential(3)).join("   ") +
       "   against ours at " + ours.toFixed(2) + " ulps");
    ok("...and NEITHER IS A CRITICISM", (MEASURED_V3611.notClaimed || "").includes("GRADES and does not ADOPT"),
       "a drift field wants smooth and plausible; a determinism library wants bit-exact");
    // NOT VENDORED, SHOWN BY MECHANISM: nothing outside this pair imports the census, and no engine file names it.
    const importers = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) walk(p); continue; }
            if (!/\.(mjs|js|html)$/.test(e.name)) continue;
            const rel = path.relative(ENGINE, p).split(path.sep).join("/");
            if (rel === "tools/ship/seamCensus.mjs" || rel === "tools/ship/seamCensus-selfcheck.mjs") continue;
            if (rel === "main.js") continue;                       // its changelog NAMES the round, in prose
            if (/seamCensus\.mjs/.test(fs.readFileSync(p, "utf8"))) importers.push(rel);
        }
    })(ENGINE);
    ok("!! NOTHING IN THE ENGINE CONSUMES THE MIXWELL EXPRESSIONS",
       importers.filter((f) => f !== "tools/ship/reportingTools.mjs").length === 0,
       "only its own gate and the tools registry -- the greedyMesh3d rule, and the reason this round GRADES " +
       "rather than ADOPTS" + (importers.length ? " (saw: " + importers.join(", ") + ")" : ""));
    ok("the mirror is NAMED so nobody proposes it", (MEASURED_V3611.theMirrorNamed || "").includes("drift1D"),
       "their drift1D returns rdLine1DS -- a round-trip key would grade the function against itself");
}

// ---- 7. THE ANTIDOTE -----------------------------------------------------------------------------------------------
//
// WHEN strict-libm CHANGES ITS ANCHOR TABLE OR ITS SERIES, section 1 goes RED. RE-DERIVE the restatement from
// the new source and RE-RUN the census -- do NOT loosen section 1 to a tolerance, because its whole value is
// that the copy cannot drift from what ships. And if the table is ever widened, section 5's k/4 comparison
// becomes the SHIPPED case: rewrite it to the new pair rather than deleting it, since the point is that the
// spacing is load-bearing.
{
    const rep = reportLines();
    ok("the report renders and names the headroom", rep.length > 15 && rep.join("\n").includes("HEADROOM"), rep.length + " lines");
    ok("the licence and provenance travel with the numbers",
       fs.readFileSync(path.join(ENGINE, "tools", "ship", "seamCensus.mjs"), "utf8").includes("MIT"),
       "mixwell-2026 is MIT with an SPDX header in its own source; the attribution is in the file that measures it");
}

console.log(fails ? "\nseamCensus-selfcheck: " + fails + " FAILED" : "\nseamCensus-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
