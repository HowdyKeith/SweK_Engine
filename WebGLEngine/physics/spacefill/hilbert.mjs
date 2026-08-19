// WebGLEngine/physics/spacefill/hilbert.mjs -- v3187
//
// A SINGLE CONTINUOUS STROKE THAT FILLS A REGION, CORRECT BY CONSTRUCTION.
//
// Keith raised tanguymagne/SLDgen -- single-line drawing generation, ETH Zurich, CGF 2026 -- and asked whether
// it could be a formula for a DETERMINISTIC test. Its real contribution is the phrase "a single continuous
// stroke BY DESIGN": the representation makes a break UNREPRESENTABLE rather than checking for one and
// rejecting it. That is wyrm_math's principle, adopted here at v3100, arrived at independently in a third
// domain.
//
// *** BUT SLDgen ITSELF CANNOT BE THE TEST. *** It optimises a B-spline by SCORE DISTILLATION SAMPLING against
// a text-to-image diffusion model: a large dependency, and a STOCHASTIC objective. v3186 froze 171 lab
// observables on EXACT equality; a diffusion-guided curve fitter would be the one thing in this tree that
// could not be frozen.
//
// THE DETERMINISTIC FORM OF THE SAME IDEA IS A SPACE-FILLING CURVE. One unbroken stroke, every cell visited
// exactly once, no dependency, no seed, and an ANALYTIC answer key rather than a reference image.
//
// *** AND THE INTERESTING PROPERTY IS NOT COVERAGE, IT IS LOCALITY -- WHICH IS WHY THE FAILING CASE MATTERS. ***
// A RASTER SCAN also visits every cell exactly once. It is a perfectly good fill and a terrible stroke: at the
// end of every row it JUMPS THE WIDTH OF THE GRID. Coverage cannot tell the two apart; adjacency can, exactly.

/** d -> (x, y) on a 2^order grid. The classic bit-rotation construction: no tables, no recursion, no floats. */
export function d2xy(order, d) {
    const n = 1 << order;
    let rx, ry, t = d, x = 0, y = 0;
    for (let s = 1; s < n; s *= 2) {
        rx = 1 & Math.floor(t / 2);
        ry = 1 & (t ^ rx);
        // The rotation is what makes consecutive d land in ADJACENT cells. It is the whole curve.
        if (ry === 0) {
            if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
            const tmp = x; x = y; y = tmp;
        }
        x += s * rx;
        y += s * ry;
        t = Math.floor(t / 4);
    }
    return [x, y];
}

/** (x, y) -> d. Kept because a curve you can only walk forward is not a mapping. */
export function xy2d(order, x, y) {
    const n = 1 << order;
    let rx, ry, d = 0;
    for (let s = n / 2; s > 0; s = Math.floor(s / 2)) {
        rx = (x & s) > 0 ? 1 : 0;
        ry = (y & s) > 0 ? 1 : 0;
        d += s * s * ((3 * rx) ^ ry);
        if (ry === 0) {
            if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
            const tmp = x; x = y; y = tmp;
        }
    }
    return d;
}

/** The whole stroke, in order. */
export function hilbertPath(order) {
    const n = 1 << order, out = new Array(n * n);
    for (let d = 0; d < n * n; d++) out[d] = d2xy(order, d);
    return out;
}

/** THE FAILING CASE, DRAWN ON PURPOSE (v3179's rule). Same coverage, no locality. */
export function rasterPath(order) {
    const n = 1 << order, out = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out.push([x, y]);
    return out;
}

/**
 * Measure a path against the two things that make it a STROKE rather than a LIST.
 *
 * Adjacency is EXACT -- Manhattan distance 1 -- not "small on average". A curve with one break is not a
 * single-line drawing, and an average would let it hide among thousands of good steps. THE COUNT OF BREAKS IS
 * THE MEASUREMENT, and for a raster scan it is exactly n - 1, DERIVABLE rather than observed.
 */
export function strokeStats(path) {
    const cells = new Set();
    let breaks = 0, worstJump = 0;
    for (let i = 0; i < path.length; i++) {
        const [x, y] = path[i];
        cells.add(x + "," + y);
        if (i === 0) continue;
        const [px, py] = path[i - 1];
        const jump = Math.abs(x - px) + Math.abs(y - py);
        if (jump !== 1) breaks++;
        if (jump > worstJump) worstJump = jump;
    }
    return {
        steps: path.length,
        distinct: cells.size,
        // A CELL VISITED TWICE AND A CELL MISSED CANCEL IN A TOTAL. Reporting both separately is the v3069
        // lesson: an aggregate is invariant under a shift.
        revisits: path.length - cells.size,
        breaks, worstJump,
        continuous: breaks === 0,
    };
}
