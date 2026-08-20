// WebGLEngine/physics/mesh/svgProfile-selfcheck.mjs -- v2982
//
// Run: node physics/mesh/svgProfile-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/mesh/svgProfile.mjs -- an SVG profile as wind-tunnel input.
//
// WHY IT IS BETTER INPUT THAN THE GLB PATH, AND THIS IS THE WHOLE POINT. v2874 added GLB -> voxelise ->
// cross-section, and it has to carry a caveat on screen forever: the tunnel is 2D, so the Cd belongs to the
// SLICE and not the body -- a sphere's mid-slice is a cylinder whose Cd is roughly double. AN SVG PROFILE HAS NO
// SUCH CAVEAT, because it IS the 2D shape being tested. Draw an aerofoil, test the aerofoil.
//
// THE KEY THAT MAKES IT AN INSTRUMENT: the tunnel builds its built-in cylinder from a distance comparison,
// (x-cx)^2+(y-cy)^2 <= r^2. An SVG <circle> of the same radius reaches the same answer by TEXT PARSING and
// POLYGON RASTERISATION -- no shared code, no shared arithmetic. They must agree CELL FOR CELL.
import { parseSVG, rasterProfile, profileFromSVG, profileArea, inPolygon, bounds } from "./svgProfile.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE EXACT AREA KEYS ----------------------------------------------------------------------------------
{
    const r = 40, svg = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="' + r + '"/></svg>';
    const errAt = (n) => Math.abs(profileArea(profileFromSVG(svg, { nx: n, ny: n, pad: 0.05 })) / (Math.PI * r * r) - 1);
    ok("!! an SVG circle rasterises to pi r^2", errAt(128) < 2e-3,
       "128^2 err " + (100 * errAt(128)).toFixed(3) + "% against " + (Math.PI * r * r).toFixed(2));
    ok("...and a coarse grid is already close", errAt(64) < 5e-3, (100 * errAt(64)).toFixed(3) + "% at 64^2");

    const rect = '<svg><rect x="10" y="20" width="30" height="15"/></svg>';
    const a = profileArea(profileFromSVG(rect, { nx: 200, ny: 200, pad: 0.05 }));
    ok("a rect rasterises to w*h", Math.abs(a / 450 - 1) < 0.01, a.toFixed(3) + " vs exactly 450");

    const tri = '<svg><polygon points="0,0 40,0 0,30"/></svg>';
    const ta = profileArea(profileFromSVG(tri, { nx: 300, ny: 300, pad: 0.05 }));
    ok("a triangle rasterises to base*height/2", Math.abs(ta / 600 - 1) < 0.02, ta.toFixed(2) + " vs exactly 600");
}

// ---- 2. THE CROSS-CHECK: two independent routes to one circle -------------------------------------------------------
{
    const NX = 220, NY = 82, CX = NX * 0.25, CY = NY / 2, D = 18;
    const analytic = (x, y) => ((x - CX) ** 2 + (y - CY) ** 2) <= (D / 2) ** 2;
    const p = profileFromSVG('<svg><circle cx="' + CX + '" cy="' + CY + '" r="' + (D / 2) + '"/></svg>',
                             { nx: NX, ny: NY, lo: [0, 0], hi: [NX, NY] });
    let diff = 0, aCount = 0;
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
        const a = analytic(x + 0.5, y + 0.5);
        if (a) aCount++;
        if (a !== p.solidAt(x, y)) diff++;
    }
    ok("!! an SVG circle matches the tunnel's ANALYTIC cylinder CELL FOR CELL", diff === 0,
       NX * NY + " cells, " + diff + " disagreements -- text parsing plus polygon rasterisation against a distance comparison, no shared code");
    ok("...and both find the same number of solid cells", p.filled === aCount, p.filled + " vs " + aCount);
    ok("...on a grid big enough for the agreement to mean something", aCount > 200, aCount + " solid cells");
}

// ---- 3. IT REFUSES WHAT IT CANNOT DO, BY NAME ------------------------------------------------------------------------
//
// A silently dropped curve or an unapplied transform would voxelise to a plausible body and produce a confident
// wrong drag -- which is exactly the failure this lab refuses everywhere else.
{
    const refuses = (svg, re) => { try { parseSVG(svg); return false; } catch (e) { return re.test(e.message); } };
    ok("!! a curve command is REFUSED, not dropped", refuses('<svg><path d="M0,0 C10,10 20,20 30,0"/></svg>', /curve/i),
       "a dropped curve would still voxelise to something plausible");
    ok("!! a transform is REFUSED, not ignored", refuses('<svg><rect transform="translate(5,5)" width="10" height="10"/></svg>', /transform/i),
       "applying it wrongly would move the body inside the tunnel without saying so");
    ok("a non-SVG is refused", refuses("hello", /not an SVG/i));
    ok("an SVG with no usable shape is refused", refuses('<svg><text>hi</text></svg>', /no usable shape/i));
    ok("...and straight-segment paths are ACCEPTED", parseSVG('<svg><path d="M0,0 L10,0 L10,10 Z"/></svg>').polys.length === 1);
}

// ---- 4. it drops into the tunnel's existing solid slot unchanged ----------------------------------------------------------
{
    const p = profileFromSVG('<svg><circle cx="50" cy="50" r="20"/></svg>', { nx: 60, ny: 40 });
    ok("!! it returns the SAME shape crossSection() does", typeof p.solidAt === "function" && "filled" in p && "cell" in p && "lo" in p && "hi" in p,
       "so the tunnel does not need to know which produced its solid");
    ok("solidAt is a usable predicate", p.solidAt(30, 20) === true && p.solidAt(0, 0) === false);
    ok("even-odd handles a hole", (() => {
        const donut = profileFromSVG('<svg><circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="15"/></svg>', { nx: 200, ny: 200, pad: 0.05 });
        const ring = Math.PI * (30 * 30 - 15 * 15);
        return Math.abs(profileArea(donut) / ring - 1) < 0.02;
    })(), "an inner circle inside an outer one is a HOLE, not a doubled fill");
}

console.log(fails ? "\nsvgProfile-selfcheck: " + fails + " FAILED" : "\nsvgProfile-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
