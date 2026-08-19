// WebGLEngine/tools/ship/canvasFill-selfcheck.mjs -- v2872
//
// Run: node tools/ship/canvasFill-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES that a lab page's canvas actually uses the page it is on.
//
// THE COMPLAINT: "the viewport is very small to see the action". It was. wind-tunnel drew a 110x41 lattice into a
// canvas nailed to 440x164 inside a WRAPPING flex row, so the vortex street occupied about a fifth of a 1080p
// screen while a 260px column of notes sat beside it taking equal billing.
//
// TWO KINDS OF CANVAS, OPPOSITE FIXES, AND THE DISTINCTION IS THE POINT:
//
//   A FIELD (wind-tunnel, ising, fanbeam, ct, interferometer) has a backing store that IS the simulation grid --
//   one pixel per cell, which is the honest resolution. Enlarge the DISPLAY and keep image-rendering: pixelated.
//   Enlarging the BACKING STORE would invent detail the simulation does not have, which is the prettier-than-true
//   move this lab exists to refuse. So this gate asserts field pages keep their grid-sized store AND get
//   pixelated -- widening one without the other is the failure.
//
//   A PLOT (kepler, schrodinger, splat-lab) is a drawing. pixelated on a curve is just jagged. So those scale
//   WITHOUT it.
//
// AND IT IS A RATCHET. Every 2D lab page must be responsive, so the next page cannot ship as a postage stamp.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const read = (f) => fs.readFileSync(path.join(ENG, f), "utf8");

// Pages whose canvas is the SIMULATION GRID itself.
const FIELD = ["wind-tunnel.html", "ising.html", "fanbeam.html", "ct.html", "interferometer.html"];
// Pages whose canvas is a DRAWING.
const PLOT = ["kepler.html", "schrodinger.html", "splat-lab.html", "logistic.html", "kerr.html", "fresnel.html", "geodesic.html", "diffraction.html"];
const ALL = FIELD.concat(PLOT);

// ---- 1. every lab page's canvas grows with the page ------------------------------------------------------------
{
    const notResponsive = ALL.filter((f) => {
        if (!fs.existsSync(path.join(ENG, f))) return false;
        return !/width:\s*100%/.test(read(f));
    });
    ok("!! EVERY 2D lab canvas is responsive", notResponsive.length === 0,
       notResponsive.length ? "STILL FIXED-SIZE: " + notResponsive.join(", ") : ALL.length + " pages checked");
}

// ---- 2. FIELD pages keep the grid as the backing store and stay pixelated ----------------------------------------
{
    for (const f of FIELD) {
        if (!fs.existsSync(path.join(ENG, f))) continue;
        const s = read(f);
        ok(f + ": pixelated (a cell must stay a square)", /image-rendering:\s*pixelated/.test(s),
           "interpolating a lattice smears cells into detail the simulation never computed");
    }
    // wind-tunnel is the one that prompted this, so it gets the specific check.
    const wt = read("wind-tunnel.html");
    ok("!! wind-tunnel's backing store is STILL the grid, not inflated", /width="440" height="164"/.test(wt),
       "the fix is a bigger DISPLAY, not a bigger buffer -- the lattice is 110x41 and that is all the detail there is");
    ok("...the view column GROWS while the controls stay fixed", /#view \{ flex: 1 1 0/.test(wt) && /#side \{ flex: 0 0/.test(wt),
       "a slider gains nothing from being wider; a flow field gains everything");
    ok("...min-width:0 on the flex child", /min-width:\s*0/.test(wt),
       "without it a flex child refuses to shrink below its content and the layout silently stops responding");
    ok("...and the sidebar drops under on a narrow screen", /@media \(max-width: 900px\)/.test(wt));
}

// ---- 3. PLOT pages must NOT be pixelated ---------------------------------------------------------------------------
{
    for (const f of ["kepler.html", "schrodinger.html", "splat-lab.html"]) {
        if (!fs.existsSync(path.join(ENG, f))) continue;
        const s = read(f);
        const rule = (s.match(/canvas\s*\{[^}]*\}/g) || []).join(" ");
        ok(f + ": a drawing is NOT pixelated", !/image-rendering:\s*pixelated/.test(rule),
           "pixelated on a curve is just jagged -- the opposite prescription from a lattice");
    }
}

// ---- 4. aspect ratio is preserved -- a tunnel at the wrong aspect is a lie about the flow ---------------------------
{
    const bad = ALL.filter((f) => {
        if (!fs.existsSync(path.join(ENG, f))) return false;
        const s = read(f);
        if (!/width:\s*100%/.test(s)) return false;
        const rule = (s.match(/canvas\s*\{[^}]*\}/g) || []).join(" ");
        return !/height:\s*auto/.test(rule) && !/aspect-ratio/.test(rule);
    });
    ok("!! aspect ratio is held on every scaled canvas", bad.length === 0,
       bad.length ? "STRETCHED: " + bad.join(", ") : "height:auto or aspect-ratio everywhere");
}

