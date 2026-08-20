// WebGLEngine/tools/render-qa/mesostructure.mjs
// VERSION: v1 -- v3253
//
// WHAT A HEIGHTFIELD CANNOT SAY, DEMONSTRATED RATHER THAN ASSERTED.
//
// Keith: "tessellation makes it possible to add non-height field mesostructural details to geometry."
//
// *** THAT SENTENCE NAMES THE EXACT BOUNDARY pom-demo.html LIVES ON, AND pom-demo NEVER SAYS SO. *** Parallax
// occlusion mapping displaces along a HEIGHTFIELD -- h(u,v), ONE HEIGHT PER TEXEL. A function cannot return two
// values, so an overhang, a hole you can see through, and an undercut are not "hard" for POM, they are
// UNREPRESENTABLE. And the silhouette never moves: the quad's outline stays a quad however deep the interior
// looks.
//
// THE BROWSER HAS NO TESSELLATION STAGE. Neither WebGL2 nor WebGPU exposes one, so the technique as Keith quoted
// it is not something SweK is choosing not to do -- it is unavailable. THE CAPABILITY, THOUGH, IS ALREADY HERE:
// a voxel DDA marches a VOLUME, and a volume has no one-height-per-texel restriction. voxelDDA has done
// non-heightfield mesostructure since v2782.
//
// *** SO THIS MODULE IS NOT A NEW RENDERER. IT IS THE PROOF THAT THE TWO DIFFER, AND WHERE. *** Both tracers
// below run over THE SAME VOLUME, in plain JavaScript, at small resolution, so the difference is a gate and not
// a screenshot -- no GPU, no browser, no eyeballing.

/**
 * A tiny voxel volume with an OVERHANG: a roof slab floating above a floor slab, with air between them.
 *
 * THE FIXTURE IS THE ARGUMENT. A column through the middle enters solid, leaves it, and enters it again -- so
 * along that column the surface has TWO heights. Any heightfield must pick one and lose the other, and that is
 * the whole claim rendered as data rather than prose.
 */
export function overhangVolume({ w = 24, h = 16, d = 1 } = {}) {
    const solid = new Uint8Array(w * h * d);
    const at = (x, y, z = 0) => (z * h + y) * w + x;
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
        for (let y = 0; y < 3; y++) solid[at(x, y, z)] = 1;                 // floor
        if (x >= 6 && x < 18) for (let y = 10; y < 13; y++) solid[at(x, y, z)] = 1;   // roof, with air under it
    }
    return { w, h, d, solid, at };
}

/**
 * The heightfield a POM shader would sample: for each column, the HIGHEST solid cell.
 *
 * *** THIS IS WHERE THE INFORMATION IS LOST, AND IT IS LOST HERE RATHER THAN IN THE TRACER. *** Building the
 * heightfield is a projection from a volume to a function, and the projection is lossy BEFORE any shading
 * happens -- so no amount of stepping, refinement or silhouette clipping in the tracer can recover it.
 */
export function heightFieldOf(vol) {
    const { w, h, solid, at } = vol;
    const top = new Int32Array(w).fill(-1);
    for (let x = 0; x < w; x++) for (let y = h - 1; y >= 0; y--) {
        if (solid[at(x, y)]) { top[x] = y; break; }
    }
    return top;
}

/** Solid cells the heightfield claims: everything at or below the top. That is the definition of a heightfield. */
export function heightFieldSolid(vol, top) {
    const { w, h, at } = vol;
    const out = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) for (let y = 0; y <= top[x]; y++) out[at(x, y)] = 1;
    return out;
}

/**
 * Compare what the volume actually contains against what a heightfield can express.
 *
 * @returns { cells, solidCells, hfSolid, invented, lost, faithful }
 *
 * TWO ERRORS, KEPT APART, BECAUSE THEY ARE DIFFERENT FAILURES. `lost` is solid the heightfield cannot represent
 * (a roof above air is fine, but the AIR UNDER IT is what disappears). `invented` is space the heightfield fills
 * in that the volume left empty -- the cavity beneath an overhang, packed solid so the column has one surface.
 * A single "error" count would average a hole that vanished against a hole that was never there.
 */
export function heightFieldFidelity(vol) {
    const { w, h, solid, at } = vol;
    const top = heightFieldOf(vol);
    const hf = heightFieldSolid(vol, top);
    let invented = 0, lost = 0, solidCells = 0;
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
        const s = solid[at(x, y)], f = hf[at(x, y)];
        if (s) solidCells++;
        if (!s && f) invented++;
        if (s && !f) lost++;
    }
    return { cells: w * h, solidCells, hfSolid: hf.reduce((a, b) => a + b, 0), invented, lost,
             faithful: invented === 0 && lost === 0 };
}

/**
 * March a ray straight down a column and return EVERY surface crossing.
 *
 * A heightfield answers "where is the surface" with ONE number. A volume answers with a LIST -- and the length
 * of that list is the property under test. `columnsWithMultipleSurfaces` is the count that makes the claim
 * concrete: those are exactly the columns no heightfield can describe.
 */
export function surfaceCrossings(vol, x) {
    const { h, solid, at } = vol;
    const hits = [];
    let prev = 0;
    for (let y = h - 1; y >= 0; y--) {
        const s = solid[at(x, y)] ? 1 : 0;
        if (s !== prev) hits.push({ y, kind: s ? "enter" : "exit" });
        prev = s;
    }
    return hits;
}

export function columnsWithMultipleSurfaces(vol) {
    let n = 0;
    for (let x = 0; x < vol.w; x++) if (surfaceCrossings(vol, x).filter((c) => c.kind === "enter").length > 1) n++;
    return n;
}

/** A one-line receipt, in the shape this tree writes them. */
export function mesoReceipt(vol) {
    const f = heightFieldFidelity(vol);
    const cols = columnsWithMultipleSurfaces(vol);
    if (f.faithful) {
        return f.cells + " cells, heightfield is EXACT here -- this volume has no overhang to lose. " +
               "A faithful reading is not evidence the technique is sufficient, only that this fixture is flat.";
    }
    return f.cells + " cells, " + f.solidCells + " solid. A heightfield INVENTS " + f.invented +
           " and LOSES " + f.lost + "; " + cols + " of " + vol.w + " columns have more than one surface, " +
           "which is the number no h(u,v) can represent.";
}

// ---- THE TWO TRACERS, SO THE DIFFERENCE IS AN IMAGE AND NOT AN ARGUMENT -------------------------------------------------
//
// v3253 proved the boundary in DATA. This renders it -- in PLAIN JAVASCRIPT at small resolution, deliberately,
// so the comparison is a GATE rather than a rig job. A WebGL version would look better and could not be checked
// here at all, and the property under test is geometric, not shaded.
//
// *** BOTH TRACERS SHARE EVERYTHING EXCEPT THE THING BEING COMPARED. *** Same volume, same camera, same ray
// direction, same shading rule, same resolution. If they differed in ANY of those, the diff would measure the
// setup and I would report it as a fact about heightfields -- which is the failure mode of every side-by-side
// ever published.

const AIR = [8, 20, 14, 255];

/** Lambert-ish shade from the surface normal's y, so a floor reads brighter than a wall. Shared by both. */
function shade(ny, depth, maxDepth) {
    const lit = 0.35 + 0.65 * Math.max(0, ny);
    const fog = 1 - 0.55 * (depth / Math.max(1, maxDepth));
    const v = Math.round(255 * lit * fog);
    return [Math.round(v * 0.55), v, Math.round(v * 0.7), 255];
}

/**
 * March a camera ray THROUGH THE VOLUME. Overhangs, holes and undercuts are ordinary cases here: the ray simply
 * keeps stepping until it finds solid, and "solid" is a lookup, not a comparison against a single height.
 */
export function traceVolume(vol, { W = 96, H = 64 } = {}) {
    const { w, h, solid, at } = vol;
    const img = new Uint8ClampedArray(W * H * 4);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        // A gentle oblique ray so an overhang is actually in front of the space beneath it.
        const x0 = (px / W) * w, y0 = (py / H) * h;
        let hitY = -1, steps = 0;
        for (let t = 0; t < h * 2; t++) {
            const x = Math.floor(x0 + t * 0.35), y = Math.floor(y0 - t * 0.5);
            if (x < 0 || x >= w || y < 0 || y >= h) break;
            steps++;
            if (solid[at(x, y)]) { hitY = y; break; }
        }
        const o = (py * W + px) * 4;
        const c = hitY < 0 ? AIR : shade(1 - (hitY / h), steps, h * 2);
        img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; img[o + 3] = 255;
    }
    return img;
}

/**
 * The same ray, against the HEIGHTFIELD derived from the same volume -- which is what a POM shader samples.
 *
 * The ONLY line that differs from traceVolume is the occupancy test: `y <= top[x]` instead of a volume lookup.
 * EVERYTHING ELSE IS THE SAME CODE PATH, so the diff between the two images is the projection and nothing else.
 */
export function traceHeightfield(vol, { W = 96, H = 64 } = {}) {
    const { w, h } = vol;
    const top = heightFieldOf(vol);
    const img = new Uint8ClampedArray(W * H * 4);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const x0 = (px / W) * w, y0 = (py / H) * h;
        let hitY = -1, steps = 0;
        for (let t = 0; t < h * 2; t++) {
            const x = Math.floor(x0 + t * 0.35), y = Math.floor(y0 - t * 0.5);
            if (x < 0 || x >= w || y < 0 || y >= h) break;
            steps++;
            if (y <= top[x]) { hitY = y; break; }        // <-- THE ONLY DIFFERENCE
        }
        const o = (py * W + px) * 4;
        const c = hitY < 0 ? AIR : shade(1 - (hitY / h), steps, h * 2);
        img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; img[o + 3] = 255;
    }
    return img;
}