// ---- 5. the shared helper exists and documents the distinction --------------------------------------------------------
{
    const h = read("ui/fitCanvas.js");
    ok("ui/fitCanvas.js exists with both modes", /export function fitField/.test(h) && /export function fitPlot/.test(h));
    // Whitespace-normalised: my first version of this check failed because the sentence it looks for WRAPS
    // across two comment lines. A gate that is brittle about line breaks fails on formatting, not on substance.
    // Strip the leading // from each comment line BEFORE flattening -- otherwise the marker lands mid-sentence
    // ("would invent // detail the simulation...") and the match fails for a reason that has nothing to do with
    // whether the reason is actually recorded. Second time this session a check of mine tripped on formatting.
    const hFlat = h.replace(/^\s*\/\/ ?/gm, "").replace(/\s+/g, " ");
    ok("!! ...and records WHY they differ", /invent detail the simulation does not have/.test(hFlat),
       "the reason is the whole content of the decision; without it the next page picks the wrong one");
    ok("fitPlot is devicePixelRatio aware", /devicePixelRatio/.test(h),
       "a 1:1 backing store on a HiDPI screen looks soft for reasons that have nothing to do with the maths");
    ok("fitPlot returns a detach function", /removeEventListener/.test(h),
       "a page that swaps views must not leak a resize listener");
}

// ---- 6. THE TREE-WIDE SWEEP. v2872 fixed the LAB pages; Keith asked what else was small, and the answer was
//         nineteen more -- reaction-diffusion, cellular automata, slime mould, the brain mazes, the box3d demos,
//         AudioLab, kriging, pachinko. The lab was never the whole problem, it was just the part I had looked at.
//
//         So the ratchet is now TREE-WIDE: any page with a fixed-size canvas and no way to grow is named.
{
    const SKIP = /node_modules|[\\/]\.git|vendor|GPU_Assets|demos_code/;
    const walk = (d, out = []) => {
        for (const f of fs.readdirSync(d)) {
            const p = path.join(d, f);
            if (SKIP.test(p)) continue;
            const st = fs.statSync(p);
            if (st.isDirectory()) walk(p, out);
            else if (/\.html$/.test(f)) out.push(p);
        }
        return out;
    };

    // WEBGL PAGES ARE DELIBERATELY EXEMPT, and this is a judgement rather than an oversight. On a WebGL canvas the
    // drawing buffer and the display size are independent, so a small buffer stretched across a big element is
    // exactly what "render at lower resolution" means -- a PERFORMANCE CHOICE a raymarcher may have made on
    // purpose. Widening those blind would trade someone's frame rate for someone else's screen real estate
    // without asking. They are listed so the exemption is visible instead of silent.
    // volume-cache.html (v3041) is exempt for a DIFFERENT reason than the four above, and the distinction matters:
    // it is not a performance tradeoff, it is a measurement constraint. That page renders the SAME volume through
    // two bindings side by side and then compares the two drawing buffers pixel by pixel. The comparison is only
    // meaningful if both buffers are the same fixed size, so a canvas that grew with the window would silently
    // destroy the thing the page exists to measure.
    const WEBGL_EXEMPT = ["sinogram-gpu.html", "benchmark.html", "raymarch-gl-demo.html", "pom-demo.html", "volume-cache.html",
        // raymarch-live.html (v3045): a fixed drawing buffer is the resolution/perf tradeoff the other four make
        // -- a per-pixel DDA over a 64x64x64 volume scales with pixel count and nothing else.
        "raymarch-live.html"];

    const offenders = [];
    for (const p of walk(ENG)) {
        const base = path.basename(p);
        if (WEBGL_EXEMPT.includes(base)) continue;
        const h = fs.readFileSync(p, "utf8");
        const tags = [...h.matchAll(/<canvas[^>]*>/gi)];
        if (!tags.length) continue;
        const sized = tags.some((t) => /width="\d+"/.test(t[0]) && /height="\d+"/.test(t[0]));
        if (!sized) continue;
          // KNOWN BLIND SPOT, v3002: this reads CSS RULES and JS assignments, not INLINE style attributes. A
          // canvas carrying style="width:100%" inline is genuinely responsive and would still be reported as a
          // postage stamp. Stated here rather than loosened to a bare file-wide search, which would accept
          // "width:100%" appearing anywhere at all -- including in a comment about canvases.
        const responsive = /canvas[^{]*\{[^}]*width:\s*100%/.test(h) || /#[\w-]+[^{]*\{[^}]*width:\s*100%/.test(h) || /\.style\.width\s*=\s*["\'`]100%/.test(h);
        const jsResize = /addEventListener\(["\'`]resize/.test(h) || /innerWidth/.test(h) || /clientWidth/.test(h) || /ResizeObserver/.test(h);
        if (!responsive && !jsResize) offenders.push(path.relative(ENG, p));
    }
    ok("!! NO PAGE IN THE TREE SHIPS A FIXED, UNGROWABLE CANVAS", offenders.length === 0,
       offenders.length ? "POSTAGE STAMPS: " + offenders.slice(0, 8).join(", ") + (offenders.length > 8 ? " (+" + (offenders.length - 8) + ")" : "")
                        : "swept the whole tree; " + WEBGL_EXEMPT.length + " WebGL pages exempt by design");
    ok("...and the WebGL exemption is NAMED, not silent", WEBGL_EXEMPT.length > 0 && WEBGL_EXEMPT.every((f) => fs.existsSync(path.join(ENG, f))),
       "a small drawing buffer on a GPU page is a deliberate resolution/perf tradeoff, not a layout bug");
}

console.log(fails ? "\ncanvasFill-selfcheck: " + fails + " FAILED" : "\ncanvasFill-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
